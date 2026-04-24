import { useState } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";

const MULTIPLIER = 1.98; // 1% house edge

type Side = "heads" | "tails";

export default function Coinflip() {
  const { profile, refetch } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [pick, setPick] = useState<Side>("heads");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<Side | null>(null);
  const [won, setWon] = useState<boolean | null>(null);

  async function flip() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");

    setFlipping(true);
    setResult(null);
    setWon(null);
    await new Promise((r) => setTimeout(r, 1100));

    const outcome: Side = Math.random() < 0.5 ? "heads" : "tails";
    const w = outcome === pick;

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "coinflip",
      _bet_amount: bet,
      _won: w,
      _multiplier: MULTIPLIER,
      _details: { pick, outcome },
    });
    setFlipping(false);
    if (error) return toast.error(error.message);
    setResult(outcome);
    setWon(w);
    refetch();
    if (w) toast.success(`+${formatCoins(data?.[0]?.payout ?? 0)} coins!`);
  }

  function half() { setBet((b) => Math.max(1, Math.floor(b / 2))); }
  function double() { setBet((b) => Math.min(profile?.coins ?? b * 2, b * 2)); }
  function max() { setBet(profile?.coins ?? bet); }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">COINFLIP</h1>
        <p className="text-sm text-muted-foreground">Pick a side. 1.98× on win.</p>
      </header>

      {/* Coin */}
      <div className="flex flex-col items-center rounded-3xl border border-border bg-card/70 p-8 backdrop-blur-xl">
        <div className="relative h-40 w-40" style={{ perspective: 1000 }}>
          <motion.div
            className="relative h-full w-full"
            style={{ transformStyle: "preserve-3d" }}
            animate={{
              rotateY: flipping ? 1800 : result === "tails" ? 180 : 0,
            }}
            transition={{ duration: flipping ? 1.1 : 0.4, ease: "easeOut" }}
          >
            <CoinFace side="heads" />
            <CoinFace side="tails" back />
          </motion.div>
        </div>

        {won !== null && !flipping && (
          <div className={`mt-4 text-sm font-bold uppercase tracking-widest ${won ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
            {won ? `WIN — ${result?.toUpperCase()}` : `LOSS — ${result?.toUpperCase()}`}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          {(["heads", "tails"] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => setPick(s)}
              className={`rounded-2xl border px-6 py-3 text-base font-black uppercase tracking-wider transition ${
                pick === s
                  ? "border-primary bg-primary/15 text-primary shadow-[0_0_18px_hsl(var(--primary)/0.3)]"
                  : "border-border bg-card/60 text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
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
        <div className="mt-2 text-xs text-muted-foreground">
          Win pays <span className="font-bold text-foreground">{formatCoins(Math.floor(bet * MULTIPLIER))}</span> ({MULTIPLIER}×)
        </div>

        <Button
          onClick={flip}
          disabled={flipping}
          className="mt-4 h-14 w-full text-lg font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
        >
          {flipping ? "FLIPPING..." : "FLIP COIN"}
        </Button>
      </div>
    </div>
  );
}

function CoinFace({ side, back }: { side: Side; back?: boolean }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-full text-5xl font-black text-background shadow-[0_0_30px_hsl(var(--primary)/0.4)]"
      style={{
        background:
          "radial-gradient(circle at 30% 30%, hsl(45 100% 70%), hsl(35 100% 50%) 60%, hsl(25 95% 35%))",
        backfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : undefined,
        border: "4px solid hsl(35 100% 30%)",
      }}
    >
      {side === "heads" ? "M" : "✦"}
    </div>
  );
}