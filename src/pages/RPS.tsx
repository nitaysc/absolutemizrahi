import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { triggerBigWin } from "@/components/WinBurst";
import { Hand, Scissors, Mountain, Shuffle, Zap } from "lucide-react";

const HOUSE_EDGE = 0.98;
// Win pays 2× minus house edge → ~1.96×
const WIN_STEP = +(2 * HOUSE_EDGE).toFixed(4);
const MAX_ROUNDS = 20;

type Choice = "rock" | "paper" | "scissors";
type Outcome = "win" | "lose" | "tie";
type Phase = "idle" | "picking" | "revealing" | "won" | "busted" | "cashed";

const CHOICES: { v: Choice; label: string; icon: typeof Hand; emoji: string }[] = [
  { v: "rock", label: "Rock", icon: Mountain, emoji: "✊" },
  { v: "paper", label: "Paper", icon: Hand, emoji: "✋" },
  { v: "scissors", label: "Scissors", icon: Scissors, emoji: "✌️" },
];

function judge(p: Choice, c: Choice): Outcome {
  if (p === c) return "tie";
  if (
    (p === "rock" && c === "scissors") ||
    (p === "paper" && c === "rock") ||
    (p === "scissors" && c === "paper")
  )
    return "win";
  return "lose";
}

function randomChoice(): Choice {
  return CHOICES[Math.floor(Math.random() * 3)].v;
}

export default function RPS() {
  useTrackGame("rps");
  const { profile, setLocalCoins } = useUserProfile();

  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>("idle");
  const [multiplier, setMultiplier] = useState(1);
  const [round, setRound] = useState(0);
  const [pending, setPending] = useState(false);
  const [playerPick, setPlayerPick] = useState<Choice | null>(null);
  const [aiPick, setAiPick] = useState<Choice | null>(null);
  const [lastOutcome, setLastOutcome] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<Outcome[]>([]);

  const potential = Math.floor(bet * multiplier);
  const nextMult = +(multiplier === 1 ? WIN_STEP : multiplier * WIN_STEP).toFixed(4);

  function startRound() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    setLocalCoins(profile.coins - bet); // optimistic lock
    setMultiplier(1);
    setRound(0);
    setHistory([]);
    setPlayerPick(null);
    setAiPick(null);
    setLastOutcome(null);
    setPhase("picking");
  }

  async function pick(choice: Choice) {
    if (pending) return;
    if (phase !== "picking") return;
    setPending(true);
    setPhase("revealing");
    setPlayerPick(choice);
    setAiPick(null);
    setLastOutcome(null);

    // suspense delay
    await new Promise((r) => setTimeout(r, 700));
    const c = randomChoice();
    setAiPick(c);
    const outcome = judge(choice, c);
    setLastOutcome(outcome);
    setHistory((h) => [outcome, ...h].slice(0, 12));

    await new Promise((r) => setTimeout(r, 450));

    if (outcome === "tie") {
      // proceed, no change
      const nextRound = round + 1;
      setRound(nextRound);
      if (nextRound >= MAX_ROUNDS) {
        await settleCashout(multiplier);
      } else {
        setPhase("picking");
      }
      setPending(false);
      return;
    }

    if (outcome === "lose") {
      const { error } = await supabase.rpc("place_bet", {
        _game: "rps",
        _bet_amount: bet,
        _won: false,
        _multiplier: 0,
        _details: { rounds: round + 1, last_pick: choice, last_ai: c },
      });
      if (error) toast.error(error.message);
      // re-sync balance from server
      if (profile) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("coins")
          .eq("id", profile.id)
          .maybeSingle();
        if (prof) setLocalCoins(Number(prof.coins));
      }
      setPhase("busted");
      setPending(false);
      return;
    }

    // win — climb multiplier, allow cashout or continue
    const newMult = +(multiplier === 1 ? WIN_STEP : multiplier * WIN_STEP).toFixed(4);
    setMultiplier(newMult);
    const nextRound = round + 1;
    setRound(nextRound);
    if (newMult >= 5) triggerBigWin(newMult, "RPS streak");
    if (nextRound >= MAX_ROUNDS) {
      await settleCashout(newMult);
    } else {
      setPhase("won");
    }
    setPending(false);
  }

  async function settleCashout(mult: number) {
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "rps",
      _bet_amount: bet,
      _won: true,
      _multiplier: mult,
      _details: { rounds: round + 1, cashout: true },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    if (mult >= 3) triggerBigWin(mult, "Cashed out");
    toast.success(`Cashed out ${formatCoins(Math.floor(bet * mult))} (${mult.toFixed(2)}×)`);
    setPhase("cashed");
  }

  async function cashout() {
    if (phase !== "won" || pending) return;
    setPending(true);
    await settleCashout(multiplier);
    setPending(false);
  }

  function nextRound() {
    if (phase !== "won" || pending) return;
    setPlayerPick(null);
    setAiPick(null);
    setLastOutcome(null);
    setPhase("picking");
  }

  function reset() {
    setPhase("idle");
    setMultiplier(1);
    setRound(0);
    setPlayerPick(null);
    setAiPick(null);
    setLastOutcome(null);
  }

  const isPlaying = phase === "picking" || phase === "revealing" || phase === "won";

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <Scissors className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> ROCK · PAPER · SCISSORS
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Beat the bot. Cash out before you lose. Up to 20 rounds.
          </p>
        </div>
        {history.length > 0 && (
          <ul className="flex gap-1.5">
            {history.map((h, i) => (
              <li
                key={i}
                className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${
                  h === "win"
                    ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                    : h === "lose"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {h === "win" ? "W" : h === "lose" ? "L" : "T"}
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_320px] sm:gap-4">
        {/* Arena */}
        <div className="relative flex min-h-[320px] flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-xl sm:rounded-3xl sm:p-6">
          {/* multiplier */}
          <div className="flex items-baseline gap-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={multiplier}
                initial={{ scale: 0.6, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.6, opacity: 0, y: -10 }}
                transition={{ type: "spring", stiffness: 220, damping: 16 }}
                className={`text-5xl font-black tabular-nums sm:text-6xl ${
                  phase === "busted"
                    ? "text-destructive drop-shadow-[0_0_24px_hsl(var(--destructive)/0.6)]"
                    : multiplier > 1
                      ? "text-[hsl(var(--success))] drop-shadow-[0_0_24px_hsl(var(--success)/0.5)]"
                      : "text-foreground/40"
                }`}
              >
                {multiplier.toFixed(2)}×
              </motion.div>
            </AnimatePresence>
            {isPlaying && multiplier > 1 && (
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                = {formatCoins(potential)}
              </span>
            )}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Round {Math.min(round + (phase === "won" || phase === "busted" || phase === "cashed" ? 0 : 1), MAX_ROUNDS)} / {MAX_ROUNDS}
          </div>

          {/* Hands */}
          <div className="flex w-full items-center justify-center gap-6 sm:gap-12">
            <HandCard
              label="You"
              choice={playerPick}
              accent="primary"
              shaking={phase === "revealing" && !aiPick}
            />
            <div className="text-2xl font-black text-muted-foreground sm:text-3xl">VS</div>
            <HandCard
              label="Bot"
              choice={aiPick}
              accent="rose"
              shaking={phase === "revealing" && !aiPick}
              hidden={phase === "revealing" && !aiPick}
            />
          </div>

          {/* Outcome banner */}
          <AnimatePresence>
            {lastOutcome && phase !== "revealing" && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${
                  lastOutcome === "win"
                    ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                    : lastOutcome === "lose"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {lastOutcome === "win" ? "You win the round" : lastOutcome === "lose" ? "Bust" : "Tie · 1×"}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4">
          {phase === "idle" || phase === "busted" || phase === "cashed" ? (
            <div className="space-y-3">
              <BetControls bet={bet} setBet={setBet} disabled={pending} />
              <div className="text-xs text-muted-foreground">
                Win pays{" "}
                <span className="font-bold text-foreground">{WIN_STEP.toFixed(2)}×</span> per round.
                Tie keeps your streak.
              </div>
              <Button
                onClick={startRound}
                disabled={pending}
                className="h-11 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:h-12"
              >
                <Zap className="mr-2 h-4 w-4" />
                BET {formatCoins(bet)}
              </Button>
              {phase === "busted" && (
                <p className="text-center text-xs font-bold uppercase tracking-widest text-destructive">
                  Bot won. Bet lost.
                </p>
              )}
              {phase === "cashed" && (
                <p className="text-center text-xs font-bold uppercase tracking-widest text-[hsl(var(--success))]">
                  Cashed out!
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background/40 p-2 text-center text-xs text-muted-foreground">
                Stake <span className="font-bold text-foreground">{formatCoins(bet)}</span>{" "}
                · Next win{" "}
                <span className="font-bold text-[hsl(var(--success))]">
                  {nextMult.toFixed(2)}×
                </span>
              </div>

              {phase === "picking" && (
                <>
                  <p className="text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Pick your hand
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {CHOICES.map((c) => (
                      <button
                        key={c.v}
                        onClick={() => pick(c.v)}
                        disabled={pending}
                        className="group flex flex-col items-center gap-1 rounded-xl border-2 border-border bg-card px-2 py-3 text-xs font-bold uppercase tracking-wider transition hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        <span className="text-3xl transition group-hover:scale-110">{c.emoji}</span>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => pick(randomChoice())}
                    disabled={pending}
                    className="w-full"
                  >
                    <Shuffle className="mr-2 h-4 w-4" /> Random pick
                  </Button>
                </>
              )}

              {phase === "revealing" && (
                <p className="text-center text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  Revealing...
                </p>
              )}

              {phase === "won" && (
                <div className="space-y-2">
                  <Button
                    onClick={cashout}
                    disabled={pending}
                    className="h-11 w-full bg-[hsl(var(--success))] text-base font-black tracking-wider text-background hover:bg-[hsl(var(--success))]/90"
                  >
                    Cash out {formatCoins(potential)}
                  </Button>
                  <Button
                    onClick={nextRound}
                    disabled={pending || round >= MAX_ROUNDS}
                    variant="outline"
                    className="h-11 w-full font-black tracking-wider"
                  >
                    Next round → {nextMult.toFixed(2)}×
                  </Button>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HandCard({
  label,
  choice,
  accent,
  shaking,
  hidden,
}: {
  label: string;
  choice: Choice | null;
  accent: "primary" | "rose";
  shaking?: boolean;
  hidden?: boolean;
}) {
  const meta = choice ? CHOICES.find((c) => c.v === choice) : null;
  const ring =
    accent === "primary"
      ? "ring-primary/40 shadow-[0_0_24px_hsl(var(--primary)/0.25)]"
      : "ring-rose-400/40 shadow-[0_0_24px_rgba(244,63,94,0.25)]";
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        animate={shaking ? { rotate: [0, -12, 12, -12, 12, 0], y: [0, -6, 0, -6, 0, 0] } : {}}
        transition={{ duration: 0.7, repeat: shaking ? Infinity : 0 }}
        className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-background/60 text-5xl ring-2 backdrop-blur sm:h-24 sm:w-24 sm:text-6xl ${ring}`}
      >
        {hidden || !meta ? "❓" : meta.emoji}
      </motion.div>
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
  );
}