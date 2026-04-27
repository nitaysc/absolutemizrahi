import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Trophy } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { calculateDailyStreak } from "@/lib/streak";

interface Row {
  id: string;
  username: string | null;
  coins: number;
  total_won: number;
  streak: number;
}

export default function Leaderboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, coins, total_won")
        .order("coins", { ascending: false })
        .limit(100);

      const { data: streakRows } = await supabase
        .from("bets")
        .select("user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);

      const byUser = new Map<string, string[]>();
      for (const row of streakRows ?? []) {
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
          streak: calculateDailyStreak(byUser.get(r.id) ?? []),
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

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-3xl font-black tracking-tight">LEADERBOARD</h1>
          <p className="text-sm text-muted-foreground">Top whales by Mizrahi Coins</p>
        </div>
      </header>

      {loading ? (
        <div className="text-center text-muted-foreground">Loading...</div>
      ) : (
        <Tabs defaultValue="coins" className="space-y-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="coins">Coins</TabsTrigger>
            <TabsTrigger value="streak">Streak</TabsTrigger>
          </TabsList>
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
  mode: "coins" | "streak";
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
                  <div className="truncate font-bold">{r.username ?? "anon"}</div>
                  <div className="text-xs text-muted-foreground">
                    {mode === "coins" ? `Won ${formatCoins(r.total_won)}` : `${r.streak} day streak`}
                  </div>
                </div>
                {mode === "coins" ? (
                  <div className="flex items-center gap-1.5 font-black tabular-nums">
                    <MizrahiCoin size={16} />
                    {formatCoins(r.coins)}
                  </div>
                ) : (
                  <div className="font-black tabular-nums text-primary">{r.streak}🔥</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </TabsContent>
  );
}
