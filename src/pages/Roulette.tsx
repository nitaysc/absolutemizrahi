import { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { Disc3, RotateCcw, Trash2, Zap } from "lucide-react";

/** European single-zero wheel order (clockwise). House edge ~2.7%. */
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const colorOf = (n: number): "red" | "black" | "green" =>
  n === 0 ? "green" : RED_NUMBERS.has(n) ? "red" : "black";

type BetKey =
  | `n:${number}`
  | "red" | "black" | "even" | "odd" | "low" | "high"
  | "d1" | "d2" | "d3"
  | "c1" | "c2" | "c3";

const PAYOUT: Record<string, number> = {
  n: 35,                                     // straight up — pays 35:1
  red: 1, black: 1, even: 1, odd: 1, low: 1, high: 1,
  d1: 2, d2: 2, d3: 2,                       // dozens 2:1
  c1: 2, c2: 2, c3: 2,                       // columns 2:1
};

function isWinning(key: BetKey, n: number): boolean {
  if (n === 0) return key === "n:0";
  if (key.startsWith("n:")) return Number(key.slice(2)) === n;
  switch (key) {
    case "red": return colorOf(n) === "red";
    case "black": return colorOf(n) === "black";
    case "even": return n % 2 === 0;
    case "odd": return n % 2 === 1;
    case "low": return n >= 1 && n <= 18;
    case "high": return n >= 19 && n <= 36;
    case "d1": return n >= 1 && n <= 12;
    case "d2": return n >= 13 && n <= 24;
    case "d3": return n >= 25 && n <= 36;
    case "c1": return n % 3 === 1;
    case "c2": return n % 3 === 2;
    case "c3": return n % 3 === 0;
  }
  return false;
}

function payoutFor(key: BetKey): number {
  if (key.startsWith("n:")) return PAYOUT.n;
  return PAYOUT[key] ?? 0;
}

const CHIP_VALUES = [1, 5, 25, 100, 500] as const;

export default function Roulette() {
  useTrackGame("roulette");
  const { profile, setLocalCoins } = useUserProfile();
  const [chip, setChip] = useState<number>(5);
  const [defaultBet, setDefaultBet] = useState<number>(10);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [angle, setAngle] = useState<number>(0);
  const [spinDuration, setSpinDuration] = useState<number>(4.2);
  const [ballAngle, setBallAngle] = useState<number>(0);
  const [ballDuration, setBallDuration] = useState<number>(3.8);
  const [showWin, setShowWin] = useState<{ profit: number } | null>(null);
  const lastBetsRef = useRef<Record<string, number>>({});

  const totalStake = useMemo(
    () => Object.values(bets).reduce((a, b) => a + b, 0),
    [bets],
  );

  function placeChip(key: BetKey) {
    if (spinning) return;
    const balance = profile?.coins ?? 0;
    if (totalStake + chip > balance) return toast.error("Not enough coins");
    setBets((b) => ({ ...b, [key]: (b[key] ?? 0) + chip }));
  }

  function clearBets() {
    if (spinning) return;
    setBets({});
  }

  function rebet() {
    if (spinning) return;
    const balance = profile?.coins ?? 0;
    const total = Object.values(lastBetsRef.current).reduce((a, b) => a + b, 0);
    if (total === 0) return;
    if (total > balance) return toast.error("Not enough coins");
    setBets({ ...lastBetsRef.current });
  }

  async function spin() {
    if (spinning) return;
    if (totalStake < 1) return toast.error("Place a bet first");
    if ((profile?.coins ?? 0) < totalStake) return toast.error("Not enough coins");

    setSpinning(true);
    setShowWin(null);
    lastBetsRef.current = { ...bets };

    // Randomized stop point: can land anywhere inside a pocket (not always dead-center).
    const slice = 360 / WHEEL_ORDER.length;
    const idx = Math.floor(Math.random() * WHEEL_ORDER.length);
    const winning = WHEEL_ORDER[idx];
    const pocketJitter = (Math.random() - 0.5) * slice * 0.86;
    const targetNorm = (((-idx * slice + pocketJitter) % 360) + 360) % 360;

    // Spin animation: natural deceleration + variable travel for less predictable motion.
    const extraTurns = 6 + Math.floor(Math.random() * 5); // 6..10 full turns
    const currentNorm = ((angle % 360) + 360) % 360;
    const settleDelta = (currentNorm - targetNorm + 360) % 360;
    const travel = extraTurns * 360 + settleDelta;
    const target = angle - travel;
    const nextDuration = Math.max(3.2, Math.min(6.4, travel / 700));
    const currentBallNorm = ((ballAngle % 360) + 360) % 360;
    const ballTurns = 10 + Math.floor(Math.random() * 7); // 10..16 orbits
    const ballSettle = (360 - currentBallNorm) % 360;
    const nextBallDuration = Math.max(2.8, Math.min(5.4, nextDuration * 0.92));
    const targetBall = ballAngle + ballTurns * 360 + ballSettle;

    setSpinDuration(nextDuration);
    setBallDuration(nextBallDuration);
    setAngle(target);
    setBallAngle(targetBall);

    // Compute payouts
    let totalReturn = 0;
    let stake = 0;
    for (const [k, amt] of Object.entries(bets)) {
      stake += amt;
      if (isWinning(k as BetKey, winning)) {
        totalReturn += amt + amt * payoutFor(k as BetKey);
      }
    }
    const profit = totalReturn - stake;
    const won = profit > 0;
    // Multiplier reported to bets table = totalReturn / stake (0 if total loss).
    const mult = stake > 0 ? +(totalReturn / stake).toFixed(4) : 0;

    // Wait for spin animation
    await new Promise((r) =>
      setTimeout(r, Math.ceil(Math.max(nextDuration, nextBallDuration) * 1000) + 120),
    );

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "roulette",
      _bet_amount: stake,
      _won: won,
      _multiplier: mult,
      _details: { winning, color: colorOf(winning), bets },
    });

    setSpinning(false);
    setResult(winning);
    setHistory((h) => [winning, ...h].slice(0, 12));

    if (error) {
      toast.error(error.message);
      return;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setBets({});
    if (profit > 0) {
      setShowWin({ profit });
      toast.success(`+${formatCoins(profit)}`);
      window.setTimeout(() => setShowWin(null), 2400);
    } else if (profit === 0 && totalReturn > 0) {
      toast("Push — bet returned");
    } else {
      toast.error(`-${formatCoins(-profit)}`);
    }
  }

  // Update default bet ↔ chip selection convenience
  useEffect(() => { setDefaultBet(chip); }, [chip]);
  void defaultBet;

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <Disc3 className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> ROULETTE
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            European single-zero · 35:1 straight · 2:1 dozens · 1:1 outside
          </p>
        </div>
        {history.length > 0 && (
          <ul className="flex gap-1.5">
            {history.map((n, i) => (
              <li
                key={i}
                className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-black tabular-nums text-white ${
                  colorOf(n) === "red"
                    ? "bg-red-600"
                    : colorOf(n) === "black"
                      ? "bg-zinc-900 ring-1 ring-zinc-700"
                      : "bg-emerald-600"
                }`}
              >
                {n}
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_320px] sm:gap-4">
        {/* Wheel + table */}
        <div className="space-y-3 min-w-0">
          {/* Wheel */}
          <div className="relative flex flex-col items-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-emerald-950/60 via-card/80 to-emerald-900/40 p-4 backdrop-blur-xl sm:rounded-3xl sm:p-5">
            <div className="relative">
              <Wheel
                angle={angle}
                spinning={spinning}
                duration={spinDuration}
                ballAngle={ballAngle}
                ballDuration={ballDuration}
              />
            </div>

            {/* Result chip */}
            <AnimatePresence mode="wait">
              {!spinning && result !== null && (
                <motion.div
                  key={`r-${result}-${history.length}`}
                  initial={{ scale: 0.4, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 240, damping: 18 }}
                  className={`mt-3 flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-black uppercase tracking-widest text-white shadow-lg ${
                    colorOf(result) === "red"
                      ? "bg-red-600 shadow-red-600/40"
                      : colorOf(result) === "black"
                        ? "bg-zinc-900 ring-1 ring-zinc-700"
                        : "bg-emerald-600 shadow-emerald-600/40"
                  }`}
                >
                  Landed on {result} · {colorOf(result)}
                </motion.div>
              )}
              {spinning && (
                <motion.div
                  key="spin"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 text-xs font-bold uppercase tracking-widest text-amber-300/90"
                >
                  Spinning…
                </motion.div>
              )}
            </AnimatePresence>

            {/* Win banner */}
            <AnimatePresence>
              {showWin && (
                <motion.div
                  key="winbanner"
                  initial={{ opacity: 0, scale: 0.7, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="pointer-events-none absolute inset-x-0 top-3 z-30 mx-auto w-fit rounded-full border-2 border-amber-300/70 bg-gradient-to-br from-amber-400/95 to-amber-600/95 px-5 py-1.5 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_36px_hsl(var(--primary)/0.5)]"
                >
                  +{formatCoins(showWin.profit)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bet table */}
          <BetTable
            bets={bets}
            onPlace={placeChip}
            disabled={spinning}
            chip={chip}
          />
        </div>

        {/* Side panel */}
        <div className="space-y-3 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4">
          <BetControls bet={chip} setBet={setChip} disabled={spinning} />

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Quick chips
            </label>
            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {CHIP_VALUES.map((v) => {
                const active = chip === v;
                return (
                  <button
                    key={v}
                    onClick={() => setChip(v)}
                    disabled={spinning}
                    className={`rounded-full py-1.5 text-xs font-black tabular-nums transition ${
                      active
                        ? "bg-primary text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.5)]"
                        : "bg-background/60 text-foreground hover:bg-background"
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-background/60 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total stake</span>
              <span className="font-black tabular-nums">{formatCoins(totalStake)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">Positions</span>
              <span className="font-bold tabular-nums">{Object.keys(bets).length}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={clearBets}
              disabled={spinning || totalStake === 0}
              className="font-black"
            >
              <Trash2 className="mr-1 h-4 w-4" /> CLEAR
            </Button>
            <Button
              variant="outline"
              onClick={rebet}
              disabled={spinning || Object.keys(lastBetsRef.current).length === 0}
              className="font-black"
            >
              <RotateCcw className="mr-1 h-4 w-4" /> REBET
            </Button>
          </div>

          <Button
            onClick={spin}
            disabled={spinning || totalStake === 0}
            className="h-12 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
          >
            <Zap className="mr-2 h-4 w-4" />
            {spinning ? "SPINNING…" : `SPIN — ${formatCoins(totalStake)}`}
          </Button>

          <p className="text-[10px] leading-snug text-muted-foreground">
            Tap a chip value, then tap any number / red-black / dozen to stack
            chips. Multiple positions allowed. Spin pays each winning bet at
            its odds.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Visual wheel: SVG conic of pockets that rotates by `angle` degrees. */
function Wheel({
  angle,
  spinning,
  duration,
  ballAngle,
  ballDuration,
}: {
  angle: number;
  spinning: boolean;
  duration: number;
  ballAngle: number;
  ballDuration: number;
}) {
  const N = WHEEL_ORDER.length;
  const slice = 360 / N;
  const r = 120;
  const cx = 130, cy = 130;

  return (
    <div className="relative h-[260px] w-[260px] sm:h-[300px] sm:w-[300px]">
      <div className="absolute inset-0 rounded-full border border-amber-200/30 shadow-inner" />
      <motion.div
        animate={{ rotate: angle }}
        transition={{
          duration: spinning ? duration : 0,
          ease: spinning ? [0.06, 0.72, 0.14, 1] : "linear",
        }}
        className="h-full w-full"
        style={{ transformOrigin: "50% 50%" }}
      >
        <svg viewBox="0 0 260 260" className="h-full w-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          <defs>
            <radialGradient id="rim" cx="50%" cy="50%" r="50%">
              <stop offset="80%" stopColor="hsl(35 60% 35%)" />
              <stop offset="100%" stopColor="hsl(35 50% 20%)" />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={128} fill="url(#rim)" />
          {WHEEL_ORDER.map((n, i) => {
            const a0 = (i * slice - 90 - slice / 2) * (Math.PI / 180);
            const a1 = ((i + 1) * slice - 90 - slice / 2) * (Math.PI / 180);
            const x0 = cx + r * Math.cos(a0);
            const y0 = cy + r * Math.sin(a0);
            const x1 = cx + r * Math.cos(a1);
            const y1 = cy + r * Math.sin(a1);
            const fill =
              colorOf(n) === "red" ? "#dc2626" :
              colorOf(n) === "green" ? "#059669" :
              "#0a0a0a";
            // Label position: midway along radius
            const am = ((i + 0.5) * slice - 90 - slice / 2) * (Math.PI / 180);
            const lx = cx + (r - 18) * Math.cos(am);
            const ly = cy + (r - 18) * Math.sin(am);
            return (
              <g key={i}>
                <path
                  d={`M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z`}
                  fill={fill}
                  stroke="hsl(45 80% 55%)"
                  strokeWidth="0.4"
                />
                <text
                  x={lx}
                  y={ly}
                  fill="white"
                  fontSize="9"
                  fontWeight="900"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${(i + 0.5) * slice} ${lx} ${ly})`}
                >
                  {n}
                </text>
              </g>
            );
          })}
          {/* Hub */}
          <circle cx={cx} cy={cy} r={32} fill="hsl(35 60% 30%)" stroke="hsl(45 80% 55%)" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r={10} fill="hsl(45 90% 60%)" />
        </svg>
      </motion.div>

      {/* Ball lane + rolling ball */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[88%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <motion.div
          animate={{ rotate: ballAngle }}
          transition={{
            duration: spinning ? ballDuration : 0,
            ease: spinning ? [0.07, 0.76, 0.16, 1] : "linear",
          }}
          className="absolute inset-0"
          style={{ transformOrigin: "50% 50%" }}
        >
          <div className="absolute left-1/2 top-[7.5%] h-4 w-4 -translate-x-1/2 rounded-full bg-zinc-100 shadow-[0_0_0_2px_rgba(255,255,255,0.35),0_0_20px_rgba(250,250,250,0.75)]" />
        </motion.div>
      </div>
    </div>
  );
}

/** Betting layout: numbers grid + dozens + outside. */
function BetTable({
  bets,
  onPlace,
  disabled,
  chip,
}: {
  bets: Record<string, number>;
  onPlace: (key: BetKey) => void;
  disabled?: boolean;
  chip: number;
}) {
  // Numbers laid out 3 rows × 12 cols, top row = 3,6,9... bottom = 1,4,7...
  const rows: number[][] = [
    Array.from({ length: 12 }, (_, i) => 3 + i * 3),
    Array.from({ length: 12 }, (_, i) => 2 + i * 3),
    Array.from({ length: 12 }, (_, i) => 1 + i * 3),
  ];

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-emerald-950/50 via-card/80 to-emerald-900/30 p-2 backdrop-blur-xl sm:rounded-3xl sm:p-3">
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          {/* Top: 0 + numbers + columns label */}
          <div className="flex gap-1">
            <Cell
              keyId="n:0"
              label="0"
              color="green"
              bets={bets}
              onPlace={onPlace}
              disabled={disabled}
              chip={chip}
              className="h-[114px] w-9"
            />
            <div className="flex-1">
              {rows.map((row, ri) => (
                <div key={ri} className="flex gap-1">
                  {row.map((n) => (
                    <Cell
                      key={n}
                      keyId={`n:${n}` as BetKey}
                      label={String(n)}
                      color={colorOf(n)}
                      bets={bets}
                      onPlace={onPlace}
                      disabled={disabled}
                      chip={chip}
                      className="h-9 flex-1"
                    />
                  ))}
                  <Cell
                    keyId={(["c3", "c2", "c1"] as BetKey[])[ri]}
                    label="2:1"
                    color="outside"
                    bets={bets}
                    onPlace={onPlace}
                    disabled={disabled}
                    chip={chip}
                    className="h-9 w-10"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Dozens */}
          <div className="ml-10 mt-1 flex gap-1">
            {(["d1", "d2", "d3"] as BetKey[]).map((k, i) => (
              <Cell
                key={k}
                keyId={k}
                label={["1st 12", "2nd 12", "3rd 12"][i]}
                color="outside"
                bets={bets}
                onPlace={onPlace}
                disabled={disabled}
                chip={chip}
                className="h-9 flex-1"
              />
            ))}
            <div className="w-10" />
          </div>

          {/* Outside row */}
          <div className="ml-10 mt-1 flex gap-1">
            {[
              { k: "low" as BetKey, label: "1-18" },
              { k: "even" as BetKey, label: "EVEN" },
              { k: "red" as BetKey, label: "RED", color: "red" as const },
              { k: "black" as BetKey, label: "BLACK", color: "black" as const },
              { k: "odd" as BetKey, label: "ODD" },
              { k: "high" as BetKey, label: "19-36" },
            ].map((o) => (
              <Cell
                key={o.k}
                keyId={o.k}
                label={o.label}
                color={(o.color as "red" | "black") ?? "outside"}
                bets={bets}
                onPlace={onPlace}
                disabled={disabled}
                chip={chip}
                className="h-9 flex-1"
              />
            ))}
            <div className="w-10" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({
  keyId,
  label,
  color,
  bets,
  onPlace,
  disabled,
  chip,
  className,
}: {
  keyId: BetKey;
  label: string;
  color: "red" | "black" | "green" | "outside";
  bets: Record<string, number>;
  onPlace: (k: BetKey) => void;
  disabled?: boolean;
  chip: number;
  className?: string;
}) {
  const amt = bets[keyId] ?? 0;
  const bg =
    color === "red"
      ? "bg-red-600 hover:bg-red-500"
      : color === "black"
        ? "bg-zinc-900 hover:bg-zinc-800 ring-1 ring-zinc-700"
        : color === "green"
          ? "bg-emerald-600 hover:bg-emerald-500"
          : "bg-emerald-900/60 hover:bg-emerald-800/70 ring-1 ring-emerald-700/50";
  return (
    <button
      onClick={() => onPlace(keyId)}
      disabled={disabled}
      title={`Place ${chip} on ${label}`}
      className={`relative flex items-center justify-center rounded-md text-[11px] font-black uppercase tracking-wider text-white transition disabled:opacity-60 ${bg} ${className ?? ""}`}
    >
      {label}
      {amt > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border border-amber-200/80 bg-amber-400 px-1 text-[9px] font-black tabular-nums text-black shadow-md">
          {amt}
        </span>
      )}
    </button>
  );
}
