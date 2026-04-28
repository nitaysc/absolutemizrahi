import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, Equal, Layers, Wallet, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

type Pick = "higher" | "lower" | "equal";
type Suit = "♠" | "♥" | "♦" | "♣";
type Phase = "idle" | "playing" | "revealing" | "busted" | "cashed";

const HOUSE_EDGE = 0.99;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

function randomCard(): { rank: number; suit: Suit } {
  return {
    rank: Math.floor(Math.random() * 13) + 1,
    suit: SUITS[Math.floor(Math.random() * 4)],
  };
}

export default function HiLo() {
  useTrackGame("hilo");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState(() => randomCard());
  const [next, setNext] = useState<ReturnType<typeof randomCard> | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [history, setHistory] = useState<{ rank: number; suit: Suit; win: boolean }[]>([]);
  const [pending, setPending] = useState(false);
  const [flip, setFlip] = useState(0);

  const probabilities = useMemo(() => {
    const higher = (13 - current.rank) / 13;
    const lower = (current.rank - 1) / 13;
    const equal = 1 / 13;
    return { higher, lower, equal };
  }, [current]);

  const stepMults = useMemo(
    () => ({
      higher: probabilities.higher > 0 ? +(HOUSE_EDGE / probabilities.higher).toFixed(4) : 0,
      lower: probabilities.lower > 0 ? +(HOUSE_EDGE / probabilities.lower).toFixed(4) : 0,
      equal: +(HOUSE_EDGE / probabilities.equal).toFixed(4),
    }),
    [probabilities],
  );

  const potential = Math.floor(bet * multiplier);

  function startRound() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    setLocalCoins(profile.coins - bet); // optimistic lock
    setMultiplier(1);
    setHistory([]);
    setNext(null);
    setCurrent(randomCard());
    setPhase("playing");
    setFlip((f) => f + 1);
  }

  async function pick(choice: Pick) {
    if (phase !== "playing" || pending) return;
    const p = probabilities[choice];
    if (p <= 0) return toast.error("Impossible pick — try a different option");

    setPending(true);
    setPhase("revealing");
    const drawn = randomCard();
    // small reveal delay for the flip animation
    await new Promise((r) => setTimeout(r, 450));
    setNext(drawn);

    const won =
      choice === "higher"
        ? drawn.rank > current.rank
        : choice === "lower"
          ? drawn.rank < current.rank
          : drawn.rank === current.rank;

    setHistory((h) => [{ ...drawn, win: won }, ...h].slice(0, 12));

    if (!won) {
      // bust — record a losing bet for the full stake
      const { error } = await supabase.rpc("place_bet", {
        _game: "hilo",
        _bet_amount: bet,
        _won: false,
        _multiplier: 0,
        _details: { from: current.rank, to: drawn.rank, pick: choice, steps: history.length + 1 },
      });
      if (error) toast.error(error.message);
      // refund optimistic (server already debited correctly)
      if (profile) {
        const { data: prof } = await supabase.from("profiles").select("coins").eq("id", profile.id).maybeSingle();
        if (prof) setLocalCoins(Number(prof.coins));
      }
      setPhase("busted");
      setPending(false);
      return;
    }

    // won this step — advance multiplier, keep playing
    const newMult = +(multiplier * stepMults[choice]).toFixed(4);
    setMultiplier(newMult);
    await new Promise((r) => setTimeout(r, 300));
    setCurrent(drawn);
    setNext(null);
    setFlip((f) => f + 1);
    setPhase("playing");
    setPending(false);
  }

  async function cashout() {
    if (phase !== "playing" || multiplier <= 1 || pending) return;
    setPending(true);
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "hilo",
      _bet_amount: bet,
      _won: true,
      _multiplier: multiplier,
      _details: { steps: history.length, cashout: true },
    });
    if (error) {
      toast.error(error.message);
      setPending(false);
      return;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    toast.success(`Cashed out ${formatCoins(potential)} (${multiplier.toFixed(2)}×)`);
    setPhase("cashed");
    setPending(false);
  }

  function reset() {
    setPhase("idle");
    setMultiplier(1);
    setNext(null);
    setHistory([]);
    setCurrent(randomCard());
  }

  // Auto-reset after bust/cashout for a clean next round
  useEffect(() => {
    if (phase === "busted" || phase === "cashed") {
      const t = setTimeout(reset, 1800);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const canPick = phase === "playing" && !pending;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card/80 via-card/60 to-background p-5 backdrop-blur-xl">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Classic card game</p>
        <h1 className="mt-1 text-3xl font-black">HI-LO</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Place a bet, then chain correct guesses to grow your multiplier. Cash out anytime — one wrong call busts the round.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          {/* Multiplier + cashout banner */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Multiplier</p>
              <motion.p
                key={multiplier}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn(
                  "text-3xl font-black tabular-nums",
                  multiplier > 1 ? "text-primary drop-shadow-[0_0_18px_hsl(var(--primary)/0.55)]" : "text-foreground",
                )}
              >
                {multiplier.toFixed(2)}×
              </motion.p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Potential</p>
              <p className="text-2xl font-black tabular-nums text-foreground">{formatCoins(potential)}</p>
            </div>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-2 gap-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={`cur-${flip}`}
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ duration: 0.35 }}
              >
                <PlayingCard label="Current" rank={current.rank} suit={current.suit} active />
              </motion.div>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {next ? (
                <motion.div
                  key={`next-${history.length}`}
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  <PlayingCard
                    label="Drawn"
                    rank={next.rank}
                    suit={next.suit}
                    win={history[0]?.win}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="back"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <CardBack pulsing={phase === "revealing"} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Pick buttons */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <PickButton
              label="Higher"
              icon={<ArrowUp className="h-4 w-4" />}
              chance={probabilities.higher}
              multiplier={stepMults.higher}
              disabled={!canPick || probabilities.higher <= 0}
              onClick={() => pick("higher")}
              tone="success"
            />
            <PickButton
              label="Equal"
              icon={<Equal className="h-4 w-4" />}
              chance={probabilities.equal}
              multiplier={stepMults.equal}
              disabled={!canPick}
              onClick={() => pick("equal")}
              tone="warning"
            />
            <PickButton
              label="Lower"
              icon={<ArrowDown className="h-4 w-4" />}
              chance={probabilities.lower}
              multiplier={stepMults.lower}
              disabled={!canPick || probabilities.lower <= 0}
              onClick={() => pick("lower")}
              tone="danger"
            />
          </div>

          {/* Status messages */}
          <AnimatePresence>
            {phase === "busted" && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-center text-sm font-bold text-destructive"
              >
                Busted! You lost {formatCoins(bet)}.
              </motion.div>
            )}
            {phase === "cashed" && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 p-3 text-center text-sm font-bold text-primary"
              >
                Cashed out {formatCoins(potential)} ({multiplier.toFixed(2)}×)
              </motion.div>
            )}
          </AnimatePresence>

          {/* History */}
          {history.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                This round
              </p>
              <div className="flex flex-wrap gap-2">
                {history.map((h, i) => (
                  <span
                    key={i}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-bold",
                      h.win
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-destructive/50 bg-destructive/10 text-destructive",
                      (h.suit === "♥" || h.suit === "♦") && "text-rose-400",
                    )}
                  >
                    {RANKS[h.rank - 1]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Side panel: bet + actions */}
        <section className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl">
          <BetControls bet={bet} setBet={setBet} disabled={phase === "playing" || phase === "revealing"} />

          <div className="mt-3 space-y-2">
            {phase === "idle" || phase === "busted" || phase === "cashed" ? (
              <Button
                className="h-12 w-full text-base font-black"
                onClick={startRound}
                disabled={!profile || pending}
              >
                <Layers className="mr-2 h-5 w-5" />
                Start round · {formatCoins(bet)}
              </Button>
            ) : (
              <>
                <Button
                  className="h-12 w-full text-base font-black"
                  variant="default"
                  onClick={cashout}
                  disabled={multiplier <= 1 || pending}
                >
                  <Wallet className="mr-2 h-5 w-5" />
                  Cash out {formatCoins(potential)}
                </Button>
                <Button variant="ghost" className="w-full" onClick={reset} disabled={pending}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Forfeit round
                </Button>
              </>
            )}
          </div>

          <div className="mt-4 rounded-2xl bg-background/60 p-3 text-sm">
            <p className="font-semibold">How it works</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>• Start a round to lock in your bet.</li>
              <li>• Guess Higher / Equal / Lower vs the current card.</li>
              <li>• Each correct call multiplies your stake.</li>
              <li>• Cash out anytime — one miss and you bust.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function PlayingCard({
  label,
  rank,
  suit,
  active,
  win,
}: {
  label: string;
  rank: number;
  suit: Suit;
  active?: boolean;
  win?: boolean;
}) {
  const red = suit === "♥" || suit === "♦";
  return (
    <div
      className={cn(
        "relative aspect-[3/4] overflow-hidden rounded-2xl border bg-gradient-to-br p-3 shadow-lg transition-all",
        active
          ? "border-primary/60 from-background to-card shadow-[0_0_30px_hsl(var(--primary)/0.25)]"
          : win === true
            ? "border-primary/60 from-primary/15 to-card shadow-[0_0_30px_hsl(var(--primary)/0.35)]"
            : win === false
              ? "border-destructive/60 from-destructive/15 to-card"
              : "border-border from-background to-card",
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className={cn("text-2xl font-black leading-none", red ? "text-rose-400" : "text-foreground")}>
            {RANKS[rank - 1]}
          </p>
          <p className={cn("text-xl leading-none", red ? "text-rose-400" : "text-foreground")}>{suit}</p>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center text-7xl font-black opacity-90",
          red ? "text-rose-400" : "text-foreground",
        )}
      >
        {suit}
      </div>
      <div className="absolute bottom-3 right-3 rotate-180">
        <p className={cn("text-2xl font-black leading-none", red ? "text-rose-400" : "text-foreground")}>
          {RANKS[rank - 1]}
        </p>
        <p className={cn("text-xl leading-none", red ? "text-rose-400" : "text-foreground")}>{suit}</p>
      </div>
    </div>
  );
}

function CardBack({ pulsing }: { pulsing?: boolean }) {
  return (
    <div
      className={cn(
        "relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/20 via-card to-background p-3 shadow-lg",
        pulsing && "animate-pulse",
      )}
    >
      <div className="absolute inset-2 rounded-xl border border-primary/30" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-5xl font-black text-primary/70 drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]">?</div>
      </div>
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, hsl(var(--primary)/0.25) 0 6px, transparent 6px 12px)",
        }}
      />
    </div>
  );
}

function PickButton({
  label,
  icon,
  chance,
  multiplier,
  disabled,
  onClick,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  chance: number;
  multiplier: number;
  disabled: boolean;
  onClick: () => void;
  tone: "success" | "warning" | "danger";
}) {
  const toneCls =
    tone === "success"
      ? "hover:border-primary hover:bg-primary/10"
      : tone === "warning"
        ? "hover:border-amber-400 hover:bg-amber-400/10"
        : "hover:border-destructive hover:bg-destructive/10";
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.03 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-2xl border border-border bg-background/70 p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        toneCls,
      )}
    >
      <p className="flex items-center gap-1 text-sm font-bold">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{(chance * 100).toFixed(2)}% chance</p>
      <p className="text-sm font-semibold text-primary">{multiplier.toFixed(2)}×</p>
    </motion.button>
  );
}