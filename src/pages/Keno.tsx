import { useMemo, useState } from "react";
import { useTrackGame } from "@/hooks/usePresence";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BetControls } from "@/components/BetControls";
import { Button } from "@/components/ui/button";
import { formatCoins } from "@/lib/format";
import { motion } from "framer-motion";
import {
  Compass,
  Gauge,
  Plane,
  Play,
  Radar,
  RotateCcw,
  Shuffle,
  Target,
} from "lucide-react";
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
const DRAW_REVEAL_MS = 120;
const HOUSE_EDGE = 0.01;

const DIFFICULTY_MULTIPLIERS: Record<Difficulty, number[]> = {
  low: [0, 0, 0.55, 1, 1.65, 2.6, 4, 6.2, 9.5, 14, 20],
  medium: [0, 0, 0.25, 1.25, 2.1, 3.5, 6.7, 11, 17, 27, 40],
  high: [0, 0, 0, 1.45, 2.5, 4.8, 9.5, 17.5, 32, 52, 80],
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
  const [bet, setBet] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawn, setDrawn] = useState<Set<number>>(new Set());
  const [drawnSequence, setDrawnSequence] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const drawCount = DRAW_COUNT_BY_DIFFICULTY[difficulty];

  const hits = useMemo(
    () => [...selected].filter((n) => drawn.has(n)).length,
    [selected, drawn],
  );
  const multiplier =
    selected.size > 0
      ? applyHouseEdge(DIFFICULTY_MULTIPLIERS[difficulty][hits] ?? 0)
      : 0;
  const potentialProfit = Math.max(Math.floor(bet * multiplier) - bet, 0);

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

  async function placeBet() {
    if (!profile) return;
    if (selected.size < 1 || selected.size > MAX_PICKS)
      return toast.error("Pick 1 to 10 numbers");
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");

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
    const won = roundMultiplier > 1;

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
      _bet_amount: bet,
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
    if (error) return toast.error(error.message);

    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));

    const payout = Number(data?.[0]?.payout ?? 0);
    const profit = payout - bet;
    if (profit > 0)
      toast.success(
        `Hit ${hitCount}! +${formatCoins(profit)} (${roundMultiplier.toFixed(2)}×)`,
      );
    else toast.error(`Hit ${hitCount}. Better luck next draw.`);
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-4 text-foreground shadow-[0_20px_60px_rgba(6,12,40,0.35)] backdrop-blur-xl sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.15),transparent_68%)]" />
      <div className="pointer-events-none absolute -bottom-16 left-1/2 h-56 w-[120%] -translate-x-1/2 rounded-[100%] bg-background/70" />

      <div className="relative grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <section className="rounded-3xl border border-border bg-background/40 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-wide">
              <Plane className="h-6 w-6 text-primary" /> SKY KENO
            </h1>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
              live
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Aviator-style cockpit with classic Keno mechanics. Pick up to 10 numbers
            and launch for a higher multiplier.
          </p>

          <div className="mt-4 space-y-4">
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
                  <SelectItem value="low">Low turbulence</SelectItem>
                  <SelectItem value="medium">Cruise</SelectItem>
                  <SelectItem value="high">Storm</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={randomPick}
                disabled={rolling}
                className="h-11 border border-border bg-background/60 hover:bg-muted"
              >
                <Shuffle className="mr-2 h-4 w-4" /> Random
              </Button>
              <Button
                variant="secondary"
                onClick={clearBoard}
                disabled={rolling}
                className="h-11 border border-border bg-background/60 hover:bg-muted"
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Reset
              </Button>
            </div>

            <Button
              onClick={placeBet}
              disabled={rolling || selected.size === 0}
              className="h-14 w-full rounded-2xl text-lg font-black tracking-wide shadow-[0_0_25px_hsl(var(--primary)/0.35)]"
            >
              <Play className="mr-2 h-5 w-5" /> {rolling ? "LAUNCHING..." : "LAUNCH ROUND"}
            </Button>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Selected</p>
                <p className="text-xl font-black">{selected.size}/10</p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Drawn</p>
                <p className="text-xl font-black">{drawnSequence.length}/{drawCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Hits</p>
                <p className="text-xl font-black text-[hsl(var(--success))]">{hits}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Multiplier</p>
                <p className="text-xl font-black text-primary">{multiplier.toFixed(2)}×</p>
              </div>
            </div>

            <div className="rounded-xl border border-primary/25 bg-primary/10 p-3 text-sm font-semibold text-foreground">
              Profit on win: <span className="font-black">+{formatCoins(potentialProfit)}</span>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-background/35 p-4 backdrop-blur-sm sm:p-5">
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
              <Gauge className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Altitude</p>
                <p className="text-sm font-bold">{drawnSequence.length * 120} m</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
              <Compass className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Distance</p>
                <p className="text-sm font-bold">{selected.size * 8} km</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
              <Radar className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Target Lock</p>
                <p className="text-sm font-bold">{Math.round((hits / Math.max(selected.size, 1)) * 100)}%</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 sm:gap-3">
            {BOARD_NUMBERS.map((n) => {
              const isSelected = selected.has(n);
              const isDrawn = drawn.has(n);
              const isHit = isSelected && isDrawn;

              return (
                <motion.button
                  key={n}
                  onClick={() => toggleNumber(n)}
                  disabled={rolling}
                  whileTap={{ scale: 0.94 }}
                  animate={
                    isHit
                      ? { scale: [1, 1.14, 1], rotate: [0, -3, 3, 0] }
                      : isDrawn
                        ? { scale: [1, 1.08, 1] }
                        : isSelected
                          ? { scale: 1.03 }
                          : { scale: 1 }
                  }
                  transition={{ duration: isHit ? 0.45 : 0.25, ease: "easeOut" }}
                  className={`aspect-square rounded-xl border text-lg font-black transition sm:text-xl ${
                    isHit
                      ? "border-emerald-300 bg-emerald-500/35 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.55)]"
                      : isSelected
                        ? "border-cyan-300 bg-cyan-400/30 text-white"
                        : isDrawn
                          ? "border-amber-300 bg-amber-400/25 text-amber-100"
                          : "border-border bg-background/60 hover:border-primary/70"
                  }`}
                >
                  {n}
                </motion.button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Target className="h-4 w-4 text-primary" />
            Draw order: {drawnSequence.length ? drawnSequence.join(" · ") : "Waiting for launch"}
          </div>
        </section>
      </div>
    </div>
  );
}
