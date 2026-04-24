import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTrackGame } from "@/hooks/usePresence";
import { formatCoins } from "@/lib/format";
import { Spade, Users, Coins, ChevronRight } from "lucide-react";

type TableRow = {
  id: string;
  small_blind: number;
  big_blind: number;
  min_buy_in: number;
  max_buy_in: number;
  seats: number;
  status: string;
};

type SeatRow = { table_id: string };

const TIER_META: Record<string, { label: string; gradient: string }> = {
  micro: { label: "Micro Stakes",    gradient: "from-emerald-700 to-emerald-900" },
  low:   { label: "Low Stakes",      gradient: "from-sky-700 to-indigo-900" },
  mid:   { label: "Mid Stakes",      gradient: "from-violet-700 to-purple-900" },
  high:  { label: "High Stakes",     gradient: "from-rose-700 to-red-900" },
  nose:  { label: "Nosebleed",       gradient: "from-amber-600 to-orange-900" },
};

export default function PokerLobby() {
  useTrackGame("poker");
  const [tables, setTables] = useState<TableRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  async function load() {
    const { data: t } = await supabase
      .from("poker_tables")
      .select("id, small_blind, big_blind, min_buy_in, max_buy_in, seats, status")
      .order("big_blind", { ascending: true });
    const { data: s } = await supabase.from("poker_seats").select("table_id");
    setTables((t ?? []) as TableRow[]);
    const c: Record<string, number> = {};
    ((s ?? []) as SeatRow[]).forEach((row) => { c[row.table_id] = (c[row.table_id] ?? 0) + 1; });
    setCounts(c);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("poker-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "poker_seats" }, () => load())
      .subscribe();
    const id = window.setInterval(load, 5000);
    return () => { supabase.removeChannel(ch); window.clearInterval(id); };
  }, []);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
          <Spade className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> POKER LOBBY
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Texas Hold'em · Pick a table to sit down
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tables.map((t) => {
          const meta = TIER_META[t.id] ?? { label: t.id.toUpperCase(), gradient: "from-slate-700 to-slate-900" };
          const seated = counts[t.id] ?? 0;
          const full = seated >= t.seats;
          return (
            <Link
              key={t.id}
              to={`/poker/${t.id}`}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition hover:border-primary/60 hover:shadow-[0_0_24px_hsl(var(--primary)/0.25)]"
            >
              <div className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${meta.gradient} opacity-30 blur-2xl`} />
              <div className="relative flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full bg-gradient-to-r ${meta.gradient} px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white`}>
                      {meta.label}
                    </span>
                  </div>
                  <h2 className="text-xl font-black tracking-tight">
                    {formatCoins(t.small_blind)} / {formatCoins(t.big_blind)}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Coins className="h-3.5 w-3.5" />
                      Buy-in {formatCoins(t.min_buy_in)}–{formatCoins(t.max_buy_in)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {seated}/{t.seats} seated
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
              </div>
              {full && (
                <p className="relative mt-3 text-xs font-bold uppercase tracking-widest text-amber-400">
                  Table full · join waitlist
                </p>
              )}
            </Link>
          );
        })}
        {tables.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">No poker tables available.</p>
        )}
      </div>
    </div>
  );
}