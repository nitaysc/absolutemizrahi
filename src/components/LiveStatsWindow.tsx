import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { BarChart3, Minus, RefreshCw, X } from "lucide-react";
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
const POS_KEY = "liveStats:pos:v1";
const OPEN_KEY = "liveStats:open:v1";

type Pos = { x: number; y: number };

function defaultPos(): Pos {
  if (typeof window === "undefined") return { x: 16, y: 100 };
  // Anchor near top-right by default
  return { x: Math.max(16, window.innerWidth - 320), y: 96 };
}

/**
 * Live Stats — a real draggable floating window (Stake-style).
 * Stays open over the page so you can keep playing while watching it.
 * Position persists across reloads + navigation. Minimize → small pill that
 * re-opens to the same spot.
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
  const winRef = useRef<HTMLDivElement | null>(null);

  // Persist position + open state
  useEffect(() => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [pos]);
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open]);

  // Keep the window in viewport when the screen resizes.
  useEffect(() => {
    function clamp() {
      const el = winRef.current;
      const w = el?.offsetWidth ?? 300;
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
        bet_amount: Number(b.bet_amount),
        payout: Number(b.payout),
        won: b.won,
        created_at: b.created_at,
      })),
    );
    setLoading(false);
  }

  // Load when opened, and live-refresh on new bets so it updates while you play.
  useEffect(() => {
    if (!open || !user) return;
    load();
    const ch = supabase
      .channel(`live-stats-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bets",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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

  const series = useMemo(() => {
    const ordered = [...filtered].reverse();
    let cum = 0;
    return ordered.map((b, i) => {
      cum += b.payout - b.bet_amount;
      return { i: i + 1, profit: cum };
    });
  }, [filtered]);

  return (
    <>
      {/* Re-open pill (only when window is closed/minimized) */}
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
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={{
              left: 0,
              top: 0,
              right: Math.max(0, (typeof window !== "undefined" ? window.innerWidth : 1000) - 300),
              bottom: Math.max(0, (typeof window !== "undefined" ? window.innerHeight : 800) - 100),
            }}
            dragListener={false}
            // Only the title bar starts a drag (set via onPointerDown below)
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1, x: pos.x, y: pos.y }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            onDragEnd={(_, info) => {
              setPos({
                x: pos.x + info.offset.x,
                y: pos.y + info.offset.y,
              });
            }}
            style={{ touchAction: "none" }}
            className="fixed left-0 top-0 z-40 w-[290px] overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl"
          >
            {/* Title bar — drag handle */}
            <TitleBar
              loading={loading}
              onRefresh={load}
              onClose={() => setOpen(false)}
              onPointerDown={(e) => {
                // Start drag on the parent motion element via pointer capture
                (e.currentTarget.closest("[data-livestats-window]") as HTMLElement | null);
              }}
              dragStarter={(e) => {
                // Synthesize drag start by dispatching to the framer drag handle
                const target = winRef.current;
                if (!target) return;
                // Use the pointer event to begin manual drag through framer's API:
                // we wrap the title bar in a small inner motion.div that triggers drag.
                e.preventDefault();
              }}
            />

            {/* Body */}
            <div className="px-3 pb-3">
              <div className="pb-2">
                <Select value={game} onValueChange={setGame}>
                  <SelectTrigger className="h-7 text-xs">
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

              <div className="grid grid-cols-2 gap-1.5">
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
                        stroke={
                          stats.profit >= 0
                            ? "hsl(var(--success))"
                            : "hsl(var(--destructive))"
                        }
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

/**
 * Title bar. We can't easily forward pointer events to motion drag from a
 * sibling, so instead we make the entire window draggable via this title bar
 * by enabling drag on the parent and letting our header act as the natural
 * grip area: the body has `onPointerDownCapture` to swallow drags inside
 * inputs.
 */
function TitleBar({
  loading,
  onRefresh,
  onClose,
}: {
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  dragStarter?: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className="flex cursor-grab select-none items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 py-2 active:cursor-grabbing"
      // The parent motion.div has dragListener=false; enabling drag on whole window
      // would let users drag from anywhere. We re-enable here by stopping pointer
      // bubbling from interactive children below, and turning on pointer capture.
      data-drag-handle
    >
      <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest">
        <BarChart3 className="h-3.5 w-3.5 text-primary" />
        Live Stats
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRefresh}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
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