import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Trophy } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { calculateDailyStreak, getStreakTimezone } from "@/lib/streak";
import { LevelBadge } from "@/components/LevelBadge";

interface Row {
  id: string;
  username: string | null;
  coins: number;
  total_won: number;
  streak: number;
  level: number;
  xp_total: number;
}

export default function Leaderboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const tz = getStreakTimezone();
      const { data } = await supabase
        .from("profiles")
        .select("id, username, coins, total_won, level, xp_total")
        .order("coins", { ascending: false })
        .limit(100);

      const ids = (data ?? []).map((r) => r.id);
      const { data: streakRows } = ids.length
        ? await supabase.rpc("get_user_bet_days", {
            _user_ids: ids,
            _limit_per_user: 200,
          })
        : { data: [] as { user_id: string; created_at: string }[] };

      const byUser = new Map<string, string[]>();
      for (const row of (streakRows ?? []) as { user_id: string; created_at: string }[]) {
        const list = byUser.get(row.user_id) ?? [];
        list.push(row.created_at);
        byUser.set(row.user_id, list);
      }

      setRows(
        (data ?? []).map((r) => ({
          id: r.id,
          username: r.username,
          coins: Number(r.coins ?? 0),
          total_won: Number(r.total_won ?? 0),
          streak: calculateDailyStreak(byUser.get(r.id) ?? [], new Date(), tz),
          level: Number((r as { level?: number }).level ?? 1),
          xp_total: Number((r as { xp_total?: number }).xp_total ?? 0),
        })),
      );
      setLoading(false);
    })();
  }, []);

  const byCoins = [...rows].sort((a, b) => b.coins - a.coins).slice(0, 50);
  const byStreak = [...rows]
    .filter((r) => r.streak > 0)
    .sort((a, b) => b.streak - a.streak || b.coins - a.coins)
    .slice(0, 50);
  const byLevel = [...rows]
    .sort((a, b) => b.level - a.level || b.xp_total - a.xp_total)
    .slice(0, 50);
  const byXp = [...rows].sort((a, b) => b.xp_total - a.xp_total).slice(0, 50);

  return (
    <div className="space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card/40 p-5 backdrop-blur-xl"
      >
        <div
          aria-hidden
          className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(45 100% 60% / 0.7), transparent 70%)" }}
        />
        <div className="relative flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
            <Trophy className="h-6 w-6 text-primary" />
          </span>
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              <span className="text-gradient">LEADERBOARD</span>
            </h1>
            <p className="text-sm text-muted-foreground">Top whales by Mizrahi Coins</p>
          </div>
        </div>
      </motion.header>

      {loading ? (
        <div className="text-center text-muted-foreground">Loading...</div>
      ) : (
        <Tabs defaultValue="level" className="space-y-3">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="level">Level</TabsTrigger>
            <TabsTrigger value="xp">XP</TabsTrigger>
            <TabsTrigger value="coins">Coins</TabsTrigger>
            <TabsTrigger value="streak">Streak</TabsTrigger>
          </TabsList>
          <LeaderboardList rows={byLevel} userId={user?.id} navigate={navigate} mode="level" />
          <LeaderboardList rows={byXp} userId={user?.id} navigate={navigate} mode="xp" />
          <LeaderboardList rows={byCoins} userId={user?.id} navigate={navigate} mode="coins" />
          <LeaderboardList rows={byStreak} userId={user?.id} navigate={navigate} mode="streak" />
        </Tabs>
      )}
    </div>
  );
}

function LeaderboardList({
  rows,
  userId,
  navigate,
  mode,
}: {
  rows: Row[];
  userId?: string;
  navigate: ReturnType<typeof useNavigate>;
  mode: "coins" | "streak" | "level" | "xp";
}) {
  return (
    <TabsContent value={mode} className="space-y-2">
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
          No active streaks yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const isMe = r.id === userId;
            return (
              <li
                key={r.id}
                onClick={() =>
                  !isMe && r.username && navigate(`/u/${encodeURIComponent(r.username)}`)
                }
                className={`flex items-center gap-3 rounded-2xl border p-3 backdrop-blur transition ${
                  isMe
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card/60 cursor-pointer hover:bg-card hover:border-primary/40"
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl font-black ${
                    i === 0
                      ? "bg-yellow-400/20 text-yellow-400"
                      : i === 1
                        ? "bg-zinc-300/20 text-zinc-300"
                        : i === 2
                          ? "bg-amber-700/30 text-amber-500"
                          : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate font-bold">
                    <LevelBadge level={r.level} size="xs" />
                    <span className="truncate">{r.username ?? "anon"}</span>
                    {r.streak > 0 && (
                      <span
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-orange-400/40 bg-orange-500/15 px-1.5 py-0 text-[9px] font-black tabular-nums text-orange-300"
                        title={`${r.streak} day daily-bet streak`}
                      >
                        🔥{r.streak}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {mode === "coins"
                      ? `Won ${formatCoins(r.total_won)}`
                      : mode === "streak"
                        ? `${r.streak} day streak`
                        : mode === "level"
                          ? `${r.xp_total.toLocaleString()} lifetime XP`
                          : `Lvl ${r.level}`}
                  </div>
                </div>
                {mode === "coins" ? (
                  <div className="flex items-center gap-1.5 font-black tabular-nums">
                    <MizrahiCoin size={16} />
                    {formatCoins(r.coins)}
                  </div>
                ) : mode === "streak" ? (
                  <div className="font-black tabular-nums text-primary">{r.streak}🔥</div>
                ) : mode === "level" ? (
                  <div className="font-black tabular-nums text-primary">Lvl {r.level}</div>
                ) : (
                  <div className="font-black tabular-nums text-amber-300">
                    {r.xp_total.toLocaleString()} XP
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </TabsContent>
  );
}
