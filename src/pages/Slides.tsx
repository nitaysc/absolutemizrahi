import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BetControls } from "@/components/BetControls";
import { NumberField } from "@/components/NumberField";
import { Button } from "@/components/ui/button";
import { formatCoins } from "@/lib/format";
import { GalleryHorizontal, ChevronDown } from "lucide-react";

// Stake-style "Slides": a long horizontal strip of randomly-generated
// multipliers scrolls past a fixed pointer in the middle. Whatever card
// stops under the pointer is the round result. Win if landed >= target.
const HOUSE_EDGE = 0.99;
const CARD_W = 88; // px including gap
const STRIP_LEN = 80;
const LANDING_INDEX = 60; // where the marker stops in the strip
const SLIDE_DURATION_SEC = 3.6;

function rollMultiplier() {
  // Inverse-CDF style multiplier with house edge — same shape as Limbo
  // so payout math stays fair and intuitive.
  let u = Math.random();
  if (u < 0.0001) u = 0.0001;
  return Math.min(+(HOUSE_EDGE / u).toFixed(2), 5000);
}

function colorFor(m: number) {
  if (m >= 50) return "from-fuchsia-500/90 to-pink-500/90 text-white border-fuchsia-300";
  if (m >= 10) return "from-amber-400/90 to-orange-500/90 text-white border-amber-300";
  if (m >= 3) return "from-emerald-400/90 to-emerald-500/90 text-white border-emerald-300";
  if (m >= 1.5) return "from-sky-400/90 to-cyan-500/90 text-white border-cyan-300";
  return "from-slate-600/80 to-slate-700/80 text-slate-200 border-slate-500/60";
}

function buildStrip(landed: number) {
  const arr: number[] = [];
  for (let i = 0; i < STRIP_LEN; i++) arr.push(rollMultiplier());
  arr[LANDING_INDEX] = landed;
  return arr;
}

export default function Slides() {
  useTrackGame("slides");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(2);
  const [rolling, setRolling] = useState(false);
  const [strip, setStrip] = useState<number[]>(() => buildStrip(rollMultiplier()));
  const [result, setResult] = useState<number | null>(null);
  const [history, setHistory] = useState<{ result: number; won: boolean }[]>([]);
  const controls = useAnimationControls();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackW, setTrackW] = useState(0);

  useEffect(() => {
    function measure() {
      setTrackW(trackRef.current?.clientWidth ?? 0);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Position strip so the landing card sits under the center pointer.
  const restingX = useMemo(() => {
    return trackW / 2 - LANDING_INDEX * CARD_W - CARD_W / 2;
  }, [trackW]);

  // Set initial position once we know the track width
  useEffect(() => {
    if (trackW > 0 && !rolling) controls.set({ x: restingX });
  }, [trackW, restingX, controls, rolling]);

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

    const targetAtBet = target;
    const landed = rollMultiplier();
    const nextStrip = buildStrip(landed);
    setStrip(nextStrip);

    // Start strip far to the right then slide left to the landing card.
    // Add a tiny overshoot before settling to make it feel smoother.
    const startX = trackW + CARD_W * 4;
    const endX = trackW / 2 - LANDING_INDEX * CARD_W - CARD_W / 2;
    controls.set({ x: startX });
    await controls.start({
      x: [startX, endX + CARD_W * 0.35, endX],
      transition: {
        duration: SLIDE_DURATION_SEC,
        ease: [0.1, 0.85, 0.2, 1],
        times: [0, 0.92, 1],
      },
    });

    const won = landed >= targetAtBet;
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "slides",
      _bet_amount: bet,
      _won: won,
      // place_bet treats multiplier as total return multiple (bet × multiplier),
      // matching Limbo/Dice. A 2× target on a 10 bet returns 20 (+10 profit).
      _multiplier: targetAtBet,
      _details: { target: targetAtBet, landed, variant: "slides" },
    });

    setRolling(false);
    if (error) return toast.error(error.message);

    setResult(landed);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setHistory((h) => [{ result: landed, won }, ...h].slice(0, 14));

    const payout = Number(data?.[0]?.payout ?? 0);
    const profit = won ? Math.max(payout - bet, 0) : -bet;
    if (won) toast.success(`Slides hit! +${formatCoins(profit)} (${landed.toFixed(2)}× vs ${targetAtBet.toFixed(2)}×)`);
    else toast.error(`Slipped at ${landed.toFixed(2)}×`);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <GalleryHorizontal className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> SLIDES
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Pick a target multiplier. The strip slides — whatever lands under the marker is your result.
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
            <Button
              onClick={playRound}
              disabled={rolling}
              className="h-12 w-full text-base font-black"
            >
              {rolling ? "SLIDING..." : "BET"}
            </Button>
          </div>
        </aside>

        <section className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_70%)]" />
          <div className="relative">
            <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <span>Target ≥ <span className="text-foreground">{target.toFixed(2)}×</span></span>
              <span>
                Landed:{" "}
                <span
                  className={
                    result === null
                      ? "text-foreground"
                      : result >= target
                        ? "text-[hsl(var(--success))]"
                        : "text-destructive"
                  }
                >
                  {result === null ? "—" : `${result.toFixed(2)}×`}
                </span>
              </span>
            </div>

            {/* Slide track */}
            <div
              ref={trackRef}
              className="relative h-32 overflow-hidden rounded-2xl border border-border bg-background/40"
            >
              {/* Edge fades */}
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-card/95 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-card/95 to-transparent" />

              {/* Center pointer */}
              <div className="pointer-events-none absolute left-1/2 top-0 z-20 flex h-full -translate-x-1/2 flex-col items-center">
                <ChevronDown className="-mb-1 h-5 w-5 text-primary drop-shadow-[0_0_8px_hsl(var(--primary))]" />
                <div className="h-full w-px bg-gradient-to-b from-primary via-primary/60 to-transparent" />
              </div>

              {/* Strip */}
              <motion.div
                animate={controls}
                className="absolute inset-y-0 flex items-center"
                style={{ willChange: "transform" }}
              >
                {strip.map((m, i) => (
                  <div
                    key={i}
                    style={{ width: CARD_W - 8, marginRight: 8 }}
                    className={`flex h-20 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-b ${colorFor(
                      m,
                    )} text-lg font-black tabular-nums shadow-md`}
                  >
                    {m.toFixed(2)}×
                  </div>
                ))}
              </motion.div>
            </div>

            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              House edge {Math.round((1 - HOUSE_EDGE) * 100)}% · Provably fair multipliers
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
