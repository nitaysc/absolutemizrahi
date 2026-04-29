import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/* -------------------------------------------------------------------------- */
/*                              TYPES & HELPERS                               */
/* -------------------------------------------------------------------------- */

export type ProgressionEvent = {
  id: string;
  kind: "xp" | "level_up" | "mission_complete" | "achievement" | "streak";
  payload: Record<string, unknown>;
  created_at: string;
};

export type Mission = {
  id: string;
  kind: string;
  description: string;
  target: number;
  progress: number;
  reward_coins: number;
  reward_xp: number;
  completed: boolean;
  expires_at: string;
};

export type Achievement = {
  code: string;
  name: string;
  description: string;
  icon: string;
  reward_coins: number;
  reward_xp: number;
  category: string;
  unlocked_at?: string | null;
};

export type ProgressionStats = {
  level: number;
  xp: number;
  xp_total: number;
  streak_days: number;
  last_streak_claim: string | null;
  xp_booster_until: string | null;
};

/** Same curve as DB: floor(100 * level^1.55), min 100. */
export function xpForLevel(level: number) {
  return Math.max(100, Math.floor(100 * Math.pow(Math.max(level, 1), 1.55)));
}

export function titleForLevel(level: number): string {
  if (level >= 100) return "Mizrahi Legend";
  if (level >= 75) return "Whale";
  if (level >= 50) return "High Roller";
  if (level >= 35) return "Risk Taker";
  if (level >= 25) return "Veteran";
  if (level >= 15) return "Grinder";
  if (level >= 10) return "Hustler";
  if (level >= 5) return "Apprentice";
  return "Beginner";
}

export function badgeColorForLevel(level: number): string {
  if (level >= 100) return "from-yellow-300 to-amber-500 text-amber-950";
  if (level >= 75) return "from-fuchsia-400 to-rose-500 text-rose-950";
  if (level >= 50) return "from-rose-400 to-orange-500 text-orange-950";
  if (level >= 35) return "from-orange-400 to-amber-500 text-amber-950";
  if (level >= 25) return "from-emerald-400 to-teal-500 text-emerald-950";
  if (level >= 15) return "from-sky-400 to-blue-500 text-sky-950";
  if (level >= 10) return "from-violet-400 to-indigo-500 text-violet-950";
  if (level >= 5) return "from-slate-300 to-slate-500 text-slate-900";
  return "from-zinc-400 to-zinc-600 text-zinc-900";
}

/* -------------------------------------------------------------------------- */
/*                                  CONTEXT                                   */
/* -------------------------------------------------------------------------- */

interface Ctx {
  stats: ProgressionStats | null;
  missions: Mission[];
  weeklyMissions: Mission[];
  achievements: Achievement[]; // catalog + unlocked merged
  unlockedCodes: Set<string>;
  /** Pending visual events to show (level ups, achievements, missions, streak). */
  popQueue: ProgressionEvent[];
  /** Live XP gain ticks for the floating "+XP" indicator. */
  xpTicks: { id: string; amount: number }[];
  /** Pop one (the consumer dismisses after animating). */
  consumePop: (id: string) => void;
  consumeTick: (id: string) => void;
  refresh: () => Promise<void>;
  rollMissions: () => Promise<void>;
  rollWeeklyMissions: () => Promise<void>;
  claimStreak: () => Promise<{ already: boolean; coins: number; day: number } | null>;
}

const ProgressionContext = createContext<Ctx | null>(null);

export function ProgressionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProgressionStats | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [weeklyMissions, setWeeklyMissions] = useState<Mission[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [unlockedCodes, setUnlockedCodes] = useState<Set<string>>(new Set());
  const [popQueue, setPopQueue] = useState<ProgressionEvent[]>([]);
  const [xpTicks, setXpTicks] = useState<{ id: string; amount: number }[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  /* ------------------------------ data loading ----------------------------- */
  const refresh = useCallback(async () => {
    if (!user) return;
    const [{ data: prof }, { data: ach }, { data: ua }] = await Promise.all([
      supabase
        .from("profiles")
        .select("level,xp,xp_total,streak_days,last_streak_claim,xp_booster_until")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("achievements").select("*"),
      supabase.from("user_achievements").select("code,unlocked_at").eq("user_id", user.id),
    ]);

    if (prof) {
      setStats({
        level: Number(prof.level ?? 1),
        xp: Number(prof.xp ?? 0),
        xp_total: Number(prof.xp_total ?? 0),
        streak_days: Number(prof.streak_days ?? 0),
        last_streak_claim: prof.last_streak_claim ?? null,
        xp_booster_until: prof.xp_booster_until ?? null,
      });
    }
    const unlockedMap = new Map<string, string>(
      (ua ?? []).map((r) => [r.code, r.unlocked_at as string]),
    );
    setUnlockedCodes(new Set(unlockedMap.keys()));
    setAchievements(
      (ach ?? []).map((a) => ({
        ...a,
        unlocked_at: unlockedMap.get(a.code) ?? null,
      })) as Achievement[],
    );

    // Missions: load active, auto-roll if none active
    const { data: msn } = await supabase
      .from("daily_missions")
      .select("*")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at");
    if (!msn || msn.length < 3) {
      const { data: rolled } = await supabase.rpc("roll_daily_missions");
      setMissions((rolled ?? []) as Mission[]);
    } else {
      setMissions(msn as Mission[]);
    }

    // Weekly missions: load active, auto-roll if fewer than 3
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const { data: wmsn } = await sb
      .from("weekly_missions")
      .select("*")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at");
    if (!wmsn || wmsn.length < 3) {
      const { data: rolled } = await sb.rpc("roll_weekly_missions");
      setWeeklyMissions((rolled ?? []) as Mission[]);
    } else {
      setWeeklyMissions(wmsn as Mission[]);
    }
  }, [user]);

  const rollMissions = useCallback(async () => {
    const { data } = await supabase.rpc("roll_daily_missions");
    if (data) setMissions(data as Mission[]);
  }, []);

  const rollWeeklyMissions = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc("roll_weekly_missions");
    if (data) setWeeklyMissions(data as Mission[]);
  }, []);

  const claimStreak = useCallback(async () => {
    const { data } = await supabase.rpc("claim_daily_streak");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    await refresh();
    return {
      already: !!row.already_claimed,
      coins: Number(row.reward_coins ?? 0),
      day: Number(row.streak_days ?? 0),
    };
  }, [refresh]);

  /* --------------------------- ingest events stream ------------------------ */
  const ingest = useCallback((evt: ProgressionEvent) => {
    if (seenIds.current.has(evt.id)) return;
    seenIds.current.add(evt.id);
    if (evt.kind === "xp") {
      const amt = Number((evt.payload as { amount?: number }).amount ?? 0);
      if (amt > 0) {
        setXpTicks((q) => [...q, { id: evt.id, amount: amt }]);
      }
      // mark seen immediately, no need to keep around
      void supabase.rpc("mark_progression_events_seen", { _ids: [evt.id] });
    } else {
      setPopQueue((q) => [...q, evt]);
    }
  }, []);

  /* ------------------------- initial load + realtime ----------------------- */
  useEffect(() => {
    if (!user) {
      setStats(null);
      setMissions([]);
      setWeeklyMissions([]);
      setAchievements([]);
      setUnlockedCodes(new Set());
      setPopQueue([]);
      setXpTicks([]);
      seenIds.current.clear();
      return;
    }
    refresh();

    // Pull recent unseen events (catch-up).
    // IMPORTANT: only replay events from the last 60s so a page refresh does
    // NOT re-fire every level-up / achievement pop-up the user already saw.
    // Older unseen events are silently marked seen so they don't pile up.
    (async () => {
      const cutoffIso = new Date(Date.now() - 60_000).toISOString();
      const { data } = await supabase
        .from("progression_events")
        .select("*")
        .eq("user_id", user.id)
        .eq("seen", false)
        .order("created_at", { ascending: true })
        .limit(100);
      const recent: ProgressionEvent[] = [];
      const stale: string[] = [];
      (data ?? []).forEach((e) => {
        const evt = e as ProgressionEvent;
        if (evt.created_at >= cutoffIso) recent.push(evt);
        else stale.push(evt.id);
      });
      if (stale.length > 0) {
        void supabase.rpc("mark_progression_events_seen", { _ids: stale });
      }
      recent.forEach((evt) => ingest(evt));
    })();

    // Realtime subscription
    const ch = supabase
      .channel(`prog-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "progression_events",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          ingest(payload.new as ProgressionEvent);
          // Refresh underlying data so dashboard is in sync.
          // Throttle: refresh on non-xp events; XP-only ticks don't need a full refetch every time.
          const k = (payload.new as ProgressionEvent).kind;
          if (k !== "xp") refresh();
          else {
            // refresh stats only (cheap)
            void (async () => {
              const { data: prof } = await supabase
                .from("profiles")
                .select("level,xp,xp_total,streak_days,last_streak_claim,xp_booster_until")
                .eq("id", user.id)
                .maybeSingle();
              if (prof) {
                setStats({
                  level: Number(prof.level ?? 1),
                  xp: Number(prof.xp ?? 0),
                  xp_total: Number(prof.xp_total ?? 0),
                  streak_days: Number(prof.streak_days ?? 0),
                  last_streak_claim: prof.last_streak_claim ?? null,
                  xp_booster_until: prof.xp_booster_until ?? null,
                });
              }
            })();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, refresh, ingest]);

  const consumePop = useCallback((id: string) => {
    setPopQueue((q) => q.filter((e) => e.id !== id));
    void supabase.rpc("mark_progression_events_seen", { _ids: [id] });
  }, []);
  const consumeTick = useCallback((id: string) => {
    setXpTicks((q) => q.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      stats,
      missions,
      weeklyMissions,
      achievements,
      unlockedCodes,
      popQueue,
      xpTicks,
      consumePop,
      consumeTick,
      refresh,
      rollMissions,
      rollWeeklyMissions,
      claimStreak,
    }),
    [
      stats,
      missions,
      weeklyMissions,
      achievements,
      unlockedCodes,
      popQueue,
      xpTicks,
      consumePop,
      consumeTick,
      refresh,
      rollMissions,
      rollWeeklyMissions,
      claimStreak,
    ],
  );

  return <ProgressionContext.Provider value={value}>{children}</ProgressionContext.Provider>;
}

export function useProgression() {
  const ctx = useContext(ProgressionContext);
  if (!ctx) throw new Error("useProgression must be used inside <ProgressionProvider>");
  return ctx;
}
