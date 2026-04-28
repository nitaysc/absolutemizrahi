import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { AutoBetPanel, type AutoBetRoundResult } from "@/components/AutoBetPanel";
import { formatCoins } from "@/lib/format";
import { triggerBigWin } from "@/components/WinBurst";
import { Zap } from "lucide-react";

const HOUSE_EDGE = 0.99;

type Mode = "manual" | "auto";
type Dir = "over" | "under";

export default function Dice() {
  useTrackGame("dice");
  const { profile, setLocalCoins } = useUserProfile();
  const [mode, setMode] = useState<Mode>("manual");
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(50);
  const [dir, setDir] = useState<Dir>("over");
  const [rolling, setRolling] = useState(false);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [history, setHistory] = useState<{ roll: number; won: boolean }[]>([]);

  const winChance = dir === "under" ? target : 100 - target;
  const multiplier = winChance > 0 ? +(HOUSE_EDGE * (100 / winChance)).toFixed(4) : 0;
  const profit = Math.floor(bet * multiplier) - bet;

  async function rollOnce(betOverride?: number): Promise<AutoBetRoundResult | null> {
    if (!profile) return null;
    const stake = betOverride ?? bet;
    if (stake < 1) {
      toast.error("Bet at least 1 coin");
      return null;
    }
    if (stake > profile.coins) {
      toast.error("Not enough coins");
      return null;
    }
    if (winChance < 2 || winChance > 98) {
      toast.error("Invalid target");
      return null;
    }

    setRolling(true);
    const result = +(Math.random() * 100).toFixed(2);
    const won = dir === "under" ? result < target : result > target;

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "dice",
      _bet_amount: stake,
      _won: won,
      _multiplier: multiplier,
      _details: { roll: result, target, dir },
    });
    setRolling(false);

    if (error) {
      toast.error(error.message);
      return null;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setLastRoll(result);
    setHistory((h) => [{ roll: result, won }, ...h].slice(0, 10));
    const payout = Number(data?.[0]?.payout ?? 0);
    if (won && multiplier >= 5) triggerBigWin(multiplier, "Dice win");
    return { won, profit: won ? Math.max(payout - stake, 0) : -stake };
  }

  // Slider bar: red on the losing side, green on winning side
  const greenStart = dir === "under" ? 0 : target;
  const greenEnd = dir === "under" ? target : 100;
  const greenPct = greenEnd - greenStart;

  return (
    <div className="space-y-3 sm:space-y-4">
      <Header title="DICE" subtitle={`Roll ${dir} ${target} to win`} history={history} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_320px] sm:gap-4">
      {/* Game panel */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-5">
        {/* Result number */}
        <AnimatePresence mode="wait">
          <motion.div
            key={lastRoll ?? "idle"}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 18 }}
            className="flex flex-col items-center"
          >
            <div
              className={`text-4xl font-black tabular-nums sm:text-6xl ${
                lastRoll === null
                  ? "text-foreground/40"
                  : isWin(lastRoll, target, dir)
                    ? "text-[hsl(var(--success))] drop-shadow-[0_0_20px_hsl(var(--success)/0.5)]"
                    : "text-destructive drop-shadow-[0_0_20px_hsl(var(--destructive)/0.5)]"
              }`}
            >
              {rolling ? "..." : (lastRoll?.toFixed(2) ?? "00.00")}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Stake-style slider */}
        <div className="mt-4 sm:mt-6">
          <div className="relative h-2.5 rounded-full bg-secondary">
            {/* red full */}
            <div className="absolute inset-0 rounded-full bg-destructive/70" />
            {/* green winning region */}
            <div
              className="absolute top-0 h-full bg-[hsl(var(--success))] shadow-[0_0_12px_hsl(var(--success)/0.6)]"
              style={{
                left: `${greenStart}%`,
                width: `${greenPct}%`,
                borderTopLeftRadius: greenStart === 0 ? 9999 : 0,
                borderBottomLeftRadius: greenStart === 0 ? 9999 : 0,
                borderTopRightRadius: greenEnd === 100 ? 9999 : 0,
                borderBottomRightRadius: greenEnd === 100 ? 9999 : 0,
              }}
            />
            {/* dice token at last roll */}
            <AnimatePresence>
              {lastRoll !== null && !rolling && (
                <motion.div
                  key={lastRoll + "-token"}
                  initial={{ y: -28, opacity: 0, scale: 0.6 }}
                  animate={{ y: -8, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 14 }}
                  className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${lastRoll}%` }}
                >
                  <div className="flex h-7 w-10 items-center justify-center rounded-md bg-foreground text-[10px] font-black text-background shadow-lg">
                    {lastRoll.toFixed(2)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* hidden range slider for input */}
            <Slider
              value={[target]}
              onValueChange={(v) => setTarget(v[0])}
              min={2}
              max={98}
              step={1}
              className="absolute inset-0 opacity-0"
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-bold text-muted-foreground">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>

          {/* Manual target input */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <Slider
              value={[target]}
              onValueChange={(v) => setTarget(v[0])}
              min={2}
              max={98}
              step={1}
              className="flex-1"
            />
          </div>
        </div>

        <div className="mt-3 flex justify-center gap-2">
          <Toggle active={dir === "under"} onClick={() => setDir("under")}>
            Roll Under
          </Toggle>
          <Toggle active={dir === "over"} onClick={() => setDir("over")}>
            Roll Over
          </Toggle>
        </div>

        {/* Stat row (Stake-style multiplier / target / chance) */}
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-background/60 p-2">
          <Stat label="Multiplier" value={`${multiplier.toFixed(2)}×`} />
          <Stat
            label={dir === "under" ? "Roll Under" : "Roll Over"}
            value={target.toString()}
            editable
            onChange={(n) => setTarget(Math.max(2, Math.min(98, Math.round(n))))}
          />
          <Stat label="Win Chance" value={`${winChance.toFixed(2)}%`} suffix />
        </div>
      </div>

      {/* Bet panel */}
      <div className="rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4">
        <ModeTabs mode={mode} onChange={setMode} />

        <div className="mt-3 space-y-3">
          <BetControls bet={bet} setBet={setBet} disabled={rolling} />
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <MiniStat label="Profit on win" value={`+${formatCoins(profit)}`} good />
            <MiniStat label="Loss on lose" value={`-${formatCoins(bet)}`} bad />
          </div>

          {mode === "manual" ? (
            <Button
              onClick={() => rollOnce()}
              disabled={rolling}
              className="h-11 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:h-12"
            >
              <Zap className="mr-2 h-4 w-4" />
              {rolling ? "ROLLING..." : "ROLL DICE"}
            </Button>
          ) : (
            <AutoBetPanel bet={bet} setBet={setBet} onBet={rollOnce} />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function isWin(roll: number, target: number, dir: Dir) {
  return dir === "under" ? roll < target : roll > target;
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
        active
          ? "bg-primary text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.4)]"
          : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: string;
  editable?: boolean;
  onChange?: (n: number) => void;
  suffix?: boolean;
}) {
  // Local string buffer for editable variant so users can clear/type freely.
  const [text, setText] = useState(value);
  useEffect(() => {
    if (editable && text !== value) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editable]);

  return (
    <div className="rounded-xl bg-card/60 p-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {editable ? (
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, "");
            setText(v);
            const n = Number(v);
            if (v !== "" && Number.isFinite(n)) onChange?.(n);
          }}
          onBlur={() => {
            const n = Math.floor(Number(text));
            if (!Number.isFinite(n) || n < 2) {
              onChange?.(2);
              setText("2");
            } else {
              setText(String(n));
            }
          }}
          className="mt-1 w-full bg-transparent text-center text-base font-black outline-none"
        />
      ) : (
        <div className="mt-1 text-center text-base font-black tabular-nums">{value}</div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  good,
  bad,
}: {
  label: string;
  value: string;
  good?: boolean;
  bad?: boolean;
}) {
  return (
    <div className="rounded-xl bg-background/60 p-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-sm font-black tabular-nums ${good ? "text-[hsl(var(--success))]" : ""} ${bad ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-background/60 p-1">
      {(["manual", "auto"] as Mode[]).map((m) => (
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

function Header({
  title,
  subtitle,
  history,
}: {
  title: string;
  subtitle: string;
  history: { roll: number; won: boolean }[];
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
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
              {h.roll.toFixed(2)}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}