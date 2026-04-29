import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateDailyStreak, getStreakTimezone } from "@/lib/streak";

/**
 * Single source of truth for the daily-bet streak shown across the app
 * (profile header, progression hero, friends list, etc.). Reads from the
 * public `get_user_bet_days` RPC so it works for any user id, then derives
 * the streak in the chosen timezone.
 *
 * Pass `userId = null` to skip (returns 0).
 */
export function useBetStreak(userId: string | null | undefined): number {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!userId) {
      setStreak(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_user_bet_days", {
        _user_ids: [userId],
        _limit_per_user: 200,
      });
      if (cancelled) return;
      const tz = getStreakTimezone();
      const days = (data ?? []).map((r: { created_at: string }) => r.created_at);
      setStreak(calculateDailyStreak(days, new Date(), tz));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return streak;
}
