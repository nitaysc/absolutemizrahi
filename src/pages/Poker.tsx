import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { NumberField } from "@/components/NumberField";
import { formatCoins } from "@/lib/format";
import { Spade, Clock, LogOut, ArrowLeft, Eye } from "lucide-react";

type Card = { s: "S" | "H" | "D" | "C"; r: string };
type Seat = {
  seat_index: number;
  user_id: string;
  username: string;
  stack: number;
  current_bet: number;
  total_committed: number;
  status: "waiting" | "active" | "folded" | "allin" | "sittingout";
  has_acted: boolean;
  hole: Card[] | number[];
  is_me: boolean;
};
type State = {
  id: string;
  status: "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";
  small_blind: number;
  big_blind: number;
  min_buy_in: number;
  max_buy_in: number;
  seats_count: number;
  hand_seq: number;
  dealer_button: number | null;
  current_seat: number | null;
  current_bet: number;
  last_raise_size: number;
  pot: number;
  board: Card[];
  phase_ends_at: string | null;
  seats: Seat[];
};

const SUIT_CHAR: Record<Card["s"], string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const isRed = (s: Card["s"]) => s === "H" || s === "D";

function PlayingCard({ card, hidden, size = "md", glow }: { card?: Card; hidden?: boolean; size?: "sm" | "md" | "lg" | "xl"; glow?: boolean }) {
  const sz =
    size === "sm" ? "h-12 w-9 text-xs"
    : size === "md" ? "h-14 w-10 text-sm sm:h-16 sm:w-12 sm:text-base"
    : size === "lg" ? "h-20 w-14 text-base sm:h-24 sm:w-16 sm:text-lg"
    : "h-28 w-20 text-xl sm:h-32 sm:w-24 sm:text-2xl";
  const glowCls = glow ? "ring-2 ring-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.55)]" : "";
  if (hidden || !card) {
    return (
      <div className={`flex items-center justify-center rounded-lg border-2 border-primary/40 bg-gradient-to-br from-primary/30 to-primary/10 shadow-md ${sz} ${glowCls}`}>
        <Spade className="h-1/2 w-1/2 text-primary/60" />
      </div>
    );
  }
  return (
    <motion.div
      initial={{ y: -20, opacity: 0, rotateY: 90 }}
      animate={{ y: 0, opacity: 1, rotateY: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className={`flex flex-col items-center justify-between rounded-lg border-2 border-border bg-white p-1 shadow-lg ${sz} ${glowCls} ${
        isRed(card.s) ? "text-red-600" : "text-black"
      }`}
    >
      <div className="self-start font-black leading-none">{card.r}</div>
      <div className="leading-none" style={{ fontSize: "1.6em" }}>{SUIT_CHAR[card.s]}</div>
      <div className="self-end rotate-180 font-black leading-none">{card.r}</div>
    </motion.div>
  );
}

type ActionLog = { id: number; seat: number; user: string; text: string; tone: "fold" | "check" | "call" | "raise" | "allin" | "info" };

export default function Poker() {
  useTrackGame("poker");
  const { tableId = "micro" } = useParams<{ tableId: string }>();
  const TABLE_ID = tableId;
  const { user } = useAuth();
  const { profile, refetch } = useUserProfile();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [buyIn, setBuyIn] = useState(500);
  const [raiseTo, setRaiseTo] = useState(0);
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef<number | null>(null);
  const prevStateRef = useRef<State | null>(null);
  const logIdRef = useRef(0);
  const [log, setLog] = useState<ActionLog[]>([]);
  const [seatFlash, setSeatFlash] = useState<Record<number, ActionLog>>({});
  const mySeatIndexRef = useRef<number | null>(null);

  function pushLog(entry: Omit<ActionLog, "id">) {
    const id = ++logIdRef.current;
    const full: ActionLog = { ...entry, id };
    setLog((prev) => [full, ...prev].slice(0, 8));
    if (entry.seat >= 0) {
      setSeatFlash((prev) => ({ ...prev, [entry.seat]: full }));
      window.setTimeout(() => {
        setSeatFlash((prev) => {
          if (prev[entry.seat]?.id !== id) return prev;
          const { [entry.seat]: _, ...rest } = prev;
          return rest;
        });
      }, 3200);
    }
  }

  async function load() {
    const { data, error } = await supabase.rpc("poker_table_state", { _table_id: TABLE_ID });
    if (error) return;
    const next = data as unknown as State;
    diffActions(prevStateRef.current, next);
    prevStateRef.current = next;
    setState(next);
  }

  function diffActions(prev: State | null, next: State) {
    if (!prev) return;
    if (prev.hand_seq !== next.hand_seq) {
      pushLog({ seat: -1, user: "—", text: `Hand #${next.hand_seq} dealt`, tone: "info" });
      return;
    }
    if (prev.status !== next.status && next.status !== "waiting") {
      pushLog({ seat: -1, user: "—", text: next.status.toUpperCase(), tone: "info" });
    }
    for (const s of next.seats) {
      const p = prev.seats.find((x) => x.seat_index === s.seat_index && x.user_id === s.user_id);
      if (!p) continue;
      if (p.status !== "folded" && s.status === "folded") {
        pushLog({ seat: s.seat_index, user: s.username, text: "FOLD", tone: "fold" });
        continue;
      }
      if (p.status !== "allin" && s.status === "allin") {
        pushLog({ seat: s.seat_index, user: s.username, text: `ALL-IN ${formatCoins(s.current_bet)}`, tone: "allin" });
        continue;
      }
      if (s.current_bet > p.current_bet) {
        const added = s.current_bet - p.current_bet;
        if (s.current_bet > prev.current_bet && next.current_bet === s.current_bet) {
          pushLog({ seat: s.seat_index, user: s.username, text: `RAISE to ${formatCoins(s.current_bet)}`, tone: "raise" });
        } else {
          pushLog({ seat: s.seat_index, user: s.username, text: `CALL ${formatCoins(added)}`, tone: "call" });
        }
        continue;
      }
      if (
        prev.current_seat === s.seat_index &&
        next.current_seat !== s.seat_index &&
        s.current_bet === p.current_bet &&
        s.status === "active" &&
        s.has_acted && !p.has_acted
      ) {
        pushLog({ seat: s.seat_index, user: s.username, text: "CHECK", tone: "check" });
      }
    }
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`poker-${TABLE_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poker_tables", filter: `id=eq.${TABLE_ID}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "poker_seats", filter: `table_id=eq.${TABLE_ID}` }, () => load())
      .subscribe();
    pollRef.current = window.setInterval(load, 2000) as unknown as number;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      supabase.removeChannel(ch);
      if (pollRef.current) window.clearInterval(pollRef.current);
      window.clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mySeat = useMemo(
    () => state?.seats.find((s) => s.user_id === user?.id),
    [state, user?.id],
  );
  useEffect(() => {
    mySeatIndexRef.current = mySeat ? mySeat.seat_index : null;
  }, [mySeat]);

  // Auto-leave on tab close: best-effort fetch with keepalive so the request
  // survives unload. Pulls the access token out of supabase-js localStorage.
  useEffect(() => {
    const handler = () => {
      if (mySeatIndexRef.current === null) return;
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/poker_leave`;
        const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        let accessToken: string | null = null;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
            try {
              const parsed = JSON.parse(localStorage.getItem(k) || "{}");
              accessToken = parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
              if (accessToken) break;
            } catch { /* ignore */ }
          }
        }
        fetch(url, {
          method: "POST",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            apikey,
            Authorization: `Bearer ${accessToken ?? apikey}`,
          },
          body: JSON.stringify({ _table_id: TABLE_ID }),
        }).catch(() => {});
      } catch { /* ignore */ }
    };
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [TABLE_ID]);

  const isMyTurn = mySeat && state?.current_seat === mySeat.seat_index && state.status !== "showdown";
  const toCall = state && mySeat ? Math.max(state.current_bet - mySeat.current_bet, 0) : 0;
  const minRaise = state ? state.current_bet + state.last_raise_size : 0;
  const maxRaise = mySeat ? mySeat.stack + mySeat.current_bet : 0;

  useEffect(() => {
    if (isMyTurn) setRaiseTo(Math.min(Math.max(minRaise, raiseTo || minRaise), maxRaise));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, minRaise, maxRaise]);

  async function sit(seatIndex: number) {
    if (!profile) return;
    if (buyIn > profile.coins) return toast.error("Not enough coins");
    setBusy(true);
    const { error } = await supabase.rpc("poker_buy_in", {
      _table_id: TABLE_ID, _seat_index: seatIndex, _amount: buyIn,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Seated!"); refetch(); load(); }
  }

  async function leave() {
    setBusy(true);
    const { data, error } = await supabase.rpc("poker_leave", { _table_id: TABLE_ID });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(`Left with ${formatCoins(Number((data as { refunded?: number })?.refunded ?? 0))}`); refetch(); load(); }
  }

  async function act(action: "fold" | "check" | "call" | "raise" | "allin", amount = 0) {
    setBusy(true);
    const { error } = await supabase.rpc("poker_action", { _table_id: TABLE_ID, _action: action, _amount: amount });
    setBusy(false);
    if (error) toast.error(error.message);
    else { refetch(); load(); }
  }

  const seatPositions = (n: number, idx: number) => {
    // 6 positions around an oval. Bottom center is 0 (the user usually sits there visually).
    // We always render seat_index → fixed slot positions.
    const slots: { x: number; y: number }[] = [
      { x: 50, y: 92 },  // 0 bottom
      { x: 12, y: 75 },  // 1 bottom-left
      { x: 8,  y: 32 },  // 2 top-left
      { x: 50, y: 8 },   // 3 top
      { x: 92, y: 32 },  // 4 top-right
      { x: 88, y: 75 },  // 5 bottom-right
    ];
    return slots[idx % n];
  };

  const seconds = state?.phase_ends_at
    ? Math.max(0, Math.ceil((new Date(state.phase_ends_at).getTime() - now) / 1000))
    : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/poker" className="mb-1 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Lobby
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <Spade className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> POKER · {TABLE_ID.toUpperCase()}
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Texas Hold'em • {state?.small_blind ?? 1}/{state?.big_blind ?? 2} blinds • Hand #{state?.hand_seq ?? 0}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <span className="capitalize">Phase: <span className="text-foreground">{state?.status ?? "..."}</span></span>
          {seconds !== null && state?.current_seat !== null && state?.status !== "showdown" && state?.status !== "waiting" && (
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {seconds}s</span>
          )}
        </div>
      </header>

      {/* Table */}
      <div className="relative mx-auto aspect-[16/10] w-full max-w-4xl overflow-hidden rounded-[40%/30%] border-[10px] border-amber-900/80 bg-gradient-to-br from-emerald-800 via-emerald-900 to-emerald-950 shadow-[inset_0_0_60px_rgba(0,0,0,0.6),0_20px_40px_rgba(0,0,0,0.5)]">
        {/* center: pot + board */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <div className="rounded-full border border-amber-300/40 bg-black/70 px-5 py-1.5 text-sm font-black uppercase tracking-widest text-amber-200 shadow-lg backdrop-blur">
            Pot · {formatCoins(state?.pot ?? 0)}
          </div>
          <div className="flex gap-2 sm:gap-2.5">
            {Array.from({ length: 5 }).map((_, i) => {
              const c = state?.board?.[i];
              return c
                ? <PlayingCard key={i} card={c} size="lg" />
                : <div key={i} className="h-20 w-14 rounded-lg border-2 border-white/10 bg-white/5 sm:h-24 sm:w-16" />;
            })}
          </div>
        </div>

        {/* Seats */}
        {Array.from({ length: state?.seats_count ?? 6 }).map((_, idx) => {
          const seat = state?.seats.find((s) => s.seat_index === idx);
          const pos = seatPositions(state?.seats_count ?? 6, idx);
          const isCurrent = state?.current_seat === idx && state?.status !== "showdown";
          const isDealer = state?.dealer_button === idx;
          const flash = seatFlash[idx];
          const flashTone =
            flash?.tone === "fold" ? "bg-destructive/90 text-destructive-foreground" :
            flash?.tone === "check" ? "bg-sky-500/90 text-white" :
            flash?.tone === "call" ? "bg-blue-500/90 text-white" :
            flash?.tone === "raise" ? "bg-amber-500/90 text-black" :
            flash?.tone === "allin" ? "bg-rose-500/90 text-white" :
            "bg-secondary";
          return (
            <div
              key={idx}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {seat ? (
                <div className={`flex flex-col items-center gap-1 ${seat.status === "folded" ? "opacity-40" : ""}`}>
                  <AnimatePresence>
                    {flash && (
                      <motion.div
                        key={flash.id}
                        initial={{ y: 6, opacity: 0, scale: 0.8 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -6, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 320, damping: 22 }}
                        className={`mb-0.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest shadow-lg ${flashTone}`}
                      >
                        {flash.text}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Hole cards */}
                  <div className="flex gap-1">
                    {seat.is_me ? (
                      (seat.hole as Card[]).map((c, i) => <PlayingCard key={i} card={c} size="md" glow />)
                    ) : (
                      Array.from({ length: typeof seat.hole?.[0] === "number" ? (seat.hole[0] as number) : (seat.hole as Card[]).length }).map((_, i) => {
                        const showdownCard = (seat.hole as Card[])[i];
                        return showdownCard && typeof showdownCard === "object"
                          ? <PlayingCard key={i} card={showdownCard} size="sm" />
                          : <PlayingCard key={i} hidden size="sm" />;
                      })
                    )}
                  </div>
                  {/* Name + stack */}
                  <div className={`flex flex-col items-center rounded-lg border px-2 py-1 text-center text-[10px] font-bold backdrop-blur ${
                    isCurrent ? "border-primary bg-primary/30 shadow-[0_0_20px_hsl(var(--primary)/0.6)] ring-2 ring-primary" : "border-border bg-black/60"
                  }`}>
                    <span className="flex items-center gap-1 text-white">
                      {seat.username}
                      {isDealer && <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-black text-black">D</span>}
                    </span>
                    <span className="tabular-nums text-amber-300">{formatCoins(seat.stack)}</span>
                    {seat.current_bet > 0 && (
                      <span className="mt-0.5 rounded-full bg-amber-500/30 px-1.5 text-amber-200">bet {formatCoins(seat.current_bet)}</span>
                    )}
                    {seat.status === "folded" && <span className="text-destructive">folded</span>}
                    {seat.status === "allin" && <span className="text-rose-300">all-in</span>}
                  </div>
                </div>
              ) : (
                !mySeat && (
                  <button
                    onClick={() => sit(idx)}
                    disabled={busy}
                    className="rounded-full border-2 border-dashed border-amber-300/60 bg-black/40 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-200 transition hover:bg-amber-500/20"
                  >
                    Sit Here
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Your hand + Action log */}
      {(mySeat || log.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-[auto_1fr]">
          {mySeat && Array.isArray(mySeat.hole) && (mySeat.hole as Card[]).length > 0 && typeof (mySeat.hole as Card[])[0] === "object" && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-500/10 to-amber-700/5 p-3 shadow-[0_0_24px_rgba(252,211,77,0.15)]">
              <div className="flex flex-col">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
                  <Eye className="h-3 w-3" /> Your hand
                </span>
                <span className="text-[10px] text-muted-foreground">Only you see these</span>
              </div>
              <div className="flex gap-2">
                {(mySeat.hole as Card[]).map((c, i) => (
                  <PlayingCard key={`${state?.hand_seq}-${i}`} card={c} size="xl" glow />
                ))}
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl">
            <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Action Log</div>
            <ul className="space-y-1 text-xs">
              <AnimatePresence initial={false}>
                {log.length === 0 && <li className="text-muted-foreground">Waiting for action…</li>}
                {log.map((l) => {
                  const dot =
                    l.tone === "fold" ? "bg-destructive" :
                    l.tone === "check" ? "bg-sky-400" :
                    l.tone === "call" ? "bg-blue-400" :
                    l.tone === "raise" ? "bg-amber-400" :
                    l.tone === "allin" ? "bg-rose-400" :
                    "bg-muted-foreground";
                  return (
                    <motion.li
                      key={l.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                      <span className="font-bold text-foreground">{l.user}</span>
                      <span className="text-muted-foreground">{l.text}</span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>
        </div>
      )}

      {/* Buy-in / Action panel */}
      <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-xl">
        {!mySeat ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Buy-in ({state?.min_buy_in ?? 100}–{state?.max_buy_in ?? 10000})
              </label>
              <NumberField
                value={buyIn}
                onChange={setBuyIn}
                min={state?.min_buy_in ?? 100}
                max={state?.max_buy_in ?? 10000}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">Click an empty seat to join.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-muted-foreground">Your stack: <span className="tabular-nums text-foreground">{formatCoins(mySeat.stack)}</span></span>
              <Button onClick={leave} variant="ghost" size="sm" disabled={busy} className="text-destructive">
                <LogOut className="mr-1 h-3.5 w-3.5" /> Leave
              </Button>
            </div>

            {isMyTurn ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Button onClick={() => act("fold")} disabled={busy} variant="destructive" className="font-black">
                    FOLD
                  </Button>
                  {toCall === 0 ? (
                    <Button onClick={() => act("check")} disabled={busy} variant="secondary" className="font-black">
                      CHECK
                    </Button>
                  ) : (
                    <Button onClick={() => act("call")} disabled={busy} variant="secondary" className="font-black">
                      CALL {formatCoins(Math.min(toCall, mySeat.stack))}
                    </Button>
                  )}
                  <Button
                    onClick={() => act("raise", raiseTo)}
                    disabled={busy || raiseTo < minRaise || raiseTo > maxRaise}
                    className="font-black"
                  >
                    RAISE TO {formatCoins(raiseTo)}
                  </Button>
                  <Button onClick={() => act("allin")} disabled={busy} variant="outline" className="font-black border-rose-500 text-rose-400">
                    ALL-IN ({formatCoins(mySeat.stack)})
                  </Button>
                </div>
                <div>
                  <Slider
                    min={minRaise}
                    max={maxRaise}
                    step={1}
                    value={[Math.min(Math.max(raiseTo, minRaise), maxRaise)]}
                    onValueChange={(v) => setRaiseTo(v[0])}
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <span>min {formatCoins(minRaise)}</span>
                    <span>max {formatCoins(maxRaise)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {([0.5, 0.75, 1, 1.5, 2] as const).map((m) => {
                      const target = Math.min(maxRaise, Math.max(minRaise, Math.floor((state?.pot ?? 0) * m + (state?.current_bet ?? 0))));
                      return (
                        <button
                          key={m}
                          onClick={() => setRaiseTo(target)}
                          className="rounded-md bg-secondary px-2 py-1 text-[10px] font-black uppercase tracking-widest hover:bg-accent"
                        >
                          {m}× pot
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {state?.status === "waiting"
                  ? "Waiting for more players…"
                  : state?.status === "showdown"
                    ? "Showdown — next hand soon"
                    : "Waiting for other players to act…"}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
