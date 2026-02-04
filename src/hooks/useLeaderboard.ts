import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LeaderboardEntry {
  id: string;
  display_name: string | null;
  total_xp: number;
  current_streak: number;
  current_rank: string;
}

export function useLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  async function fetchLeaderboard() {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, total_xp, current_streak, current_rank')
      .order('total_xp', { ascending: false })
      .order('current_streak', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching leaderboard:', error);
    } else {
      setLeaderboard(data || []);
    }
    setLoading(false);
  }

  return { leaderboard, loading, refetch: fetchLeaderboard };
}
