import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { Sparkles } from "lucide-react";

type Difficulty = "easy" | "medium" | "hard" | "expert";

// Snakes & Ladders inspired: 8 rows, each row has N tiles with K snakes.
// Picking a safe tile climbs you up; picking a snake busts. Cash out anytime.
// Multiplier = step^row * 0.98 (98% RTP, matches Stake Snakes).
const CFG: Record<Difficulty, { tiles: number; snakes: number }> = {
  easy:   { tiles: 4, snakes: 1 }, // 4/3 step
  medium: { tiles: 3, snakes: 1 }, // 3/2 step
  hard:   { tiles: 2, snakes: 1 }, // 2/1 step
  expert: { tiles: 4, snakes: 3 }, // 4/1 step
};
const ROWS = 8;
const HOUSE = 0.98;

function stepFor(d: Difficulty) {
  const { tiles, snakes } = CFG[d];
  return tiles / (tiles - snakes);
}
function multAt(d: Difficulty, row: number) {
  if (row <= 0) return 1;
  return +(Math.pow(stepFor(d), row) * HOUSE).toFixed(4);
}

type Floor = {
  picked?: number;
  hitSnake?: boolean;
  snakes: number[]; // revealed positions
};

export default function Snakes() {
  useTrackGame("snakes");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [diff, setDiff] = useState<Difficulty>("medium");
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0); // rows climbed
  const [floors, setFloors] = useState<Floor[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ mult: number; won: boolean }[]>([]);

  const cfg = CFG[diff];
  const currentMult = multAt(diff, progress);
  const nextMult = multAt(diff, progress + 1);

  function freshFloors(): Floor[] {
    return Array.from({ length: ROWS }, () => ({ snakes: [] }));
  }

  async function start() {
    if (!profile || active) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    setBusy(true);
    setLocalCoins(profile.coins - bet);
    setFloors(freshFloors());
    setProgress(0);
    setActive(true);
    setBusy(false);
  }

  async function pick(tile: number) {
    if (!active || busy) return;
    setBusy(true);
    const row = progress;
    // Roll snakes for this row.
    const positions = Array.from({ length: cfg.tiles }, (_, i) => i);
    const snakes: number[] = [];
    for (let i = 0; i < cfg.snakes; i++) {
      const idx = Math.floor(Math.random() * positions.length);
      snakes.push(positions.splice(idx, 1)[0]);
    }
    const hitSnake = snakes.includes(tile);

    setFloors((arr) => {
      const next = arr.slice();
      next[row] = { picked: tile, hitSnake, snakes };
      return next;
    });

    if (hitSnake) {
      const stake = bet;
      const { data, error } = await supabase.rpc("place_bet", {
        _game: "snakes",
        _bet_amount: stake,
        _won: false,
        _multiplier: 0,
        _details: { difficulty: diff, row: row + 1, hit_snake: true },
      });
      setActive(false);
      setBusy(false);
      if (error) return toast.error(error.message);
      if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
      setHistory((h) => [{ mult: 0, won: false }, ...h].slice(0, 10));
      toast.error(`Snake on row ${row + 1}!`);
      return;
    }

    const newRow = row + 1;
    setProgress(newRow);

    // Reached the top: auto-cashout.
    if (newRow >= ROWS) {
      await cashoutAt(newRow);
      return;
    }
    setBusy(false);
  }

  async function cashoutAt(row: number) {
    const stake = bet;
    const finalMult = multAt(diff, row);
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "snakes",
      _bet_amount: stake,
      _won: true,
      _multiplier: finalMult,
      _details: { difficulty: diff, row, cashed_out: true },
    });
    setActive(false);
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    const payout = Number(data?.[0]?.payout ?? 0);
    setHistory((h) => [{ mult: finalMult, won: true }, ...h].slice(0, 10));
    toast.success(`+${formatCoins(payout - stake)} @ ${finalMult.toFixed(2)}×`);
  }

  async function cashout() {
    if (!active || busy || progress < 1) return;
    setBusy(true);
    await cashoutAt(progress);
  }

  // Render rows top → bottom (top = highest multiplier).
  const rows = useMemo(
    () => Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i),
    [],
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <span className="text-2xl sm:text-3xl">🐍</span> SNAKES
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Climb the ladder. Dodge the snakes. Cash out anytime.
          </p>
        </div>
        {history.length > 0 && (
          <ul className="flex gap-1.5">
            {history.map((h, i) => (
              <li
                key={i}
                className={`rounded-md px-2 py-1 text-[10px] font-black tabular-nums ${
                  h.won
                    ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                    : "bg-destructive/15 text-destructive"
                }`}
              >
                {h.won ? `${h.mult.toFixed(2)}×` : "💀"}
              </li>
            ))}
          </ul>
        )}
      </header>

      {/* Ladder */}
      <div className="rounded-2xl border border-border bg-gradient-to-b from-emerald-950/40 via-card/70 to-emerald-900/20 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4">
        <div className="flex flex-col gap-1.5">
          {rows.map((rowIdx) => {
            const floor = floors[rowIdx];
            const isCurrent = active && progress === rowIdx;
            const isPast = floor?.picked !== undefined;
            const rowMult = multAt(diff, rowIdx + 1);

            return (
              <div key={rowIdx} className="flex items-center gap-2">
                <div className="w-14 shrink-0 text-right text-[10px] font-bold tabular-nums text-muted-foreground sm:text-xs">
                  {rowMult.toFixed(2)}×
                </div>
                <div
                  className={`grid flex-1 gap-1.5 rounded-xl p-1.5 transition ${
                    isCurrent
                      ? "bg-primary/10 ring-2 ring-primary shadow-[0_0_24px_hsl(var(--primary)/0.35)]"
                      : "bg-background/30"
                  }`}
                  style={{ gridTemplateColumns: `repeat(${cfg.tiles}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: cfg.tiles }, (_, t) => {
                    const isSnake = floor?.snakes.includes(t);
                    const isPicked = floor?.picked === t;
                    const reveal = isPast;
                    return (
                      <button
                        key={t}
                        disabled={!isCurrent || busy}
                        onClick={() => pick(t)}
                        className={`relative flex h-9 items-center justify-center rounded-lg text-base font-black transition sm:h-10 sm:text-lg ${
                          reveal
                            ? isSnake
                              ? isPicked
                                ? "bg-destructive/30 ring-2 ring-destructive"
                                : "bg-destructive/15 text-destructive/70"
                              : isPicked
                                ? "bg-[hsl(var(--success))]/30 ring-2 ring-[hsl(var(--success))]"
                                : "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]/70"
                            : isCurrent
                              ? "bg-card hover:bg-primary/20 hover:scale-[1.03]"
                              : "bg-background/40 opacity-50"
                        }`}
                      >
                        <AnimatePresence>
                          {reveal && (
                            <motion.span
                              initial={{ scale: 0, rotate: -90 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: "spring", stiffness: 320, damping: 18 }}
                            >
                              {isSnake ? "🐍" : "💎"}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-background/50 p-2 text-xs">
          <span className="text-muted-foreground">
            Now <span className="font-black text-foreground tabular-nums">{currentMult.toFixed(2)}×</span>
          </span>
          {active && progress < ROWS && (
            <span className="text-muted-foreground">
              Next <span className="font-black text-primary tabular-nums">{nextMult.toFixed(2)}×</span>
            </span>
          )}
          <span className="text-muted-foreground">
            Pays{" "}
            <span className="font-black text-foreground tabular-nums">
              {formatCoins(Math.floor(bet * currentMult))}
            </span>
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4">
        <div className="space-y-3">
          <BetControls bet={bet} setBet={setBet} disabled={active} />

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Difficulty
            </label>
            <div className="mt-1 grid grid-cols-4 gap-1 rounded-full bg-background/60 p-1">
              {(["easy", "medium", "hard", "expert"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => !active && setDiff(d)}
                  disabled={active}
                  className={`rounded-full py-1.5 text-[11px] font-bold uppercase tracking-widest transition ${
                    diff === d ? "bg-card text-foreground shadow" : "text-muted-foreground"
                  } disabled:opacity-50`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {!active ? (
            <Button
              onClick={start}
              className="h-11 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:h-12"
            >
              <Sparkles className="mr-2 h-4 w-4" /> START CLIMB
            </Button>
          ) : (
            <Button
              onClick={cashout}
              disabled={progress < 1 || busy}
              className="h-11 w-full bg-[hsl(var(--success))] text-base font-black tracking-wider text-background hover:bg-[hsl(var(--success))]/90 disabled:opacity-60 sm:h-12"
            >
              CASH OUT @ {currentMult.toFixed(2)}×
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
