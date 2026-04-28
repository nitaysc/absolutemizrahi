import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/NumberField";
import { Repeat } from "lucide-react";

/**
 * Stake-style "Advanced" auto-bet panel.
 * The host page provides:
 *   bet               — current stake (controlled by BetControls outside)
 *   setBet            — to mutate the stake between rounds
 *   onBet()           — runs ONE round; resolve to { won, profit } so the
 *                      panel can apply on-win/on-loss rules and stop conditions.
 *
 * The panel itself owns: number of bets, on-win/on-loss reset/increase %,
 * stop on profit / stop on loss, and the running loop.
 */

type WinLossMode = "reset" | "increase";

export type AutoBetRoundResult = {
  /** True if the round was a net win for the player. */
  won: boolean;
  /** Net profit in coins (positive when won, negative when lost). */
  profit: number;
};

interface Props {
  bet: number;
  setBet: (n: number) => void;
  /**
   * Runs a single round. Return null to stop the loop (e.g. error).
   * The auto loop passes the next stake explicitly via `betOverride`
   * so the RPC always uses the freshly-computed amount instead of the
   * page-level `bet` state, which may be stale inside the closure.
   */
  onBet: (betOverride?: number) => Promise<AutoBetRoundResult | null>;
  /** Optional: disable the "Start" button (e.g. round in progress). */
  disabled?: boolean;
  /** ms to wait between rounds. Default 250. */
  intervalMs?: number;
}

export function AutoBetPanel({ bet, setBet, onBet, disabled, intervalMs = 250 }: Props) {
  const [bets, setBets] = useState(10);
  const [infinite, setInfinite] = useState(false);
  const [onWinMode, setOnWinMode] = useState<WinLossMode>("reset");
  const [onWinPct, setOnWinPct] = useState(0);
  const [onLossMode, setOnLossMode] = useState<WinLossMode>("reset");
  const [onLossPct, setOnLossPct] = useState(0);
  const [stopProfit, setStopProfit] = useState(0);
  const [stopLoss, setStopLoss] = useState(0);
  const [autoSpeed, setAutoSpeed] = useState(2);

  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const [session, setSession] = useState({ profit: 0, wins: 0, losses: 0 });
  const stopRef = useRef(false);
  const baseBetRef = useRef(bet);

  // Reset session when the user manually changes bet outside a run.
  useEffect(() => {
    if (!running) baseBetRef.current = bet;
  }, [bet, running]);

  // Cancel loop on unmount.
  useEffect(
    () => () => {
      stopRef.current = true;
    },
    [],
  );

  async function start() {
    if (running) {
      stopRef.current = true;
      return;
    }
    if (!infinite && bets < 1) return;
    stopRef.current = false;
    setRunning(true);
    setLeft(infinite ? Infinity as unknown as number : bets);
    setSession({ profit: 0, wins: 0, losses: 0 });
    baseBetRef.current = bet;
    let cumulative = 0;
    let next = bet;
    let i = 0;
    while (infinite || i < bets) {
      if (stopRef.current) break;
      // Clamp next bet to at least 1.
      next = Math.max(1, Math.floor(next));
      setBet(next);
      // Wait one frame so the input visibly updates before the round fires.
      await new Promise((r) => setTimeout(r, 0));
      // Pass the freshly-computed stake explicitly — the host page's
      // `onBet` closure typically captures a stale `bet` from render.
      const res = await onBet(next);
      if (!res) break;
      cumulative += res.profit;
      setSession((s) => ({
        profit: s.profit + res.profit,
        wins: s.wins + (res.won ? 1 : 0),
        losses: s.losses + (res.won ? 0 : 1),
      }));
      // Stop conditions
      if (stopProfit > 0 && cumulative >= stopProfit) break;
      if (stopLoss > 0 && -cumulative >= stopLoss) break;
      // Compute next stake
      if (res.won) {
        if (onWinMode === "reset") next = baseBetRef.current;
        else next = next + (next * onWinPct) / 100;
      } else {
        if (onLossMode === "reset") next = baseBetRef.current;
        else next = next + (next * onLossPct) / 100;
      }
      i++;
      if (!infinite) setLeft(bets - i);
      const waitMs = Math.max(40, Math.round(intervalMs / autoSpeed));
      await new Promise((r) => setTimeout(r, waitMs));
    }
    setRunning(false);
    // Restore the stake the user originally entered.
    setBet(baseBetRef.current);
  }

  return (
    <div className="space-y-3">
      {/* Number of bets */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Number of bets
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <input
              type="checkbox"
              checked={infinite}
              onChange={(e) => setInfinite(e.target.checked)}
              disabled={running}
              className="accent-primary"
            />
            ∞ infinite
          </label>
        </div>
        <NumberField
          value={bets}
          onChange={setBets}
          min={1}
          max={100000}
          disabled={running || infinite}
          className="mt-1"
        />
      </div>

      {/* On Win / On Loss */}
      <WinLossRow
        title="On Win"
        mode={onWinMode}
        setMode={setOnWinMode}
        pct={onWinPct}
        setPct={setOnWinPct}
        disabled={running}
      />
      <WinLossRow
        title="On Loss"
        mode={onLossMode}
        setMode={setOnLossMode}
        pct={onLossPct}
        setPct={setOnLossPct}
        disabled={running}
      />

      {/* Stop conditions */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Stop on profit
          </label>
          <NumberField
            value={stopProfit}
            onChange={setStopProfit}
            min={0}
            max={1_000_000_000}
            disabled={running}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Stop on loss
          </label>
          <NumberField
            value={stopLoss}
            onChange={setStopLoss}
            min={0}
            max={1_000_000_000}
            disabled={running}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Auto speed
          </label>
          <span className="text-xs font-black tabular-nums text-foreground">{autoSpeed.toFixed(1)}×</span>
        </div>
        <input
          type="range"
          min={2}
          max={5}
          step={0.1}
          value={autoSpeed}
          onChange={(e) => setAutoSpeed(Number(e.target.value))}
          disabled={running}
          className="mt-2 h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
        />
      </div>

      {/* Live session readout */}
      {(running || session.wins + session.losses > 0) && (
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-background/60 p-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <div>
            <div>Wins</div>
            <div className="mt-0.5 text-sm font-black tabular-nums text-[hsl(var(--success))]">
              {session.wins}
            </div>
          </div>
          <div>
            <div>Losses</div>
            <div className="mt-0.5 text-sm font-black tabular-nums text-destructive">
              {session.losses}
            </div>
          </div>
          <div>
            <div>Profit</div>
            <div
              className={`mt-0.5 text-sm font-black tabular-nums ${
                session.profit >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
              }`}
            >
              {session.profit >= 0 ? "+" : ""}
              {session.profit.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      <Button
        onClick={start}
        disabled={disabled && !running}
        className={`h-11 w-full text-base font-black tracking-wider sm:h-12 ${
          running ? "bg-destructive hover:bg-destructive" : ""
        }`}
      >
        <Repeat className="mr-2 h-4 w-4" />
        {running
          ? infinite
            ? `STOP (∞)`
            : `STOP (${left} left)`
          : infinite
            ? `START AUTO (∞)`
            : `START AUTO (${bets})`}
      </Button>
    </div>
  );
}

function WinLossRow({
  title,
  mode,
  setMode,
  pct,
  setPct,
  disabled,
}: {
  title: string;
  mode: WinLossMode;
  setMode: (m: WinLossMode) => void;
  pct: number;
  setPct: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 flex gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode("reset")}
          className={`rounded-md px-3 py-1.5 text-xs font-black uppercase tracking-wider transition ${
            mode === "reset"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Reset
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode("increase")}
          className={`rounded-md px-3 py-1.5 text-xs font-black uppercase tracking-wider transition ${
            mode === "increase"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Increase by
        </button>
        <div className="relative flex-1">
          <NumberField
            value={pct}
            onChange={setPct}
            min={0}
            max={1000}
            decimal
            disabled={disabled || mode === "reset"}
            className="pr-7 text-right"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
            %
          </span>
        </div>
      </div>
    </div>
  );
}
