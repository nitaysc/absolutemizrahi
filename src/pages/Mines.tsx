import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { NumberField } from "@/components/NumberField";
import { CashoutPop } from "@/components/CashoutPop";
import { formatCoins } from "@/lib/format";
import { Bomb, Gem, Target, Repeat } from "lucide-react";
import { playGem, playBomb, playTileClick, playCashout } from "@/lib/sfx";

type Tile = "hidden" | "gem" | "bomb";
type Mode = "manual" | "auto";
type WinLossMode = "reset" | "increase";

export default function Mines() {
  useTrackGame("mines");
  const { profile, setLocalCoins } = useUserProfile();
  const [mode, setMode] = useState<Mode>("manual");
  const [bet, setBet] = useState(10);
  const [mines, setMines] = useState(3);
  const [active, setActive] = useState(false);
  const [tiles, setTiles] = useState<Tile[]>(Array(25).fill("hidden"));
  const [revealedCount, setRevealedCount] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [busy, setBusy] = useState(false);
  const [cashoutPop, setCashoutPop] = useState({ show: false, multiplier: 1, payout: 0 });

  // Auto-mode state
  const [picks, setPicks] = useState<Set<number>>(new Set());
  const [autoBets, setAutoBets] = useState(10);
  const [infinite, setInfinite] = useState(false);
  const [onWinMode, setOnWinMode] = useState<WinLossMode>("reset");
  const [onWinPct, setOnWinPct] = useState(0);
  const [onLossMode, setOnLossMode] = useState<WinLossMode>("reset");
  const [onLossPct, setOnLossPct] = useState(0);
  const [stopProfit, setStopProfit] = useState(0);
  const [stopLoss, setStopLoss] = useState(0);
  const [running, setRunning] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [session, setSession] = useState({ profit: 0, wins: 0, losses: 0 });
  const stopRef = useRef(false);
  const baseBetRef = useRef(bet);

  // Resume any active round on mount (manual only)
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("mines_round")
        .eq("id", profile.id)
        .maybeSingle();
      const round = data?.mines_round as
        | { active?: boolean; bet?: number; mines?: number; revealed?: number[] }
        | null;
      if (round?.active) {
        setActive(true);
        setBet(Number(round.bet ?? bet));
        setMines(Number(round.mines ?? mines));
        const t: Tile[] = Array(25).fill("hidden");
        (round.revealed ?? []).forEach((idx) => (t[idx] = "gem"));
        setTiles(t);
        setRevealedCount(round.revealed?.length ?? 0);
        setMultiplier(currentMultiplier(Number(round.mines ?? 1), round.revealed?.length ?? 0));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Cancel auto loop on unmount.
  useEffect(() => () => { stopRef.current = true; }, []);

  const gemsLeft = 25 - mines - revealedCount;
  const nextMultiplier = currentMultiplier(mines, revealedCount + 1);
  const profit = Math.floor(bet * multiplier) - bet;

  // ---------- MANUAL ----------

  async function start() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    if (mines < 1 || mines > 24) return toast.error("Mines 1-24");
    setBusy(true);
    const { data, error } = await supabase.rpc("mines_start", {
      _bet_amount: bet,
      _mines: mines,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setTiles(Array(25).fill("hidden"));
    setRevealedCount(0);
    setMultiplier(1);
    setActive(true);
  }

  async function reveal(i: number) {
    if (!active || tiles[i] !== "hidden" || busy) return;
    playTileClick();
    setBusy(true);
    const { data, error } = await supabase.rpc("mines_reveal", { _tile: i });
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (!r) return;
    if (r.hit_bomb) {
      playBomb();
      setTiles((prev) => {
        const next: Tile[] = [...prev];
        const bombs = (r.bombs as number[]) ?? [];
        for (let idx = 0; idx < 25; idx++) {
          if (bombs.includes(idx)) next[idx] = "bomb";
          else if (next[idx] === "hidden") next[idx] = "gem";
        }
        next[i] = "bomb";
        return next;
      });
      setActive(false);
      setMultiplier(0);
      toast.error(`Boom! -${formatCoins(bet)}`);
      return;
    }
    playGem();
    setTiles((prev) => { const next: Tile[] = [...prev]; next[i] = "gem"; return next; });
    setRevealedCount((c) => c + 1);
    setMultiplier(Number(r.multiplier));
  }

  async function cashout() {
    if (!active || revealedCount === 0) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("mines_cashout");
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (r) setLocalCoins(Number(r.new_balance));
    if (r) {
      playCashout();
      const profit = Math.max(Number(r.payout ?? 0) - bet, 0);
      toast.success(`+${formatCoins(profit)} (${Number(r.multiplier).toFixed(2)}×)`);
      setCashoutPop({ show: true, multiplier: Number(r.multiplier), payout: Number(r.payout ?? 0) });
      setTimeout(() => setCashoutPop((prev) => ({ ...prev, show: false })), 1600);
      const bombs = (r.bombs as number[]) ?? [];
      setTiles((prev) => {
        const next: Tile[] = [...prev];
        for (let idx = 0; idx < 25; idx++) {
          if (bombs.includes(idx)) { if (next[idx] === "hidden") next[idx] = "bomb"; }
          else if (next[idx] === "hidden") next[idx] = "gem";
        }
        return next;
      });
      setActive(false);
      setTimeout(() => {
        setTiles(Array(25).fill("hidden"));
        setRevealedCount(0);
        setMultiplier(1);
      }, 2200);
      return;
    }
    setActive(false);
    setTiles(Array(25).fill("hidden"));
    setRevealedCount(0);
    setMultiplier(1);
  }

  // ---------- AUTO ----------

  function togglePick(i: number) {
    if (running) return;
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else if (next.size < 25 - mines) next.add(i);
      return next;
    });
  }

  /** Plays one auto-mode round at the given stake. Returns net profit. */
  async function playAutoRound(stake: number): Promise<{ won: boolean; profit: number } | null> {
    // Start
    const startRes = await supabase.rpc("mines_start", { _bet_amount: stake, _mines: mines });
    if (startRes.error) { toast.error(startRes.error.message); return null; }
    if (startRes.data?.[0]) setLocalCoins(Number(startRes.data[0].new_balance));
    // Reset board for animation
    setTiles(Array(25).fill("hidden"));
    setRevealedCount(0);
    setMultiplier(1);

    const order = Array.from(picks);
    let lastMult = 1;
    for (let k = 0; k < order.length; k++) {
      if (stopRef.current) return null;
      const tile = order[k];
      const res = await supabase.rpc("mines_reveal", { _tile: tile });
      if (res.error) { toast.error(res.error.message); return null; }
      const r = res.data?.[0];
      if (!r) return null;
      if (r.hit_bomb) {
        playBomb();
        const bombs = (r.bombs as number[]) ?? [];
        setTiles((prev) => {
          const next: Tile[] = [...prev];
          for (let idx = 0; idx < 25; idx++) {
            if (bombs.includes(idx)) next[idx] = "bomb";
            else if (next[idx] === "hidden") next[idx] = "gem";
          }
          next[tile] = "bomb";
          return next;
        });
        setMultiplier(0);
        return { won: false, profit: -stake };
      }
      playGem();
      setTiles((prev) => { const next: Tile[] = [...prev]; next[tile] = "gem"; return next; });
      setRevealedCount(k + 1);
      lastMult = Number(r.multiplier);
      setMultiplier(lastMult);
      await sleep(120);
    }

    // Cashout
    const cash = await supabase.rpc("mines_cashout");
    if (cash.error) { toast.error(cash.error.message); return null; }
    const cr = cash.data?.[0];
    if (!cr) return null;
    setLocalCoins(Number(cr.new_balance));
    playCashout();
    const payout = Number(cr.payout ?? 0);
    const bombs = (cr.bombs as number[]) ?? [];
    setTiles((prev) => {
      const next: Tile[] = [...prev];
      for (let idx = 0; idx < 25; idx++) {
        if (bombs.includes(idx)) { if (next[idx] === "hidden") next[idx] = "bomb"; }
        else if (next[idx] === "hidden") next[idx] = "gem";
      }
      return next;
    });
    return { won: payout > stake, profit: payout - stake };
  }

  async function startAuto() {
    if (running) { stopRef.current = true; return; }
    if (!profile) return;
    if (picks.size === 0) return toast.error("Pick at least one tile to auto-reveal");
    if (picks.size > 25 - mines) return toast.error("Too many picks for that mine count");
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    if (!infinite && autoBets < 1) return;

    stopRef.current = false;
    setRunning(true);
    setAutoLeft(infinite ? (Infinity as unknown as number) : autoBets);
    setSession({ profit: 0, wins: 0, losses: 0 });
    baseBetRef.current = bet;
    let cumulative = 0;
    let next = bet;
    let i = 0;
    while (infinite || i < autoBets) {
      if (stopRef.current) break;
      next = Math.max(1, Math.floor(next));
      setBet(next);
      const res = await playAutoRound(next);
      if (!res) break;
      cumulative += res.profit;
      setSession((s) => ({
        profit: s.profit + res.profit,
        wins: s.wins + (res.won ? 1 : 0),
        losses: s.losses + (res.won ? 0 : 1),
      }));
      if (stopProfit > 0 && cumulative >= stopProfit) break;
      if (stopLoss > 0 && -cumulative >= stopLoss) break;
      if (res.won) {
        next = onWinMode === "reset" ? baseBetRef.current : next + (next * onWinPct) / 100;
      } else {
        next = onLossMode === "reset" ? baseBetRef.current : next + (next * onLossPct) / 100;
      }
      i++;
      if (!infinite) setAutoLeft(autoBets - i);
      await sleep(600);
    }
    setRunning(false);
    setBet(baseBetRef.current);
    setActive(false);
  }

  // ---------- RENDER ----------

  const inAuto = mode === "auto";
  const isPicking = inAuto && !running;

  return (
    <div className="space-y-6">
      <CashoutPop show={cashoutPop.show} multiplier={cashoutPop.multiplier} payout={cashoutPop.payout} />
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Bomb className="h-7 w-7 text-primary" /> MINES
        </h1>
        <p className="text-sm text-muted-foreground">
          Reveal gems, dodge bombs, cash out before you bust.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
        {/* Grid */}
        <div className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl sm:p-6">
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {tiles.map((t, i) => {
              const picked = picks.has(i);
              const clickable = inAuto
                ? isPicking && t === "hidden"
                : active && t === "hidden" && !busy;
              return (
                <button
                  key={i}
                  onClick={() => (inAuto ? togglePick(i) : reveal(i))}
                  disabled={!clickable}
                  className={`relative aspect-square rounded-xl transition ${
                    t === "hidden"
                      ? clickable
                        ? picked
                          ? "bg-primary/30 ring-2 ring-primary shadow-[0_0_18px_hsl(var(--primary)/0.5)] active:scale-95 cursor-pointer"
                          : "bg-secondary hover:bg-accent active:scale-95 cursor-pointer"
                        : picked
                          ? "bg-primary/20 ring-2 ring-primary/60"
                          : "bg-secondary/50 cursor-default"
                      : t === "gem"
                        ? "bg-[hsl(var(--success))]/15 ring-2 ring-[hsl(var(--success))]"
                        : "bg-destructive/15 ring-2 ring-destructive"
                  }`}
                >
                  {t === "hidden" && picked && (
                    <Target className="absolute inset-0 m-auto h-5 w-5 text-primary sm:h-6 sm:w-6" />
                  )}
                  {t !== "hidden" && (
                    <motion.div
                      key={t}
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 14 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      {t === "gem" ? (
                        <Gem className="h-7 w-7 text-[hsl(var(--success))] drop-shadow-[0_0_12px_hsl(var(--success)/0.6)] sm:h-9 sm:w-9" />
                      ) : (
                        <Bomb className="h-7 w-7 text-destructive drop-shadow-[0_0_12px_hsl(var(--destructive)/0.6)] sm:h-9 sm:w-9" />
                      )}
                    </motion.div>
                  )}
                </button>
              );
            })}
          </div>
          {inAuto && (
            <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {picks.size === 0
                ? "Click tiles to mark your auto-reveal pattern"
                : `${picks.size} tile${picks.size === 1 ? "" : "s"} selected · ${currentMultiplier(mines, picks.size).toFixed(2)}× target`}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4 rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <ModeTabs mode={mode} onChange={(m) => { if (!running && !active) setMode(m); }} disabled={running || active} />

          <BetControls bet={bet} setBet={setBet} disabled={active || running} />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Mines
              </label>
              <NumberField
                value={mines}
                onChange={(n) => { setMines(n); setPicks(new Set()); }}
                min={1}
                max={24}
                disabled={active || running}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Gems
              </label>
              <div className="mt-2 rounded-md border border-input bg-background/60 px-3 py-2 text-lg font-black tabular-nums">
                {25 - mines}
              </div>
            </div>
          </div>

          {!inAuto && active && (
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat label="Multiplier" value={`${multiplier.toFixed(2)}×`} />
              <Stat label="Next pick" value={gemsLeft > 0 ? `${nextMultiplier.toFixed(2)}×` : "—"} />
            </div>
          )}

          {inAuto && (
            <>
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
                  value={autoBets}
                  onChange={setAutoBets}
                  min={1}
                  max={100000}
                  disabled={running || infinite}
                  className="mt-1"
                />
              </div>

              <WinLossRow title="On Win" mode={onWinMode} setMode={setOnWinMode} pct={onWinPct} setPct={setOnWinPct} disabled={running} />
              <WinLossRow title="On Loss" mode={onLossMode} setMode={setOnLossMode} pct={onLossPct} setPct={setOnLossPct} disabled={running} />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Stop on profit
                  </label>
                  <NumberField value={stopProfit} onChange={setStopProfit} min={0} max={1_000_000_000} disabled={running} className="mt-1" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Stop on loss
                  </label>
                  <NumberField value={stopLoss} onChange={setStopLoss} min={0} max={1_000_000_000} disabled={running} className="mt-1" />
                </div>
              </div>

              {(running || session.wins + session.losses > 0) && (
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-background/60 p-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <div>
                    <div>Wins</div>
                    <div className="mt-0.5 text-sm font-black tabular-nums text-[hsl(var(--success))]">{session.wins}</div>
                  </div>
                  <div>
                    <div>Losses</div>
                    <div className="mt-0.5 text-sm font-black tabular-nums text-destructive">{session.losses}</div>
                  </div>
                  <div>
                    <div>Profit</div>
                    <div className={`mt-0.5 text-sm font-black tabular-nums ${session.profit >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                      {session.profit >= 0 ? "+" : ""}{session.profit.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {inAuto ? (
            <Button
              onClick={startAuto}
              disabled={!profile}
              className={`h-12 w-full text-base font-black tracking-wider ${running ? "bg-destructive hover:bg-destructive" : "shadow-[0_0_24px_hsl(var(--primary)/0.4)]"}`}
            >
              <Repeat className="mr-2 h-4 w-4" />
              {running
                ? infinite ? "STOP (∞)" : `STOP (${autoLeft} left)`
                : infinite ? "START AUTO (∞)" : `START AUTO (${autoBets})`}
            </Button>
          ) : active ? (
            <Button
              onClick={cashout}
              disabled={revealedCount === 0 || busy}
              className="h-14 w-full bg-[hsl(var(--success))] text-background hover:bg-[hsl(var(--success))]/90"
            >
              CASHOUT {revealedCount > 0 && `+${formatCoins(profit)}`}
            </Button>
          ) : (
            <Button
              onClick={start}
              disabled={busy}
              className="h-14 w-full text-lg font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
            >
              BET
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function currentMultiplier(mines: number, safeRevealed: number): number {
  if (safeRevealed <= 0) return 1;
  let m = 1;
  for (let i = 0; i < safeRevealed; i++) {
    m *= (25 - i) / (25 - mines - i);
  }
  return +(m * 0.99).toFixed(4);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/60 p-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-black tabular-nums">{value}</div>
    </div>
  );
}

function ModeTabs({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  return (
    <div className="flex rounded-lg bg-secondary p-1">
      {(["manual", "auto"] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          disabled={disabled}
          className={`flex-1 rounded-md py-1.5 text-xs font-black uppercase tracking-widest transition ${
            mode === m ? "bg-card text-foreground shadow" : "text-muted-foreground"
          } ${disabled ? "opacity-50" : ""}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function WinLossRow({
  title, mode, setMode, pct, setPct, disabled,
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
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="mt-1 flex gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode("reset")}
          className={`rounded-md px-3 py-1.5 text-xs font-black uppercase tracking-wider transition ${
            mode === "reset" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >Reset</button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode("increase")}
          className={`rounded-md px-3 py-1.5 text-xs font-black uppercase tracking-wider transition ${
            mode === "increase" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >Increase by</button>
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
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
        </div>
      </div>
    </div>
  );
}
