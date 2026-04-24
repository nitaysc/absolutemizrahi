import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
 * Plinko — Stake-style.
 * Triangular peg field: row r has (r+3) pegs (top row = 3 pegs … bottom row = 18 pegs),
 * giving 17 landing slots. Ball steps left/right at each row; eased "gravity" tween
 * between rows + small horizontal overshoot per peg gives the smooth Stake feel.
 */
const ROWS = 16;
/** 17 buckets, symmetric medium-risk Stake-like payouts. */
const PAYOUTS: number[] = [
  110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110,
];
const BUCKETS = PAYOUTS.length; // 17

/** Logical SVG units. */
const COL = 40; // horizontal spacing between adjacent peg columns
const ROW_H = 38; // vertical spacing between rows
const TOP_PAD = 24;
const SIDE_PAD = 20;
const BOARD_W = SIDE_PAD * 2 + (BUCKETS - 1) * COL;
const BOARD_H = TOP_PAD + (ROWS + 1) * ROW_H + 70; // +bucket strip

type Drop = {
  id: number;
  /** Right-step decisions per row (length = ROWS). */
  path: number[];
  bucket: number;
  multiplier: number;
  bet: number;
};

export default function Plinko() {
  useTrackGame("plinko");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [recent, setRecent] = useState<{ mult: number; won: boolean }[]>([]);
  const [hitPeg, setHitPeg] = useState<{ r: number; c: number; t: number } | null>(null);
  const [hitBucket, setHitBucket] = useState<{ i: number; t: number } | null>(null);
  const idRef = useRef(0);

  // Trim old animated balls so the SVG stays light.
  useEffect(() => {
    if (drops.length <= 6) return;
    const t = window.setTimeout(() => setDrops((d) => d.slice(-6)), 2500);
    return () => window.clearTimeout(t);
  }, [drops]);

  function bucketColor(mult: number) {
    if (mult >= 41) return "bg-rose-500 text-white";
    if (mult >= 5) return "bg-orange-500 text-black";
    if (mult >= 1.5) return "bg-amber-400 text-black";
    if (mult >= 1) return "bg-yellow-300 text-black";
    return "bg-emerald-500 text-black";
  }

  async function drop() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");

    setBusy(true);
    playTileClick();

    // Pick path client-side (cosmetic — server records the result).
    const path: number[] = [];
    let bucket = 0;
    for (let r = 0; r < ROWS; r++) {
      const right = Math.random() < 0.5 ? 0 : 1;
      path.push(right);
      bucket += right;
    }
    const multiplier = PAYOUTS[bucket];
    const won = multiplier >= 1;

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "plinko",
      _bet_amount: bet,
      _won: true, // pay exact multiplier (server pays floor(bet*mult))
      _multiplier: multiplier,
      _details: { bucket, path, rows: ROWS },
    });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));

    const id = ++idRef.current;
    setDrops((d) => [...d, { id, path, bucket, multiplier, bet }]);

    // Schedule subtle peg-hit ticks during the fall.
    const stepMs = 95;
    let col = 1; // ball enters between top-row pegs (3 pegs → cols 0,1,2 — start centered)
    for (let r = 0; r < ROWS; r++) {
      const right = path[r];
      const c = col + right;
      window.setTimeout(() => {
        setHitPeg({ r, c, t: Date.now() });
        // very soft tick — reuse tileClick at low importance
        if (r % 2 === 0) playTileClick();
      }, r * stepMs + 60);
      col = c;
    }

    // Landing
    window.setTimeout(
      () => {
        setHitBucket({ i: bucket, t: Date.now() });
        if (multiplier >= 5) playGem();
        else if (multiplier < 1) playBomb();
        else playTileClick();
        setRecent((r) => [{ mult: multiplier, won }, ...r].slice(0, 8));
        setBusy(false);
      },
      ROWS * stepMs + 120
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <Triangle className="h-6 w-6 text-primary" /> PLINKO
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Drop the ball. Land on a multiplier.
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]">
        {/* Controls — left like Stake */}
        <div className="order-2 space-y-4 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-xl sm:rounded-3xl sm:p-5 md:order-1">
          <BetControls bet={bet} setBet={setBet} disabled={busy} />
          <Button
            onClick={drop}
            disabled={busy}
            className="h-12 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
          >
            {busy ? "DROPPING..." : `DROP BALL (${formatCoins(bet)})`}
          </Button>
          <div className="rounded-xl bg-background/60 p-3 text-[11px] text-muted-foreground">
            16 rows · 17 buckets · Edge multipliers up to{" "}
            <span className="font-black text-foreground">110×</span>
          </div>
        </div>

        {/* Board — right */}
        <div className="order-1 relative rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-5 md:order-2">
          <Board
            drops={drops}
            hitPeg={hitPeg}
            hitBucket={hitBucket}
            bucketColor={bucketColor}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Board ------------------------------ */

function Board({
  drops,
  hitPeg,
  hitBucket,
  bucketColor,
}: {
  drops: Drop[];
  hitPeg: { r: number; c: number; t: number } | null;
  hitBucket: { i: number; t: number } | null;
  bucketColor: (m: number) => string;
}) {
  // Pegs: row r has (r+3) pegs, centered. Bottom row has ROWS+2 = 18 pegs → 17 gaps.
  const pegRows = useMemo(() => {
    const rows: { x: number; y: number; r: number; c: number }[][] = [];
    for (let r = 0; r < ROWS; r++) {
      const count = r + 3;
      const rowWidth = (count - 1) * COL;
      const startX = (BOARD_W - rowWidth) / 2;
      const y = TOP_PAD + (r + 1) * ROW_H;
      const row: { x: number; y: number; r: number; c: number }[] = [];
      for (let c = 0; c < count; c++) {
        row.push({ x: startX + c * COL, y, r, c });
      }
      rows.push(row);
    }
    return rows;
  }, []);

  // X position the ball occupies *between* rows after taking step `right` at row r.
  // Indexing: before row 0, ball is centered. After row r, ball sits in gap `col`
  // of row r (which has r+3 pegs and r+2 gaps), where col = sum of rights so far - ?
  // We compute incrementally instead.
  function ballPath(path: number[]) {
    const pts: { x: number; y: number }[] = [];
    // Start above center, between the top row's middle pegs.
    pts.push({ x: BOARD_W / 2, y: TOP_PAD - 10 });
    let col = 1; // top row has 3 pegs (cols 0,1,2); ball enters between col 1 area
    for (let r = 0; r < ROWS; r++) {
      const right = path[r];
      // After hitting row r, ball nudges to between pegs of row r+1.
      // Compute x as midpoint between peg (r, col) and peg (r, col+1) shifted by step.
      const nextCol = col + right;
      // Peg row r has count = r+3 pegs; the ball lands between peg `nextCol-1` and `nextCol` of the NEXT row.
      const count = r + 3;
      const rowWidth = (count - 1) * COL;
      const startX = (BOARD_W - rowWidth) / 2;
      // Position between peg `col` and peg `nextCol` of current row, just below it.
      const xLeft = startX + col * COL;
      const xRight = startX + nextCol * COL;
      const x = (xLeft + xRight) / 2;
      const y = TOP_PAD + (r + 1) * ROW_H + ROW_H * 0.5;
      pts.push({ x, y });
      col = nextCol;
    }
    // Final landing in bucket — bucket index === col (cumulative rights), 0..16.
    const bucketX = SIDE_PAD + col * COL;
    pts.push({ x: bucketX, y: TOP_PAD + (ROWS + 1) * ROW_H + 18 });
    return pts;
  }

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: 640 }}>
      <svg
        viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Pegs */}
        {pegRows.flat().map((p) => {
          const lit =
            hitPeg && hitPeg.r === p.r && hitPeg.c === p.c
              ? hitPeg.t
              : 0;
          return (
            <Peg key={`${p.r}-${p.c}`} x={p.x} y={p.y} litKey={lit} />
          );
        })}

        {/* Animated balls */}
        {drops.map((d) => {
          const pts = ballPath(d.path);
          return <Ball key={d.id} points={pts} />;
        })}
      </svg>

      {/* Bucket row */}
      <div className="mt-2 flex w-full gap-[3px] px-[2px]">
        {PAYOUTS.map((m, i) => (
          <BucketCell
            key={i}
            mult={m}
            tone={bucketColor(m)}
            highlight={hitBucket?.i === i ? hitBucket.t : 0}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Peg ------------------------------ */

function Peg({ x, y, litKey }: { x: number; y: number; litKey: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.2} className="fill-foreground/70" />
      <AnimatePresence>
        {litKey > 0 && (
          <motion.circle
            key={litKey}
            cx={x}
            cy={y}
            initial={{ r: 3.2, opacity: 0.9 }}
            animate={{ r: 9, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fill-primary"
          />
        )}
      </AnimatePresence>
    </g>
  );
}

/* ------------------------------ Ball ------------------------------ */

function Ball({ points }: { points: { x: number; y: number }[] }) {
  // Smooth gravity-like fall: easeIn cy keyframes, slightly snappier cx.
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const times = points.map((_, i) => i / (points.length - 1));
  const dur = points.length * 0.095;
  return (
    <motion.circle
      r={6.5}
      className="fill-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.7)]"
      initial={{ cx: xs[0], cy: ys[0], opacity: 0 }}
      animate={{
        cx: xs,
        cy: ys,
        opacity: [0, 1, 1, 1, 1, 1],
      }}
      transition={{
        duration: dur,
        ease: "easeIn",
        times,
      }}
    />
  );
}

/* ------------------------------ Bucket ------------------------------ */

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
    <div className="relative flex-1">
      <motion.div
        key={highlight}
        initial={{ y: 0 }}
        animate={highlight ? { y: [0, 6, 0] } : { y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={`relative rounded-md px-1 py-1.5 text-center text-[10px] font-black tabular-nums shadow-[0_3px_0_rgba(0,0,0,0.25)] sm:text-xs ${tone} ${
          highlight ? "ring-2 ring-foreground" : ""
        }`}
      >
        {mult}×
      </motion.div>
    </div>
  );
}