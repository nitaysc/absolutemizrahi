import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/usePresence";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { ArrowLeft, Circle, Eye, TrendingUp, TrendingDown } from "lucide-react";

/**
 * Live spectate page: shows what an accepted friend is currently doing — their
 * presence (game/lobby/offline) and a stream of their most recent bets, so it
 * feels like watching them play. Server-side `get_friend_recent_bets`
 * enforces the friendship check, so unauthorized spectating is blocked.
 */

type SpectateBet = {
  id: string;
  game: string;
  bet_amount: number;
  payout: number;
  multiplier: number;
  won: boolean;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: any;
};

type FriendInfo = {
  id: string;
  username: string | null;
  avatar: string;
  coins: number;
  level: number;
};

export default function Spectate() {
  const { username } = useParams<{ username: string }>();
  const { byUser } = usePresence();
  const [friend, setFriend] = useState<FriendInfo | null>(null);
  const [bets, setBets] = useState<SpectateBet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastSeenRef = useRef<string | null>(null);

  // Resolve username → id once
  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBets([]);
    lastSeenRef.current = null;
    (async () => {
      const { data, error: e } = await supabase
        .from("profiles")
        .select("id, username, avatar, coins, level")
        .ilike("username", username)
        .maybeSingle();
      if (cancelled) return;
      if (e || !data) {
        setError("Player not found.");
        setLoading(false);
        return;
      }
      setFriend({
        id: data.id as string,
        username: data.username as string | null,
        avatar: (data.avatar as string) ?? "🎰",
        coins: Number(data.coins ?? 0),
        level: Number(data.level ?? 1),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Poll friend bets every 2.5s once we have a friend id.
  useEffect(() => {
    if (!friend?.id) return;
    let cancelled = false;

    async function fetchBets(initial: boolean) {
      const args: Record<string, unknown> = { _friend_id: friend.id, _limit: 30 };
      if (!initial && lastSeenRef.current) args._since = lastSeenRef.current;
      const { data, error: e } = await supabase.rpc("get_friend_recent_bets", args);
      if (cancelled) return;
      if (e) {
        // Most likely: not friends. Show message and stop polling by setting error.
        setError(e.message);
        return;
      }
      const rows = (data ?? []) as SpectateBet[];
      if (rows.length === 0) return;
      lastSeenRef.current = rows[0].created_at;
      if (initial) {
        setBets(rows);
      } else {
        setBets((prev) => {
          const merged = [...rows, ...prev];
          // De-dup by id, keep most-recent first, cap at 50.
          const seen = new Set<string>();
          const out: SpectateBet[] = [];
          for (const b of merged) {
            if (seen.has(b.id)) continue;
            seen.add(b.id);
            out.push(b);
            if (out.length >= 50) break;
          }
          return out;
        });
      }
    }

    fetchBets(true);
    const t = setInterval(() => fetchBets(false), 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [friend?.id]);

  const presence = friend ? byUser[friend.id] : undefined;
  const online = presence !== undefined;

  const totals = useMemo(() => {
    let wagered = 0;
    let won = 0;
    for (const b of bets) {
      wagered += Number(b.bet_amount ?? 0);
      won += Number(b.payout ?? 0);
    }
    return { wagered, won, profit: won - wagered };
  }, [bets]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading spectate session…
      </div>
    );
  }
  if (error || !friend) {
    return (
      <div className="space-y-4">
        <Link to="/friends" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to friends
        </Link>
        <div className="rounded-3xl border border-destructive/40 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-bold text-destructive">{error ?? "Cannot spectate this player."}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You can only spectate accepted friends. Send them a friend request first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/friends" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to friends
        </Link>
      </div>

      <header className="rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card/70 to-transparent p-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative shrink-0">
            <PlayerAvatar avatar={friend.avatar} size={64} ring />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${
                online ? "bg-[hsl(var(--success))]" : "bg-muted"
              }`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary">
              <Eye className="h-3.5 w-3.5" /> Spectating
            </p>
            <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">
              {friend.username ?? "anon"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-secondary px-2 py-0.5 font-bold">Lv {friend.level}</span>
              <span className="inline-flex items-center gap-1">
                <MizrahiCoin size={12} /> {formatCoins(friend.coins)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Circle
                  className={`h-2 w-2 ${
                    online
                      ? "fill-[hsl(var(--success))] text-[hsl(var(--success))]"
                      : "fill-muted text-muted"
                  }`}
                />
                {online ? (presence ? `Playing ${presence}` : "In the lobby") : "Offline"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Session wagered" value={formatCoins(totals.wagered)} />
        <Stat label="Session won" value={formatCoins(totals.won)} />
        <Stat
          label="Net"
          value={`${totals.profit >= 0 ? "+" : ""}${formatCoins(totals.profit)}`}
          tone={totals.profit >= 0 ? "win" : "loss"}
        />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Live bet feed (refreshes every 2.5s)
        </h2>
        {bets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            Waiting for {friend.username ?? "this player"} to place a bet…
          </div>
        ) : (
          <ul className="space-y-2">
            {bets.map((b) => {
              const profit = b.payout - b.bet_amount;
              return (
                <li
                  key={b.id}
                  className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                    b.won
                      ? "border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5"
                      : "border-destructive/40 bg-destructive/5"
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      b.won
                        ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {b.won ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-black uppercase tracking-wide">{b.game}</span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                        {Number(b.multiplier ?? 0).toFixed(2)}×
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-bold tabular-nums">
                      {formatCoins(b.bet_amount)} →{" "}
                      <span
                        className={
                          b.won ? "text-[hsl(var(--success))]" : "text-destructive"
                        }
                      >
                        {formatCoins(b.payout)}
                      </span>
                    </div>
                    <div
                      className={`text-xs font-bold tabular-nums ${
                        profit >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
                      }`}
                    >
                      {profit >= 0 ? "+" : ""}
                      {formatCoins(profit)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "win" | "loss";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 text-base font-black tabular-nums sm:text-lg ${
          tone === "win"
            ? "text-[hsl(var(--success))]"
            : tone === "loss"
              ? "text-destructive"
              : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}