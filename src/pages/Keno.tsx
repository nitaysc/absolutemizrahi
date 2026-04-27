import { useMemo, useState } from "react";
import { useTrackGame } from "@/hooks/usePresence";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BetControls } from "@/components/BetControls";
import { Button } from "@/components/ui/button";
import { formatCoins } from "@/lib/format";
import { Target } from "lucide-react";
import { motion } from "framer-motion";

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
  const multiplier = selected.size > 0 ? applyHouseEdge(DIFFICULTY_MULTIPLIERS[difficulty][hits] ?? 0) : 0;
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
    const shuffled = [...BOARD_NUMBERS].sort(() => Math.random() - 0.5).slice(0, MAX_PICKS);
    setSelected(new Set(shuffled));
    setDrawn(new Set());
    setDrawnSequence([]);
  }

  async function placeBet() {
    if (!profile) return;
    if (selected.size < 1 || selected.size > MAX_PICKS) return toast.error("Pick 1 to 10 numbers");
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");

    setRolling(true);
    setDrawn(new Set());
    setDrawnSequence([]);

    const draw = [...BOARD_NUMBERS].sort(() => Math.random() - 0.5).slice(0, drawCount);
    const drawSet = new Set(draw);
    const hitCount = [...selected].filter((n) => drawSet.has(n)).length;
    const roundMultiplier = applyHouseEdge(DIFFICULTY_MULTIPLIERS[difficulty][hitCount] ?? 0);
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
    if (profit > 0) toast.success(`Hit ${hitCount}! +${formatCoins(profit)} (${roundMultiplier.toFixed(2)}×)`);
    else toast.error(`Hit ${hitCount}. Better luck next draw.`);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
      <section className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl">
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Target className="h-6 w-6 text-primary" /> KENO
        </h1>
            <p className="mt-1 text-sm text-muted-foreground">
          Select up to 10 numbers and match the draw. Higher difficulty draws fewer numbers, but can pay more.
        </p>

        <div className="mt-4 space-y-4">
          <BetControls bet={bet} setBet={setBet} disabled={rolling} />

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Difficulty
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              disabled={rolling}
              className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <Button variant="secondary" onClick={randomPick} disabled={rolling} className="w-full">
            Random Pick
          </Button>
          <Button variant="secondary" onClick={clearBoard} disabled={rolling} className="w-full">
            Clear Table
          </Button>
          <Button onClick={placeBet} disabled={rolling || selected.size === 0} className="w-full text-base font-black">
            {rolling ? "BETTING..." : "Bet"}
          </Button>

          <div className="rounded-xl bg-background/50 p-3 text-sm">
            <p className="font-semibold">Selected: {selected.size}/10</p>
            <p className="text-muted-foreground">Drawn: {drawnSequence.length}/{drawCount}</p>
            <p className="text-muted-foreground">Hits: {hits}</p>
            <p className="text-muted-foreground">Current Multiplier: {multiplier.toFixed(2)}×</p>
            <p className="font-semibold text-primary">Profit on win: +{formatCoins(potentialProfit)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl sm:p-6">
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
                className={`aspect-square rounded-xl border text-xl font-black transition ${
                  isHit
                    ? "border-emerald-300 bg-emerald-500/35 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.55)]"
                    : isSelected
                      ? "border-primary bg-primary/25 text-primary"
                    : isDrawn
                        ? "border-amber-400 bg-amber-500/20 text-amber-100"
                        : "border-border bg-background/60 text-foreground hover:border-primary/50"
                }`}
              >
                {n}
              </motion.button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
