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
const PAYOUTS: number[] = [
  110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110,
];
const BUCKETS = PAYOUTS.length; // 17

// Logical SVG units — compact.
const COL = 28;
const ROW_H = 26;
const TOP_PAD = 18;
const SIDE_PAD = 14;
const BOARD_W = SIDE_PAD * 2 + (BUCKETS - 1) * COL;
const BOARD_H = TOP_PAD + (ROWS + 1) * ROW_H + 8;

// Physics
const GRAVITY = 520;        // svg units / s^2
const BOUNCE_DAMP = 0.55;   // vertical restitution at peg
const HORIZ_KICK = 95;      // horizontal velocity given by peg deflection
const PEG_RADIUS = 2.4;
const BALL_RADIUS = 4.6;

type Ball = {
  id: number;
  path: number[];        // pre-decided row decisions
  bucket: number;
  multiplier: number;
  bet: number;
  // physics state
  x: number;
  y: number;
  vx: number;
  vy: number;
  rowIdx: number;        // next row to resolve
  done: boolean;
  hue: number;
};

export default function Plinko() {
  useTrackGame("plinko");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [recent, setRecent] = useState<{ mult: number; won: boolean }[]>([]);
  const [hitBucket, setHitBucket] = useState<{ i: number; t: number } | null>(null);
  const [, force] = useState(0);

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
  // Bucket cells are rendered as 17 equal flex divs spanning the SVG width.
  const bucketX = useCallback(
    (i: number) => SIDE_PAD + i * COL,
    []
  );
  const floorY = TOP_PAD + (ROWS + 1) * ROW_H;

  // RAF physics loop
  useEffect(() => {
    function step(ts: number) {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = Math.min(0.032, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      const balls = ballsRef.current;
      let needRender = false;

      for (const b of balls) {
        if (b.done) continue;
        needRender = true;

        // Integrate
        b.vy += GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        // Light horizontal damping for natural feel
        b.vx *= Math.pow(0.94, dt * 60);

        // Resolve collision with the next row's target peg.
        if (b.rowIdx < ROWS) {
          const r = b.rowIdx;
          // The "anchor" peg is the left peg of the deflection pair.
          // Cumulative left-col before this row = sum of path[0..r-1].
          // Ball will deflect off peg at (r, anchorCol) going `right` direction.
          let anchorCol = 0;
          for (let k = 0; k < r; k++) anchorCol += b.path[k];
          const right = b.path[r];
          // Target peg the ball strikes:
          const pegCol = anchorCol + (right ? 1 : 0); // strike peg from its left or right side? simpler: use center peg row
          // Use a simpler model: peg at (r, anchorCol + 1 - (1-right)) = the closer one
          // Just check crossing of the peg row plane.
          const py = pegY(r);
          if (b.y + BALL_RADIUS >= py) {
            // Snap, light it, kick.
            const px = pegX(r, pegCol);
            // Position ball just at top of peg
            b.y = py - BALL_RADIUS - PEG_RADIUS + 2;
            b.vy = -Math.abs(b.vy) * BOUNCE_DAMP;
            // Horizontal kick toward direction
            b.vx = (right ? 1 : -1) * HORIZ_KICK + (b.x - px) * 1.2;

            // Light the peg
            litPegsRef.current.set(`${r}-${pegCol}`, performance.now());
            if (r % 3 === 0) playTileClick();

            b.rowIdx += 1;
          }
        } else {
          // After all rows: drift to bucket center then settle.
          const targetX = bucketX(b.bucket);
          const dx = targetX - b.x;
          // Soft pull horizontally so it lands cleanly.
          b.vx += dx * 6 * dt;
          b.vx *= Math.pow(0.85, dt * 60);

          if (b.y >= floorY) {
            // Land!
            b.done = true;
            setHitBucket({ i: b.bucket, t: Date.now() });
            if (b.multiplier >= 5) playGem();
            else if (b.multiplier < 1) playBomb();
            else playTileClick();
            setRecent((rec) =>
              [{ mult: b.multiplier, won: b.multiplier >= 1 }, ...rec].slice(0, 8)
            );
            // Schedule removal so it visually pops out cleanly.
            const removeId = b.id;
            window.setTimeout(() => {
              ballsRef.current = ballsRef.current.filter((x) => x.id !== removeId);
              force((n) => n + 1);
            }, 40);
          }
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
  }, [pegX, pegY, bucketX, floorY]);

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
    const multiplier = PAYOUTS[bucket];

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "plinko",
      _bet_amount: bet,
      _won: true,
      _multiplier: multiplier,
      _details: { bucket, path, rows: ROWS },
    });
    if (error) return toast.error(error.message);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));

    const id = ++idRef.current;
    const newBall: Ball = {
      id,
      path,
      bucket,
      multiplier,
      bet,
      x: BOARD_W / 2 + (Math.random() - 0.5) * 4,
      y: TOP_PAD - 6,
      vx: (Math.random() - 0.5) * 30,
      vy: 30,
      rowIdx: 0,
      done: false,
      hue: Math.floor(Math.random() * 360),
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
          <Button
            onClick={drop}
            disabled={!profile}
            className="h-11 w-full text-sm font-black tracking-wider shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
          >
            DROP BALL ({formatCoins(bet)})
          </Button>
          <div className="rounded-xl bg-background/60 p-2.5 text-[10px] text-muted-foreground">
            16 rows · 17 buckets · Up to{" "}
            <span className="font-black text-foreground">110×</span>
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
              style={{
                paddingLeft: `${(SIDE_PAD - COL / 2) / BOARD_W * 100}%`,
                paddingRight: `${(SIDE_PAD - COL / 2) / BOARD_W * 100}%`,
              }}
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
