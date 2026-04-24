import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { NumberField } from "@/components/NumberField";
import { AutoBetPanel, type AutoBetRoundResult } from "@/components/AutoBetPanel";
import { formatCoins } from "@/lib/format";
import { Rocket, Zap } from "lucide-react";

const HOUSE_EDGE = 0.99;

export default function Limbo() {
  useTrackGame("limbo");
  const { profile, setLocalCoins } = useUserProfile();
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(2.0);
  const [rolling, setRolling] = useState(false);
  const [last, setLast] = useState<number | null>(null);
  const [lastWon, setLastWon] = useState<boolean | null>(null);
  const [history, setHistory] = useState<{ mult: number; won: boolean }[]>([]);

  const winChance = target > 1 ? +(HOUSE_EDGE * 100 / target).toFixed(2) : 0;

  async function rollOnce(betOverride?: number): Promise<AutoBetRoundResult | null> {
    if (!profile) return null;
    const stake = betOverride ?? bet;
    if (stake < 1) { toast.error("Bet at least 1 coin"); return null; }
    if (stake > profile.coins) { toast.error("Not enough coins"); return null; }
    if (target < 1.01 || target > 1000) { toast.error("Target must be 1.01 – 1000"); return null; }

    setRolling(true);
    setLast(null);
    setLastWon(null);

    // Provably-fair-style: pick a random multiplier with proper distribution
    // P(result >= x) = HOUSE_EDGE / x  →  result = HOUSE_EDGE / U where U in (0,1]
    let u = Math.random();
    if (u < 0.0001) u = 0.0001;
    const result = +(HOUSE_EDGE / u).toFixed(2);
    const won = result >= target;

    await new Promise((r) => setTimeout(r, 700));

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "limbo",
      _bet_amount: stake,
      _won: won,
      _multiplier: target,
      _details: { result, target },
    });
    setRolling(false);
    if (error) {
      toast.error(error.message);
      return null;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setLast(Math.min(result, 9999));
    setLastWon(won);
    setHistory((h) => [{ mult: result, won }, ...h].slice(0, 10));
    const payout = Number(data?.[0]?.payout ?? 0);
    const profit = won ? Math.max(payout - stake, 0) : -stake;
    if (won) toast.success(`+${formatCoins(profit)}`);
    return { won, profit };
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <Rocket className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> LIMBO
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">Pick a target. Hit it or higher to win.</p>
        </div>
        {history.length > 0 && (
          <ul className="flex gap-1.5">
            {history.map((h, i) => (
              <li
                key={i}
                className={`rounded-md px-2 py-1 text-[10px] font-black tabular-nums ${
                  h.won
                    ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                    : "bg-destructive/15 text-destructive"
                }`}
              >
                {h.mult.toFixed(2)}×
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="relative flex min-h-[140px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-xl sm:min-h-[200px] sm:rounded-3xl sm:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={last ?? "idle"}
            initial={{ scale: 0.4, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.4, opacity: 0, y: -30 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className={`text-5xl font-black tabular-nums sm:text-7xl ${
              last === null
                ? "text-foreground/40"
                : lastWon
                  ? "text-[hsl(var(--success))] drop-shadow-[0_0_24px_hsl(var(--success)/0.6)]"
                  : "text-destructive drop-shadow-[0_0_24px_hsl(var(--destructive)/0.6)]"
            }`}
          >
            {rolling ? "..." : `${(last ?? target).toFixed(2)}×`}
          </motion.div>
        </AnimatePresence>
        {lastWon !== null && !rolling && (
          <div
            className={`mt-2 text-xs font-bold uppercase tracking-widest sm:text-sm ${lastWon ? "text-[hsl(var(--success))]" : "text-destructive"}`}
          >
            {lastWon ? "WIN" : "BUST"}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4">
        <ModeTabs mode={mode} onChange={setMode} />
        <div className="mt-3 space-y-3">
          <BetControls bet={bet} setBet={setBet} disabled={rolling} />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Target multiplier
              </label>
              <NumberField
                value={target}
                onChange={setTarget}
                min={1.01}
                max={1000}
                decimal
                disabled={rolling}
                className="mt-1 text-base font-black tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Win chance
              </label>
              <div className="mt-1 rounded-md border border-input bg-background/60 px-3 py-1.5 text-base font-black tabular-nums">
                {winChance}%
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Win pays{" "}
            <span className="font-bold text-foreground">
              {formatCoins(Math.floor(bet * target))}
            </span>
          </div>

          {mode === "manual" ? (
            <Button
              onClick={() => rollOnce()}
              disabled={rolling}
              className="h-11 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:h-12"
            >
              <Zap className="mr-2 h-4 w-4" />
              {rolling ? "LAUNCHING..." : "BET"}
            </Button>
          ) : (
            <AutoBetPanel bet={bet} setBet={setBet} onBet={rollOnce} />
          )}
        </div>
      </div>
    </div>
  );
}

function ModeTabs({ mode, onChange }: { mode: "manual" | "auto"; onChange: (m: "manual" | "auto") => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-background/60 p-1">
      {(["manual", "auto"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-full py-1.5 text-xs font-bold uppercase tracking-widest transition ${
            mode === m ? "bg-card text-foreground shadow" : "text-muted-foreground"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}