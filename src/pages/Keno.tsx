import { useMemo, useState } from "react";
import { useTrackGame } from "@/hooks/usePresence";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BetControls } from "@/components/BetControls";
import { Button } from "@/components/ui/button";
import { formatCoins } from "@/lib/format";
import { Target } from "lucide-react";

type Difficulty = "low" | "medium" | "high";

const BOARD_NUMBERS = Array.from({ length: 40 }, (_, i) => i + 1);

const DIFFICULTY_MULTIPLIERS: Record<Difficulty, number[]> = {
  low: [0, 0, 0.6, 1.1, 1.8, 3, 5, 8, 12, 18, 26],
  medium: [0, 0, 0.3, 1.4, 2.4, 4.2, 8, 13, 20, 32, 48],
  high: [0, 0, 0, 1.8, 3.2, 6, 12, 22, 40, 65, 100],
};

export default function Keno() {
  useTrackGame("keno");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawn, setDrawn] = useState<Set<number>>(new Set());
  const [rolling, setRolling] = useState(false);

  const hits = useMemo(
    () => [...selected].filter((n) => drawn.has(n)).length,
    [selected, drawn],
  );
  const multiplier = selected.size > 0 ? DIFFICULTY_MULTIPLIERS[difficulty][hits] ?? 0 : 0;
  const potentialProfit = Math.max(Math.floor(bet * multiplier) - bet, 0);

  function toggleNumber(n: number) {
    if (rolling) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else if (next.size < 10) next.add(n);
      return next;
    });
  }

  function clearBoard() {
    if (rolling) return;
    setSelected(new Set());
    setDrawn(new Set());
  }

  function randomPick() {
    if (rolling) return;
    const shuffled = [...BOARD_NUMBERS].sort(() => Math.random() - 0.5).slice(0, 10);
    setSelected(new Set(shuffled));
    setDrawn(new Set());
  }

  async function placeBet() {
    if (!profile) return;
    if (selected.size < 1 || selected.size > 10) return toast.error("Pick 1 to 10 numbers");
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");

    setRolling(true);
    const draw = [...BOARD_NUMBERS].sort(() => Math.random() - 0.5).slice(0, 10);
    const drawSet = new Set(draw);
    const hitCount = [...selected].filter((n) => drawSet.has(n)).length;
    const roundMultiplier = DIFFICULTY_MULTIPLIERS[difficulty][hitCount] ?? 0;
    const won = roundMultiplier > 1;

    const { data, error } = await supabase.rpc("place_bet", {
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

    setRolling(false);
    if (error) return toast.error(error.message);

    setDrawn(drawSet);
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
        <p className="mt-1 text-sm text-muted-foreground">Select up to 10 numbers and match the draw.</p>

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
              <button
                key={n}
                onClick={() => toggleNumber(n)}
                disabled={rolling}
                className={`aspect-square rounded-xl border text-xl font-black transition ${
                  isHit
                    ? "border-emerald-400 bg-emerald-500/30 text-emerald-200"
                    : isSelected
                      ? "border-primary bg-primary/25 text-primary"
                      : isDrawn
                        ? "border-amber-400 bg-amber-500/20 text-amber-100"
                        : "border-border bg-background/60 text-foreground hover:border-primary/50"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
