import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { Triangle } from "lucide-react";
import { playGem, playBomb, playTileClick } from "@/lib/sfx";

/**
 * Plinko — Stake-style with real continuous gravity simulation.
 * Multi-ball: each click drops a new independent ball. Balls disappear on landing.
 */
const ROWS = 16;
type Risk = "low" | "medium" | "high";
const PAYOUTS_BY_RISK: Record<Risk, number[]> = {
  low:    [16, 9, 2, 1.4, 1.1, 1, 0.5, 1, 0.3, 1, 0.5, 1, 1.1, 1.4, 2, 9, 16],
  medium: [40, 14, 5, 2, 1.4, 1, 0.5, 0.3, 0.2, 0.3, 0.5, 1, 1.4, 2, 5, 14, 40],
  high:   [420, 130, 26, 9, 3, 1.5, 0.3, 0.2, 0.1, 0.2, 0.3, 1.5, 3, 9, 26, 130, 420],
};
const BUCKETS = 17;

// Logical SVG units — compact.
const COL = 28;
const ROW_H = 26;
const TOP_PAD = 18;
const SIDE_PAD = 14;
const BOARD_W = SIDE_PAD * 2 + (BUCKETS - 1) * COL;
const BOARD_H = TOP_PAD + (ROWS + 1) * ROW_H + 8;

// Physics — slower, floaty Stake-like feel
const GRAVITY = 320;          // svg units / s^2
const RESTITUTION = 0.42;     // bounce on the normal axis
const TANGENTIAL_KEEP = 0.98; // preserve sideways glide across peg surface
const AIR_DRAG = 0.992;       // global damping (applied via dt)
const PEG_RADIUS = 2.4;
const BALL_RADIUS = 4.2;
const SUB_STEPS = 4;          // physics sub-steps per frame for stable contacts

type Ball = {
  id: number;
  path: number[];        // predetermined row decisions (server-truth)
  rightsByRow: number[]; // cumulative rights after each row, for lane guidance
  bucket: number;
  multiplier: number;
  bet: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  nextRow: number;       // next row to bias toward (matches predetermined path)
  done: boolean;
  hue: number;
  spawnedAt: number;     // for stuck-ball watchdog
};

export default function Plinko() {
  useTrackGame("plinko");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [risk, setRisk] = useState<Risk>("medium");
  const [recent, setRecent] = useState<{ mult: number; won: boolean }[]>([]);
  const [hitBucket, setHitBucket] = useState<{ i: number; t: number } | null>(null);
  const [, force] = useState(0);

  const PAYOUTS = PAYOUTS_BY_RISK[risk];

  const ballsRef = useRef<Ball[]>([]);
  const idRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const litPegsRef = useRef<Map<string, number>>(new Map());

  function bucketTone(mult: number) {
    if (mult >= 41) return "bg-rose-500 text-white border-rose-300";
    if (mult >= 5) return "bg-orange-500 text-black border-orange-300";
    if (mult >= 1.5) return "bg-amber-400 text-black border-amber-200";
    if (mult >= 1) return "bg-yellow-300 text-black border-yellow-200";
    return "bg-emerald-500 text-black border-emerald-300";
  }

  // Peg X position for a given row index r (0..ROWS-1) and column c.
  // Row r has (r+3) pegs centered.
  const pegX = useCallback((r: number, c: number) => {
    const count = r + 3;
    const rowWidth = (count - 1) * COL;
    const startX = (BOARD_W - rowWidth) / 2;
    return startX + c * COL;
  }, []);
  const pegY = useCallback((r: number) => TOP_PAD + (r + 1) * ROW_H, []);

  // Bucket center X (bucket i, i=0..16). Final landing column == sum of rights.
  const bucketX = useCallback(
    (i: number) => COL / 2 + i * COL,
    []
  );
  const laneX = useCallback(
    (row: number, rights: number) => BOARD_W / 2 + (rights - (row + 1) / 2) * COL,
    []
  );
  const floorY = TOP_PAD + (ROWS + 1) * ROW_H;

  // RAF physics loop
  useEffect(() => {
    function step(ts: number) {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = Math.min(0.025, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      const balls = ballsRef.current;
      let needRender = false;

      const sdt = dt / SUB_STEPS;
      const contactR = PEG_RADIUS + BALL_RADIUS;
      const contactR2 = contactR * contactR;

      for (const b of balls) {
        if (b.done) continue;
        needRender = true;

        // Watchdog: if a ball has been alive way too long (stuck on a peg
        // with near-zero velocity), force it down to its bucket.
        if (ts - b.spawnedAt > 6000) {
          b.x = bucketX(b.bucket);
          b.y = floorY;
          b.vx = 0;
          b.vy = 0;
        }

        // Sub-stepped semi-implicit Euler with circle-circle collisions
        // against the actual peg disks. This produces a real "tap and
        // deflect" instead of teleporting between rows.
        for (let s = 0; s < SUB_STEPS; s++) {
          b.vy += GRAVITY * sdt;
          b.vx *= Math.pow(AIR_DRAG, sdt * 60);

          if (b.y <= pegY(ROWS - 1) + ROW_H * 0.35) {
            const guideRow = Math.max(
              0,
              Math.min(ROWS - 1, Math.floor((b.y - TOP_PAD + ROW_H * 0.45) / ROW_H) - 1),
            );
            const targetLaneX = laneX(guideRow, b.rightsByRow[guideRow]);
            const lanePull = Math.max(-28, Math.min(28, (targetLaneX - b.x) * 1.8));
            b.vx += lanePull * sdt * 12;
          }

          b.x += b.vx * sdt;
          b.y += b.vy * sdt;

          // Only check pegs in the row band the ball is currently near
          // (huge speedup vs. checking all 152 pegs).
          const approxRow = Math.floor((b.y - TOP_PAD) / ROW_H) - 1;
          for (let r = Math.max(0, approxRow); r <= Math.min(ROWS - 1, approxRow + 2); r++) {
            const py = pegY(r);
            const count = r + 3;
            for (let c = 0; c < count; c++) {
              const px = pegX(r, c);
              const dx = b.x - px;
              const dy = b.y - py;
              const d2 = dx * dx + dy * dy;
              if (d2 < contactR2 && d2 > 0.0001) {
                const d = Math.sqrt(d2);
                // Push ball out along the contact normal
                const nx = dx / d;
                const ny = dy / d;
                const overlap = contactR - d;
                b.x += nx * overlap;
                b.y += ny * overlap;

                // Reflect only the normal component so the ball keeps its
                // sideways glide along the peg instead of dropping dead
                // straight after the first impact.
                const vDotN = b.vx * nx + b.vy * ny;
                if (vDotN < 0) {
                  const tx = -ny;
                  const ty = nx;
                  const vDotT = b.vx * tx + b.vy * ty;
                  const normalOut = -vDotN * RESTITUTION;
                  const tangentOut = vDotT * TANGENTIAL_KEEP;

                  b.vx = tx * tangentOut + nx * normalOut;
                  b.vy = ty * tangentOut + ny * normalOut;

                  if (r === b.nextRow) {
                    const targetLaneX = laneX(r, b.rightsByRow[r]);
                    b.vx += Math.max(-18, Math.min(18, (targetLaneX - b.x) * 1.4));
                    b.nextRow = r + 1;
                  }

                  if (b.vy < 30) b.vy = 30;

                  litPegsRef.current.set(`${r}-${c}`, performance.now());
                  if ((r + c) % 3 === 0) playTileClick();
                }
              }
            }
          }

          // Side walls so the ball never escapes the triangle
          if (b.x < BALL_RADIUS) {
            b.x = BALL_RADIUS;
            b.vx = Math.abs(b.vx) * 0.6;
          } else if (b.x > BOARD_W - BALL_RADIUS) {
            b.x = BOARD_W - BALL_RADIUS;
            b.vx = -Math.abs(b.vx) * 0.6;
          }
        }

        // After the last peg row, gently pull into the exact bucket center.
        if (b.y > pegY(ROWS - 1) + ROW_H * 0.5) {
          const targetX = bucketX(b.bucket);
          const dxT = targetX - b.x;
          b.vx += Math.max(-24, Math.min(24, dxT * 1.35)) * dt * 10;
          if (Math.abs(dxT) < 0.75) {
            b.x = targetX;
            b.vx *= 0.5;
          }
        }

        if (b.y >= floorY) {
          // Hard-snap X to the recorded bucket on landing so the visual
          // bucket highlight always matches the multiplier paid out.
          b.x = bucketX(b.bucket);
          b.done = true;
          setHitBucket({ i: b.bucket, t: Date.now() });
          if (b.multiplier >= 5) playGem();
          else if (b.multiplier < 1) playBomb();
          else playTileClick();
          setRecent((rec) =>
            [{ mult: b.multiplier, won: b.multiplier >= 1 }, ...rec].slice(0, 8)
          );
          const removeId = b.id;
          window.setTimeout(() => {
            ballsRef.current = ballsRef.current.filter((x) => x.id !== removeId);
            force((n) => n + 1);
          }, 40);
        }
      }

      // Clean up old peg lights
      const now = performance.now();
      for (const [k, t] of litPegsRef.current) {
        if (now - t > 350) litPegsRef.current.delete(k);
      }

      if (needRender || litPegsRef.current.size > 0) force((n) => n + 1);

      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [pegX, pegY, bucketX, laneX, floorY]);

  async function drop() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");

    playTileClick();

    // Random path (cosmetic — server records actual)
    const path: number[] = [];
    let bucket = 0;
    for (let r = 0; r < ROWS; r++) {
      const right = Math.random() < 0.5 ? 0 : 1;
      path.push(right);
      bucket += right;
    }
    const rightsByRow = path.reduce<number[]>((acc, dir) => {
      acc.push((acc.at(-1) ?? 0) + dir);
      return acc;
    }, []);
    const multiplier = PAYOUTS[bucket];

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "plinko",
      _bet_amount: bet,
      _won: multiplier >= 1,
      _multiplier: multiplier,
      _details: { bucket, path, rows: ROWS },
    });
    if (error) return toast.error(error.message);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));

    const id = ++idRef.current;
    const newBall: Ball = {
      id,
      path,
      rightsByRow,
      bucket,
      multiplier,
      bet,
      x: BOARD_W / 2 + (Math.random() - 0.5) * 4,
      y: TOP_PAD - 6,
      vx: (Math.random() - 0.5) * 18,
      vy: 12,
      nextRow: 0,
      done: false,
      hue: Math.floor(Math.random() * 360),
      spawnedAt: performance.now(),
    };
    ballsRef.current = [...ballsRef.current, newBall];
    force((n) => n + 1);
  }

  // Build peg grid once
  const pegs: { x: number; y: number; r: number; c: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < r + 3; c++) {
      pegs.push({ x: pegX(r, c), y: pegY(r), r, c });
    }
  }

  const balls = ballsRef.current;

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight sm:text-2xl">
            <Triangle className="h-5 w-5 text-primary" /> PLINKO
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Drop multiple balls. Continuous gravity.
          </p>
        </div>
        {recent.length > 0 && (
          <ul className="flex gap-1.5">
            {recent.map((h, i) => (
              <li
                key={i}
                className={`rounded-md px-2 py-1 text-[10px] font-black tabular-nums ${
                  h.mult >= 5
                    ? "bg-rose-500/20 text-rose-400"
                    : h.mult >= 1
                      ? "bg-amber-400/15 text-amber-300"
                      : "bg-destructive/15 text-destructive"
                }`}
              >
                {h.mult}×
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[260px_1fr]">
        {/* Controls */}
        <div className="order-2 space-y-3 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl md:order-1">
          <BetControls bet={bet} setBet={setBet} disabled={false} />
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Risk
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(["low", "medium", "high"] as Risk[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRisk(r)}
                  className={`rounded-md border px-2 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                    risk === r
                      ? r === "high"
                        ? "border-rose-400 bg-rose-500/20 text-rose-300"
                        : r === "medium"
                          ? "border-amber-400 bg-amber-400/20 text-amber-300"
                          : "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                      : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <Button
            onClick={drop}
            disabled={!profile}
            className="h-11 w-full text-sm font-black tracking-wider shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
          >
            DROP BALL ({formatCoins(bet)})
          </Button>
          <div className="rounded-xl bg-background/60 p-2.5 text-[10px] text-muted-foreground">
            16 rows · 17 buckets · Up to{" "}
            <span className="font-black text-foreground">{PAYOUTS[0]}×</span>
            <div className="mt-1 text-[10px]">
              Active balls:{" "}
              <span className="font-black text-foreground">{balls.filter(b => !b.done).length}</span>
            </div>
          </div>
        </div>

        {/* Board */}
        <div className="order-1 relative rounded-2xl border border-border bg-card/70 p-2.5 backdrop-blur-xl md:order-2">
          <div className="relative mx-auto w-full" style={{ maxWidth: 480 }}>
            <svg
              viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
              className="h-auto w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Pegs */}
              {pegs.map((p) => {
                const lit = litPegsRef.current.get(`${p.r}-${p.c}`);
                const age = lit ? performance.now() - lit : Infinity;
                const glow = age < 300 ? 1 - age / 300 : 0;
                return (
                  <g key={`${p.r}-${p.c}`}>
                    {glow > 0 && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={PEG_RADIUS + 6 * glow}
                        className="fill-primary"
                        opacity={glow * 0.6}
                      />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={PEG_RADIUS}
                      className="fill-foreground/75"
                    />
                  </g>
                );
              })}

              {/* Balls */}
              {balls.map((b) => (
                <circle
                  key={b.id}
                  cx={b.x}
                  cy={b.y}
                  r={BALL_RADIUS}
                  fill={`hsl(${b.hue} 95% 60%)`}
                  className="drop-shadow-[0_0_6px_hsl(var(--primary)/0.7)]"
                />
              ))}
            </svg>

            {/* Bucket row — aligned to SVG columns via padding */}
            <div
              className="mt-1 flex w-full gap-[2px]"
              style={{ paddingLeft: 0, paddingRight: 0 }}
            >
              {PAYOUTS.map((m, i) => (
                <BucketCell
                  key={i}
                  mult={m}
                  tone={bucketTone(m)}
                  highlight={hitBucket?.i === i ? hitBucket.t : 0}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BucketCell({
  mult,
  tone,
  highlight,
}: {
  mult: number;
  tone: string;
  highlight: number;
}) {
  return (
    <div className="relative flex-1 min-w-0">
      <motion.div
        key={highlight}
        initial={{ y: 0 }}
        animate={highlight ? { y: [0, 4, 0] } : { y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`relative rounded-md border px-0.5 py-1 text-center text-[9px] font-black tabular-nums shadow-[0_2px_0_rgba(0,0,0,0.25)] sm:text-[10px] ${tone} ${
          highlight ? "ring-2 ring-foreground" : ""
        }`}
      >
        {mult}×
      </motion.div>
    </div>
  );
}
