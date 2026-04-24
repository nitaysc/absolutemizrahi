import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { Plane, Coins, Rocket } from "lucide-react";

type Pace = "slow" | "normal" | "fast";

// Each pace controls tick speed and per-tick event chances.
// Expected value is tuned just under 1 (~0.97 RTP) to keep a small house edge,
// matching the Aviamasters ~97% RTP feel.
const PACE_CFG: Record<
  Pace,
  { tickMs: number; coinChance: number; rocketChance: number; coinGain: [number, number] }
> = {
  slow:   { tickMs: 900, coinChance: 0.34, rocketChance: 0.10, coinGain: [0.15, 0.40] },
  normal: { tickMs: 650, coinChance: 0.38, rocketChance: 0.16, coinGain: [0.20, 0.55] },
  fast:   { tickMs: 420, coinChance: 0.42, rocketChance: 0.24, coinGain: [0.25, 0.80] },
};

type Event = { kind: "coin" | "rocket"; value: number; id: number };

export default function Aviamasters() {
  useTrackGame("aviamasters");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [pace, setPace] = useState<Pace>("normal");
  const [flying, setFlying] = useState(false);
  const [mult, setMult] = useState(1);
  const [busted, setBusted] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [history, setHistory] = useState<{ mult: number; won: boolean }[]>([]);
  const tickRef = useRef<number | null>(null);
  const evtIdRef = useRef(0);
  const stakeRef = useRef(0);
  const multRef = useRef(1);

  useEffect(() => () => stopTicker(), []);

  function stopTicker() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function start() {
    if (!profile) return;
    if (flying) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");

    setBusted(false);
    setEvents([]);
    setMult(1);
    multRef.current = 1;
    stakeRef.current = bet;
    setFlying(true);
    // Optimistic balance: take the wager away immediately so the UI matches
    // what the bankroll will look like — we settle for real on land/bust.
    setLocalCoins(profile.coins - bet);

    const cfg = PACE_CFG[pace];
    tickRef.current = window.setInterval(() => tick(cfg), cfg.tickMs);
  }

  function tick(cfg: typeof PACE_CFG.normal) {
    const r = Math.random();
    let kind: "coin" | "rocket" | null = null;
    if (r < cfg.rocketChance) kind = "rocket";
    else if (r < cfg.rocketChance + cfg.coinChance) kind = "coin";

    if (!kind) return;

    if (kind === "coin") {
      const [lo, hi] = cfg.coinGain;
      const gain = +(lo + Math.random() * (hi - lo)).toFixed(2);
      const next = +(multRef.current + gain).toFixed(2);
      multRef.current = next;
      setMult(next);
      pushEvent({ kind: "coin", value: gain, id: ++evtIdRef.current });
    } else {
      const next = +(multRef.current * 0.5).toFixed(2);
      pushEvent({ kind: "rocket", value: next, id: ++evtIdRef.current });
      multRef.current = next;
      setMult(next);
      // Plane crashes if multiplier drops below 1×.
      if (next < 1) void bust();
    }
  }

  function pushEvent(e: Event) {
    setEvents((arr) => [...arr.slice(-5), e]);
  }

  async function bust() {
    if (!flying) return;
    stopTicker();
    setFlying(false);
    setBusted(true);
    const stake = stakeRef.current;
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "aviamasters",
      _bet_amount: stake,
      _won: false,
      _multiplier: 0,
      _details: { pace, final_mult: multRef.current, outcome: "crashed" },
    });
    if (error) return toast.error(error.message);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setHistory((h) => [{ mult: multRef.current, won: false }, ...h].slice(0, 10));
    toast.error(`Crashed at ${multRef.current.toFixed(2)}×`);
  }

  async function land() {
    if (!flying) return;
    stopTicker();
    setFlying(false);
    const stake = stakeRef.current;
    const finalMult = +multRef.current.toFixed(2);
    const won = finalMult >= 1.0;
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "aviamasters",
      _bet_amount: stake,
      _won: won,
      _multiplier: won ? finalMult : 0,
      _details: { pace, final_mult: finalMult, outcome: "landed" },
    });
    if (error) return toast.error(error.message);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    const payout = Number(data?.[0]?.payout ?? 0);
    setHistory((h) => [{ mult: finalMult, won }, ...h].slice(0, 10));
    if (won) toast.success(`+${formatCoins(payout - stake)} @ ${finalMult.toFixed(2)}×`);
    else toast.error(`Landed at ${finalMult.toFixed(2)}×`);
  }

  const potentialPayout = Math.floor(stakeRef.current * mult);

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <Plane className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> AVIAMASTERS
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Grab coins, dodge rockets, land before you crash.
          </p>
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

      {/* Sky */}
      <div className="relative h-64 overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-sky-700/40 via-sky-500/20 to-sky-300/10 backdrop-blur-xl sm:h-80 sm:rounded-3xl">
        {/* Clouds */}
        <div aria-hidden className="absolute inset-0 opacity-40">
          <div className="absolute left-[10%] top-[20%] h-10 w-24 rounded-full bg-white/30 blur-2xl" />
          <div className="absolute left-[55%] top-[60%] h-14 w-32 rounded-full bg-white/30 blur-2xl" />
          <div className="absolute left-[75%] top-[15%] h-8 w-20 rounded-full bg-white/30 blur-xl" />
        </div>

        {/* Plane */}
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          animate={
            flying
              ? { y: [0, -8, 0, 8, 0], rotate: [-2, 2, -2] }
              : busted
                ? { y: 80, rotate: 75, opacity: 0.4 }
                : { y: 0, rotate: 0 }
          }
          transition={
            flying
              ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.8, ease: "easeIn" }
          }
        >
          <Plane className="h-16 w-16 -rotate-12 text-primary drop-shadow-[0_8px_24px_hsl(var(--primary)/0.6)] sm:h-20 sm:w-20" />
        </motion.div>

        {/* Floating event chips */}
        <div className="pointer-events-none absolute inset-0">
          <AnimatePresence>
            {events.map((e, idx) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: 200, y: 20 + idx * 8, scale: 0.6 }}
                animate={{ opacity: 1, x: -20, y: -10 - idx * 12, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className={`absolute right-6 top-1/2 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${
                  e.kind === "coin"
                    ? "bg-yellow-400/20 text-yellow-300 ring-1 ring-yellow-400/50"
                    : "bg-destructive/20 text-destructive ring-1 ring-destructive/50"
                }`}
              >
                {e.kind === "coin" ? (
                  <>
                    <Coins className="h-3 w-3" />+{e.value.toFixed(2)}×
                  </>
                ) : (
                  <>
                    <Rocket className="h-3 w-3" />÷2
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Multiplier */}
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center">
          <div
            className={`text-4xl font-black tabular-nums sm:text-5xl ${
              busted
                ? "text-destructive drop-shadow-[0_0_24px_hsl(var(--destructive)/0.6)]"
                : flying
                  ? "text-foreground drop-shadow-[0_0_18px_hsl(var(--primary)/0.6)]"
                  : "text-foreground/40"
            }`}
          >
            {mult.toFixed(2)}×
          </div>
          {flying && (
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Potential: {formatCoins(potentialPayout)}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4">
        <div className="space-y-3">
          <BetControls bet={bet} setBet={setBet} disabled={flying} />

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Pace
            </label>
            <div className="mt-1 grid grid-cols-3 gap-1 rounded-full bg-background/60 p-1">
              {(["slow", "normal", "fast"] as Pace[]).map((p) => (
                <button
                  key={p}
                  onClick={() => !flying && setPace(p)}
                  disabled={flying}
                  className={`rounded-full py-1.5 text-xs font-bold uppercase tracking-widest transition ${
                    pace === p ? "bg-card text-foreground shadow" : "text-muted-foreground"
                  } disabled:opacity-50`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {!flying ? (
            <Button
              onClick={start}
              className="h-11 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:h-12"
            >
              <Plane className="mr-2 h-4 w-4" /> TAKE OFF
            </Button>
          ) : (
            <Button
              onClick={land}
              variant="secondary"
              className="h-11 w-full bg-[hsl(var(--success))] text-base font-black tracking-wider text-background hover:bg-[hsl(var(--success))]/90 sm:h-12"
            >
              LAND @ {mult.toFixed(2)}×
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
