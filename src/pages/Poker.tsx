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
import { Spade, Clock, LogOut, ArrowLeft } from "lucide-react";

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

function PlayingCard({ card, hidden, small }: { card?: Card; hidden?: boolean; small?: boolean }) {
  const sz = small ? "h-12 w-9 text-xs" : "h-20 w-14 text-base sm:h-24 sm:w-16 sm:text-lg";
  if (hidden || !card) {
    return (
      <div className={`flex items-center justify-center rounded-lg border-2 border-primary/40 bg-gradient-to-br from-primary/30 to-primary/10 shadow-md ${sz}`}>
        <Spade className="h-1/2 w-1/2 text-primary/60" />
      </div>
    );
  }
  return (
    <motion.div
      initial={{ y: -20, opacity: 0, rotateY: 90 }}
      animate={{ y: 0, opacity: 1, rotateY: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className={`flex flex-col items-center justify-between rounded-lg border-2 border-border bg-white p-1 shadow-lg ${sz} ${
        isRed(card.s) ? "text-red-600" : "text-black"
      }`}
    >
      <div className="self-start font-black leading-none">{card.r}</div>
      <div className="text-2xl leading-none sm:text-3xl">{SUIT_CHAR[card.s]}</div>
      <div className="self-end rotate-180 font-black leading-none">{card.r}</div>
    </motion.div>
  );
}

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

  async function load() {
    const { data, error } = await supabase.rpc("poker_table_state", { _table_id: TABLE_ID });
    if (error) return;
    setState(data as unknown as State);
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
          <div className="rounded-full bg-black/60 px-4 py-1 text-xs font-black uppercase tracking-widest text-amber-200 backdrop-blur">
            Pot: {formatCoins(state?.pot ?? 0)}
          </div>
          <div className="flex gap-1.5 sm:gap-2">
            {Array.from({ length: 5 }).map((_, i) => {
              const c = state?.board?.[i];
              return c
                ? <PlayingCard key={i} card={c} small />
                : <div key={i} className="h-12 w-9 rounded-lg border-2 border-white/10 bg-white/5 sm:h-14 sm:w-10" />;
            })}
          </div>
        </div>

        {/* Seats */}
        {Array.from({ length: state?.seats_count ?? 6 }).map((_, idx) => {
          const seat = state?.seats.find((s) => s.seat_index === idx);
          const pos = seatPositions(state?.seats_count ?? 6, idx);
          const isCurrent = state?.current_seat === idx && state?.status !== "showdown";
          const isDealer = state?.dealer_button === idx;
          return (
            <div
              key={idx}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {seat ? (
                <div className={`flex flex-col items-center gap-1 ${seat.status === "folded" ? "opacity-40" : ""}`}>
                  {/* Hole cards */}
                  <div className="flex gap-1">
                    {seat.is_me ? (
                      (seat.hole as Card[]).map((c, i) => <PlayingCard key={i} card={c} small />)
                    ) : (
                      Array.from({ length: typeof seat.hole?.[0] === "number" ? (seat.hole[0] as number) : (seat.hole as Card[]).length }).map((_, i) => {
                        const showdownCard = (seat.hole as Card[])[i];
                        return showdownCard && typeof showdownCard === "object"
                          ? <PlayingCard key={i} card={showdownCard} small />
                          : <PlayingCard key={i} hidden small />;
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
