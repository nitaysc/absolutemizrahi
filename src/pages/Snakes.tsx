import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { Dices, Play, Sparkles } from "lucide-react";

type Difficulty = "easy" | "medium" | "hard" | "expert" | "master";

/**
 * Ring board: 5×5 grid; only the 16 perimeter tiles are playable.
 * Index 0 = top-left (START / play tile). Tiles 1..15 = clockwise around the ring.
 * The center 3×3 holds the dice and the live multiplier.
 * Rolling 1d6 advances along the ring. Each landed tile reveals as either:
 *   - multiplier (stacks onto current mult)
 *   - snake (BUST)
 *   - trophy (final big-payout tile near the end of the ring)
 */
const RING = 16;

/**
 * Per-difficulty config:
 *  - snakes: exact number of snake tiles guaranteed on the ring (excluding the start tile)
 *  - maxMult: the highest possible cumulative multiplier (placed on the final tile)
 *  - highCount: how many "top" tiles get the maxMult value (the rest interpolate up to it)
 */
const DIFF_CFG: Record<
  Difficulty,
  { snakes: number; maxMult: number; highCount: number; label: string }
> = {
  easy:   { snakes: 1, maxMult: 2.0,   highCount: 2, label: "Easy" },
  medium: { snakes: 3, maxMult: 4.0,   highCount: 1, label: "Medium" },
  hard:   { snakes: 5, maxMult: 7.5,   highCount: 1, label: "Hard" },
  expert: { snakes: 7, maxMult: 10.0,  highCount: 1, label: "Expert" },
  master: { snakes: 9, maxMult: 17.64, highCount: 1, label: "Master" },
};

type Tile =
  | { kind: "snake" }
  | { kind: "mult"; mult: number };

function buildRing(diff: Difficulty): Tile[] {
  const cfg = DIFF_CFG[diff];
  const tiles: Tile[] = new Array(RING);
  tiles[0] = { kind: "mult", mult: 1 }; // start

  // Indices available for placement (1..RING-1)
  const playable: number[] = [];
  for (let i = 1; i < RING; i++) playable.push(i);

  // Pick exactly N snake positions at random.
  const snakePool = [...playable];
  for (let i = snakePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [snakePool[i], snakePool[j]] = [snakePool[j], snakePool[i]];
  }
  const snakeSet = new Set(snakePool.slice(0, Math.min(cfg.snakes, playable.length)));

  // Multiplier tiles: ascending from ~1.05× up to maxMult, with the top `highCount`
  // tiles all sharing the maxMult value (per-step incremental, NOT cumulative).
  const multIdxs = playable.filter((i) => !snakeSet.has(i));
  const n = multIdxs.length;
  // Per-step multipliers (each tile applies once when landed) — keep them small so
  // the cumulative product stays close to maxMult by the end.
  // Solve: product over n tiles ≈ maxMult  =>  per-step ≈ maxMult^(1/n)
  // House edge: shave per-step multipliers ~6% so the cumulative product undershoots
  // maxMult on average. Also steepen the ramp so the BIG tiles are clustered near
  // the end (and harder to reach without busting on a snake first).
  const HOUSE_EDGE = 0.94;
  const perStep = Math.pow(cfg.maxMult, 1 / Math.max(1, n)) * HOUSE_EDGE;
  multIdxs.forEach((idx, k) => {
    // Steeper ramp: earlier tiles much lower, later tiles ramp up to the headline.
    const ramp = 0.78 + (k / Math.max(1, n - 1)) * 0.34;
    const v = +(perStep * ramp).toFixed(2);
    tiles[idx] = { kind: "mult", mult: Math.max(1.01, v) };
  });

  // Force highCount tiles at the END to land exactly on maxMult cumulative — easy
  // mode: the two highest-value tiles each show maxMult× as the "headline" value.
  const topIdxs = multIdxs.slice(-cfg.highCount);
  topIdxs.forEach((idx) => {
    tiles[idx] = { kind: "mult", mult: cfg.maxMult };
  });

  // Apply snakes
  snakeSet.forEach((idx) => {
    tiles[idx] = { kind: "snake" };
  });

  return tiles;
}

// Map ring index → grid (row, col) on a 5×5 board.
// 0..4: top row L→R; 5..8: right col rows 1..4; 9..12: bottom row R→L; 13..15: left col rows 3..1.
function ringToGrid(idx: number): { row: number; col: number } {
  if (idx <= 4) return { row: 0, col: idx };
  if (idx <= 8) return { row: idx - 4, col: 4 };
  if (idx <= 12) return { row: 4, col: 12 - idx };
  return { row: 16 - idx, col: 0 };
}
function gridToRing(row: number, col: number): number | null {
  if (row === 0) return col;
  if (col === 4) return 4 + row;
  if (row === 4) return 12 - col;
  if (col === 0) return 16 - row;
  return null;
}

export default function Snakes() {
  useTrackGame("snakes");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [diff, setDiff] = useState<Difficulty>("medium");
  const [active, setActive] = useState(false);
  const [board, setBoard] = useState<Tile[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [pos, setPos] = useState<number>(0);
  const [mult, setMult] = useState(1);
  const [busy, setBusy] = useState(false);
  const [dice, setDice] = useState<number | null>(null);
  const [dice2, setDice2] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<{ mult: number; won: boolean }[]>([]);
  const settledRef = useRef(false);

  // Dot pagination = number of rolls/steps taken so far (cap 5 for visual).
  const dots = Math.min(5, pos);

  async function start() {
    if (!profile || active) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    setBusy(true);
    setLocalCoins(profile.coins - bet);
    const b = buildRing(diff);
    setBoard(b);
    setRevealed(Array(RING).fill(false));
    setPos(0);
    setMult(1);
    setDice(null);
    setDice2(null);
    settledRef.current = false;
    setActive(true);
    setBusy(false);
  }

  async function roll() {
    if (!active || busy || rolling) return;
    setRolling(true);
    setBusy(true);
    let ticks = 0;
    const spin = setInterval(() => {
      setDice(1 + Math.floor(Math.random() * 6));
      setDice2(1 + Math.floor(Math.random() * 6));
      ticks++;
      if (ticks >= 8) clearInterval(spin);
    }, 70);

    await new Promise((r) => setTimeout(r, 650));
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    setDice(d1);
    setDice2(d2);
    const r = d1 + d2;

    const startPos = pos;
    // Wrap around the ring so the player can keep rolling past the final tile.
    // Skip index 0 (start) when wrapping.
    const steps: number[] = [];
    let cur = startPos;
    for (let s = 0; s < r; s++) {
      cur = (cur + 1) % RING;
      if (cur === 0) cur = 1; // skip start tile on wrap
      steps.push(cur);
    }
    const landed = steps[steps.length - 1];
    for (const i of steps) {
      setPos(i);
      await new Promise((res) => setTimeout(res, 160));
    }

    setRevealed((arr) => {
      const next = arr.slice();
      next[landed] = true;
      return next;
    });
    const tile = board[landed];

    if (tile.kind === "snake") {
      await settle(false, 0, landed);
      setRolling(false);
      return;
    }

    const newMult = +(mult * tile.mult).toFixed(2);
    setMult(newMult);

    setBusy(false);
    setRolling(false);
  }

  async function cashout() {
    if (!active || busy || rolling || pos < 1) return;
    setBusy(true);
    await settle(true, mult, pos);
  }

  async function settle(won: boolean, finalMult: number, landed: number) {
    if (settledRef.current) return;
    settledRef.current = true;
    const stake = bet;
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "snakes",
      _bet_amount: stake,
      _won: won && finalMult > 0,
      _multiplier: won ? finalMult : 0,
      _details: { difficulty: diff, tile: landed, hit_snake: !won },
    });
    setActive(false);
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    if (won) {
      const payout = Number(data?.[0]?.payout ?? 0);
      setHistory((h) => [{ mult: finalMult, won: true }, ...h].slice(0, 10));
      toast.success(`+${formatCoins(payout - stake)} @ ${finalMult.toFixed(2)}×`);
    } else {
      setHistory((h) => [{ mult: 0, won: false }, ...h].slice(0, 10));
      toast.error(`Snake on tile ${landed}!`);
    }
  }

  // Build a 5×5 grid; null cells in the middle 3×3 belong to the dice/center area.
  const gridCells = useMemo(() => {
    const cells: Array<{ row: number; col: number; ring: number | null }> = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        cells.push({ row, col, ring: gridToRing(row, col) });
      }
    }
    return cells;
  }, []);

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <span className="text-2xl sm:text-3xl">🐍</span> SNAKES
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Roll the dice. Stack multipliers around the ring. Don't get bit.
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

      {/* Board */}
      <div className="rounded-2xl border border-border bg-[hsl(220_30%_8%)] p-4 sm:rounded-3xl sm:p-6">
        <div className="mx-auto max-w-md">
          <div
            className="grid gap-2 sm:gap-3"
            style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
          >
            {gridCells.map(({ row, col, ring }) => {
              // Center 3×3 area (rows 1..3, cols 1..3) is the dice/multiplier zone.
              const isCenterArea = row >= 1 && row <= 3 && col >= 1 && col <= 3;
              if (isCenterArea) {
                // Render only one center cell that spans the 3×3 area (top-left of the area).
                if (row === 1 && col === 1) {
                  return (
                    <div
                      key={`c-${row}-${col}`}
                      className="flex flex-col items-center justify-center gap-2"
                      style={{ gridRow: "2 / span 3", gridColumn: "2 / span 3" }}
                    >
                      {/* Dice pair */}
                      <div className="flex gap-2">
                        <DieFace value={dice ?? 1} pulsing={rolling} />
                        <DieFace value={dice2 ?? 1} pulsing={rolling} />
                      </div>
                      {dice !== null && dice2 !== null && !rolling && (
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Rolled {dice + dice2}
                        </div>
                      )}
                      {/* Multiplier readout */}
                      <motion.div
                        key={mult}
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="rounded-xl bg-[hsl(220_40%_5%)] px-5 py-2 text-2xl font-black tabular-nums text-foreground shadow-inner ring-1 ring-border sm:text-3xl"
                      >
                        {mult.toFixed(2)}×
                      </motion.div>
                    </div>
                  );
                }
                return null;
              }

              if (ring === null) return null;
              const tile = board[ring];
              const isStart = ring === 0;
              const isPlayer = active && pos === ring;
              const isRevealed = revealed[ring];
              return (
                <RingTile
                  key={`t-${ring}`}
                  ring={ring}
                  tile={tile}
                  isStart={isStart}
                  isPlayer={isPlayer}
                  isRevealed={isRevealed}
                />
              );
            })}
          </div>

          {/* Dot pagination = ring progress */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full transition ${
                  i < dots ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
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
            <div className="mt-1 grid grid-cols-5 gap-1 rounded-full bg-background/60 p-1">
              {(["easy", "medium", "hard", "expert", "master"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => !active && setDiff(d)}
                  disabled={active}
                  className={`rounded-full py-1.5 text-[10px] font-bold uppercase tracking-widest transition ${
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
              <Sparkles className="mr-2 h-4 w-4" /> PLACE BET
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={roll}
                disabled={busy || rolling || pos >= RING - 1}
                className="h-11 text-base font-black tracking-wider sm:h-12"
              >
                <Dices className="mr-2 h-4 w-4" /> ROLL
              </Button>
              <Button
                onClick={cashout}
                disabled={busy || rolling || pos < 1}
                className="h-11 bg-[hsl(var(--success))] text-base font-black tracking-wider text-background hover:bg-[hsl(var(--success))]/90 disabled:opacity-60 sm:h-12"
              >
                CASH {mult.toFixed(2)}×
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----- Sub-components ----- */

function RingTile({
  ring,
  tile,
  isStart,
  isPlayer,
  isRevealed,
}: {
  ring: number;
  tile: Tile | undefined;
  isStart: boolean;
  isPlayer: boolean;
  isRevealed: boolean;
}) {
  // Keycap-style tile: rounded, soft inner shadow, slight top highlight.
  const base =
    "relative flex aspect-square items-center justify-center rounded-xl text-sm font-black tabular-nums ring-1 ring-border/80 sm:rounded-2xl sm:text-base";
  const surface =
    "bg-gradient-to-b from-[hsl(220_25%_22%)] to-[hsl(220_30%_15%)] text-foreground shadow-[inset_0_-3px_0_hsl(220_40%_8%),inset_0_1px_0_hsl(220_25%_30%)]";
  const dim = "text-muted-foreground/70";
  const playerRing = isPlayer ? "ring-2 ring-primary shadow-[0_0_18px_hsl(var(--primary)/0.55)]" : "";

  let content: React.ReactNode = null;
  if (isStart) {
    content = <Play className="h-5 w-5 fill-primary text-primary sm:h-6 sm:w-6" />;
  } else if (!isRevealed) {
    if (tile?.kind === "mult") {
      content = <span>{tile.mult.toFixed(2)}×</span>;
    } else if (tile?.kind === "snake") {
      // Snakes are visible on the board so the player can see the danger.
      content = <span className="text-xl opacity-60 sm:text-2xl">🐍</span>;
    }
  } else {
    if (tile?.kind === "snake") {
      content = <span className="text-2xl sm:text-3xl">🐍</span>;
    } else if (tile?.kind === "mult") {
      content = (
        <span className="text-[hsl(var(--success))]">{tile.mult.toFixed(2)}×</span>
      );
    }
  }

  return (
    <div className={`${base} ${surface} ${playerRing}`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${ring}-${isRevealed ? "r" : "h"}`}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
          className="flex items-center justify-center"
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function DieFace({ value, pulsing }: { value: number; pulsing: boolean }) {
  // 3×3 dot pattern by die value.
  const dot = (on: boolean) => (
    <span
      className={`block h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${
        on ? "bg-[hsl(220_40%_15%)]" : "bg-transparent"
      }`}
    />
  );
  const map: Record<number, boolean[]> = {
    1: [false, false, false, false, true, false, false, false, false],
    2: [true, false, false, false, false, false, false, false, true],
    3: [true, false, false, false, true, false, false, false, true],
    4: [true, false, true, false, false, false, true, false, true],
    5: [true, false, true, false, true, false, true, false, true],
    6: [true, false, true, true, false, true, true, false, true],
  };
  const pattern = map[value] ?? map[1];
  return (
    <motion.div
      animate={pulsing ? { rotate: [0, -8, 8, 0] } : { rotate: 0 }}
      transition={{ duration: 0.4, repeat: pulsing ? Infinity : 0 }}
      className="grid h-12 w-12 grid-cols-3 grid-rows-3 place-items-center rounded-xl bg-gradient-to-b from-[hsl(220_15%_92%)] to-[hsl(220_15%_82%)] p-2 shadow-[inset_0_-3px_0_hsl(220_15%_70%),0_4px_10px_hsl(220_40%_5%/0.5)] sm:h-14 sm:w-14"
    >
      {pattern.map((on, i) => (
        <span key={i}>{dot(on)}</span>
      ))}
    </motion.div>
  );
}