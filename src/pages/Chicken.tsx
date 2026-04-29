import { useMemo, useRef, useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { AutoBetPanel, type AutoBetRoundResult } from "@/components/AutoBetPanel";
import { NumberField } from "@/components/NumberField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCoins } from "@/lib/format";
import { Bird } from "lucide-react";
import { ChickenScene, type LaneState as SceneLaneState } from "@/components/ChickenScene";

/**
 * CHICKEN — Stake-style "Chicken Cross" lane game.
 * Pick a difficulty, then advance one lane at a time. Each lane has a death
 * probability tied to that difficulty; surviving multiplies your payout.
 * Cash out anytime. Get hit by the car → you lose the bet.
 *
 * Probabilities are picked so the per-step expected value pays the player
 * 99% of fair (1% house edge), matching the rest of the casino.
 */

type Difficulty = "easy" | "medium" | "hard" | "daredevil";

const DIFFICULTY: Record<
  Difficulty,
  { label: string; deathProb: number; lanes: number; color: string }
> = {
  easy: { label: "Easy", deathProb: 0.04, lanes: 24, color: "emerald" },
  medium: { label: "Medium", deathProb: 0.1, lanes: 22, color: "sky" },
  hard: { label: "Hard", deathProb: 0.2, lanes: 20, color: "amber" },
  daredevil: { label: "Daredevil", deathProb: 0.35, lanes: 15, color: "rose" },
};

const HOUSE_EDGE = 0.99;

/** Multiplier after surviving `step` lanes (1-indexed). */
function multiplierFor(diff: Difficulty, step: number): number {
  const p = 1 - DIFFICULTY[diff].deathProb;
  if (step <= 0) return 1;
  return +(Math.pow(HOUSE_EDGE / p, step)).toFixed(4);
}

type LaneState = "hidden" | "safe" | "death";

export default function Chicken() {
  useTrackGame("chicken");
  const { profile, setLocalCoins } = useUserProfile();
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [bet, setBet] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  // Auto: cashout when reaching this many lanes (capped to lanes for the difficulty).
  const [autoTarget, setAutoTarget] = useState(4);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0); // lanes successfully crossed
  const [lanes, setLanes] = useState<LaneState[]>([]);
  const [busy, setBusy] = useState(false);
  const [dead, setDead] = useState(false);
  /** Lane the chicken died on (set when dead = true). */
  const [deathLane, setDeathLane] = useState<number | null>(null);
  /** Set after a successful cashout — the lane index where the next car was waiting. */
  const [nextDeathLane, setNextDeathLane] = useState<number | null>(null);
  const [cashedOut, setCashedOut] = useState(false);

  // Pre-rolled deaths for the current round (committed at Bet time).
  const rollsRef = useRef<boolean[]>([]); // true = death lane
  const lockedBetRef = useRef(0);
  const lockedDiffRef = useRef<Difficulty>("medium");

  const cfg = DIFFICULTY[difficulty];
  const liveCfg = active ? DIFFICULTY[lockedDiffRef.current] : cfg;
  const currentMult = active ? multiplierFor(lockedDiffRef.current, step) : 1;
  const nextMult = active
    ? multiplierFor(lockedDiffRef.current, step + 1)
    : multiplierFor(difficulty, 1);
  const profit = active ? Math.floor(lockedBetRef.current * currentMult) - lockedBetRef.current : 0;

  async function playAutoRound(betOverride?: number): Promise<AutoBetRoundResult | null> {
    if (!profile) return null;
    const stake = betOverride ?? bet;
    if (stake < 1 || stake > profile.coins) {
      toast.error(stake < 1 ? "Bet at least 1 coin" : "Not enough coins");
      return null;
    }
    const cfgNow = DIFFICULTY[difficulty];
    const target = Math.max(1, Math.min(autoTarget, cfgNow.lanes));
    // Pre-roll lanes for visualization + outcome.
    const total = cfgNow.lanes;
    const rand = new Uint32Array(total);
    crypto.getRandomValues(rand);
    const rolls = Array.from(rand, (n) => n / 0xffffffff < cfgNow.deathProb);
    rollsRef.current = rolls;
    lockedBetRef.current = stake;
    lockedDiffRef.current = difficulty;
    setLanes(Array(total).fill("hidden"));
    setStep(0);
    setDead(false);
    setDeathLane(null);
    setNextDeathLane(null);
    setCashedOut(false);
    setActive(true);

    let safe = 0;
    let died = false;
    for (let i = 0; i < target; i++) {
      if (rolls[i]) { died = true; break; }
      safe++;
    }
    // Animate quickly
    for (let i = 0; i < safe; i++) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 110));
      setLanes((prev) => { const next = [...prev]; next[i] = "safe"; return next; });
      setStep(i + 1);
    }
    if (died) {
      await new Promise((r) => setTimeout(r, 140));
      setLanes((prev) => { const next = [...prev]; next[safe] = "death"; return next; });
      setDead(true);
      setDeathLane(safe);
    }
    const won = !died;
    const mult = won ? multiplierFor(difficulty, safe) : 0;
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "chicken",
      _bet_amount: stake,
      _won: won,
      _multiplier: won ? mult : 0,
      _details: { difficulty, step: safe, outcome: won ? "auto-cashout" : "death", auto: true },
    });
    if (error) {
      toast.error(error.message);
      setActive(false);
      return null;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    if (won) {
      const nextDeath = rolls.findIndex((d, i) => i >= safe && d);
      setNextDeathLane(nextDeath >= 0 ? nextDeath : null);
      setCashedOut(true);
      setLanes((prev) => prev.map((l, i) => (l === "hidden" ? (rolls[i] ? "death" : "safe") : l)));
    }
    setActive(false);
    setTimeout(() => {
      setLanes([]);
      setStep(0);
      setDead(false);
      setDeathLane(null);
      setNextDeathLane(null);
      setCashedOut(false);
    }, 1200);
    const profitNow = won ? Math.floor(stake * mult) - stake : -stake;
    return { won, profit: profitNow };
  }

  function startRound() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    // Pre-roll all lanes using crypto for fairness on the client side.
    const total = cfg.lanes;
    const rand = new Uint32Array(total);
    crypto.getRandomValues(rand);
    rollsRef.current = Array.from(rand, (n) => n / 0xffffffff < cfg.deathProb);
    lockedBetRef.current = bet;
    lockedDiffRef.current = difficulty;
    setLanes(Array(total).fill("hidden"));
    setStep(0);
    setDead(false);
    setDeathLane(null);
    setNextDeathLane(null);
    setCashedOut(false);
    setActive(true);
  }

  async function advance() {
    if (!active || busy || dead) return;
    const idx = step;
    if (idx >= rollsRef.current.length) return;
    setBusy(true);
    const isDeath = rollsRef.current[idx];
    // Animate the reveal
    await new Promise((r) => setTimeout(r, 280));
    if (isDeath) {
      setLanes((prev) => {
        const next = [...prev];
        next[idx] = "death";
        return next;
      });
      setDead(true);
      setDeathLane(idx);
      // Settle as loss
      const { data, error } = await supabase.rpc("place_bet", {
        _game: "chicken",
        _bet_amount: lockedBetRef.current,
        _won: false,
        _multiplier: 0,
        _details: { difficulty: lockedDiffRef.current, step: idx, outcome: "death" },
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
      toast.error(`Splat! -${formatCoins(lockedBetRef.current)}`);
      // Auto-reset after a moment
      setTimeout(() => {
        setActive(false);
        setLanes([]);
        setStep(0);
        setDead(false);
        setDeathLane(null);
      }, 1800);
      return;
    }
    setLanes((prev) => {
      const next = [...prev];
      next[idx] = "safe";
      return next;
    });
    setStep(idx + 1);
    setBusy(false);
  }

  async function cashout() {
    if (!active || busy || step === 0 || dead) return;
    setBusy(true);
    const mult = multiplierFor(lockedDiffRef.current, step);
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "chicken",
      _bet_amount: lockedBetRef.current,
      _won: true,
      _multiplier: mult,
      _details: { difficulty: lockedDiffRef.current, step, outcome: "cashout" },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    const profitNow = Math.max(Number(data?.[0]?.payout ?? 0) - lockedBetRef.current, 0);
    // Find the next lane that would have killed them (the "you got out just in time" moment).
    const nextDeath = rollsRef.current.findIndex((d, i) => i >= step && d);
    setNextDeathLane(nextDeath >= 0 ? nextDeath : null);
    setCashedOut(true);
    if (nextDeath >= 0) {
      const lanesLeft = nextDeath - step + 1;
      toast.success(
        `+${formatCoins(profitNow)} (${mult.toFixed(2)}×) — car was ${lanesLeft} lane${lanesLeft === 1 ? "" : "s"} away!`,
      );
    } else {
      toast.success(`+${formatCoins(profitNow)} (${mult.toFixed(2)}×) — clear road ahead!`);
    }
    // Reveal remaining lanes so they see what was ahead
    setLanes((prev) =>
      prev.map((l, i) => (l === "hidden" ? (rollsRef.current[i] ? "death" : "safe") : l)),
    );
    setActive(false);
    setTimeout(() => {
      setLanes([]);
      setStep(0);
      setNextDeathLane(null);
      setCashedOut(false);
    }, 2000);
  }

  // Auto-scroll lane strip so the chicken stays in view.
  const totalLanes = liveCfg.lanes;
  const previewMults = useMemo(
    () =>
      Array.from({ length: totalLanes }, (_, i) =>
        multiplierFor(lockedDiffRef.current ?? difficulty, i + 1),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [totalLanes, difficulty, active],
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
          <Bird className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> CHICKEN
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Cross the road. Cash out before the car hits.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_320px] sm:gap-4">
      <div className="space-y-3 sm:space-y-4">
      {/* 3D Road */}
      <ChickenScene
        totalLanes={totalLanes}
        step={step}
        lanes={lanes as SceneLaneState[]}
        multipliers={previewMults}
        dead={dead}
        active={active}
        deathLane={deathLane}
        cashedOut={cashedOut}
        nextDeathLane={nextDeathLane}
      />

      {/* Lane strip preview underneath: small chips with multipliers so players
          can plan a target without the 3D camera obscuring them. */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card/40 p-1.5 [scrollbar-width:thin]">
        {previewMults.map((m, i) => {
          const state = lanes[i] ?? "hidden";
          const isCurrent = active && !dead && i === step;
          return (
            <div
              key={i}
              className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-black tabular-nums transition ${
                state === "death"
                  ? "bg-destructive/20 text-destructive"
                  : state === "safe"
                    ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                    : isCurrent
                      ? "bg-primary/20 text-primary ring-1 ring-primary"
                      : "bg-background/40 text-muted-foreground"
              }`}
            >
              {m.toFixed(2)}×
            </div>
          );
        })}
      </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-background/60 p-1">
            {(["manual", "auto"] as const).map((m) => (
              <button
                key={m}
                onClick={() => !active && setMode(m)}
                disabled={active}
                className={`rounded-full py-1.5 text-xs font-bold uppercase tracking-widest transition ${
                  mode === m ? "bg-card text-foreground shadow" : "text-muted-foreground"
                } disabled:opacity-50`}
              >
                {m}
              </button>
            ))}
          </div>

          <BetControls bet={bet} setBet={setBet} disabled={active} />

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Difficulty
            </label>
            <Select
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as Difficulty)}
              disabled={active}
            >
              <SelectTrigger className="mt-1 font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                  <SelectItem key={d} value={d}>
                    {DIFFICULTY[d].label} — {(DIFFICULTY[d].deathProb * 100).toFixed(0)}% death/lane
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "auto" && (
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Auto cashout @ lane ({multiplierFor(difficulty, Math.min(autoTarget, cfg.lanes)).toFixed(2)}×)
              </label>
              <NumberField
                value={autoTarget}
                onChange={setAutoTarget}
                min={1}
                max={cfg.lanes}
                disabled={active}
                className="mt-1"
              />
            </div>
          )}

          {active && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Current" value={`${currentMult.toFixed(2)}×`} />
              <Stat label="Next" value={`${nextMult.toFixed(2)}×`} />
              <Stat
                label="Profit"
                value={profit > 0 ? `+${formatCoins(profit)}` : "—"}
                tone={profit > 0 ? "win" : undefined}
              />
            </div>
          )}

          {mode === "auto" ? (
            <AutoBetPanel
              bet={bet}
              setBet={setBet}
              onBet={playAutoRound}
              disabled={busy || active || !profile}
              intervalMs={400}
            />
          ) : !active ? (
            <Button
              onClick={startRound}
              disabled={busy}
              className="h-11 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:h-12"
            >
              BET
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={advance}
                disabled={busy || dead}
                className="h-11 text-base font-black tracking-wider sm:h-12"
              >
                GO
              </Button>
              <Button
                onClick={cashout}
                disabled={busy || step === 0 || dead}
                className="h-11 bg-[hsl(var(--success))] text-background hover:bg-[hsl(var(--success))]/90 sm:h-12"
              >
                CASHOUT
              </Button>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "win" }) {
  return (
    <div className="rounded-xl bg-background/60 p-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 text-base font-black tabular-nums ${
          tone === "win" ? "text-[hsl(var(--success))]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}