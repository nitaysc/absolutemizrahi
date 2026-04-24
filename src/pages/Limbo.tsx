import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { NumberField } from "@/components/NumberField";
import { formatCoins } from "@/lib/format";
import { Rocket, Repeat, Zap } from "lucide-react";

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

  const [autoBets, setAutoBets] = useState(10);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const stopAuto = useRef(false);

  const winChance = target > 1 ? +(HOUSE_EDGE * 100 / target).toFixed(2) : 0;

  async function rollOnce() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    if (target < 1.01 || target > 1000) return toast.error("Target must be 1.01 – 1000");

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
      _bet_amount: bet,
      _won: won,
      _multiplier: target,
      _details: { result, target },
    });
    setRolling(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setLast(Math.min(result, 9999));
    setLastWon(won);
    setHistory((h) => [{ mult: result, won }, ...h].slice(0, 10));
    if (won) toast.success(`+${formatCoins(data?.[0]?.payout ?? 0)}`);
  }

  async function runAuto() {
    if (autoRunning) {
      stopAuto.current = true;
      return;
    }
    stopAuto.current = false;
    setAutoRunning(true);
    setAutoLeft(autoBets);
    for (let i = 0; i < autoBets; i++) {
      if (stopAuto.current) break;
      await rollOnce();
      setAutoLeft(autoBets - i - 1);
      await new Promise((r) => setTimeout(r, 250));
    }
    setAutoRunning(false);
  }

  useEffect(() => () => { stopAuto.current = true; }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
            <Rocket className="h-7 w-7 text-primary" /> LIMBO
          </h1>
          <p className="text-sm text-muted-foreground">Pick a target. Hit it or higher to win.</p>
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

      <div className="relative flex min-h-[260px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-border bg-card/70 p-8 backdrop-blur-xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={last ?? "idle"}
            initial={{ scale: 0.4, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.4, opacity: 0, y: -30 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className={`text-7xl font-black tabular-nums sm:text-8xl ${
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
            className={`mt-3 text-sm font-bold uppercase tracking-widest ${lastWon ? "text-[hsl(var(--success))]" : "text-destructive"}`}
          >
            {lastWon ? "WIN" : "BUST"}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
        <ModeTabs mode={mode} onChange={setMode} />
        <div className="mt-4 space-y-4">
          <BetControls bet={bet} setBet={setBet} disabled={autoRunning} />

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
                disabled={autoRunning}
                className="mt-2 text-lg font-black tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Win chance
              </label>
              <div className="mt-2 rounded-md border border-input bg-background/60 px-3 py-2 text-lg font-black tabular-nums">
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

          {mode === "auto" && (
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Number of bets
              </label>
              <NumberField
                value={autoBets}
                onChange={setAutoBets}
                min={1}
                max={10000}
                disabled={autoRunning}
                className="mt-2"
              />
            </div>
          )}

          {mode === "manual" ? (
            <Button
              onClick={rollOnce}
              disabled={rolling}
              className="h-14 w-full text-lg font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
            >
              <Zap className="mr-2 h-5 w-5" />
              {rolling ? "LAUNCHING..." : "BET"}
            </Button>
          ) : (
            <Button
              onClick={runAuto}
              className={`h-14 w-full text-lg font-black tracking-wider ${autoRunning ? "bg-destructive hover:bg-destructive" : ""}`}
            >
              <Repeat className="mr-2 h-5 w-5" />
              {autoRunning ? `STOP (${autoLeft})` : `START AUTO (${autoBets})`}
            </Button>
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