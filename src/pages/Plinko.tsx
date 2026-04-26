import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { AutoBetPanel, type AutoBetRoundResult } from "@/components/AutoBetPanel";
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
  // Slightly more generous, smoother curves — center penalty is softer so it
  // doesn't feel rigged. Edges still pay big to keep the dopamine.
  low:    [16, 9, 4, 2, 1.4, 1.2, 1, 0.9, 0.7, 0.9, 1, 1.2, 1.4, 2, 4, 9, 16],
  medium: [55, 18, 7, 3, 1.8, 1.3, 1.1, 0.8, 0.5, 0.8, 1.1, 1.3, 1.8, 3, 7, 18, 55],
  high:   [555, 130, 38, 12, 4.5, 2, 1.1, 0.4, 0.2, 0.4, 1.1, 2, 4.5, 12, 38, 130, 555],
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
// Physics — heavier, real-feeling drop (less glide, more peg-driven motion)
const GRAVITY = 980;          // stronger downward acceleration for heavier feel
const RESTITUTION = 0.42;     // lower bounce so impacts feel less pinball-floaty
const TANGENTIAL_KEEP = 0.72; // keeps some slide, but pegs still redirect decisively
const AIR_DRAG = 0.993;       // lower air loss so drops keep natural momentum
const PEG_RADIUS = 2.4;
const BALL_RADIUS = 4.2;
const SUB_STEPS = 6;          // physics sub-steps per frame for stable contacts

type Ball = {
  id: number;
  path: number[];        // predetermined row decisions (server-truth)
  rightsByRow: number[]; // cumulative rights after each row, for lane guidance
  bucket: number;
  payoutTable: number[];
  bet: number;
  settled: boolean;
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
  const [mode, setMode] = useState<"manual" | "auto">("manual");

  const PAYOUTS = PAYOUTS_BY_RISK[risk];

  const ballsRef = useRef<Ball[]>([]);
  const idRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const litPegsRef = useRef<Map<string, number>>(new Map());
  const serverBalanceRef = useRef(0);
  const reservedStakeRef = useRef(0);

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

  useEffect(() => {
    serverBalanceRef.current = profile?.coins ?? 0;
  }, [profile?.coins]);

  const settleBall = useCallback(async (b: Ball, landedBucket: number) => {
    const multiplier = b.payoutTable[landedBucket] ?? 0;
    const won = multiplier >= 1;
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "plinko",
      _bet_amount: b.bet,
      _won: won,
      _multiplier: multiplier,
      _details: { bucket: landedBucket, path: b.path, rows: ROWS },
    });

    reservedStakeRef.current = Math.max(0, reservedStakeRef.current - b.bet);

    if (error) {
      toast.error(error.message);
      setLocalCoins(Math.max(0, serverBalanceRef.current - reservedStakeRef.current));
      return;
    }

    if (data?.[0]) {
      serverBalanceRef.current = Number(data[0].new_balance);
    }

    setLocalCoins(Math.max(0, serverBalanceRef.current - reservedStakeRef.current));
  }, [setLocalCoins]);

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

          // Tiny continuous lane pull so the ball still ends up in the
          // correct bucket — but small enough that the visible bounces feel
          // peg-driven, not floaty/scripted.
          if (b.y <= pegY(ROWS - 1) + ROW_H * 0.35) {
            const guideRow = Math.max(
              0,
              Math.min(ROWS - 1, Math.floor((b.y - TOP_PAD + ROW_H * 0.45) / ROW_H) - 1),
            );
            const targetLaneX = laneX(guideRow, b.rightsByRow[guideRow]);
            const lanePull = Math.max(-4, Math.min(4, (targetLaneX - b.x) * 0.35));
            b.vx += lanePull * sdt * 2.5;
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
                    // Subtle nudge on first contact in this row so the path
                    // converges over many bounces instead of one obvious shove.
                    b.vx += Math.max(-4, Math.min(4, (targetLaneX - b.x) * 0.3));
                    b.nextRow = r + 1;
                  }

                  if (b.vy < 100) b.vy = 100;

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
        if (b.y > pegY(ROWS - 1) + ROW_H * 0.85) {
          const targetX = bucketX(b.bucket);
          const dxT = targetX - b.x;
          b.vx += Math.max(-10, Math.min(10, dxT * 0.45)) * dt * 6;
        }

        if (b.y >= floorY) {
          const landedBucket = Math.max(0, Math.min(BUCKETS - 1, Math.round((b.x - SIDE_PAD) / COL)));
          b.x = bucketX(landedBucket);
          b.done = true;
          const landedMultiplier = b.payoutTable[landedBucket] ?? 0;
          setHitBucket({ i: landedBucket, t: Date.now() });
          if (landedMultiplier >= 5) playGem();
          else if (landedMultiplier < 1) playBomb();
          else playTileClick();
          setRecent((rec) =>
            [{ mult: landedMultiplier, won: landedMultiplier >= 1 }, ...rec].slice(0, 8)
          );
          if (!b.settled) {
            b.settled = true;
            void settleBall(b, landedBucket);
          }
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
  }, [pegX, pegY, bucketX, laneX, floorY, settleBall]);

  async function drop(betOverride?: number): Promise<AutoBetRoundResult | null> {
    if (!profile) return null;
    const stake = betOverride ?? bet;
    if (stake < 1) { toast.error("Bet at least 1 coin"); return null; }
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
      const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
      acc.push(prev + dir);
      return acc;
    }, []);
    const availableCoins = serverBalanceRef.current - reservedStakeRef.current;
    if (stake > availableCoins) { toast.error("Not enough coins"); return null; }

    reservedStakeRef.current += stake;
    setLocalCoins(Math.max(0, serverBalanceRef.current - reservedStakeRef.current));

    const id = ++idRef.current;
    const newBall: Ball = {
      id,
      path,
      rightsByRow,
      bucket,
      payoutTable: [...PAYOUTS],
      bet: stake,
      settled: false,
      x: BOARD_W / 2 + (Math.random() - 0.5) * 4,
      y: TOP_PAD - 6,
      vx: (Math.random() - 0.5) * 18,
      vy: 24,
      nextRow: 0,
      done: false,
      hue: Math.floor(Math.random() * 360),
      spawnedAt: performance.now(),
    };
    ballsRef.current = [...ballsRef.current, newBall];
    force((n) => n + 1);
    const previewMultiplier = PAYOUTS[bucket];
    const previewPayout = Math.floor(stake * previewMultiplier);
    return { won: previewMultiplier >= 1, profit: previewPayout - stake };
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
          <div className="grid grid-cols-2 gap-1 rounded-full bg-background/60 p-1">
            {(["manual","auto"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-full py-1.5 text-[11px] font-bold uppercase tracking-widest transition ${
                  mode === m ? "bg-card text-foreground shadow" : "text-muted-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
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
          {mode === "manual" ? (
            <Button
              onClick={() => drop()}
              disabled={!profile}
              className="h-11 w-full text-sm font-black tracking-wider shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
            >
              DROP BALL ({formatCoins(bet)})
            </Button>
          ) : (
            <AutoBetPanel bet={bet} setBet={setBet} onBet={drop} intervalMs={350} />
          )}
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
            {/* Bucket row — exactly tiles the SVG column grid (17 equal
                slots, no gap) so the visual cell directly under the ball
                matches the multiplier the server actually paid out. */}
            <div className="mt-1 grid w-full" style={{ gridTemplateColumns: `repeat(${BUCKETS}, minmax(0, 1fr))` }}>
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
    <div className="relative min-w-0 px-[1px]">
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
