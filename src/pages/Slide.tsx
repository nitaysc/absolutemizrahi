import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BetControls } from "@/components/BetControls";
import { AutoBetPanel, type AutoBetRoundResult } from "@/components/AutoBetPanel";
import { NumberField } from "@/components/NumberField";
import { Button } from "@/components/ui/button";
import { formatCoins } from "@/lib/format";
import { ArrowDown, SlidersHorizontal } from "lucide-react";

const HOUSE_EDGE = 0.97;
const LANE_COUNT = 7;

type Lane = { multiplier: number; color: string };

const LANE_COLORS = [
  "from-slate-400/70 to-slate-300/70",
  "from-slate-500/70 to-slate-400/70",
  "from-blue-500/80 to-blue-400/80",
  "from-cyan-400/80 to-cyan-300/80",
  "from-emerald-400/80 to-emerald-300/80",
  "from-amber-400/80 to-amber-300/80",
  "from-orange-400/80 to-orange-300/80",
];

function randomMultiplier() {
  // Similar risk profile to limbo: lots of low rolls, occasional high pops.
  let u = Math.random();
  // Slightly nerfed — bias outcomes toward lower multipliers so high
  // pops are rarer. House edge constant is unchanged.
  const skewed = Math.pow(u, 1.18);
  if (skewed < 0.0001) return 200;
  return +(HOUSE_EDGE / skewed).toFixed(2);
}

function makeLanes() {
  return Array.from({ length: LANE_COUNT }, (_, i) => ({
    multiplier: Math.min(randomMultiplier(), 200),
    color: LANE_COLORS[i % LANE_COLORS.length],
  }));
}

export default function Slide() {
  useTrackGame("slide");
  const { profile, setLocalCoins } = useUserProfile();
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(2);
  const [rolling, setRolling] = useState(false);
  const [lanes, setLanes] = useState<Lane[]>(() => makeLanes());
  const [activeLane, setActiveLane] = useState<number | null>(null);
  const [history, setHistory] = useState<{ result: number; won: boolean }[]>([]);

  const activeMultiplier = activeLane === null ? target : lanes[activeLane]?.multiplier ?? target;
  const potentialPayout = Math.floor(bet * target);
  const winChance = useMemo(() => (target > 1 ? +((HOUSE_EDGE * 100) / target).toFixed(2) : 0), [target]);

  async function playRound(betOverride?: number): Promise<AutoBetRoundResult | null> {
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
    if (target < 1.01 || target > 200) {
      toast.error("Target must be 1.01 – 200");
      return null;
    }

    setRolling(true);
    setActiveLane(null);

    const nextLanes = makeLanes();
    setLanes(nextLanes);

    await new Promise((r) => setTimeout(r, 850));

    const landedLane = Math.floor(Math.random() * nextLanes.length);
    setActiveLane(landedLane);

    const landed = nextLanes[landedLane].multiplier;
    const won = landed >= target;

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "slide",
      _bet_amount: stake,
      _won: won,
      // place_bet treats multiplier as total return multiple; add stake back so
      // a 3x target pays +3x profit (e.g. 30 -> +90) in Slide too.
      _multiplier: target + 1,
      _details: { target, landed, lane: landedLane + 1, lanes: nextLanes.map((l) => l.multiplier) },
    });

    setRolling(false);
    if (error) {
      toast.error(error.message);
      return null;
    }

    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    const payout = Number(data?.[0]?.payout ?? 0);
    const profit = won ? Math.max(payout - stake, 0) : -stake;

    setHistory((h) => [{ result: landed, won }, ...h].slice(0, 10));

    if (won) toast.success(`Slide hit! +${formatCoins(profit)} (${landed.toFixed(2)}×)`);
    else toast.error(`Slipped at ${landed.toFixed(2)}×`);
    return { won, profit };
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <SlidersHorizontal className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> SLIDE
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">Set your target and hope the marker lands on a high enough multiplier.</p>
        </div>
        {history.length > 0 && (
          <ul className="flex gap-1.5">
            {history.map((h, i) => (
              <li
                key={i}
                className={`rounded-md px-2 py-1 text-[10px] font-black tabular-nums ${
                  h.won ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" : "bg-destructive/15 text-destructive"
                }`}
              >
                {h.result.toFixed(2)}×
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <aside className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl">
          <div className="space-y-3">
            <ModeTabs mode={mode} onChange={setMode} />
            <BetControls bet={bet} setBet={setBet} disabled={rolling} />

            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Target multiplier</label>
              <NumberField
                value={target}
                onChange={setTarget}
                min={1.01}
                max={200}
                decimal
                disabled={rolling}
                className="mt-1 text-base font-black tabular-nums"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-border bg-background/50 p-2">
                <p className="text-muted-foreground">Win chance</p>
                <p className="text-sm font-black">{winChance}%</p>
              </div>
              <div className="rounded-xl border border-border bg-background/50 p-2">
                <p className="text-muted-foreground">Payout</p>
                <p className="text-sm font-black">{formatCoins(potentialPayout)}</p>
              </div>
            </div>

            {mode === "manual" ? (
              <Button
                onClick={() => playRound()}
                disabled={rolling}
                className="h-12 w-full text-base font-black tracking-wide"
              >
                {rolling ? "SLIDING..." : "BET (NEXT ROUND)"}
              </Button>
            ) : (
              <AutoBetPanel bet={bet} setBet={setBet} onBet={playRound} intervalMs={350} />
            )}
          </div>
        </aside>

        <section className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.2),transparent_70%)]" />

          <div className="relative">
            <div className="mb-6 flex items-center justify-center gap-3">
              {lanes.map((lane, i) => (
                <div
                  key={i}
                  className={`rounded-full px-3 py-1 text-xs font-black tabular-nums ${
                    activeLane === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {lane.multiplier.toFixed(2)}×
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {lanes.map((lane, i) => {
                const selected = activeLane === i;
                return (
                  <motion.div
                    key={`lane-${i}-${lane.multiplier}`}
                    initial={{ y: 10, opacity: 0.7 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.25, delay: i * 0.03 }}
                    className="flex flex-col items-center"
                  >
                    <div className="mb-2 h-6 text-xs font-black tabular-nums text-white/90">{lane.multiplier.toFixed(2)}×</div>
                    <div
                      className={`h-44 w-full rounded-xl border ${selected ? "border-primary shadow-[0_0_24px_hsl(var(--primary)/0.55)]" : "border-border"} bg-gradient-to-b from-[#0b1f36] via-[#102d4f] to-[#0e1f32] p-1`}
                    >
                      <div className="h-full w-full rounded-lg bg-gradient-to-b from-transparent via-white/5 to-background/40" />
                    </div>
                    <div className={`mt-2 h-3 w-full rounded-md bg-gradient-to-r ${lane.color} ${selected ? "opacity-100" : "opacity-60"}`} />
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-5 flex justify-center">
              <div className="flex flex-col items-center gap-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <ArrowDown className="h-4 w-4 text-primary" />
                Marker result: <span className="text-foreground">{activeMultiplier.toFixed(2)}×</span>
              </div>
            </div>
          </div>
        </section>
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
