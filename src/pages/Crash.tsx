import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { NumberField } from "@/components/NumberField";
import { formatCoins } from "@/lib/format";
import { Rocket, TrendingUp } from "lucide-react";

type Round = {
  id: string;
  status: "waiting" | "running" | "crashed";
  crash_at: number | null;
  start_at: string | null;
  ended_at: string | null;
  seq: number;
};
type CrashBet = {
  id: string;
  round_id: string;
  user_id: string;
  username: string;
  bet_amount: number;
  auto_cashout: number | null;
  cashed_out_at: number | null;
  payout: number;
};

const WAITING_MS = 7000;

function liveMultiplier(startAt: string | null): number {
  if (!startAt) return 1;
  const elapsed = (Date.now() - new Date(startAt).getTime()) / 1000;
  return Math.max(1, Math.exp(elapsed * 0.06));
}

export default function Crash() {
  useTrackGame("crash");
  const { profile, setLocalCoins } = useUserProfile();
  const { user } = useAuth();

  const [round, setRound] = useState<Round | null>(null);
  const [bets, setBets] = useState<CrashBet[]>([]);
  const [bet, setBet] = useState(10);
  const [autoCashout, setAutoCashout] = useState(2);
  const [useAuto, setUseAuto] = useState(false);
  const [mult, setMult] = useState(1);
  const [history, setHistory] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const myBet = bets.find((b) => b.user_id === user?.id);
  const lastAutoNotified = useRef<string | null>(null);

  // Poll round + bets
  async function loadRound() {
    const { data } = await supabase.rpc("crash_current_round");
    const r = data?.[0] as Round | undefined;
    if (r) setRound(r);
  }
  async function loadBets(roundId: string) {
    const { data } = await supabase
      .from("crash_bets")
      .select("*")
      .eq("round_id", roundId);
    if (data) setBets(data as CrashBet[]);
  }

  useEffect(() => {
    loadRound();
    const i = setInterval(loadRound, 2500);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!round?.id) return;
    loadBets(round.id);
    const ch = supabase
      .channel(`crash-${round.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crash_bets", filter: `round_id=eq.${round.id}` },
        () => loadBets(round.id),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "crash_rounds", filter: `id=eq.${round.id}` },
        (payload) => setRound(payload.new as unknown as Round),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [round?.id]);

  // Drive the visible multiplier when running
  useEffect(() => {
    if (round?.status !== "running" || !round.start_at) return;
    let raf = 0;
    const tick = () => {
      setMult(liveMultiplier(round.start_at));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [round?.status, round?.start_at]);

  // When waiting -> auto-start after countdown elapses
  useEffect(() => {
    if (round?.status !== "waiting") return;
    const created = new Date(round.start_at ?? Date.now()).getTime();
    const elapsedSinceLoad = 0;
    const id = setTimeout(async () => {
      await supabase.rpc("crash_start");
      loadRound();
    }, Math.max(1500, WAITING_MS - elapsedSinceLoad));
    return () => clearTimeout(id);
  }, [round?.id, round?.status]);

  // When running -> when local mult reaches crash, settle
  useEffect(() => {
    if (round?.status !== "running" || !round.start_at) return;
    const check = setInterval(async () => {
      const m = liveMultiplier(round.start_at);
      // Pay out anyone whose auto-cashout target was hit.
      if (m > 1.01) {
        await supabase.rpc("crash_process_autos");
      }
      // The server knows the real crash_at — call settle and let it decide.
      if (m > 1.05) {
        const { data } = await supabase.rpc("crash_settle");
        if (data?.[0]) {
          loadRound();
        }
      }
    }, 250);
    return () => clearInterval(check);
  }, [round?.status, round?.start_at]);

  // Track history when a round ends
  useEffect(() => {
    if (round?.status === "crashed" && round.crash_at) {
      setHistory((h) => {
        if (h[0] === round.crash_at) return h;
        return [round.crash_at!, ...h].slice(0, 12);
      });
    }
  }, [round?.status, round?.crash_at]);

  // Detect MY auto-cashout completing (server credited via crash_process_autos)
  // and immediately pull fresh balance + show success toast — no page refresh.
  useEffect(() => {
    if (!myBet || !user?.id) return;
    if (!myBet.cashed_out_at || !myBet.auto_cashout) return;
    if (lastAutoNotified.current === myBet.id) return;
    lastAutoNotified.current = myBet.id;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("coins")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.coins != null) setLocalCoins(Number(data.coins));
      const profit = Math.max(myBet.payout - myBet.bet_amount, 0);
      toast.success(
        `Auto cashout +${formatCoins(profit)} (${Number(myBet.cashed_out_at).toFixed(2)}×)`,
      );
    })();
  }, [myBet?.id, myBet?.cashed_out_at, myBet?.auto_cashout, myBet?.payout, myBet?.bet_amount, user?.id, setLocalCoins]);

  async function placeBet() {
    if (!profile) return;
    if (round?.status !== "waiting") return toast.error("Wait for the next round");
    if (bet > profile.coins) return toast.error("Not enough coins");
    setBusy(true);
    const { data, error } = await supabase.rpc("crash_place_bet", {
      _bet_amount: bet,
      _auto_cashout: useAuto ? autoCashout : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    if (round) loadBets(round.id);
  }

  async function cashout() {
    setBusy(true);
    const { data, error } = await supabase.rpc("crash_cashout");
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (r) {
      setLocalCoins(Number(r.new_balance));
      if (r.busted) toast.error("Too late — busted");
      else {
        const profit = Math.max(Number(r.payout) - bet, 0);
        toast.success(`+${formatCoins(profit)} (${Number(r.multiplier).toFixed(2)}×)`);
      }
    }
    if (round) loadBets(round.id);
  }

  const status = round?.status ?? "waiting";
  const displayMult = status === "crashed" ? Number(round?.crash_at ?? 1) : mult;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
            <Rocket className="h-7 w-7 text-primary" /> CRASH
          </h1>
          <p className="text-sm text-muted-foreground">
            Live multiplayer. Cash out before it crashes.
          </p>
        </div>
        {history.length > 0 && (
          <ul className="flex gap-1.5">
            {history.map((m, i) => (
              <li
                key={i}
                className={`rounded-md px-2 py-1 text-[10px] font-black tabular-nums ${
                  m >= 2
                    ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                    : "bg-destructive/15 text-destructive"
                }`}
              >
                {m.toFixed(2)}×
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
        {/* Stage */}
        <div className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-border bg-card/70 p-8 backdrop-blur-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={status + round?.id}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 16 }}
              className={`text-7xl font-black tabular-nums sm:text-8xl ${
                status === "crashed"
                  ? "text-destructive drop-shadow-[0_0_24px_hsl(var(--destructive)/0.6)]"
                  : status === "running"
                    ? "text-[hsl(var(--success))] drop-shadow-[0_0_24px_hsl(var(--success)/0.5)]"
                    : "text-foreground/60"
              }`}
            >
              {displayMult.toFixed(2)}×
            </motion.div>
          </AnimatePresence>
          <div className="mt-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {status === "waiting" && "Place your bets…"}
            {status === "running" && "FLYING"}
            {status === "crashed" && "💥 CRASHED"}
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4 rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <BetControls bet={bet} setBet={setBet} disabled={!!myBet || status !== "waiting"} />
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <input
              type="checkbox"
              checked={useAuto}
              onChange={(e) => setUseAuto(e.target.checked)}
              disabled={!!myBet || status !== "waiting"}
            />
            Auto cashout
          </label>
          {useAuto && (
            <NumberField
              value={autoCashout}
              onChange={setAutoCashout}
              min={1.01}
              max={1000}
              decimal
              disabled={!!myBet || status !== "waiting"}
            />
          )}

          {!myBet && status === "waiting" && (
            <Button onClick={placeBet} disabled={busy} className="h-14 w-full text-lg font-black tracking-wider">
              JOIN ROUND
            </Button>
          )}
          {myBet && status === "running" && !myBet.cashed_out_at && (
            <Button
              onClick={cashout}
              disabled={busy}
              className="h-14 w-full bg-[hsl(var(--success))] text-background hover:bg-[hsl(var(--success))]/90"
            >
              CASHOUT {formatCoins(Math.floor(myBet.bet_amount * mult))} ({mult.toFixed(2)}×)
            </Button>
          )}
          {myBet?.cashed_out_at && (
            <div className="rounded-xl bg-[hsl(var(--success))]/15 p-3 text-center text-sm font-bold text-[hsl(var(--success))]">
              Cashed out at {Number(myBet.cashed_out_at).toFixed(2)}× (+{formatCoins(Math.max(myBet.payout - myBet.bet_amount, 0))})
            </div>
          )}
          {myBet && status === "crashed" && !myBet.cashed_out_at && (
            <div className="rounded-xl bg-destructive/15 p-3 text-center text-sm font-bold text-destructive">
              Busted at {Number(round?.crash_at ?? 0).toFixed(2)}×
            </div>
          )}
        </div>
      </div>

      {/* Live players */}
      <div className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <TrendingUp className="h-4 w-4" /> Players this round ({bets.length})
        </h2>
        {bets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bets yet — be the first.</p>
        ) : (
          <ul className="divide-y divide-border">
            {bets.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-bold">{b.username}</span>
                <span className="tabular-nums text-muted-foreground">{formatCoins(b.bet_amount)}</span>
                {b.cashed_out_at ? (
                  <span className="font-black text-[hsl(var(--success))]">
                    {Number(b.cashed_out_at).toFixed(2)}× → +{formatCoins(Math.max(b.payout - b.bet_amount, 0))}
                  </span>
                ) : status === "crashed" ? (
                  <span className="font-black text-destructive">BUST</span>
                ) : (
                  <span className="text-xs text-muted-foreground">in flight…</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
