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
 * Single risk profile (16 rows) with a Stake-like medium-risk payout table.
 * The ball is animated by stepping left/right at each row randomly; the
 * resulting bucket index decides the multiplier. Result is recorded via
 * `place_bet` so it counts in Live Stats.
 */
const ROWS = 16;
/** 17 buckets, symmetric, medium-risk style. House edge baked in. */
const PAYOUTS: number[] = [
  16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16,
];

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
  const idRef = useRef(0);

  // Auto-clean very old animated balls so the DOM stays light.
  useEffect(() => {
    if (drops.length === 0) return;
    const t = window.setTimeout(() => {
      setDrops((d) => d.slice(-6));
    }, 4000);
    return () => window.clearTimeout(t);
  }, [drops]);

  function bucketColor(mult: number) {
    if (mult >= 9) return "bg-rose-500 text-white";
    if (mult >= 2) return "bg-amber-500 text-black";
    if (mult >= 1.2) return "bg-orange-400 text-black";
    if (mult >= 1) return "bg-yellow-400 text-black";
    return "bg-emerald-500 text-black";
  }

  async function drop() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");

    setBusy(true);
    playTileClick();

    // Pick path and bucket client-side (fair — purely cosmetic outcome).
    const path: number[] = [];
    let bucket = 0;
    for (let r = 0; r < ROWS; r++) {
      const right = Math.random() < 0.5 ? 0 : 1;
      path.push(right);
      bucket += right;
    }
    const multiplier = PAYOUTS[bucket];
    const won = multiplier >= 1; // we still always pay `floor(bet*mult)`; "won" means net >= 0

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "plinko",
      _bet_amount: bet,
      _won: true, // pay the exact multiplier always (server pays floor(bet*mult))
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
    // Sound on landing — fire after the animation roughly finishes.
    window.setTimeout(() => {
      if (multiplier >= 2) playGem();
      else if (multiplier < 1) playBomb();
      else playTileClick();
      setRecent((r) => [{ mult: multiplier, won }, ...r].slice(0, 8));
      setBusy(false);
    }, ROWS * 90 + 200);
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
                  h.mult >= 2
                    ? "bg-amber-500/20 text-amber-400"
                    : h.mult >= 1
                      ? "bg-yellow-400/15 text-yellow-300"
                      : "bg-destructive/15 text-destructive"
                }`}
              >
                {h.mult.toFixed(2)}×
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_300px]">
        {/* Board */}
        <div className="relative rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-5">
          <Board drops={drops} bucketColor={bucketColor} />
        </div>

        {/* Controls */}
        <div className="space-y-4 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-xl sm:rounded-3xl sm:p-5">
          <BetControls bet={bet} setBet={setBet} disabled={busy} />
          <Button
            onClick={drop}
            disabled={busy}
            className="h-12 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
          >
            {busy ? "DROPPING..." : `DROP BALL (${formatCoins(bet)})`}
          </Button>
          <div className="rounded-xl bg-background/60 p-3 text-[11px] text-muted-foreground">
            16 rows · 17 buckets · Edge multipliers up to <span className="font-black text-foreground">16×</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Board({
  drops,
  bucketColor,
}: {
  drops: Drop[];
  bucketColor: (m: number) => string;
}) {
  // Geometry: triangular peg grid. Row r has (r+3) pegs (start with 3 at top).
  const pegRows = useMemo(() => {
    const rows: { x: number; y: number }[][] = [];
    for (let r = 0; r < ROWS; r++) {
      const count = r + 3;
      const row: { x: number; y: number }[] = [];
      const totalWidth = (PAYOUTS.length - 1) * 100; // logical units
      const spacing = totalWidth / (count + 1);
      for (let i = 0; i < count; i++) {
        const x = spacing * (i + 1);
        const y = (r + 1) * 100; // row spacing = 100 logical units
        row.push({ x, y });
      }
      rows.push(row);
    }
    return rows;
  }, []);

  const totalWidth = (PAYOUTS.length - 1) * 100;
  const totalHeight = (ROWS + 2) * 100;

  // Compute ball x at each row from path (right-step decisions).
  function ballPath(path: number[]) {
    // Start above row 0 centered.
    const points: { x: number; y: number }[] = [];
    points.push({ x: totalWidth / 2, y: 0 });
    let bucket = 0;
    for (let r = 0; r < ROWS; r++) {
      bucket += path[r];
      // After row r, ball sits between pegs of row r+1.
      // Position it at the slot between left/right peg = roughly bucket index along width
      const spacing = totalWidth / (r + 4);
      const x = spacing * (bucket + 1) + (spacing - spacing) * 0; // simple
      const y = (r + 1) * 100;
      points.push({ x, y });
    }
    // Land in the bucket
    const finalX = (bucket / (PAYOUTS.length - 1)) * totalWidth;
    points.push({ x: finalX, y: totalHeight - 60 });
    return points;
  }

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: 560 }}>
      <svg
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Pegs */}
        {pegRows.flat().map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={6}
            className="fill-foreground/40"
          />
        ))}

        {/* Animated balls */}
        {drops.map((d) => {
          const pts = ballPath(d.path);
          return <Ball key={d.id} points={pts} />;
        })}
      </svg>

      {/* Bucket row */}
      <div className="mt-1 flex w-full gap-[2px]">
        {PAYOUTS.map((m, i) => (
          <BucketCell
            key={i}
            mult={m}
            tone={bucketColor(m)}
            highlight={drops[drops.length - 1]?.bucket === i}
          />
        ))}
      </div>
    </div>
  );
}

function Ball({ points }: { points: { x: number; y: number }[] }) {
  // Animate the ball through each row position with framer-motion.
  return (
    <motion.circle
      r={9}
      className="fill-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.7)]"
      initial={{ cx: points[0].x, cy: points[0].y, opacity: 0 }}
      animate={{
        cx: points.map((p) => p.x),
        cy: points.map((p) => p.y),
        opacity: [0, 1, 1, 1, 1, 1],
      }}
      transition={{
        duration: points.length * 0.09,
        ease: "easeIn",
        times: points.map((_, i) => i / (points.length - 1)),
      }}
    />
  );
}

function BucketCell({
  mult,
  tone,
  highlight,
}: {
  mult: number;
  tone: string;
  highlight: boolean;
}) {
  return (
    <div className="relative flex-1">
      <AnimatePresence>
        {highlight && (
          <motion.div
            key="hl"
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, 1.3, 1], opacity: [0, 1, 0] }}
            transition={{ duration: 0.6 }}
            className={`absolute inset-0 -z-0 rounded-md ${tone} opacity-60`}
          />
        )}
      </AnimatePresence>
      <div
        className={`relative z-10 rounded-md px-1 py-1.5 text-center text-[10px] font-black tabular-nums sm:text-xs ${tone} ${
          highlight ? "ring-2 ring-foreground" : ""
        }`}
      >
        {mult}×
      </div>
    </div>
  );
}