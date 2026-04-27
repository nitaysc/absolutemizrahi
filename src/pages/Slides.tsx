import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BetControls } from "@/components/BetControls";
import { NumberField } from "@/components/NumberField";
import { Button } from "@/components/ui/button";
import { formatCoins } from "@/lib/format";
import { ArrowDown, GalleryHorizontal } from "lucide-react";

const HOUSE_EDGE = 0.99;
const STRIP_SIZE = 25;
const CENTER_INDEX = Math.floor(STRIP_SIZE / 2);

function randomResult() {
  let u = Math.random();
  if (u < 0.0001) u = 0.0001;
  return +(HOUSE_EDGE / u).toFixed(2);
}

function makeStrip(result?: number) {
  const cards = Array.from({ length: STRIP_SIZE }, () => Math.min(randomResult(), 5000));
  if (typeof result === "number") cards[CENTER_INDEX] = result;
  return cards;
}

export default function Slides() {
  useTrackGame("slides");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(2);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [strip, setStrip] = useState<number[]>(() => makeStrip());
  const [history, setHistory] = useState<{ result: number; won: boolean }[]>([]);

  const winChance = useMemo(
    () => (target > 1 ? +((HOUSE_EDGE * 100) / target).toFixed(2) : 0),
    [target],
  );
  const potentialPayout = Math.floor(bet * target);

  async function playRound() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    if (target < 1.01 || target > 5000) return toast.error("Target must be 1.01 – 5000");

    setRolling(true);
    setResult(null);

    const rolled = Math.min(randomResult(), 5000);
    setStrip(makeStrip(rolled));

    await new Promise((r) => setTimeout(r, 1600));

    const won = rolled >= target;
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "slide",
      _bet_amount: bet,
      _won: won,
      _multiplier: target,
      _details: { target, landed: rolled, variant: "slides" },
    });

    setRolling(false);
    if (error) return toast.error(error.message);

    setResult(rolled);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setHistory((h) => [{ result: rolled, won }, ...h].slice(0, 12));

    const payout = Number(data?.[0]?.payout ?? 0);
    const profit = won ? Math.max(payout - bet, 0) : -bet;
    if (won) toast.success(`Slides hit! +${formatCoins(profit)} (${rolled.toFixed(2)}×)`);
    else toast.error(`Crashed at ${rolled.toFixed(2)}×`);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <GalleryHorizontal className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> SLIDES
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Stake-style carousel: pick your target and hope the slide lands high enough.
          </p>
        </div>
        {history.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {history.map((h, i) => (
              <li
                key={i}
                className={`rounded-md px-2 py-1 text-[10px] font-black tabular-nums ${
                  h.won
                    ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                    : "bg-destructive/15 text-destructive"
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
            <BetControls bet={bet} setBet={setBet} disabled={rolling} />
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Target multiplier
              </label>
              <NumberField
                value={target}
                onChange={setTarget}
                min={1.01}
                max={5000}
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
            <Button onClick={playRound} disabled={rolling} className="h-12 w-full text-base font-black">
              {rolling ? "SLIDING..." : "BET"}
            </Button>
          </div>
        </aside>

        <section className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.2),transparent_70%)]" />
          <div className="relative">
            <div className="mb-4 flex justify-center">
              <div className="flex flex-col items-center gap-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <ArrowDown className="h-4 w-4 text-primary" />
                Landed:{" "}
                <span className="text-foreground">{(result ?? target).toFixed(2)}×</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-background/30 p-3">
              <motion.div
                animate={{ x: rolling ? ["0%", "-56%"] : "-48%" }}
                transition={{ duration: 1.6, ease: "easeInOut" }}
                className="flex min-w-max gap-2"
              >
                {strip.map((m, i) => {
                  const isCenter = i === CENTER_INDEX;
                  return (
                    <div
                      key={`${m}-${i}`}
                      className={`w-20 rounded-xl border p-2 text-center ${
                        isCenter
                          ? "border-primary bg-primary/15 shadow-[0_0_22px_hsl(var(--primary)/0.3)]"
                          : "border-border bg-background/60"
                      }`}
                    >
                      <div className="text-lg font-black tabular-nums text-foreground">{m.toFixed(2)}×</div>
                    </div>
                  );
                })}
              </motion.div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
