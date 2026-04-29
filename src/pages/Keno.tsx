import { useMemo, useState } from "react";
import { useTrackGame } from "@/hooks/usePresence";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BetControls } from "@/components/BetControls";
import { AutoBetPanel, type AutoBetRoundResult } from "@/components/AutoBetPanel";
import { Button } from "@/components/ui/button";
import { formatCoins } from "@/lib/format";
import { motion } from "framer-motion";
import { Dices, Play, RotateCcw, Shuffle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Difficulty = "low" | "medium" | "high";

const BOARD_NUMBERS = Array.from({ length: 40 }, (_, i) => i + 1);
const MAX_PICKS = 10;
const DRAW_REVEAL_MS = 110;
const HOUSE_EDGE = 0.01;

const DIFFICULTY_MULTIPLIERS: Record<Difficulty, number[]> = {
  // Balance pass:
  // - low: notable nerf to reduce overpowered consistency/top-end.
  // - medium/high: slight buffs to keep riskier difficulties more rewarding.
  low: [0, 0, 0.35, 0.70, 1.10, 1.75, 2.60, 3.70, 4.90, 6.20, 8.40],
  medium: [0, 0, 0.22, 1.18, 2.05, 3.25, 5.90, 9.70, 15.0, 23.5, 35.0],
  high: [0, 0, 0, 1.36, 2.35, 4.45, 8.45, 15.2, 27.0, 43.5, 67.0],
};
const DRAW_COUNT_BY_DIFFICULTY: Record<Difficulty, number> = {
  low: 12,
  medium: 10,
  high: 8,
};

function applyHouseEdge(multiplier: number) {
  if (multiplier <= 0) return 0;
  return multiplier * (1 - HOUSE_EDGE);
}

export default function Keno() {
  useTrackGame("keno");
  const { profile, setLocalCoins } = useUserProfile();
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [bet, setBet] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawn, setDrawn] = useState<Set<number>>(new Set());
  const [drawnSequence, setDrawnSequence] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const drawCount = DRAW_COUNT_BY_DIFFICULTY[difficulty];
  const hasEnoughCoins = Boolean(profile && Math.floor(bet) >= 1 && Math.floor(bet) <= profile.coins);

  const hits = useMemo(
    () => [...selected].filter((n) => drawn.has(n)).length,
    [selected, drawn],
  );
  const multiplier =
    selected.size > 0
      ? applyHouseEdge(DIFFICULTY_MULTIPLIERS[difficulty][hits] ?? 0)
      : 0;
  const potentialProfit = Math.max(Math.floor(bet * multiplier) - bet, 0);

  // Show the full payout table for the current pick count + difficulty
  // so players can see exactly what each hit count is worth.
  const payoutTable = useMemo(() => {
    const table = DIFFICULTY_MULTIPLIERS[difficulty];
    const picks = Math.max(selected.size, 1);
    return Array.from({ length: picks + 1 }, (_, k) => ({
      hits: k,
      multiplier: applyHouseEdge(table[k] ?? 0),
    })).filter((row) => row.hits > 0 || row.multiplier > 0);
  }, [difficulty, selected.size]);

  function toggleNumber(n: number) {
    if (rolling) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else if (next.size < MAX_PICKS) next.add(n);
      return next;
    });
  }

  function clearBoard() {
    if (rolling) return;
    setSelected(new Set());
    setDrawn(new Set());
    setDrawnSequence([]);
  }

  function randomPick() {
    if (rolling) return;
    const shuffled = [...BOARD_NUMBERS]
      .sort(() => Math.random() - 0.5)
      .slice(0, MAX_PICKS);
    setSelected(new Set(shuffled));
    setDrawn(new Set());
    setDrawnSequence([]);
  }

  async function placeBet(betOverride?: number): Promise<AutoBetRoundResult | null> {
    if (!profile) return null;
    if (selected.size < 1 || selected.size > MAX_PICKS)
      return null;
    const stake = Math.floor(betOverride ?? bet);
    if (stake < 1) {
      toast.error("Bet must be at least 1 coin");
      return null;
    }
    if (stake > profile.coins) {
      toast.error("Not enough coins for this bet");
      return null;
    }

    setRolling(true);
    setDrawn(new Set());
    setDrawnSequence([]);

    const draw = [...BOARD_NUMBERS]
      .sort(() => Math.random() - 0.5)
      .slice(0, drawCount);
    const drawSet = new Set(draw);
    const hitCount = [...selected].filter((n) => drawSet.has(n)).length;
    const roundMultiplier = applyHouseEdge(
      DIFFICULTY_MULTIPLIERS[difficulty][hitCount] ?? 0,
    );
    // Any non-zero multiplier returns coins (partial refunds like 0.25× still pay).
    // Profit-vs-bet is shown to the user separately below.
    const won = roundMultiplier > 0;

    const animateDraw = new Promise<void>((resolve) => {
      draw.forEach((num, index) => {
        setTimeout(() => {
          setDrawn((prev) => {
            const next = new Set(prev);
            next.add(num);
            return next;
          });
          setDrawnSequence((prev) => [...prev, num]);
          if (index === draw.length - 1) resolve();
        }, (index + 1) * DRAW_REVEAL_MS);
      });
    });

    const betPromise = supabase.rpc("place_bet", {
      _game: "keno",
      _bet_amount: stake,
      _won: won,
      _multiplier: roundMultiplier,
      _details: {
        difficulty,
        picks: [...selected],
        draw,
        hits: hitCount,
      },
    });

    await animateDraw;
    const { data, error } = await betPromise;
    setRolling(false);
    if (error) {
      if (mode === "manual") toast.error(error.message);
      return null;
    }

    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));

    const payout = Number(data?.[0]?.payout ?? 0);
    const profit = payout - stake;
    if (mode === "manual") {
      if (profit > 0)
        toast.success(
          `Hit ${hitCount}! +${formatCoins(profit)} (${roundMultiplier.toFixed(2)}×)`,
        );
      else toast.error(`Hit ${hitCount}. Better luck next draw.`);
    }

    return {
      won: profit > 0,
      profit,
    };
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
          <Dices className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> KENO
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Pick up to 10 numbers. The more hits, the bigger the payout.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <aside className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl">
          <div className="space-y-3">
            <ModeTabs mode={mode} onChange={setMode} />
            <BetControls bet={bet} setBet={setBet} disabled={rolling} />

            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Difficulty
              </label>
              <Select
                value={difficulty}
                onValueChange={(value) => setDifficulty(value as Difficulty)}
                disabled={rolling}
              >
                <SelectTrigger className="mt-1 font-bold">
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={randomPick}
                disabled={rolling}
                className="h-10"
              >
                <Shuffle className="mr-1.5 h-4 w-4" /> Random
              </Button>
              <Button
                variant="secondary"
                onClick={clearBoard}
                disabled={rolling}
                className="h-10"
              >
                <RotateCcw className="mr-1.5 h-4 w-4" /> Clear
              </Button>
            </div>

            {mode === "manual" ? (
              <Button
                onClick={() => {
                  if (selected.size < 1 || selected.size > MAX_PICKS) {
                    toast.error("Pick 1 to 10 numbers");
                    return;
                  }
                  placeBet();
                }}
                disabled={rolling || selected.size === 0 || !profile || !hasEnoughCoins}
                className="h-12 w-full text-base font-black"
              >
                <Play className="mr-2 h-4 w-4" /> {rolling ? "DRAWING..." : "BET"}
              </Button>
            ) : (
              <AutoBetPanel
                bet={bet}
                setBet={setBet}
                onBet={placeBet}
                disabled={rolling || selected.size === 0 || !profile || !hasEnoughCoins}
                intervalMs={350}
              />
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-border bg-background/50 p-2">
                <p className="text-muted-foreground">Picks</p>
                <p className="text-sm font-black">{selected.size}/10</p>
              </div>
              <div className="rounded-xl border border-border bg-background/50 p-2">
                <p className="text-muted-foreground">Drawn</p>
                <p className="text-sm font-black">
                  {drawnSequence.length}/{drawCount}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/50 p-2">
                <p className="text-muted-foreground">Hits</p>
                <p className="text-sm font-black text-[hsl(var(--success))]">
                  {hits}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/50 p-2">
                <p className="text-muted-foreground">Multiplier</p>
                <p className="text-sm font-black text-primary">
                  {multiplier.toFixed(2)}×
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-primary/25 bg-primary/10 p-2.5 text-xs font-semibold">
              Profit on win:{" "}
              <span className="font-black">+{formatCoins(potentialProfit)}</span>
            </div>
          </div>
        </aside>

        <section className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl sm:p-5">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 sm:gap-2.5">
            {BOARD_NUMBERS.map((n) => {
              const isSelected = selected.has(n);
              const isDrawn = drawn.has(n);
              const isHit = isSelected && isDrawn;

              return (
                <motion.button
                  key={n}
                  type="button"
                  onClick={() => toggleNumber(n)}
                  disabled={rolling}
                  whileTap={{ scale: 0.94 }}
                  animate={
                    isHit
                      ? { scale: [1, 1.14, 1] }
                      : isDrawn
                        ? { scale: [1, 1.06, 1] }
                        : isSelected
                          ? { scale: 1.02 }
                          : { scale: 1 }
                  }
                  transition={{ duration: isHit ? 0.45 : 0.2, ease: "easeOut" }}
                  className={`aspect-square rounded-xl border text-base font-black tabular-nums transition sm:text-lg ${
                    isHit
                      ? "border-[hsl(var(--success))] bg-[hsl(var(--success))]/25 text-[hsl(var(--success))] shadow-[0_0_22px_hsl(var(--success)/0.45)]"
                      : isSelected
                        ? "border-primary bg-primary/20 text-foreground"
                        : isDrawn
                          ? "border-destructive/60 bg-destructive/15 text-destructive"
                          : "border-border bg-background/60 hover:border-primary/60"
                  }`}
                >
                  {n}
                </motion.button>
              );
            })}
          </div>

          {/* Payout table */}
          <div className="mt-4 rounded-2xl border border-border bg-background/40 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Payout table — {selected.size || 1} pick{selected.size === 1 ? "" : "s"}
            </p>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
              {payoutTable.map((row) => (
                <div
                  key={row.hits}
                  className={`rounded-lg border px-2 py-1.5 text-center ${
                    row.hits === hits && drawnSequence.length > 0
                      ? "border-primary bg-primary/20"
                      : "border-border bg-background/60"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    {row.hits}×
                  </p>
                  <p className="text-xs font-black tabular-nums">
                    {row.multiplier.toFixed(2)}×
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ModeTabs({
  mode,
  onChange,
}: {
  mode: "manual" | "auto";
  onChange: (mode: "manual" | "auto") => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-background/50 p-1">
      {(["manual", "auto"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
            mode === m
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
