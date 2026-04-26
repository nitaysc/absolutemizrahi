import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wind } from "lucide-react";
import { playGem, playBomb, playTileClick, playCashout } from "@/lib/sfx";

/**
 * PUMP — balloon pump game. Each tap pumps the balloon; the multiplier grows
 * geometrically with the difficulty's "step" rate. Server pre-rolls a pop
 * pump up-front (provably fair-ish) so the client can never know when it
 * pops. Cash out anytime before the pop.
 */

type Difficulty = "easy" | "medium" | "hard" | "insane";

const STEP: Record<Difficulty, number> = {
  easy: 1.0175,
  medium: 1.065,
  hard: 1.16,
  insane: 1.35,
};
/**
 * Pop chance grows every pump (matches `pump_start` server-side):
 *   chance(i) = min(cap, base + (i-1) * grow)
 */
const POP_CURVE: Record<
  Difficulty,
  { base: number; grow: number; cap: number }
> = {
  easy:   { base: 0.02, grow: 0.0020, cap: 0.35 },
  medium: { base: 0.04, grow: 0.0045, cap: 0.55 },
  hard:   { base: 0.12, grow: 0.0080, cap: 0.75 },
  insane: { base: 0.25, grow: 0.0150, cap: 0.90 },
};

function popChanceAtPump(diff: Difficulty, pumpIndex: number): number {
  const { base, grow, cap } = POP_CURVE[diff];
  return Math.min(cap, base + Math.max(0, pumpIndex - 1) * grow);
}

function multForPump(diff: Difficulty, pumps: number) {
  if (pumps <= 0) return 1;
  return +(Math.pow(STEP[diff], pumps) * 0.99).toFixed(4);
}

export default function Pump() {
  useTrackGame("pump");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [active, setActive] = useState(false);
  const [pumps, setPumps] = useState(0);
  const [pendingPump, setPendingPump] = useState(false);
  const [busy, setBusy] = useState(false);
  const [popped, setPopped] = useState(false);
  const [popAt, setPopAt] = useState<number | null>(null);
  // Per-action locks so a click on CASHOUT isn't silently swallowed while a
  // PUMP request is still in flight. We also queue a pending cashout so a
  // fast double-tap (PUMP → CASHOUT) is honoured the moment the pump resolves.
  const pumpingRef = useRef(false);
  const cashingRef = useRef(false);
  const startingRef = useRef(false);
  const pendingCashoutRef = useRef(false);
  const activeRef = useRef(false);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Resume any active server-side round on mount so a refresh doesn't lose state.
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("pump_round")
        .eq("id", profile.id)
        .maybeSingle();
      const round = data?.pump_round as
        | { active?: boolean; bet?: number; difficulty?: Difficulty; pumps?: number }
        | null;
      if (round?.active) {
        setActive(true);
        setBet(Number(round.bet ?? bet));
        setDifficulty((round.difficulty ?? "medium") as Difficulty);
        setPumps(Number(round.pumps ?? 0));
        setPendingPump(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const displayPumps = pumps + (pendingPump ? 1 : 0);
  const currentMult = multForPump(difficulty, displayPumps);
  const nextMult = multForPump(difficulty, displayPumps + 1);
  const profit = active ? Math.floor(bet * currentMult) - bet : 0;
  // Risk meters
  const nextPopChance = popChanceAtPump(difficulty, displayPumps + 1);
  const currentPopChance = popChanceAtPump(difficulty, Math.max(1, displayPumps));
  // Visual scale: balloon grows with each pump, capped so it doesn't escape.
  const balloonScale = Math.min(1 + displayPumps * 0.06, 2.6);

  async function start() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    if (startingRef.current || activeRef.current) return;
    startingRef.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("pump_start", {
        _bet_amount: bet,
        _difficulty: difficulty,
      });
      if (error) return toast.error(error.message);
      if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
      setActive(true);
      activeRef.current = true;
      setPumps(0);
      setPendingPump(false);
      setPopped(false);
      setPopAt(null);
    } finally {
      startingRef.current = false;
      setBusy(false);
    }
  }

  async function pump() {
    if (!activeRef.current || pumpingRef.current || cashingRef.current) return;
    pumpingRef.current = true;
    setPendingPump(true);
    setBusy(true);
    playTileClick();
    try {
      const { data, error } = await supabase.rpc("pump_pump");
      if (error) return toast.error(error.message);
      const r = data?.[0];
      if (!r) return;
      setPumps(r.pumps);
      if (r.popped) {
        playBomb();
        setPopped(true);
        setPopAt(r.pop_at);
        setActive(false);
        activeRef.current = false;
        pendingCashoutRef.current = false;
        setPendingPump(false);
        toast.error(`Pop! -${formatCoins(bet)}`);
        setTimeout(() => {
          setPumps(0);
          setPopped(false);
        }, 2200);
      } else {
        playGem();
      }
    } finally {
      pumpingRef.current = false;
      setPendingPump(false);
      setBusy(false);
      // If the user pressed CASHOUT while this pump was in flight, run it now.
      if (pendingCashoutRef.current && activeRef.current) {
        pendingCashoutRef.current = false;
        void cashout();
      }
    }
  }

  async function cashout() {
    if (!activeRef.current || cashingRef.current) return;
    // If a pump is mid-flight, queue the cashout instead of dropping the click.
    if (pumpingRef.current) {
      pendingCashoutRef.current = true;
      return;
    }
    if (displayPumps < 1) return;
    cashingRef.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("pump_cashout");
      if (error) return toast.error(error.message);
      const r = data?.[0];
      if (!r) return;
      playCashout();
      setLocalCoins(Number(r.new_balance));
      const profitNow = Math.max(Number(r.payout) - bet, 0);
      const lanesLeft = Number(r.pop_at) - pumps;
      setActive(false);
      activeRef.current = false;
      setPendingPump(false);
      setPopAt(Number(r.pop_at));
      toast.success(
        `+${formatCoins(profitNow)} (${Number(r.multiplier).toFixed(2)}×) — pop was ${lanesLeft} pump${lanesLeft === 1 ? "" : "s"} away!`,
      );
      setTimeout(() => {
        setPumps(0);
        setPopAt(null);
      }, 2200);
    } finally {
      cashingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
          <Wind className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> PUMP
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Pump the balloon. Cash out before it pops.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
        {/* Stage */}
        <div className="relative flex min-h-[360px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-border bg-card/70 p-6 backdrop-blur-xl">
          <AnimatePresence mode="wait">
            {popped ? (
              <motion.div
                key="pop"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: [1.4, 1], opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="text-7xl"
              >
                💥
              </motion.div>
            ) : (
              <motion.div
                key="balloon"
                initial={{ scale: 0.6, y: 20, opacity: 0 }}
                animate={{
                  scale: balloonScale,
                  y: [0, -3, 0],
                  opacity: 1,
                }}
                transition={{
                  scale: { type: "spring", stiffness: 220, damping: 16 },
                  y: { repeat: Infinity, duration: 2.4, ease: "easeInOut" },
                  opacity: { duration: 0.3 },
                }}
                exit={{ opacity: 0 }}
                className="relative"
              >
                <Balloon difficulty={difficulty} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
            <div
              className={`text-4xl font-black tabular-nums ${
                popped
                  ? "text-destructive"
                  : active
                    ? "text-[hsl(var(--success))]"
                    : "text-foreground/60"
              }`}
            >
              {currentMult.toFixed(2)}×
            </div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {popped
                ? `Popped at pump ${popAt}`
                : active
                  ? `Pump ${pumps} · next ${nextMult.toFixed(2)}×`
                  : "Place your bet"}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-3 rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <BetControls bet={bet} setBet={setBet} disabled={active} />
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Difficulty
            </label>
            <Select
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as Difficulty)}
              disabled={active}
            >
              <SelectTrigger className="mt-1 font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STEP) as Difficulty[]).map((d) => {
                  const c = POP_CURVE[d];
                  return (
                    <SelectItem key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)} — start {(c.base * 100).toFixed(0)}% +
                      {(c.grow * 100).toFixed(2)}%/pump · ×{STEP[d]}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {active && (
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat label="Current" value={`${currentMult.toFixed(2)}×`} />
              <Stat
                label="Profit"
                value={profit > 0 ? `+${formatCoins(profit)}` : "—"}
                tone={profit > 0 ? "win" : undefined}
              />
            </div>
          )}

          {/* Per-pump risk display — always visible so the player can see
              how much riskier each successive pump gets. */}
          <RiskTable
            difficulty={difficulty}
            currentPump={displayPumps}
            active={active}
          />

          {!active ? (
            <Button
              onClick={start}
              disabled={busy}
              className="h-12 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
            >
              BET
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={pump}
                disabled={busy}
                className="h-12 text-base font-black tracking-wider"
              >
                PUMP · {(nextPopChance * 100).toFixed(1)}% risk
              </Button>
              <Button
                onClick={cashout}
                disabled={displayPumps < 1 || cashingRef.current}
                className="h-12 bg-[hsl(var(--success))] text-background hover:bg-[hsl(var(--success))]/90"
              >
                CASHOUT {currentMult > 1 ? `(${currentMult.toFixed(2)}×)` : ""}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "win" }) {
  return (
    <div className="rounded-xl bg-background/60 p-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 text-base font-black tabular-nums ${
          tone === "win" ? "text-[hsl(var(--success))]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function RiskTable({
  difficulty,
  currentPump,
  active,
}: {
  difficulty: Difficulty;
  currentPump: number;
  active: boolean;
}) {
  // Show 8 upcoming pumps so the curve is visible at a glance.
  const start = active ? Math.max(0, currentPump) : 0;
  const rows = Array.from({ length: 8 }, (_, k) => {
    const i = start + k + 1; // 1-indexed pump number
    return {
      i,
      mult: +(Math.pow(STEP[difficulty], i) * 0.99).toFixed(2),
      risk: popChanceAtPump(difficulty, i),
    };
  });
  const cap = POP_CURVE[difficulty].cap;
  return (
    <div className="rounded-2xl border border-border bg-background/40 p-2">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {active ? "Next 8 pumps" : "Risk preview"}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          cap {(cap * 100).toFixed(0)}%
        </span>
      </div>
      <ul className="grid grid-cols-4 gap-1">
        {rows.map((r, k) => {
          const pct = (r.risk * 100).toFixed(1);
          const tone =
            r.risk >= 0.5
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : r.risk >= 0.25
                ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                : r.risk >= 0.1
                  ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
          return (
            <li
              key={k}
              className={`rounded-lg border px-1.5 py-1 text-center ${tone}`}
              title={`Pump #${r.i}: ${pct}% pop risk · ${r.mult}×`}
            >
              <div className="text-[9px] font-bold uppercase tracking-wider opacity-70">
                #{r.i}
              </div>
              <div className="text-[11px] font-black tabular-nums">{pct}%</div>
              <div className="text-[9px] font-bold tabular-nums opacity-80">
                {r.mult}×
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Balloon({ difficulty }: { difficulty: Difficulty }) {
  const tone =
    difficulty === "easy"
      ? "hsl(140 70% 55%)"
      : difficulty === "medium"
        ? "hsl(45 95% 55%)"
        : difficulty === "hard"
          ? "hsl(20 90% 55%)"
          : "hsl(0 85% 55%)";
  return (
    <svg width="120" height="160" viewBox="0 0 120 160" className="drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
      <defs>
        <radialGradient id="balloonGrad" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity="0.85" />
          <stop offset="35%" stopColor={tone} stopOpacity="0.95" />
          <stop offset="100%" stopColor={tone} stopOpacity="1" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="65" rx="50" ry="60" fill="url(#balloonGrad)" />
      <path d="M55 122 L60 130 L65 122 Z" fill={tone} />
      <path
        d="M60 130 Q66 138 56 144 Q66 150 58 158"
        stroke="hsl(var(--foreground) / 0.6)"
        strokeWidth="1.2"
        fill="none"
      />
      <ellipse cx="42" cy="42" rx="10" ry="14" fill="white" opacity="0.45" />
    </svg>
  );
}