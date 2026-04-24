import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { Spade } from "lucide-react";

type Card = { s: "S" | "H" | "D" | "C"; r: string };
type RpcResult = {
  new_balance: number;
  player: Card[];
  dealer: Card[];
  status:
    | "playing"
    | "win"
    | "lose"
    | "push"
    | "bust"
    | "blackjack"
    | "dealer_blackjack";
  payout: number;
  multiplier: number;
};

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

function PlayingCard({ card, hidden, idx }: { card?: Card; hidden?: boolean; idx: number }) {
  return (
    <motion.div
      initial={{ y: -40, opacity: 0, rotateY: 90 }}
      animate={{ y: 0, opacity: 1, rotateY: 0 }}
      transition={{ delay: idx * 0.08, type: "spring", stiffness: 240, damping: 20 }}
      className={`relative flex h-28 w-20 flex-col items-center justify-between rounded-xl border-2 p-2 shadow-xl sm:h-32 sm:w-24 ${
        hidden
          ? "border-primary/40 bg-gradient-to-br from-primary/30 to-primary/10"
          : "border-border bg-card"
      }`}
    >
      {hidden || !card ? (
        <div className="flex h-full w-full items-center justify-center">
          <Spade className="h-8 w-8 text-primary/60" />
        </div>
      ) : (
        <>
          <div
            className={`self-start text-lg font-black leading-none ${
              isRed(card.s) ? "text-red-500" : "text-foreground"
            }`}
          >
            {card.r}
          </div>
          <div
            className={`text-3xl ${isRed(card.s) ? "text-red-500" : "text-foreground"}`}
          >
            {SUIT_CHAR[card.s]}
          </div>
          <div
            className={`self-end rotate-180 text-lg font-black leading-none ${
              isRed(card.s) ? "text-red-500" : "text-foreground"
            }`}
          >
            {card.r}
          </div>
        </>
      )}
    </motion.div>
  );
}

export default function Blackjack() {
  useTrackGame("blackjack");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [status, setStatus] = useState<RpcResult["status"] | "idle">("idle");
  const [lastPayout, setLastPayout] = useState(0);

  // Resume an active round on mount
  useEffect(() => {
    if (!profile) return;
    const r = (profile as { blackjack_round?: { active?: boolean; player?: Card[]; dealer?: Card[]; bet?: number } }).blackjack_round;
    if (r?.active && r.player && r.dealer) {
      setPlayer(r.player);
      setDealer(r.dealer);
      setBet(r.bet ?? bet);
      setStatus("playing");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const playing = status === "playing";
  const finished = status !== "idle" && status !== "playing";

  function applyResult(d: RpcResult) {
    setPlayer(d.player ?? []);
    setDealer(d.dealer ?? []);
    setStatus(d.status);
    setLastPayout(Number(d.payout) || 0);
    setLocalCoins(Number(d.new_balance));
    if (d.status === "win" || d.status === "blackjack") {
      const profit = Math.max(Number(d.payout) - bet, 0);
      toast.success(
        d.status === "blackjack"
          ? `BLACKJACK! +${formatCoins(profit)}`
          : `You win +${formatCoins(profit)}`,
      );
    } else if (d.status === "push") {
      toast("Push — bet returned");
    } else if (d.status === "bust") {
      toast.error("Bust!");
    } else if (d.status === "lose") {
      toast.error("Dealer wins");
    } else if (d.status === "dealer_blackjack") {
      toast.error("Dealer blackjack");
    }
  }

  async function deal() {
    if (!profile) return;
    if (bet > profile.coins) return toast.error("Not enough coins");
    setBusy(true);
    setLastPayout(0);
    const { data, error } = await supabase.rpc("bj_start", { _bet_amount: bet });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data?.[0]) applyResult(data[0] as RpcResult);
  }

  async function hit() {
    setBusy(true);
    const { data, error } = await supabase.rpc("bj_hit");
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data?.[0]) applyResult(data[0] as RpcResult);
  }

  async function stand() {
    setBusy(true);
    const { data, error } = await supabase.rpc("bj_stand");
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data?.[0]) applyResult(data[0] as RpcResult);
  }

  async function doubleDown() {
    setBusy(true);
    const { data, error } = await supabase.rpc("bj_double");
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data?.[0]) applyResult(data[0] as RpcResult);
  }

  function reset() {
    setPlayer([]);
    setDealer([]);
    setStatus("idle");
    setLastPayout(0);
  }

  const playerVal = handValue(player);
  // Hide dealer's hole card while still playing
  const dealerVisible = playing ? dealer.slice(0, 1) : dealer;
  const dealerVal = handValue(dealerVisible);
  const canDouble = playing && player.length === 2 && (profile?.coins ?? 0) >= bet;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Spade className="h-7 w-7 text-primary" /> BLACKJACK
        </h1>
        <p className="text-sm text-muted-foreground">
          Beat the dealer to 21. Blackjack pays 3:2.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
        {/* Table */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-emerald-950/60 via-card/80 to-emerald-900/40 p-6 backdrop-blur-xl">
          {/* Dealer */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Dealer
              </span>
              {dealer.length > 0 && (
                <span className="rounded-md bg-background/60 px-2 py-1 text-sm font-black tabular-nums">
                  {playing ? `${dealerVal}+?` : dealerVal}
                </span>
              )}
            </div>
            <div className="flex min-h-[8rem] flex-wrap gap-2">
              <AnimatePresence>
                {dealer.map((c, i) => (
                  <PlayingCard
                    key={`d-${i}`}
                    card={c}
                    hidden={playing && i === 1}
                    idx={i}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="my-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {/* Player */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                You
              </span>
              {player.length > 0 && (
                <span
                  className={`rounded-md px-2 py-1 text-sm font-black tabular-nums ${
                    playerVal > 21
                      ? "bg-destructive/20 text-destructive"
                      : playerVal === 21
                        ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]"
                        : "bg-background/60"
                  }`}
                >
                  {playerVal}
                </span>
              )}
            </div>
            <div className="flex min-h-[8rem] flex-wrap gap-2">
              <AnimatePresence>
                {player.map((c, i) => (
                  <PlayingCard key={`p-${i}`} card={c} idx={i} />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {finished && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-4 rounded-xl p-3 text-center text-sm font-black uppercase tracking-widest ${
                status === "win" || status === "blackjack"
                  ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                  : status === "push"
                    ? "bg-muted text-foreground"
                    : "bg-destructive/15 text-destructive"
              }`}
            >
              {status === "blackjack" && `BLACKJACK +${formatCoins(Math.max(lastPayout - bet, 0))}`}
              {status === "win" && `WIN +${formatCoins(Math.max(lastPayout - bet, 0))}`}
              {status === "push" && "PUSH"}
              {status === "bust" && "BUST"}
              {status === "lose" && "DEALER WINS"}
              {status === "dealer_blackjack" && "DEALER BLACKJACK"}
            </motion.div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4 rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <BetControls bet={bet} setBet={setBet} disabled={playing} />

          {!playing && (
            <Button
              onClick={finished ? () => { reset(); deal(); } : deal}
              disabled={busy}
              className="h-14 w-full text-lg font-black tracking-wider"
            >
              {finished ? "DEAL AGAIN" : "DEAL"}
            </Button>
          )}

          {playing && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={hit}
                disabled={busy}
                className="h-14 bg-[hsl(var(--success))] text-background hover:bg-[hsl(var(--success))]/90 font-black"
              >
                HIT
              </Button>
              <Button
                onClick={stand}
                disabled={busy}
                variant="secondary"
                className="h-14 font-black"
              >
                STAND
              </Button>
              <Button
                onClick={doubleDown}
                disabled={busy || !canDouble}
                variant="outline"
                className="col-span-2 h-12 font-black"
              >
                DOUBLE ({formatCoins(bet)})
              </Button>
            </div>
          )}

          {finished && (
            <Button onClick={reset} variant="ghost" className="w-full">
              Clear table
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
