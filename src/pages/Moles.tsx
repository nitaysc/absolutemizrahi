import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { AutoBetPanel, type AutoBetRoundResult } from "@/components/AutoBetPanel";
import { NumberField } from "@/components/NumberField";
import { formatCoins } from "@/lib/format";
import { Rabbit } from "lucide-react";
import { playGem, playBomb, playTileClick, playCashout } from "@/lib/sfx";

const HOLES = 7;
const HOUSE_EDGE = 0.99;

type Tile = "hidden" | "empty" | "mole";

/**
 * Multiplier after k successful hits.
 *
 * Each hit is a fresh board with the same mole count, so the chance to hit a
 * mole is `moles / HOLES` every time (independent rounds).
 */
function molesMultiplier(moles: number, k: number): number {
  if (k <= 0) return 1;
  const perHit = HOLES / moles;
  return Math.pow(perHit, k) * HOUSE_EDGE;
}

function generateMolePositions(count: number): number[] {
  const all = Array.from({ length: HOLES }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

export default function Moles() {
  useTrackGame("moles");
  const { profile, setLocalCoins } = useUserProfile();
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [bet, setBet] = useState(10);
  const [moles, setMoles] = useState(6);
  const [active, setActive] = useState(false);
  const [tiles, setTiles] = useState<Tile[]>(Array(HOLES).fill("hidden"));
  const [molePositions, setMolePositions] = useState<number[]>([]);
  const [hitCount, setHitCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hammerAt, setHammerAt] = useState<number | null>(null);

  const multiplier = useMemo(() => molesMultiplier(moles, hitCount), [moles, hitCount]);
  const molesLeft = moles - hitCount;
  const profit = Math.floor(bet * multiplier) - bet;

  function resetBoard(delay = 2200) {
    setTimeout(() => {
      setTiles(Array(HOLES).fill("hidden"));
      setHitCount(0);
      setMolePositions([]);
    }, delay);
  }

  function showResolvedBoard(positions: number[], hitIndex?: number) {
    setTiles(() =>
      Array.from({ length: HOLES }, (_, idx) => {
        if (positions.includes(idx)) return "mole";
        if (hitIndex === idx) return "mole";
        return "empty";
      }),
    );
  }

  function validateStake(stake: number): boolean {
    if (!profile) return false;
    if (stake < 1) {
      toast.error("Bet at least 1 coin");
      return false;
    }
    if (stake > profile.coins) {
      toast.error("Not enough coins");
      return false;
    }
    if (moles < 1 || moles > HOLES - 1) {
      toast.error(`Moles 1-${HOLES - 1}`);
      return false;
    }
    return true;
  }

  function start() {
    if (!validateStake(bet)) return;
    const nextMoles = generateMolePositions(moles);
    setMolePositions(nextMoles);
    setTiles(Array(HOLES).fill("hidden"));
    setHitCount(0);
    setActive(true);
  }

  async function settle({
    won,
    mult,
    stake,
    hits,
    positions,
  }: {
    won: boolean;
    mult: number;
    stake: number;
    hits: number;
    positions: number[];
  }) {
    setBusy(true);
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "moles",
      _bet_amount: stake,
      _won: won,
      _multiplier: won ? Number(mult.toFixed(4)) : 0,
      _details: { moles, hit_count: hits, mole_positions: positions, mode },
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return null;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));

    const payout = Number(data?.[0]?.payout ?? 0);
    if (won) {
      toast.success(`+${formatCoins(Math.max(payout - stake, 0))} (${mult.toFixed(2)}×)`);
    } else {
      toast.error(`Missed! -${formatCoins(stake)}`);
    }

    return { payout };
  }

  async function reveal(i: number) {
    if (!active || tiles[i] !== "hidden" || busy || mode !== "manual") return;
    playTileClick();
    setHammerAt(i);
    setTimeout(() => setHammerAt((prev) => (prev === i ? null : prev)), 240);

    if (!molePositions.includes(i)) {
      playBomb();
      showResolvedBoard(molePositions);
      setActive(false);
      await settle({ won: false, mult: 0, stake: bet, hits: hitCount, positions: molePositions });
      resetBoard();
      return;
    }

    playGem();
    const newCount = hitCount + 1;
    setTiles((prev) => {
      const next: Tile[] = [...prev];
      next[i] = "mole";
      return next;
    });
    setHitCount(newCount);

    if (newCount >= moles) {
      const finalMult = molesMultiplier(moles, newCount);
      setActive(false);
      playCashout();
      showResolvedBoard(molePositions);
      await settle({ won: true, mult: finalMult, stake: bet, hits: newCount, positions: molePositions });
      resetBoard();
      return;
    }

    setBusy(true);
    showResolvedBoard(molePositions);
    setTimeout(() => {
      setTiles(Array(HOLES).fill("hidden"));
      setMolePositions(generateMolePositions(moles));
      setBusy(false);
    }, 520);
  }

  async function cashout() {
    if (!active || hitCount === 0 || mode !== "manual") return;
    const mult = molesMultiplier(moles, hitCount);
    setActive(false);
    playCashout();
    showResolvedBoard(molePositions);
    await settle({ won: true, mult, stake: bet, hits: hitCount, positions: molePositions });
    resetBoard();
  }

  async function playAutoRound(betOverride?: number): Promise<AutoBetRoundResult | null> {
    const stake = betOverride ?? bet;
    if (active || busy || !validateStake(stake)) return null;

    const positions = generateMolePositions(moles);
    const pick = Math.floor(Math.random() * HOLES);
    const won = positions.includes(pick);
    const hits = won ? 1 : 0;
    const mult = won ? molesMultiplier(moles, hits) : 0;

    setMolePositions(positions);
    setHitCount(hits);
    setHammerAt(pick);
    setTimeout(() => setHammerAt((prev) => (prev === pick ? null : prev)), 260);

    if (won) {
      playGem();
      playCashout();
    } else {
      playBomb();
    }
    showResolvedBoard(positions, won ? pick : undefined);

    await settle({ won, mult, stake, hits, positions });
    resetBoard(850);

    const profitValue = won ? Math.floor(stake * mult) - stake : -stake;
    return { won, profit: profitValue };
  }

  const boardSlots = [
    "left-1/2 top-[7%] -translate-x-1/2",
    "right-[13%] top-[22%]",
    "right-[13%] bottom-[22%]",
    "left-1/2 bottom-[7%] -translate-x-1/2",
    "left-[13%] bottom-[22%]",
    "left-[13%] top-[22%]",
    "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Rabbit className="h-7 w-7 text-primary" /> MOLES
        </h1>
        <p className="text-sm text-muted-foreground">Whack only the moles. Hit an empty hole and you bust.</p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
        <div className="rounded-3xl border border-border bg-card/70 p-4 sm:p-6 backdrop-blur-xl">
          <div className="relative mx-auto aspect-square w-full max-w-[560px]">
            {tiles.map((t, i) => {
              const clickable = mode === "manual" && active && t === "hidden" && !busy;
              return (
                <button
                  key={i}
                  onClick={() => reveal(i)}
                  disabled={!clickable}
                  className={`group absolute aspect-square w-[28%] sm:w-[25%] ${boardSlots[i]}`}
                >
                  <div
                    className={`absolute inset-0 rounded-full bg-background/60 ring-2 ring-border shadow-[inset_0_6px_18px_rgba(0,0,0,0.4)] transition ${
                      clickable ? "group-hover:ring-primary/60 group-active:scale-95" : ""
                    }`}
                  />
                  {hammerAt === i && (
                    <motion.div
                      initial={{ opacity: 0, y: -24, rotate: -35, scale: 0.85 }}
                      animate={{ opacity: 1, y: -6, rotate: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 text-3xl"
                    >
                      🔨
                    </motion.div>
                  )}
                  {t === "empty" && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 14 }}
                      className="absolute inset-3 flex items-center justify-center rounded-full bg-destructive/20 ring-2 ring-destructive/60"
                    >
                      <span className="text-3xl">✕</span>
                    </motion.div>
                  )}
                  {t === "mole" && (
                    <motion.div
                      initial={{ y: 30, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 280, damping: 16 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <span className="text-5xl drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)] sm:text-6xl">🐹</span>
                    </motion.div>
                  )}
                </button>
              );
            })}
          </div>

          {active && hitCount > 0 && mode === "manual" && (
            <div className="mt-6 flex justify-center">
              <div className="rounded-full border border-primary/40 bg-background/70 px-5 py-2 text-sm font-black tabular-nums">
                {multiplier.toFixed(2)}× · +{formatCoins(profit)}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <ModeTabs
            mode={mode}
            onChange={(next) => {
              setMode(next);
              setActive(false);
              setTiles(Array(HOLES).fill("hidden"));
              setHitCount(0);
              setMolePositions([]);
            }}
          />
          <BetControls bet={bet} setBet={setBet} disabled={active || busy} />

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Moles ({1}-{HOLES - 1})
            </label>
            <NumberField
              value={moles}
              onChange={setMoles}
              min={1}
              max={HOLES - 1}
              disabled={active || busy}
              className="mt-2"
            />
          </div>

          {mode === "manual" && active && (
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat label="Multiplier" value={`${multiplier.toFixed(2)}×`} />
              <Stat label="Moles left" value={molesLeft > 0 ? `${molesLeft}` : "0"} />
            </div>
          )}

          {mode === "manual" ? (
            !active ? (
              <Button onClick={start} disabled={busy || !profile} className="h-12 w-full text-lg font-black">
                Bet
              </Button>
            ) : (
              <Button
                onClick={cashout}
                disabled={busy || hitCount === 0}
                variant="secondary"
                className="h-12 w-full bg-[hsl(var(--success))] text-background hover:bg-[hsl(var(--success))]/90 text-lg font-black"
              >
                Cashout +{formatCoins(profit)}
              </Button>
            )
          ) : (
            <AutoBetPanel bet={bet} setBet={setBet} onBet={playAutoRound} disabled={busy || active || !profile} intervalMs={350} />
          )}

          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {moles} target mole{moles === 1 ? "" : "s"} · {HOLES - moles} empty
          </p>
        </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/60 p-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-lg font-black tabular-nums">{value}</div>
    </div>
  );
}
