import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useTaskProgress() {
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  const { data } = useQuery({
    queryKey: ["task-progress", user?.id, today],
    queryFn: async () => {
      if (!user) return { total: 0, completed: 0, hasUnfinished: false };

      // Get today's plan
      const { data: plan } = await supabase
        .from("daily_plans")
        .select("id")
        .eq("user_id", user.id)
        .eq("plan_date", today)
        .single();

      if (!plan) return { total: 0, completed: 0, hasUnfinished: false };

      // Get plan items
      const { data: items } = await supabase
        .from("daily_plan_items")
        .select("is_done")
        .eq("daily_plan_id", plan.id);

      if (!items) return { total: 0, completed: 0, hasUnfinished: false };

      const total = items.length;
      const completed = items.filter((i) => i.is_done).length;

      return {
        total,
        completed,
        hasUnfinished: total > 0 && completed < total,
      };
    },
    enabled: !!user,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  return {
    total: data?.total ?? 0,
    completed: data?.completed ?? 0,
    hasUnfinished: data?.hasUnfinished ?? false,
  };
}
