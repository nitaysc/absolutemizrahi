import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { toast } from "sonner";
import { Swords, Plus, Users, Zap, Lock, Bot } from "lucide-react";

type Battle = {
  id: string;
  mode: string;
  type: string;
  status: string;
  total_cost: number;
  per_player_cost: number;
  player_slots: number;
  fast: boolean;
  is_private: boolean;
  fill_with_bots: boolean;
  rounds_total: number;
  current_round: number;
  created_at: string;
};

export default function CaseBattles() {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function load() {
    const { data } = await supabase
      .from("case_battles")
      .select("*")
      .in("status", ["waiting", "running"])
      .eq("is_private", false)
      .order("created_at", { ascending: false })
      .limit(50);
    setBattles((data ?? []) as Battle[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("battles-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "case_battles" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card/70 p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Case Battles</p>
          <h1 className="text-2xl font-black sm:text-3xl">Open cases against players</h1>
        </div>
        <Link
          to="/cases/battles/new"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 font-bold text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.5)]"
        >
          <Plus className="h-4 w-4" /> Create Battle
        </Link>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : battles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No active battles. Be the first to create one!
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {battles.map((b) => (
            <button
              key={b.id}
              onClick={() => navigate(`/cases/battles/${b.id}`)}
              className="group flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Swords className="h-4 w-4 text-primary" />
                  <span className="font-bold">{b.mode.toUpperCase()}</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                    {b.type}
                  </span>
                  {b.fast && <Zap className="h-3 w-3 text-amber-400" />}
                  {b.fill_with_bots && <Bot className="h-3 w-3 text-muted-foreground" />}
                  {b.is_private && <Lock className="h-3 w-3 text-muted-foreground" />}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" /> {b.player_slots} slots · {b.rounds_total} rounds ·{" "}
                  {b.status}
                </div>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-1 font-black text-primary">
                  <MizrahiCoin size={14} /> {formatCoins(b.total_cost)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCoins(b.per_player_cost)} / player
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}