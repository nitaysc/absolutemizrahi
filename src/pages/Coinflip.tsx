import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { AutoBetPanel, type AutoBetRoundResult } from "@/components/AutoBetPanel";
import { formatCoins } from "@/lib/format";

const MULTIPLIER = 1.98;
type Side = "heads" | "tails";

export default function Coinflip() {
  useTrackGame("coinflip");
  const { profile, setLocalCoins } = useUserProfile();
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [bet, setBet] = useState(10);
  const [pick, setPick] = useState<Side>("heads");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<Side | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [history, setHistory] = useState<Side[]>([]);
  const rotation = useRef(0);

  async function flip(betOverride?: number): Promise<AutoBetRoundResult | null> {
    if (!profile) return null;
    const stake = betOverride ?? bet;
    if (stake < 1) { toast.error("Bet at least 1 coin"); return null; }
    if (stake > profile.coins) { toast.error("Not enough coins"); return null; }

    setFlipping(true);
    setWon(null);
    setResult(null);

    const outcome: Side = Math.random() < 0.5 ? "heads" : "tails";
    const w = outcome === pick;

    // Animate: spin a lot, land showing the outcome face.
    // Heads = 0deg (front), Tails = 180deg (back). Add 5 full spins.
    const targetMod = outcome === "heads" ? 0 : 180;
    const currentMod = ((rotation.current % 360) + 360) % 360;
    const delta = (targetMod - currentMod + 360) % 360;
    rotation.current = rotation.current + delta + 360 * 5; // 5 full spins

    // Wait for animation to finish before settling so the user *sees* the result land
    await new Promise((r) => setTimeout(r, 1300));

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "coinflip",
      _bet_amount: stake,
      _won: w,
      _multiplier: MULTIPLIER,
      _details: { pick, outcome },
    });
    setFlipping(false);
    if (error) {
      toast.error(error.message);
      return null;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setResult(outcome);
    setWon(w);
    setHistory((h) => [outcome, ...h].slice(0, 12));
    const payout = Number(data?.[0]?.payout ?? 0);
    const profit = w ? Math.max(payout - stake, 0) : -stake;
    if (w) toast.success(`+${formatCoins(profit)} coins!`);
    return { won: w, profit };
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">COINFLIP</h1>
          <p className="text-sm text-muted-foreground">Pick a side. {MULTIPLIER}× on win.</p>
        </div>
        {history.length > 0 && (
          <ul className="flex gap-1.5">
            {history.map((s, i) => (
              <li
                key={i}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                  s === "heads"
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {s === "heads" ? "M" : "✦"}
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="flex flex-col items-center rounded-3xl border border-border bg-card/70 p-8 backdrop-blur-xl">
        <div className="relative h-44 w-44" style={{ perspective: 1000 }}>
          <motion.div
            className="relative h-full w-full"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: rotation.current }}
            transition={{ duration: flipping ? 1.3 : 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <CoinFace side="heads" />
            <CoinFace side="tails" back />
          </motion.div>
        </div>

        {won !== null && !flipping && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-5 text-base font-black uppercase tracking-widest ${
              won ? "text-[hsl(var(--success))]" : "text-destructive"
            }`}
          >
            {won ? `WIN — ${result?.toUpperCase()}` : `LOSS — ${result?.toUpperCase()}`}
          </motion.div>
        )}

        <div className="mt-6 flex gap-3">
          {(["heads", "tails"] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => setPick(s)}
              disabled={flipping}
              className={`rounded-2xl border px-7 py-3 text-base font-black uppercase tracking-wider transition ${
                pick === s
                  ? "border-primary bg-primary/15 text-primary shadow-[0_0_18px_hsl(var(--primary)/0.3)]"
                  : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-background/60 p-1">
          {(["manual","auto"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full py-1.5 text-xs font-bold uppercase tracking-widest transition ${
                mode === m ? "bg-card text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <BetControls bet={bet} setBet={setBet} disabled={flipping} />
        <div className="mt-2 text-xs text-muted-foreground">
          Win pays{" "}
          <span className="font-bold text-foreground">
            {formatCoins(Math.floor(bet * MULTIPLIER))}
          </span>{" "}
          ({MULTIPLIER}×)
        </div>
        {mode === "manual" ? (
          <Button
            onClick={() => flip()}
            disabled={flipping}
            className="mt-4 h-14 w-full text-lg font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
          >
            {flipping ? "FLIPPING..." : "FLIP COIN"}
          </Button>
        ) : (
          <div className="mt-4">
            <AutoBetPanel bet={bet} setBet={setBet} onBet={flip} intervalMs={400} />
          </div>
        )}
      </div>
    </div>
  );
}

function CoinFace({ side, back }: { side: Side; back?: boolean }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-full text-6xl font-black text-background shadow-[0_0_30px_hsl(var(--primary)/0.4)]"
      style={{
        background:
          "radial-gradient(circle at 30% 30%, hsl(45 100% 70%), hsl(35 100% 50%) 60%, hsl(25 95% 35%))",
        backfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : undefined,
        border: "5px solid hsl(35 100% 30%)",
      }}
    >
      {side === "heads" ? "M" : "✦"}
    </div>
  );
}