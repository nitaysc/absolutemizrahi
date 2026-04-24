import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { Dices, Sparkles } from "lucide-react";

type Difficulty = "easy" | "medium" | "hard" | "expert";

// Board: serpentine 6 cols × N rows. Player rolls 1d6 and advances.
// Each tile reveals on landing: SNAKE (bust) or MULTIPLIER (cumulative).
// Snake density and multiplier curve scale with difficulty (~97% RTP target).
const COLS = 6;
const ROWS = 8; // 48 tiles
const TOTAL = COLS * ROWS;

const DIFF_CFG: Record<
  Difficulty,
  { snakeChance: (i: number) => number; multBase: number; label: string }
> = {
  easy:   { snakeChance: (i) => 0.06 + i * 0.004, multBase: 1.06, label: "Easy" },
  medium: { snakeChance: (i) => 0.10 + i * 0.006, multBase: 1.10, label: "Medium" },
  hard:   { snakeChance: (i) => 0.16 + i * 0.008, multBase: 1.16, label: "Hard" },
  expert: { snakeChance: (i) => 0.24 + i * 0.010, multBase: 1.26, label: "Expert" },
};

type Tile =
  | { kind: "snake" }
  | { kind: "mult"; mult: number };

function buildBoard(diff: Difficulty): Tile[] {
  const cfg = DIFF_CFG[diff];
  const tiles: Tile[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const snakeP = Math.min(0.55, cfg.snakeChance(i));
    if (Math.random() < snakeP) {
      tiles.push({ kind: "snake" });
    } else {
      // Multiplier increases with depth + small jitter.
      const base = Math.pow(cfg.multBase, i + 1);
      const jitter = 0.85 + Math.random() * 0.35;
      tiles.push({ kind: "mult", mult: +(base * jitter).toFixed(2) });
    }
  }
  return tiles;
}

// Board layout: row 0 (bottom) goes left→right, row 1 right→left, etc.
function tileToCoord(idx: number) {
  const row = Math.floor(idx / COLS);
  const colInRow = idx % COLS;
  const col = row % 2 === 0 ? colInRow : COLS - 1 - colInRow;
  return { row, col };
}

export default function Snakes() {
  useTrackGame("snakes");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [diff, setDiff] = useState<Difficulty>("medium");
  const [active, setActive] = useState(false);
  const [board, setBoard] = useState<Tile[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [pos, setPos] = useState<number>(-1); // -1 = off board (start)
  const [mult, setMult] = useState(1);
  const [busy, setBusy] = useState(false);
  const [dice, setDice] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<{ mult: number; won: boolean }[]>([]);
  const settledRef = useRef(false);

  async function start() {
    if (!profile || active) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    setBusy(true);
    setLocalCoins(profile.coins - bet);
    const b = buildBoard(diff);
    setBoard(b);
    setRevealed(Array(TOTAL).fill(false));
    setPos(-1);
    setMult(1);
    setDice(null);
    settledRef.current = false;
    setActive(true);
    setBusy(false);
  }

  async function roll() {
    if (!active || busy || rolling) return;
    setRolling(true);
    setBusy(true);
    // Quick dice animation
    let ticks = 0;
    const spin = setInterval(() => {
      setDice(1 + Math.floor(Math.random() * 6));
      ticks++;
      if (ticks >= 8) clearInterval(spin);
    }, 70);

    await new Promise((r) => setTimeout(r, 650));
    const roll = 1 + Math.floor(Math.random() * 6);
    setDice(roll);

    // Move tile by tile with small delays for tension.
    const start = pos;
    let landed = Math.min(TOTAL - 1, start + roll);
    for (let i = start + 1; i <= landed; i++) {
      setPos(i);
      await new Promise((r) => setTimeout(r, 140));
    }

    // Reveal landed tile
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

    // Auto-cashout if reached the final tile.
    if (landed >= TOTAL - 1) {
      await settle(true, newMult, landed);
      setRolling(false);
      return;
    }
    setBusy(false);
    setRolling(false);
  }

  async function cashout() {
    if (!active || busy || rolling || pos < 0) return;
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
      _details: { difficulty: diff, tile: landed + 1, hit_snake: !won },
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
      toast.error(`Snake on tile ${landed + 1}!`);
    }
  }

  // Render rows top→bottom (highest tile index first row visually).
  const rowsRender = useMemo(
    () => Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i),
    [],
  );

  function tileAt(row: number, col: number): { idx: number; tile: Tile | undefined } {
    const colInRow = row % 2 === 0 ? col : COLS - 1 - col;
    const idx = row * COLS + colInRow;
    return { idx, tile: board[idx] };
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <span className="text-2xl sm:text-3xl">🐍</span> SNAKES
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Roll the dice. Stack multipliers. Don't get bit.
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
      <div className="rounded-2xl border border-border bg-gradient-to-b from-emerald-950/40 via-card/70 to-emerald-900/20 p-2 backdrop-blur-xl sm:rounded-3xl sm:p-4">
        <div className="flex flex-col gap-1.5">
          {rowsRender.map((row) => (
            <div
              key={row}
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: COLS }, (_, col) => {
                const { idx, tile } = tileAt(row, col);
                const isPlayer = pos === idx;
                const isRevealed = revealed[idx];
                const isStart = false;
                return (
                  <div
                    key={col}
                    className={`relative flex aspect-square items-center justify-center rounded-lg text-[10px] font-black transition sm:rounded-xl sm:text-xs ${
                      isPlayer
                        ? "ring-2 ring-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)]"
                        : ""
                    } ${
                      isRevealed
                        ? tile?.kind === "snake"
                          ? "bg-destructive/25 text-destructive"
                          : "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]"
                        : "bg-card/70 text-muted-foreground"
                    }`}
                  >
                    <span className="absolute left-1 top-0.5 text-[8px] opacity-40 tabular-nums">
                      {idx + 1}
                    </span>
                    {isRevealed ? (
                      tile?.kind === "snake" ? (
                        <motion.span
                          initial={{ scale: 0, rotate: -90 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: "spring", stiffness: 300, damping: 16 }}
                          className="text-base sm:text-xl"
                        >
                          🐍
                        </motion.span>
                      ) : (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="tabular-nums"
                        >
                          {tile?.kind === "mult" ? `${tile.mult.toFixed(2)}×` : ""}
                        </motion.span>
                      )
                    ) : (
                      <span className="opacity-30">?</span>
                    )}
                    <AnimatePresence>
                      {isPlayer && (
                        <motion.div
                          layoutId="player-token"
                          className="absolute inset-1 rounded-md bg-primary/30 ring-2 ring-primary"
                          transition={{ type: "spring", stiffness: 360, damping: 26 }}
                        >
                          <div className="flex h-full w-full items-center justify-center text-base sm:text-lg">
                            🎩
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Status bar */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-background/50 p-2 text-xs">
          <span className="text-muted-foreground">
            Tile{" "}
            <span className="font-black text-foreground tabular-nums">
              {pos < 0 ? "—" : `${pos + 1}/${TOTAL}`}
            </span>
          </span>
          <span className="text-muted-foreground">
            Mult <span className="font-black text-primary tabular-nums">{mult.toFixed(2)}×</span>
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Dices className="h-3 w-3" />
            <motion.span
              key={dice ?? "none"}
              initial={{ scale: 0.6, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              className="font-black text-foreground tabular-nums"
            >
              {dice ?? "—"}
            </motion.span>
          </span>
          <span className="text-muted-foreground">
            Pays{" "}
            <span className="font-black text-foreground tabular-nums">
              {formatCoins(Math.floor(bet * mult))}
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
              <Sparkles className="mr-2 h-4 w-4" /> PLACE BET
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={roll}
                disabled={busy || rolling || pos >= TOTAL - 1}
                className="h-11 text-base font-black tracking-wider sm:h-12"
              >
                <Dices className="mr-2 h-4 w-4" /> ROLL
              </Button>
              <Button
                onClick={cashout}
                disabled={busy || rolling || pos < 0}
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