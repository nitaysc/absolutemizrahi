import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/usePresence";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, UserCheck, UserX, Clock, Circle } from "lucide-react";

type Status = "none" | "pending_out" | "pending_in" | "accepted" | "self";

type Bet = {
  id: string;
  game: string;
  bet_amount: number;
  payout: number;
  multiplier: number;
  won: boolean;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string;
  avatar: string;
  coins: number;
  total_won: number;
  total_wagered: number;
  created_at: string;
  friendship_status: Status;
  recent_bets: Bet[];
};

export default function PlayerProfile() {
  const { username = "" } = useParams();
  const navigate = useNavigate();
  const { byUser } = usePresence();
  const [data, setData] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rows, error } = await supabase.rpc("get_player_profile", {
      _username: username,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = rows?.[0];
    if (!r) {
      setData(null);
      return;
    }
    setData({
      id: r.id,
      username: r.username,
      avatar: r.avatar ?? "🎰",
      coins: Number(r.coins ?? 0),
      total_won: Number(r.total_won ?? 0),
      total_wagered: Number(r.total_wagered ?? 0),
      created_at: r.created_at,
      friendship_status: (r.friendship_status as Status) ?? "none",
      recent_bets: (r.recent_bets ?? []) as Bet[],
    });
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  const profit = (data?.total_won ?? 0) - (data?.total_wagered ?? 0);
  const presence = data ? byUser[data.id] : undefined;
  const isOnline = presence !== undefined;
  const currentGame = presence ?? null;

  async function act(rpc: "friend_request" | "friend_accept" | "friend_decline" | "friend_remove") {
    if (!data) return;
    setBusy(true);
    const { error } =
      rpc === "friend_request"
        ? await supabase.rpc(rpc, { _target: data.id })
        : await supabase.rpc(rpc, { _other: data.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (rpc === "friend_request") toast.success("Friend request sent");
    else if (rpc === "friend_accept") toast.success("Friend added");
    else if (rpc === "friend_decline") toast("Request declined");
    else toast("Friend removed");
    load();
  }

  if (loading) {
    return <div className="text-center text-muted-foreground">Loading…</div>;
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="rounded-2xl border border-border bg-card/60 p-8 text-center text-muted-foreground">
          No player named <span className="font-bold">{username}</span>.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <header className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-4">
          <PlayerAvatar avatar={data.avatar} size={72} ring />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">
                {data.username}
              </h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                  isOnline
                    ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Circle className={`h-2 w-2 ${isOnline ? "fill-current" : ""}`} />
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
            {isOnline && (
              <div className="mt-1 text-xs text-muted-foreground">
                {currentGame ? (
                  <>
                    Currently playing{" "}
                    <span className="font-bold capitalize text-foreground">{currentGame}</span>
                  </>
                ) : (
                  "In the lobby"
                )}
              </div>
            )}
            <div className="mt-1 text-xs text-muted-foreground">
              Joined {new Date(data.created_at).toLocaleDateString()}
            </div>
          </div>

          <FriendActions status={data.friendship_status} busy={busy} act={act} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Balance" value={formatCoins(data.coins)} coin />
          <Stat label="Wagered" value={formatCoins(data.total_wagered)} coin />
          <Stat label="Won" value={formatCoins(data.total_won)} coin />
          <Stat
            label="Profit"
            value={`${profit >= 0 ? "+" : ""}${formatCoins(profit)}`}
            coin
            tone={profit >= 0 ? "good" : "bad"}
          />
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Recent bets
        </h2>
        {data.recent_bets.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No bets yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {data.recent_bets.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-card/60 p-3"
              >
                <div>
                  <div className="text-sm font-bold capitalize">{b.game}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatCoins(Number(b.bet_amount))} @ {Number(b.multiplier).toFixed(2)}×
                  </div>
                </div>
                <div
                  className={`flex items-center gap-1 font-black tabular-nums ${
                    b.won ? "text-[hsl(var(--success))]" : "text-destructive"
                  }`}
                >
                  <MizrahiCoin size={14} />
                  {b.won
                    ? `+${formatCoins(Number(b.payout) - Number(b.bet_amount))}`
                    : `-${formatCoins(Number(b.bet_amount))}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FriendActions({
  status,
  busy,
  act,
}: {
  status: Status;
  busy: boolean;
  act: (
    rpc: "friend_request" | "friend_accept" | "friend_decline" | "friend_remove",
  ) => void;
}) {
  if (status === "self") return null;
  if (status === "accepted") {
    return (
      <Button variant="outline" disabled={busy} onClick={() => act("friend_remove")}>
        <UserCheck className="mr-2 h-4 w-4" /> Friends · Remove
      </Button>
    );
  }
  if (status === "pending_out") {
    return (
      <Button variant="secondary" disabled>
        <Clock className="mr-2 h-4 w-4" /> Request sent
      </Button>
    );
  }
  if (status === "pending_in") {
    return (
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => act("friend_accept")}>
          <UserCheck className="mr-2 h-4 w-4" /> Accept
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => act("friend_decline")}>
          <UserX className="mr-2 h-4 w-4" /> Decline
        </Button>
      </div>
    );
  }
  return (
    <Button disabled={busy} onClick={() => act("friend_request")}>
      <UserPlus className="mr-2 h-4 w-4" /> Add friend
    </Button>
  );
}

function Stat({
  label,
  value,
  coin,
  tone,
}: {
  label: string;
  value: string;
  coin?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 flex items-center justify-center gap-1 text-base font-black tabular-nums ${
          tone === "good" ? "text-[hsl(var(--success))]" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {coin && <MizrahiCoin size={14} />}
        {value}
      </div>
    </div>
  );
}
