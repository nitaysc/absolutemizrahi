import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useDragControls, PanInfo } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { BarChart3, ChevronUp, RefreshCw, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type BetRow = {
  id: string;
  game: string;
  bet_amount: number;
  payout: number;
  won: boolean;
  created_at: string;
};

const GAMES = ["all", "dice", "limbo", "coinflip", "mines", "blackjack", "crash"];

/**
 * Floating "Live Stats" tab — Stake-style.
 * - Compact pill in the corner; tap or drag up to open.
 * - On mobile: bottom sheet with drag-to-close handle.
 * - On desktop: side drawer pinned to the right edge.
 */
export function LiveStatsDrawer() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [bets, setBets] = useState<BetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [game, setGame] = useState<string>("all");
  const dragControls = useDragControls();

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("bets")
      .select("id, game, bet_amount, payout, won, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setBets(
      (data ?? []).map((b) => ({
        id: b.id,
        game: b.game,
        bet_amount: Number(b.bet_amount),
        payout: Number(b.payout),
        won: b.won,
        created_at: b.created_at,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const filtered = useMemo(
    () => (game === "all" ? bets : bets.filter((b) => b.game === game)),
    [bets, game],
  );

  const stats = useMemo(() => {
    let wagered = 0;
    let payout = 0;
    let wins = 0;
    let losses = 0;
    for (const b of filtered) {
      wagered += b.bet_amount;
      payout += b.payout;
      if (b.won) wins += 1;
      else losses += 1;
    }
    return { wagered, payout, profit: payout - wagered, wins, losses };
  }, [filtered]);

  // Cumulative profit series, oldest -> newest
  const series = useMemo(() => {
    const ordered = [...filtered].reverse();
    let cum = 0;
    return ordered.map((b, i) => {
      cum += b.payout - b.bet_amount;
      return { i: i + 1, profit: cum };
    });
  }, [filtered]);

  function onHandleDrag(_: unknown, info: PanInfo) {
    if (info.offset.y > 80) setOpen(false);
  }

  return (
    <>
      {/* Floating launcher pill (hidden when open) */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="launcher"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed right-3 bottom-20 z-40 flex items-center gap-1.5 rounded-full border border-primary/40 bg-card/90 px-3 py-2 text-xs font-black uppercase tracking-widest text-primary shadow-[0_8px_24px_hsl(var(--primary)/0.25)] backdrop-blur-xl md:right-4 md:bottom-4"
            aria-label="Open live stats"
          >
            <BarChart3 className="h-4 w-4" />
            Live Stats
            <ChevronUp className="h-3 w-3" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm"
            />

            {/* Sheet */}
            <motion.aside
              key="sheet"
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={onHandleDrag}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:max-w-sm md:rounded-l-3xl md:rounded-tr-none md:border-l"
            >
              {/* Drag handle (mobile) */}
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex cursor-grab justify-center pt-2 pb-1 active:cursor-grabbing md:hidden"
              >
                <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between gap-2 px-4 py-2">
                <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                  <BarChart3 className="h-4 w-4 text-primary" /> Live Stats
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={load}
                    className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label="Refresh"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Game filter */}
              <div className="px-4 pb-2">
                <Select value={game} onValueChange={setGame}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GAMES.map((g) => (
                      <SelectItem key={g} value={g} className="text-xs capitalize">
                        {g === "all" ? "All games" : g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 px-4">
                <StatCell
                  label="Profit"
                  value={`${stats.profit >= 0 ? "+" : ""}${formatCoins(stats.profit)}`}
                  tone={stats.profit >= 0 ? "good" : "bad"}
                  coin
                />
                <StatCell label="Wins" value={String(stats.wins)} tone="good" />
                <StatCell label="Wagered" value={formatCoins(stats.wagered)} coin />
                <StatCell label="Losses" value={String(stats.losses)} tone="bad" />
              </div>

              {/* Chart */}
              <div className="mt-3 flex-1 overflow-hidden px-2 pb-4">
                <div className="h-44 w-full rounded-2xl border border-border bg-background/40 p-2">
                  {series.length < 2 ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Play a couple rounds to see your curve.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="profitFillPos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="profitFillNeg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="i" hide />
                        <YAxis hide domain={["auto", "auto"]} />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 11,
                          }}
                          labelFormatter={(v) => `Bet #${v}`}
                          formatter={(v: number) => [formatCoins(v), "Profit"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="profit"
                          stroke={
                            stats.profit >= 0
                              ? "hsl(var(--success))"
                              : "hsl(var(--destructive))"
                          }
                          strokeWidth={2}
                          fill={
                            stats.profit >= 0
                              ? "url(#profitFillPos)"
                              : "url(#profitFillNeg)"
                          }
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function StatCell({
  label,
  value,
  tone,
  coin,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  coin?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-0.5 flex items-center gap-1 text-sm font-black tabular-nums ${
          tone === "good"
            ? "text-[hsl(var(--success))]"
            : tone === "bad"
              ? "text-destructive"
              : ""
        }`}
      >
        {coin && <MizrahiCoin size={12} />}
        {value}
      </div>
    </div>
  );
}