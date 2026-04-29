import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { Spade, Users, Clock, Trophy } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { EmotePanel, EmoteBubble } from "@/components/EmotePanel";

type Card = { s: "S" | "H" | "D" | "C"; r: string };
type Hand = {
  cards: Card[];
  bet: number;
  doubled: boolean;
  status: "playing" | "stand" | "bust" | "blackjack" | "win" | "lose" | "push";
  payout: number;
  split?: boolean;
};
type Seat = {
  seat_index: number;
  user_id: string;
  username: string;
  avatar?: string;
  bet: number;
  hands: Hand[];
  current_hand: number;
  settled: boolean;
  total_payout: number;
};
type TableState = {
  id: string;
  status: "betting" | "playing" | "dealer" | "settled";
  min_bet: number;
  seats_count: number;
  dealer: Card[];
  current_seat: number | null;
  current_hand: number | null;
  phase_ends_at: string;
  round_seq: number;
  seats: Seat[];
};

const TABLE_ID = "main";

const SUIT_CHAR: Record<Card["s"], string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const isRed = (s: Card["s"]) => s === "H" || s === "D";

function handValue(hand: Card[]): number {
  let v = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.r === "A") {
      v += 11;
      aces++;
    } else if (["J", "Q", "K"].includes(c.r)) v += 10;
    else v += Number(c.r);
  }
  while (v > 21 && aces > 0) {
    v -= 10;
    aces--;
  }
  return v;
}

const PlayingCard = forwardRef<HTMLDivElement, {
  card?: Card;
  hidden?: boolean;
  idx: number;
  size?: "sm" | "md" | "lg";
}>(function PlayingCard({ card, hidden, idx, size = "md" }, ref) {
  const sz =
    size === "sm"
      ? "h-14 w-10 p-1 text-xs"
      : size === "lg"
        ? "h-28 w-20 p-2 text-base sm:h-32 sm:w-24 sm:text-lg"
        : "h-24 w-16 p-1.5 text-sm sm:h-28 sm:w-20 sm:p-2 sm:text-base";
  const suitSz =
    size === "sm" ? "text-xl" : size === "lg" ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl";
  if (hidden || !card) {
    return (
      <motion.div
        ref={ref}
        initial={{ y: -30, opacity: 0, rotateY: 90 }}
        animate={{ y: 0, opacity: 1, rotateY: 0 }}
        transition={{ delay: idx * 0.06, type: "spring", stiffness: 240, damping: 22 }}
        className={`flex items-center justify-center rounded-lg border-2 border-primary/40 bg-gradient-to-br from-primary/30 to-primary/10 shadow-lg ${sz}`}
      >
        <Spade className="h-1/2 w-1/2 text-primary/60" />
      </motion.div>
    );
  }
  return (
    <motion.div
      ref={ref}
      initial={{ y: -30, opacity: 0, rotateY: 90 }}
      animate={{ y: 0, opacity: 1, rotateY: 0 }}
      transition={{ delay: idx * 0.06, type: "spring", stiffness: 240, damping: 22 }}
      className={`flex flex-col items-center justify-between rounded-lg border-2 border-border bg-white shadow-xl ${sz} ${
        isRed(card.s) ? "text-red-600" : "text-black"
      }`}
    >
      <div className="self-start font-black leading-none">{card.r}</div>
      <div className={`leading-none ${suitSz}`}>{SUIT_CHAR[card.s]}</div>
      <div className="self-end rotate-180 font-black leading-none">{card.r}</div>
    </motion.div>
  );
});

export default function Blackjack() {
  useTrackGame("blackjack");
  const { user } = useAuth();
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<TableState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [autoJoin, setAutoJoin] = useState(false);
  const lastResultRound = useRef<number>(-1);
  const autoAttemptRound = useRef<number | null>(null);
  const [winBanner, setWinBanner] = useState<{ id: number; profit: number; bj: boolean } | null>(null);
  const winIdRef = useRef(0);

  // Refresh state from server (also rolls timers)
  async function refresh() {
    const { data, error } = await supabase.rpc("bj_table_state", { _table_id: TABLE_ID });
    if (error) return;
    setState(data as unknown as TableState);
  }

  // Poll + Realtime subscription
  useEffect(() => {
    refresh();
    const tick = setInterval(refresh, 1000);
    const ch = supabase
      .channel(`bj:${TABLE_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bj_tables", filter: `id=eq.${TABLE_ID}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bj_seats", filter: `table_id=eq.${TABLE_ID}` }, refresh)
      .subscribe();
    return () => {
      clearInterval(tick);
      supabase.removeChannel(ch);
    };
  }, []);

  // Local 100ms ticker for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const mySeat = useMemo(
    () => state?.seats.find((s) => s.user_id === user?.id),
    [state, user?.id],
  );

  // Show settle toast / refresh balance once per round
  useEffect(() => {
    if (!state || !mySeat || !mySeat.settled) return;
    if (state.round_seq === lastResultRound.current) return;
    lastResultRound.current = state.round_seq;
    setLocalCoins((profile?.coins ?? 0) + mySeat.total_payout);
    const totalBet = mySeat.hands.reduce((a, h) => a + h.bet, 0);
    const profit = mySeat.total_payout - totalBet;
    if (profit > 0) {
      toast.success(`+${formatCoins(profit)}`);
      const bj = mySeat.hands.some((h) => h.status === "blackjack");
      const id = ++winIdRef.current;
      setWinBanner({ id, profit, bj });
      window.setTimeout(() => {
        setWinBanner((cur) => (cur && cur.id === id ? null : cur));
      }, 3000);
    } else if (profit === 0 && mySeat.total_payout > 0) {
      toast("Push — bet returned");
    } else {
      toast.error(`-${formatCoins(-profit)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.round_seq, mySeat?.settled]);

  async function joinSeat(auto = false) {
    if (!profile) return;
    if (bet > profile.coins) {
      if (auto) setAutoJoin(false);
      return toast.error("Not enough coins");
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("bj_join_seat", { _table_id: TABLE_ID, _bet: bet });
    setBusy(false);
    if (error) {
      if (auto) setAutoJoin(false);
      return toast.error(error.message);
    }
    const d = data as { new_balance?: number } | null;
    if (d?.new_balance != null) setLocalCoins(Number(d.new_balance));
    refresh();
  }

  async function act(action: "hit" | "stand" | "double" | "split") {
    setBusy(true);
    const { error } = await supabase.rpc("bj_action", { _table_id: TABLE_ID, _action: action });
    setBusy(false);
    if (error) return toast.error(error.message);
    refresh();
  }

  useEffect(() => {
    if (!autoJoin || !state || !profile || busy || mySeat || state.status !== "betting") return;
    if (autoAttemptRound.current === state.round_seq) return;
    autoAttemptRound.current = state.round_seq;
    void joinSeat(true);
  }, [autoJoin, state?.status, state?.round_seq, profile?.coins, busy, mySeat?.seat_index, bet]);

  if (!state) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading table…
      </div>
    );
  }

  const myTurn =
    state.status === "playing" &&
    mySeat != null &&
    state.current_seat === mySeat.seat_index;
  const myHand = myTurn && mySeat ? mySeat.hands[state.current_hand ?? 0] : null;
  const canDouble =
    !!myHand && myHand.cards.length === 2 && (profile?.coins ?? 0) >= myHand.bet;
  const canSplit =
    !!myHand &&
    myHand.cards.length === 2 &&
    cardRankValue(myHand.cards[0].r) === cardRankValue(myHand.cards[1].r) &&
    mySeat!.hands.length < 4 &&
    (profile?.coins ?? 0) >= myHand.bet;

  const dealerHidden = state.status === "playing" || state.status === "betting";
  const dealerShown = dealerHidden ? state.dealer.slice(0, 1) : state.dealer;
  const dealerVal = handValue(dealerShown);

  const secondsLeft = Math.max(
    0,
    Math.ceil((new Date(state.phase_ends_at).getTime() - now) / 1000),
  );

  return (
    <div className="relative space-y-3 sm:space-y-4">
      <EmotePanel channelKey={`bj:${TABLE_ID}`} />
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <Spade className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> BLACKJACK
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Live table · up to {state.seats_count} players · BJ pays 3:2
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs font-bold backdrop-blur-xl">
          <PhasePill status={state.status} />
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" /> {secondsLeft}s
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3 w-3" /> {state.seats.length}/{state.seats_count}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_320px] sm:gap-4">
      {/* Table */}
      <div className="relative overflow-hidden rounded-2xl border-[6px] border-amber-900/70 bg-gradient-to-br from-emerald-800 via-emerald-900 to-emerald-950 p-3 shadow-[inset_0_0_60px_rgba(0,0,0,0.55),0_20px_40px_rgba(0,0,0,0.4)] sm:rounded-[32px] sm:p-5">
        {/* Winner banner */}
        <AnimatePresence>
          {winBanner && (
            <motion.div
              key={winBanner.id}
              initial={{ opacity: 0, scale: 0.8, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: -10 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="pointer-events-none absolute inset-x-0 top-3 z-20 mx-auto flex w-fit items-center gap-2 rounded-2xl border-2 border-amber-300/70 bg-gradient-to-br from-amber-400/95 via-amber-500/95 to-amber-600/95 px-5 py-2 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_40px_rgba(252,211,77,0.55)]"
            >
              <Trophy className="h-4 w-4" />
              {winBanner.bj ? "BLACKJACK · " : ""}+{formatCoins(winBanner.profit)}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dealer */}
        <div className="mb-3 sm:mb-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-200/90 ring-1 ring-amber-300/30">
              Dealer
            </span>
            {state.dealer.length > 0 && (
              <span className="rounded-md bg-black/50 px-2 py-0.5 text-xs font-black tabular-nums text-amber-100 ring-1 ring-amber-300/30">
                {dealerHidden ? `${dealerVal}+?` : dealerVal}
              </span>
            )}
          </div>
          <div className="flex min-h-[7rem] flex-wrap justify-center gap-2 sm:min-h-[8rem]">
            <AnimatePresence>
              {state.dealer.length === 0 && (
                <div className="flex items-center text-xs text-amber-100/60">
                  {state.status === "betting" ? "Waiting for bets…" : "Dealing…"}
                </div>
              )}
              {state.dealer.map((c, i) => (
                <PlayingCard
                  key={`d-${state.round_seq}-${i}`}
                  card={c}
                  hidden={dealerHidden && i === 1}
                  idx={i}
                  size="lg"
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Felt arc separator */}
        <div className="my-3 flex items-center justify-center">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />
          <span className="mx-3 whitespace-nowrap rounded-full bg-black/30 px-3 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-200/80 ring-1 ring-amber-300/20">
            Players
          </span>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />
        </div>

        {/* Seats */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: state.seats_count }).map((_, idx) => {
            const seat = state.seats.find((s) => s.seat_index === idx);
            const isMe = seat?.user_id === user?.id;
            const isTurn = state.status === "playing" && state.current_seat === idx;
            return (
              <SeatCard
                key={idx}
                seatIndex={idx}
                seat={seat}
                isMe={!!isMe}
                isTurn={isTurn}
                roundSeq={state.round_seq}
                currentHand={state.current_hand ?? 0}
              />
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-3 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4">
        <BetControls bet={bet} setBet={setBet} />
        <Button
          type="button"
          onClick={() => setAutoJoin((v) => !v)}
          variant={autoJoin ? "destructive" : "secondary"}
          className="h-11 w-full text-sm font-black uppercase tracking-wider"
        >
          {autoJoin ? "Stop auto next rounds" : `Auto join next rounds — ${formatCoins(bet)}`}
        </Button>
        {!mySeat && state.status === "betting" && (
          <Button
            onClick={() => void joinSeat(false)}
            disabled={busy}
            className="h-12 w-full text-base font-black tracking-wider"
          >
            JOIN TABLE — {formatCoins(bet)}
          </Button>
        )}
        {!mySeat && state.status !== "betting" && (
          <div className="rounded-xl bg-background/60 p-3 text-center text-sm text-muted-foreground">
            Round in progress · next betting in {secondsLeft}s
          </div>
        )}
        {mySeat && state.status === "betting" && (
          <div className="rounded-xl bg-[hsl(var(--success))]/10 p-3 text-center text-sm font-bold text-[hsl(var(--success))]">
            Seated for {formatCoins(mySeat.bet)} · waiting for round to start
          </div>
        )}
        {mySeat && myTurn && myHand && (
          <div className="space-y-2">
            <div className="text-center text-xs font-bold uppercase tracking-widest text-primary">
              Your turn — hand {(state.current_hand ?? 0) + 1}/{mySeat.hands.length}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => act("hit")}
                disabled={busy}
                className="h-12 bg-[hsl(var(--success))] font-black text-background hover:bg-[hsl(var(--success))]/90"
              >
                HIT
              </Button>
              <Button onClick={() => act("stand")} disabled={busy} variant="secondary" className="h-12 font-black">
                STAND
              </Button>
              <Button
                onClick={() => act("double")}
                disabled={busy || !canDouble}
                variant="outline"
                className="h-11 font-black"
              >
                DOUBLE
              </Button>
              <Button
                onClick={() => act("split")}
                disabled={busy || !canSplit}
                variant="outline"
                className="h-11 font-black"
              >
                SPLIT
              </Button>
            </div>
          </div>
        )}
        {mySeat && state.status === "playing" && !myTurn && (
          <div className="rounded-xl bg-background/60 p-3 text-center text-sm text-muted-foreground">
            Waiting for seat {(state.current_seat ?? 0) + 1}…
          </div>
        )}
        {mySeat && (state.status === "dealer" || state.status === "settled") && (
          <div className="rounded-xl bg-background/60 p-3 text-center text-sm text-muted-foreground">
            {state.status === "dealer" ? "Dealer playing…" : `Round over · next round in ${secondsLeft}s`}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function PhasePill({ status }: { status: TableState["status"] }) {
  const map = {
    betting: { label: "BETTING", cls: "bg-primary/20 text-primary" },
    playing: { label: "PLAYING", cls: "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]" },
    dealer: { label: "DEALER", cls: "bg-amber-500/20 text-amber-400" },
    settled: { label: "SETTLED", cls: "bg-muted text-foreground" },
  } as const;
  const m = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${m.cls}`}>{m.label}</span>;
}

function SeatCard({
  seatIndex,
  seat,
  isMe,
  isTurn,
  roundSeq,
  currentHand,
}: {
  seatIndex: number;
  seat?: Seat;
  isMe: boolean;
  isTurn: boolean;
  roundSeq: number;
  currentHand: number;
}) {
  if (!seat) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/30 text-xs text-muted-foreground">
        Seat {seatIndex + 1} · empty
      </div>
    );
  }
  return (
    <motion.div
      layout
      className={`rounded-xl border p-2 transition ${
        isTurn
          ? "border-primary bg-primary/10 shadow-[0_0_18px_hsl(var(--primary)/0.4)]"
          : isMe
            ? "border-[hsl(var(--success))]/50 bg-[hsl(var(--success))]/5"
            : "border-border bg-background/40"
      }`}
    >
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className="relative inline-flex min-w-0 items-center gap-1 overflow-visible pr-2">
          <PlayerAvatar avatar={seat.avatar} size={18} className="shrink-0" />
          <span className="truncate">{isMe ? "You" : seat.username}</span>
          <span className="shrink-0 text-muted-foreground">· seat {seatIndex + 1}</span>
          <EmoteBubble channelKey={`bj:${TABLE_ID}`} userId={seat.user_id} side="top" />
        </span>
        <span className="rounded bg-background/60 px-1.5 py-0.5 tabular-nums">
          {formatCoins(seat.bet)}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {seat.hands.map((h, hi) => {
          const v = handValue(h.cards);
          const active = isTurn && hi === currentHand;
          return (
            <div
              key={`${roundSeq}-${seatIndex}-${hi}`}
              className={`rounded-lg p-1.5 ${active ? "bg-primary/15 ring-1 ring-primary/50" : "bg-background/50"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  <AnimatePresence>
                    {h.cards.map((c, i) => (
                      <PlayingCard key={`${hi}-${i}`} card={c} idx={i} size="sm" />
                    ))}
                  </AnimatePresence>
                </div>
                <div className="ml-2 flex flex-col items-end gap-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                      v > 21
                        ? "bg-destructive/20 text-destructive"
                        : v === 21
                          ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]"
                          : "bg-background/60"
                    }`}
                  >
                    {v}
                  </span>
                  {h.status !== "playing" && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                        h.status === "win" || h.status === "blackjack"
                          ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]"
                          : h.status === "push"
                            ? "bg-muted text-foreground"
                            : h.status === "stand"
                              ? "bg-background/60 text-muted-foreground"
                              : "bg-destructive/20 text-destructive"
                      }`}
                    >
                      {h.status}
                      {h.payout > 0 && h.status !== "push" ? ` +${formatCoins(h.payout - h.bet)}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function cardRankValue(r: string) {
  if (["J", "Q", "K"].includes(r)) return 10;
  if (r === "A") return 11;
  return Number(r);
}
