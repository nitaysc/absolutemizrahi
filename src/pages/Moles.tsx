import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { NumberField } from "@/components/NumberField";
import { formatCoins } from "@/lib/format";
import { Rabbit } from "lucide-react";
import { playGem, playBomb, playTileClick, playCashout } from "@/lib/sfx";

const HOLES = 6;
const HOUSE_EDGE = 0.99;

type Tile = "hidden" | "empty" | "mole";

/** Fair multiplier after k successful mole hits with `moles` moles among HOLES holes. */
function molesMultiplier(moles: number, k: number): number {
  if (k <= 0) return 1;
  let m = 1;
  for (let i = 0; i < k; i++) {
    m *= (HOLES - i) / (HOLES - moles - i);
  }
  return m * HOUSE_EDGE;
}

export default function Moles() {
  useTrackGame("moles");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [moles, setMoles] = useState(3);
  const [active, setActive] = useState(false);
  const [tiles, setTiles] = useState<Tile[]>(Array(HOLES).fill("hidden"));
  const [molePositions, setMolePositions] = useState<number[]>([]);
  const [hitCount, setHitCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hammerAt, setHammerAt] = useState<number | null>(null);

  const multiplier = useMemo(() => molesMultiplier(moles, hitCount), [moles, hitCount]);
  const molesLeft = moles - hitCount;
  const profit = Math.floor(bet * multiplier) - bet;

  function start() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    if (moles < 1 || moles > HOLES - 1) return toast.error(`Moles 1-${HOLES - 1}`);

    // Generate mole positions client-side (settled fairly via place_bet on resolve).
    const all = Array.from({ length: HOLES }, (_, i) => i);
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    setMolePositions(all.slice(0, moles));
    setTiles(Array(HOLES).fill("hidden"));
    setHitCount(0);
    setActive(true);
  }

  async function settle(won: boolean, mult: number) {
    setBusy(true);
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "moles",
      _bet_amount: bet,
      _won: won,
      _multiplier: won ? Number(mult.toFixed(4)) : 0,
      _details: { moles, hit_count: hitCount, mole_positions: molePositions },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    if (won) {
      const payout = Number(data?.[0]?.payout ?? 0);
      toast.success(`+${formatCoins(Math.max(payout - bet, 0))} (${mult.toFixed(2)}×)`);
    } else {
      toast.error(`Missed! -${formatCoins(bet)}`);
    }
  }

  async function reveal(i: number) {
    if (!active || tiles[i] !== "hidden" || busy) return;
    playTileClick();
    setHammerAt(i);
    setTimeout(() => setHammerAt((prev) => (prev === i ? null : prev)), 240);

    if (!molePositions.includes(i)) {
      // Bust on empty hole — reveal entire board.
      playBomb();
      setTiles((prev) => {
        const next: Tile[] = [...prev];
        for (let idx = 0; idx < HOLES; idx++) {
          if (molePositions.includes(idx)) next[idx] = "mole";
          else if (next[idx] === "hidden") next[idx] = "empty";
        }
        return next;
      });
      setActive(false);
      await settle(false, 0);
      setTimeout(() => {
        setTiles(Array(HOLES).fill("hidden"));
        setHitCount(0);
      }, 2200);
      return;
    }

    // Correct hit.
    playGem();
    const newCount = hitCount + 1;
    setTiles((prev) => {
      const next: Tile[] = [...prev];
      next[i] = "mole";
      return next;
    });
    setHitCount(newCount);
    // If user hits all selected moles, auto-cashout.
    if (newCount >= moles) {
      const finalMult = molesMultiplier(moles, newCount);
      setActive(false);
      playCashout();
      setTiles((prev) => {
        const next: Tile[] = [...prev];
        for (let idx = 0; idx < HOLES; idx++) {
          if (!molePositions.includes(idx) && next[idx] === "hidden") next[idx] = "empty";
        }
        return next;
      });
      await settle(true, finalMult);
      setTimeout(() => {
        setTiles(Array(HOLES).fill("hidden"));
        setHitCount(0);
      }, 2200);
    }
  }

  async function cashout() {
    if (!active || hitCount === 0) return;
    const mult = molesMultiplier(moles, hitCount);
    setActive(false);
    playCashout();
    setTiles((prev) => {
      const next: Tile[] = [...prev];
      for (let idx = 0; idx < HOLES; idx++) {
        if (next[idx] === "hidden") {
          next[idx] = molePositions.includes(idx) ? "mole" : "empty";
        }
      }
      return next;
    });
    await settle(true, mult);
    setTimeout(() => {
      setTiles(Array(HOLES).fill("hidden"));
      setHitCount(0);
    }, 2200);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Rabbit className="h-7 w-7 text-primary" /> MOLES
        </h1>
        <p className="text-sm text-muted-foreground">
          Whack only the moles. Hit an empty hole and you bust.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
        {/* Holes */}
        <div className="rounded-3xl border border-border bg-card/70 p-6 backdrop-blur-xl">
          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            {tiles.map((t, i) => {
              const clickable = active && t === "hidden" && !busy;
              return (
                <button
                  key={i}
                  onClick={() => reveal(i)}
                  disabled={!clickable}
                  className="group relative aspect-square"
                >
                  {/* Hole */}
                  <div
                    className={`absolute inset-0 rounded-full bg-background/60 ring-2 ring-border shadow-[inset_0_6px_18px_rgba(0,0,0,0.4)] transition ${
                      clickable ? "group-hover:ring-primary/60 group-active:scale-95" : ""
                    }`}
                  />
                  {/* Hammer effect */}
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
                  {/* Reveal */}
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
                      <span className="text-5xl drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)] sm:text-6xl">
                        🐹
                      </span>
                    </motion.div>
                  )}
                </button>
              );
            })}
          </div>

          {active && hitCount > 0 && (
            <div className="mt-6 flex justify-center">
              <div className="rounded-full border border-primary/40 bg-background/70 px-5 py-2 text-sm font-black tabular-nums">
                {multiplier.toFixed(2)}× · +{formatCoins(profit)}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4 rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <BetControls bet={bet} setBet={setBet} disabled={active} />

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Moles ({1}-{HOLES - 1})
            </label>
            <NumberField
              value={moles}
              onChange={setMoles}
              min={1}
              max={HOLES - 1}
              disabled={active}
              className="mt-2"
            />
          </div>

          {active && (
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat label="Multiplier" value={`${multiplier.toFixed(2)}×`} />
              <Stat
                label="Moles left"
                value={molesLeft > 0 ? `${molesLeft}` : "0"}
              />
            </div>
          )}

          {!active ? (
            <Button
              onClick={start}
              disabled={busy || !profile}
              className="h-12 w-full text-lg font-black"
            >
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
          )}

          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {moles} target mole{moles === 1 ? "" : "s"} · {HOLES - moles} empty
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/60 p-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-black tabular-nums">{value}</div>
    </div>
  );
}
