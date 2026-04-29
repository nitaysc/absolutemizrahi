import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/usePresence";
import { useAuth } from "@/contexts/AuthContext";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Search, UserPlus, UserCheck, UserX, Circle, Users, Inbox, Eye } from "lucide-react";
import { calculateDailyStreak, getStreakTimezone } from "@/lib/streak";

type Friend = { id: string; username: string | null; avatar: string; coins: number };
type Request = {
  id: string;
  requester: string;
  username: string | null;
  avatar: string;
  created_at: string;
};
type SearchHit = {
  id: string;
  username: string | null;
  avatar: string;
  coins: number;
  total_won: number;
  total_wagered: number;
};

export default function Friends() {
  const { user } = useAuth();
  const { byUser } = usePresence();
  const navigate = useNavigate();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    const [{ data: f }, { data: r }] = await Promise.all([
      supabase.rpc("list_friends"),
      supabase.rpc("list_friend_requests"),
    ]);
    setFriends(
      (f ?? []).map((x: { id: string; username: string | null; avatar: string | null; coins: number }) => ({
        id: x.id,
        username: x.username,
        avatar: x.avatar ?? "🎰",
        coins: Number(x.coins ?? 0),
      })),
    );
    setRequests(
      (r ?? []).map((x: { id: string; requester: string; username: string | null; avatar: string | null; created_at: string }) => ({
        id: x.id,
        requester: x.requester,
        username: x.username,
        avatar: x.avatar ?? "🎰",
        created_at: x.created_at,
      })),
    );
  }, []);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  // Realtime: refresh on any change to friendships involving me
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`friendships-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => loadFriends(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, loadFriends]);

  // Search players (debounced)
  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_players", { _q: q });
      setSearching(false);
      if (error) return toast.error(error.message);
      setHits(
        (data ?? []).map((x: SearchHit) => ({
          ...x,
          avatar: x.avatar ?? "🎰",
          coins: Number(x.coins ?? 0),
          total_won: Number(x.total_won ?? 0),
          total_wagered: Number(x.total_wagered ?? 0),
        })),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function sendRequest(id: string) {
    setBusyId(id);
    const { error } = await supabase.rpc("friend_request", { _target: id });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Friend request sent");
    loadFriends();
  }

  async function accept(other: string) {
    setBusyId(other);
    const { error } = await supabase.rpc("friend_accept", { _other: other });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Friend added");
    loadFriends();
  }

  async function decline(other: string) {
    setBusyId(other);
    const { error } = await supabase.rpc("friend_decline", { _other: other });
    setBusyId(null);
    if (error) return toast.error(error.message);
    loadFriends();
  }

  async function remove(other: string) {
    setBusyId(other);
    const { error } = await supabase.rpc("friend_remove", { _other: other });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast("Friend removed");
    loadFriends();
  }

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);
  const pendingInIds = useMemo(() => new Set(requests.map((r) => r.requester)), [requests]);

  // Streaks for everyone we render — single batched query keyed off the
  // union of friend / request / search-hit ids, kept fresh as that set changes.
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids = Array.from(
      new Set<string>([
        ...friends.map((f) => f.id),
        ...requests.map((r) => r.requester),
        ...hits.map((h) => h.id),
      ]),
    );
    if (ids.length === 0) {
      setStreaks({});
      return;
    }
    let cancelled = false;
    (async () => {
      // Public RPC — bets table SELECT is restricted to the row owner via RLS.
      const { data } = await supabase.rpc("get_user_bet_days", {
        _user_ids: ids,
        _limit_per_user: 200,
      });
      if (cancelled) return;
      const tz = getStreakTimezone();
      const byUserId = new Map<string, string[]>();
      for (const row of (data ?? []) as { user_id: string; created_at: string }[]) {
        const list = byUserId.get(row.user_id) ?? [];
        list.push(row.created_at);
        byUserId.set(row.user_id, list);
      }
      const next: Record<string, number> = {};
      for (const id of ids) {
        next[id] = calculateDailyStreak(byUserId.get(id) ?? [], new Date(), tz);
      }
      setStreaks(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [friends, requests, hits]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">FRIENDS</h1>
        <p className="text-sm text-muted-foreground">
          Find players, send friend requests, and see who's online.
        </p>
      </header>

      {/* Search */}
      <section className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Search players
        </label>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a username…"
              className="pl-9"
            />
          </div>
        </div>

        {query.trim() && (
          <ul className="mt-3 space-y-2">
            {searching && hits.length === 0 && (
              <li className="text-center text-sm text-muted-foreground">Searching…</li>
            )}
            {!searching && hits.length === 0 && (
              <li className="text-center text-sm text-muted-foreground">No matches.</li>
            )}
            {hits.map((h) => {
              const isMe = h.id === user?.id;
              const presence = byUser[h.id];
              const online = presence !== undefined;
              const profit = h.total_won - h.total_wagered;
              return (
                <li
                  key={h.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-background/40 p-3"
                >
                  <button
                    onClick={() => h.username && navigate(`/u/${encodeURIComponent(h.username)}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <PlayerAvatar avatar={h.avatar} size={40} ring />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-bold">{h.username ?? "anon"}</span>
                        {streaks[h.id] > 0 && (
                          <StreakBadge value={streaks[h.id]} />
                        )}
                        {online && (
                          <Circle className="h-2 w-2 fill-[hsl(var(--success))] text-[hsl(var(--success))]" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MizrahiCoin size={10} />
                          {formatCoins(h.coins)}
                        </span>
                        <span className="mx-1.5">·</span>
                        <span className={profit >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}>
                          {profit >= 0 ? "+" : ""}
                          {formatCoins(profit)}
                        </span>
                      </div>
                    </div>
                  </button>
                  {!isMe && !friendIds.has(h.id) && !pendingInIds.has(h.id) && (
                    <Button
                      size="sm"
                      disabled={busyId === h.id}
                      onClick={() => sendRequest(h.id)}
                    >
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Add
                    </Button>
                  )}
                  {friendIds.has(h.id) && (
                    <span className="text-xs font-bold uppercase tracking-widest text-[hsl(var(--success))]">
                      Friends
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Incoming requests */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <Inbox className="h-4 w-4" /> Requests
          {requests.length > 0 && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-black text-primary">
              {requests.length}
            </span>
          )}
        </h2>
        {requests.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card/40 p-4 text-center text-sm text-muted-foreground">
            No pending requests.
          </div>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-card/60 p-3"
              >
                <button
                  onClick={() => r.username && navigate(`/u/${encodeURIComponent(r.username)}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <PlayerAvatar avatar={r.avatar} size={40} ring />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="truncate">{r.username ?? "anon"}</span>
                      {streaks[r.requester] > 0 && (
                        <StreakBadge value={streaks[r.requester]} />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">wants to be friends</div>
                  </div>
                </button>
                <Button size="sm" disabled={busyId === r.requester} onClick={() => accept(r.requester)}>
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === r.requester}
                  onClick={() => decline(r.requester)}
                >
                  <UserX className="mr-1.5 h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Friends list */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <Users className="h-4 w-4" /> My friends
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-black">
            {friends.length}
          </span>
        </h2>
        {friends.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No friends yet — search above and send a request.
          </div>
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => {
              const presence = byUser[f.id];
              const online = presence !== undefined;
              const game = presence ?? null;
              return (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-3"
                >
                  <button
                    onClick={() => f.username && navigate(`/u/${encodeURIComponent(f.username)}`)}
                    className="relative shrink-0"
                  >
                    <PlayerAvatar avatar={f.avatar} size={44} ring />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                        online ? "bg-[hsl(var(--success))]" : "bg-muted"
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => f.username && navigate(`/u/${encodeURIComponent(f.username)}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="truncate">{f.username ?? "anon"}</span>
                      {streaks[f.id] > 0 && <StreakBadge value={streaks[f.id]} />}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {online ? (
                        game ? (
                          <>
                            Playing <span className="capitalize text-foreground">{game.split(":")[0]}</span>
                          </>
                        ) : (
                          "In the lobby"
                        )
                      ) : (
                        "Offline"
                      )}
                    </div>
                  </button>
                  <div className="hidden items-center gap-1 text-sm font-bold tabular-nums sm:flex">
                    <MizrahiCoin size={14} />
                    {formatCoins(f.coins)}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!f.username}
                    onClick={() => f.username && navigate(`/spectate/${encodeURIComponent(f.username)}`)}
                    aria-label="Spectate friend"
                    title="Spectate live"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === f.id}
                    onClick={() => remove(f.id)}
                    aria-label="Remove friend"
                  >
                    <UserX className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StreakBadge({ value }: { value: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-orange-400/40 bg-orange-500/15 px-1.5 py-0 text-[9px] font-black tabular-nums text-orange-300"
      title={`${value} day daily-bet streak`}
    >
      🔥{value}
    </span>
  );
}
