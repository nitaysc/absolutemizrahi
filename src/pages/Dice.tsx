import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";

const HOUSE_EDGE = 0.99; // 1% edge

export default function Dice() {
  const { profile, refetch } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(50); // win if roll < target (rollover off)
  const [mode, setMode] = useState<"under" | "over">("under");
  const [rolling, setRolling] = useState(false);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [lastWon, setLastWon] = useState<boolean | null>(null);

  const winChance = mode === "under" ? target : 100 - target;
  const multiplier = winChance > 0 ? +(HOUSE_EDGE * (100 / winChance)).toFixed(4) : 0;
  const profit = Math.floor(bet * multiplier) - bet;

  async function roll() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    if (winChance < 1 || winChance > 95) return toast.error("Invalid target");

    setRolling(true);
    const result = +(Math.random() * 100).toFixed(2);
    const won = mode === "under" ? result < target : result > target;

    // Brief animation
    await new Promise((r) => setTimeout(r, 600));

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "dice",
      _bet_amount: bet,
      _won: won,
      _multiplier: multiplier,
      _details: { roll: result, target, mode },
    });
    setRolling(false);
    if (error) return toast.error(error.message);

    setLastRoll(result);
    setLastWon(won);
    refetch();
    if (won) toast.success(`+${formatCoins(data?.[0]?.payout ?? 0)} coins!`);
  }

  function half() { setBet((b) => Math.max(1, Math.floor(b / 2))); }
  function double() { setBet((b) => Math.min(profile?.coins ?? b * 2, b * 2)); }
  function max() { setBet(profile?.coins ?? bet); }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">DICE</h1>
        <p className="text-sm text-muted-foreground">Roll {mode === "under" ? "under" : "over"} {target} to win</p>
      </header>

      {/* Roll display */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-8 backdrop-blur-xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={lastRoll ?? "idle"}
            initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className="flex flex-col items-center"
          >
            <div
              className={`text-7xl font-black tabular-nums sm:text-8xl ${
                lastWon === null ? "text-foreground" : lastWon ? "text-[hsl(var(--success))]" : "text-destructive"
              }`}
            >
              {rolling ? "..." : (lastRoll ?? (50).toFixed(2))}
            </div>
            {lastWon !== null && !rolling && (
              <div className={`mt-2 text-sm font-bold uppercase tracking-widest ${lastWon ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                {lastWon ? "WIN" : "BUST"}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Slider track */}
        <div className="mt-8">
          <Slider
            value={[target]}
            onValueChange={(v) => setTarget(v[0])}
            min={2}
            max={98}
            step={1}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>0</span>
            <span className="font-bold text-primary">Target: {target}</span>
            <span>100</span>
          </div>
        </div>

        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setMode("under")}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${mode === "under" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            Roll Under
          </button>
          <button
            onClick={() => setMode("over")}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${mode === "over" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            Roll Over
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Multiplier" value={`${multiplier.toFixed(2)}×`} />
        <Stat label="Win chance" value={`${winChance.toFixed(0)}%`} />
        <Stat label="Profit" value={formatCoins(profit)} icon />
      </div>

      {/* Bet controls */}
      <div className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bet amount</label>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <MizrahiCoin size={18} className="absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="number"
              min={1}
              value={bet}
              onChange={(e) => setBet(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
              className="pl-10 text-lg font-bold tabular-nums"
            />
          </div>
          <Button variant="secondary" onClick={half} type="button">½</Button>
          <Button variant="secondary" onClick={double} type="button">2×</Button>
          <Button variant="secondary" onClick={max} type="button">Max</Button>
        </div>

        <Button
          onClick={roll}
          disabled={rolling}
          className="mt-4 h-14 w-full text-lg font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
        >
          {rolling ? "ROLLING..." : "ROLL DICE"}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3 backdrop-blur">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center justify-center gap-1 text-base font-black tabular-nums">
        {icon && <MizrahiCoin size={14} />}
        {value}
      </div>
    </div>
  );
}