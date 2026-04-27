import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { BarChart3, RefreshCw, X } from "lucide-react";
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

const GAMES = [
  "all",
  "dice",
  "limbo",
  "coinflip",
  "mines",
  "blackjack",
  "crash",
  "chicken",
  "plinko",
  "pump",
  "dragontower",
  "snakes",
  "roulette",
  "keno",
  "slide",
];
const POS_KEY = "liveStats:pos:v1";
const OPEN_KEY = "liveStats:open:v1";
const W = 290;

type Pos = { x: number; y: number };

function defaultPos(): Pos {
  if (typeof window === "undefined") return { x: 16, y: 96 };
  return { x: Math.max(16, window.innerWidth - W - 16), y: 96 };
}

/**
 * Live Stats — a real draggable floating window (Stake-style).
 * Stays open over the page so you can keep playing while watching it.
 * Drag by the title bar. Position + open state persist.
 */
export function LiveStatsWindow() {
  const { user } = useAuth();
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(OPEN_KEY);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  const [pos, setPos] = useState<Pos>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) return JSON.parse(raw) as Pos;
    } catch {
      /* ignore */
    }
    return defaultPos();
  });
  const [bets, setBets] = useState<BetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [game, setGame] = useState<string>("all");
  const dragControls = useDragControls();
  const winRef = useRef<HTMLDivElement | null>(null);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* */ }
  }, [pos]);
  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, open ? "1" : "0"); } catch { /* */ }
  }, [open]);

  // Keep in viewport on resize
  useEffect(() => {
    function clamp() {
      const el = winRef.current;
      const w = el?.offsetWidth ?? W;
      const h = el?.offsetHeight ?? 360;
      setPos((p) => ({
        x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - w - 8)),
        y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - h - 8)),
      }));
    }
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [open]);

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
        // bigint columns can come back as strings in some clients —
        // coerce explicitly so the profit math never silently does
        // string concatenation or NaN arithmetic.
        bet_amount: Number(b.bet_amount) || 0,
        payout: Number(b.payout) || 0,
        won: b.won,
        created_at: b.created_at,
      })),
    );
    setLoading(false);
  }

  // Live-refresh on new bets so it updates while you play.
  useEffect(() => {
    if (!open || !user) return;
    load();
    const ch = supabase
      .channel(`live-stats-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bets", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    // Polling fallback in case the realtime channel hiccups, so wins/losses
    // always reflect on screen without a manual refresh.
    const poll = window.setInterval(load, 4000);
    // Also re-pull when the tab regains focus.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const filtered = useMemo(
    () => (game === "all" ? bets : bets.filter((b) => b.game === game)),
    [bets, game],
  );
  const stats = useMemo(() => {
    let wagered = 0,
      payout = 0,
      wins = 0,
      losses = 0;
    for (const b of filtered) {
      wagered += b.bet_amount;
      payout += b.payout;
      // Source of truth = the `won` boolean each game writes when it
      // settles the bet. Recomputing from payout vs bet got it wrong on
      // pushes (blackjack tie pays back the bet but isn't a win) and on
      // games that intentionally pay <1× as a "win" (chicken/plinko).
      // Pushes (payout == bet AND not flagged won) are excluded from W/L.
      const delta = b.payout - b.bet_amount;
      if (b.won) wins += 1;
      else if (delta < 0) losses += 1;
      // delta === 0 && !won → push, ignore
    }
    return { wagered, payout, profit: payout - wagered, wins, losses };
  }, [filtered]);
  const series = useMemo(() => {
    const ordered = [...filtered].reverse();
    let cum = 0;
    return ordered.map((b, i) => {
      cum += b.payout - b.bet_amount;
      return { i: i + 1, profit: cum };
    });
  }, [filtered]);

  // Profit on the most recent bet — handy at-a-glance "did the last
  // round win?" indicator next to the cumulative profit.
  const lastDelta = filtered[0]
    ? filtered[0].payout - filtered[0].bet_amount
    : 0;

  return (
    <>
      {/* Re-open pill when window closed */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="reopen"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed right-3 bottom-20 z-40 flex items-center gap-1.5 rounded-full border border-primary/40 bg-card/90 px-3 py-2 text-xs font-black uppercase tracking-widest text-primary shadow-[0_8px_24px_hsl(var(--primary)/0.25)] backdrop-blur-xl md:right-4 md:bottom-4"
            aria-label="Open live stats window"
          >
            <BarChart3 className="h-4 w-4" />
            Live Stats
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating window */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="live-stats-window"
            ref={winRef}
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0}
            initial={{ opacity: 0, scale: 0.95, x: pos.x, y: pos.y }}
            animate={{ opacity: 1, scale: 1, x: pos.x, y: pos.y }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            onDragEnd={(_, info) => {
              const next = {
                x: Math.min(
                  Math.max(8, pos.x + info.offset.x),
                  Math.max(8, window.innerWidth - (winRef.current?.offsetWidth ?? W) - 8),
                ),
                y: Math.min(
                  Math.max(8, pos.y + info.offset.y),
                  Math.max(8, window.innerHeight - (winRef.current?.offsetHeight ?? 360) - 8),
                ),
              };
              setPos(next);
            }}
            style={{ width: W, touchAction: "none" }}
            className="fixed left-0 top-0 z-40 overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl"
          >
            {/* Title bar — the only drag handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex cursor-grab select-none items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 py-2 active:cursor-grabbing"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                Live Stats
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={load}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Refresh"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setOpen(false)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-3 pb-3">
              <div className="pb-2 pt-2">
                <Select value={game} onValueChange={setGame}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GAMES.map((g) => (
                      <SelectItem key={g} value={g} className="text-xs capitalize">
                        {g === "all"
                          ? "All games"
                          : g === "dragontower"
                            ? "Dragon Tower"
                            : g === "snakes"
                              ? "Snakes"
                              : g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <StatCell
                  label="Profit"
                  value={`${stats.profit >= 0 ? "+" : ""}${formatCoins(stats.profit)}`}
                  tone={stats.profit >= 0 ? "good" : "bad"}
                  coin
                />
                <StatCell
                  label="Last bet"
                  value={`${lastDelta >= 0 ? "+" : ""}${formatCoins(lastDelta)}`}
                  tone={lastDelta >= 0 ? "good" : "bad"}
                  coin
                />
                <StatCell label="Wagered" value={formatCoins(stats.wagered)} coin />
                <StatCell
                  label="W / L"
                  value={`${stats.wins} / ${stats.losses}`}
                />
              </div>

              <div className="mt-2 h-32 w-full rounded-xl border border-border bg-background/40 p-1.5">
                {series.length < 2 ? (
                  <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                    Play a couple rounds to see your curve.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="lsPos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.55} />
                          <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="lsNeg" x1="0" y1="0" x2="0" y2="1">
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
                        stroke={stats.profit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                        strokeWidth={2}
                        fill={stats.profit >= 0 ? "url(#lsPos)" : "url(#lsNeg)"}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </motion.div>
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
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-0.5 flex items-center gap-1 text-xs font-black tabular-nums ${
          tone === "good"
            ? "text-[hsl(var(--success))]"
            : tone === "bad"
              ? "text-destructive"
              : ""
        }`}
      >
        {coin && <MizrahiCoin size={11} />}
        {value}
      </div>
    </div>
  );
}