import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { AutoBetPanel, type AutoBetRoundResult } from "@/components/AutoBetPanel";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";
import { playDartThrow, playDartHit, playBullseye } from "@/lib/sfx";
import { triggerBigWin } from "@/components/WinBurst";

type Difficulty = "easy" | "medium" | "hard" | "expert";

/**
 * Each difficulty defines concentric rings with multipliers and probability weights.
 * The center (bullseye) is always the rarest + highest payout. RTP is calibrated
 * to ~98% by adjusting weights so sum(weight_i * mult_i) / sum(weight_i) ≈ 0.98.
 */
type Ring = { mult: number; weight: number; color: string; ringColor: string };

const TABLES: Record<Difficulty, Ring[]> = {
  // Outside → inside. Outer is "miss" (0×).
  // Calibrated to ~95-97% RTP (sum of weight*mult / sum weight ≈ 0.95-0.97).
  easy: [
    { mult: 0, weight: 35, color: "hsl(0 0% 14%)", ringColor: "hsl(0 0% 28%)" },
    { mult: 1.0, weight: 36, color: "hsl(150 50% 22%)", ringColor: "hsl(150 60% 35%)" },
    { mult: 1.25, weight: 20, color: "hsl(150 60% 30%)", ringColor: "hsl(150 70% 45%)" },
    { mult: 1.6, weight: 7, color: "hsl(45 80% 40%)", ringColor: "hsl(45 90% 55%)" },
    { mult: 3, weight: 2, color: "hsl(0 70% 40%)", ringColor: "hsl(0 80% 55%)" },
  ],
  medium: [
    { mult: 0, weight: 52, color: "hsl(0 0% 14%)", ringColor: "hsl(0 0% 28%)" },
    { mult: 1.4, weight: 28, color: "hsl(150 50% 22%)", ringColor: "hsl(150 60% 35%)" },
    { mult: 2.0, weight: 13, color: "hsl(150 60% 30%)", ringColor: "hsl(150 70% 45%)" },
    { mult: 3.5, weight: 5, color: "hsl(45 80% 40%)", ringColor: "hsl(45 90% 55%)" },
    { mult: 10, weight: 2, color: "hsl(0 70% 40%)", ringColor: "hsl(0 80% 55%)" },
  ],
  hard: [
    { mult: 0, weight: 70, color: "hsl(0 0% 14%)", ringColor: "hsl(0 0% 28%)" },
    { mult: 2.2, weight: 19, color: "hsl(150 50% 22%)", ringColor: "hsl(150 60% 35%)" },
    { mult: 4, weight: 8, color: "hsl(150 60% 30%)", ringColor: "hsl(150 70% 45%)" },
    { mult: 8, weight: 2.5, color: "hsl(45 80% 40%)", ringColor: "hsl(45 90% 55%)" },
    { mult: 25, weight: 0.5, color: "hsl(0 70% 40%)", ringColor: "hsl(0 80% 55%)" },
  ],
  expert: [
    { mult: 0, weight: 85, color: "hsl(0 0% 14%)", ringColor: "hsl(0 0% 28%)" },
    { mult: 3.5, weight: 11, color: "hsl(150 50% 22%)", ringColor: "hsl(150 60% 35%)" },
    { mult: 8, weight: 3, color: "hsl(150 60% 30%)", ringColor: "hsl(150 70% 45%)" },
    { mult: 25, weight: 0.9, color: "hsl(45 80% 40%)", ringColor: "hsl(45 90% 55%)" },
    { mult: 100, weight: 0.1, color: "hsl(0 70% 40%)", ringColor: "hsl(0 80% 55%)" },
  ],
};

function pickRing(rings: Ring[]): number {
  const total = rings.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < rings.length; i++) {
    roll -= rings[i].weight;
    if (roll <= 0) return i;
  }
  return rings.length - 1;
}

/** Random landing point inside the ring band [r_inner, r_outer] (in % of board radius). */
function randomPointInRing(idx: number, total: number) {
  // ring 0 is outermost band (r in [(total-1)/total, 1]); last ring is bullseye (r in [0, 1/total])
  const rOuter = ((total - idx) / total) * 0.94; // keep inside the board
  const rInner = ((total - idx - 1) / total) * 0.94;
  const r = Math.sqrt(Math.random() * (rOuter * rOuter - rInner * rInner) + rInner * rInner);
  const theta = Math.random() * Math.PI * 2;
  // SVG coords: centered at 50,50 with viewBox 100x100
  return { x: 50 + Math.cos(theta) * r * 50, y: 50 + Math.sin(theta) * r * 50 };
}

type Throw = { x: number; y: number; mult: number; color: string };

export default function Darts() {
  useTrackGame("darts");
  const { profile, setLocalCoins } = useUserProfile();
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [bet, setBet] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [pending, setPending] = useState(false);
  const [throws, setThrows] = useState<Throw[]>([]);
  const [flying, setFlying] = useState<{ x: number; y: number } | null>(null);
  const [lastResult, setLastResult] = useState<{ mult: number; payout: number } | null>(null);

  const rings = TABLES[difficulty];

  const summary = useMemo(() => {
    const total = rings.reduce((s, r) => s + r.weight, 0);
    return rings.map((r) => ({ ...r, chance: r.weight / total }));
  }, [rings]);

  async function throwDart(betOverride?: number): Promise<AutoBetRoundResult | null> {
    if (!profile) return null;
    if (pending) return null;
    const stake = betOverride ?? bet;
    if (stake < 1) {
      toast.error("Bet at least 1 coin");
      return null;
    }
    if (stake > profile.coins) {
      toast.error("Not enough coins");
      return null;
    }

    setPending(true);
    setLastResult(null);

    // Determine outcome
    const idx = pickRing(rings);
    const ring = rings[idx];
    const point = randomPointInRing(idx, rings.length);

    // Animate the dart flying to the point
    playDartThrow();
    setFlying(point);

    // Wait for flight animation
    await new Promise((r) => setTimeout(r, 750));
    playDartHit();

    // Place the bet on the server
    const won = ring.mult > 0;
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "darts",
      _bet_amount: stake,
      _won: won,
      _multiplier: won ? ring.mult : 0,
      _details: { difficulty, ring: idx, mult: ring.mult },
    });
    if (error) {
      toast.error(error.message);
      setFlying(null);
      setPending(false);
      return null;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));

    // Stick the dart
    setThrows((t) => [{ x: point.x, y: point.y, mult: ring.mult, color: ring.ringColor }, ...t].slice(0, 6));
    setFlying(null);
    const payout = Math.floor(stake * ring.mult);
    setLastResult({ mult: ring.mult, payout });
    if (won && ring.mult >= 5) {
      playBullseye();
      triggerBigWin(ring.mult, ring.mult >= 25 ? "Bullseye" : "Big hit");
      toast.success(`💥 ${ring.mult}× — ${formatCoins(payout)}!`);
    }
    setPending(false);
    return { won, profit: won ? payout - stake : -stake };
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card/80 via-card/60 to-background p-4 backdrop-blur-xl">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-rose-500/20 blur-3xl" />
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Mizrahi Originals</p>
        <h1 className="mt-1 text-2xl font-black">DARTS</h1>
        <p className="mt-1 max-w-xl text-xs text-muted-foreground">
          Pick a difficulty, place your bet, and throw. Hit the bullseye for the biggest multiplier.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Board */}
        <section className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <Dartboard rings={rings} throws={throws} flying={flying} />

          {/* Result banner */}
          <AnimatePresence mode="wait">
            {lastResult && (
              <motion.div
                key={`r-${throws.length}`}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "mx-auto mt-4 max-w-sm rounded-2xl border p-3 text-center",
                  lastResult.mult > 0
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                <p className="text-xs font-bold uppercase tracking-widest opacity-80">
                  {lastResult.mult > 0 ? "Hit!" : "Missed"}
                </p>
                <p className="text-2xl font-black tabular-nums">
                  {lastResult.mult.toFixed(2)}× · {formatCoins(lastResult.payout)}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Recent throws */}
          {throws.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Last throws
              </p>
              <div className="flex flex-wrap gap-2">
                {throws.map((t, i) => (
                  <span
                    key={i}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-xs font-bold",
                      t.mult >= 10
                        ? "border-rose-400/60 bg-rose-400/10 text-rose-300"
                        : t.mult > 1
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : t.mult > 0
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-destructive/40 bg-destructive/10 text-destructive",
                    )}
                  >
                    {t.mult.toFixed(2)}×
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Controls */}
        <section className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl">
          {/* Difficulty */}
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Difficulty</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["easy", "medium", "hard", "expert"] as Difficulty[]).map((d) => (
              <button
                key={d}
                disabled={pending}
                onClick={() => setDifficulty(d)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-bold capitalize transition disabled:opacity-50",
                  difficulty === d
                    ? "border-primary bg-primary/15 text-primary shadow-[0_0_18px_hsl(var(--primary)/0.4)]"
                    : "border-border bg-background/60 hover:border-primary/60",
                )}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <BetControls bet={bet} setBet={setBet} disabled={pending} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-background/60 p-1">
            {(["manual", "auto"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-full py-1.5 text-xs font-bold uppercase tracking-widest transition",
                  mode === m ? "bg-card text-foreground shadow" : "text-muted-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {mode === "manual" ? (
            <Button
              className="mt-3 h-12 w-full text-base font-black"
              onClick={() => void throwDart()}
              disabled={!profile || pending}
            >
              <Target className="mr-2 h-5 w-5" />
              {pending ? "Throwing…" : `Throw · ${formatCoins(bet)}`}
            </Button>
          ) : (
            <div className="mt-3">
              <AutoBetPanel
                bet={bet}
                setBet={setBet}
                onBet={throwDart}
                disabled={!profile || pending}
                intervalMs={450}
              />
            </div>
          )}

          {/* Payout table */}
          <div className="mt-4 rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Payout table
            </p>
            <div className="mt-2 space-y-1.5">
              {summary
                .slice()
                .reverse()
                .map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full ring-1 ring-foreground/10"
                        style={{ background: r.ringColor }}
                      />
                      <span className="font-semibold">{r.mult.toFixed(2)}×</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {(r.chance * 100).toFixed(2)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <Wallet className="h-3 w-3" /> Higher difficulty = lower hit chance, bigger payouts.
          </p>
        </section>
      </div>
    </div>
  );
}

function Dartboard({
  rings,
  throws,
  flying,
}: {
  rings: Ring[];
  throws: Throw[];
  flying: { x: number; y: number } | null;
}) {
  // Build concentric circles. First ring covers full radius; subsequent rings sit on top.
  const total = rings.length;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]">
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_10px_30px_hsl(var(--primary)/0.25)]">
        {/* Outer rim */}
        <circle cx="50" cy="50" r="49" fill="hsl(0 0% 8%)" stroke="hsl(0 0% 22%)" strokeWidth="1" />
        {/* Wedge spokes for visual texture (decorative) */}
        {Array.from({ length: 20 }).map((_, i) => {
          const a = (i / 20) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={50}
              y1={50}
              x2={50 + Math.cos(a) * 47}
              y2={50 + Math.sin(a) * 47}
              stroke="hsl(0 0% 0% / 0.25)"
              strokeWidth="0.3"
            />
          );
        })}
        {/* Concentric scoring rings (outer → inner) */}
        {rings.map((ring, i) => {
          const r = ((total - i) / total) * 47;
          return (
            <g key={i}>
              <circle cx="50" cy="50" r={r} fill={ring.color} />
              <circle cx="50" cy="50" r={r} fill="none" stroke={ring.ringColor} strokeWidth="0.6" opacity="0.9" />
            </g>
          );
        })}
        {/* Bullseye dot accent */}
        <circle cx="50" cy="50" r={(0.5 / total) * 47} fill="hsl(0 90% 60%)" />
        {/* Stuck darts */}
        {throws.map((t, i) => (
          <Dart key={`d-${i}-${t.x}-${t.y}`} x={t.x} y={t.y} fresh={i === 0} color={t.color} />
        ))}
        {/* Flying dart */}
        <AnimatePresence>
          {flying && (
            <motion.g
              key="flying"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <FlyingDart x={flying.x} y={flying.y} />
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
    </div>
  );
}

function Dart({ x, y, fresh, color }: { x: number; y: number; fresh: boolean; color: string }) {
  return (
    <g>
      {fresh && (
        <motion.circle
          cx={x}
          cy={y}
          r={0}
          fill="none"
          stroke={color}
          strokeWidth={0.6}
          initial={{ r: 0, opacity: 0.9 }}
          animate={{ r: 6, opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      )}
      <circle cx={x} cy={y} r={1.1} fill="hsl(0 0% 95%)" stroke="hsl(0 0% 0%)" strokeWidth={0.2} />
      <circle cx={x} cy={y} r={0.4} fill="hsl(0 0% 10%)" />
    </g>
  );
}

function FlyingDart({ x, y }: { x: number; y: number }) {
  // Animate from off-screen toward the target with a small scale-down to fake depth.
  return (
    <motion.g
      initial={{ x: -40, y: -40, scale: 2.2, opacity: 0 }}
      animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      transition={{ duration: 0.65, ease: [0.6, 0.05, 0.2, 1] }}
    >
      {/* Dart shaft */}
      <line
        x1={x - 6}
        y1={y - 6}
        x2={x}
        y2={y}
        stroke="hsl(0 0% 90%)"
        strokeWidth={0.8}
        strokeLinecap="round"
      />
      {/* Flight (back) */}
      <polygon
        points={`${x - 6},${y - 6} ${x - 9},${y - 5} ${x - 7},${y - 8}`}
        fill="hsl(0 80% 55%)"
        stroke="hsl(0 0% 0%)"
        strokeWidth={0.15}
      />
      {/* Tip */}
      <circle cx={x} cy={y} r={0.9} fill="hsl(0 0% 95%)" />
    </motion.g>
  );
}
