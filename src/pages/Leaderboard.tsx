import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Trophy } from "lucide-react";

interface Row {
  id: string;
  username: string | null;
  coins: number;
  total_won: number;
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
        .limit(50);
      setRows(
        (data ?? []).map((r) => ({
          id: r.id,
          username: r.username,
          coins: Number(r.coins ?? 0),
          total_won: Number(r.total_won ?? 0),
        })),
      );
      setLoading(false);
    })();
  }, []);

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
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const isMe = r.id === user?.id;
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
                    Won {formatCoins(r.total_won)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 font-black tabular-nums">
                  <MizrahiCoin size={16} />
                  {formatCoins(r.coins)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}