import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const DAILY_GOAL_ML = 2000; // 2 liters daily goal

export function useWaterIntake() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: todayIntake = [], isLoading } = useQuery({
    queryKey: ["water-intake", user?.id, today],
    queryFn: async () => {
      if (!user) return [];

      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("water_intake")
        .select("*")
        .eq("user_id", user.id)
        .gte("logged_at", startOfDay.toISOString())
        .lte("logged_at", endOfDay.toISOString())
        .order("logged_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const addIntake = useMutation({
    mutationFn: async (amountMl: number) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("water_intake")
        .insert({
          user_id: user.id,
          amount_ml: amountMl,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["water-intake", user?.id, today] });
    },
  });

  const removeLastIntake = useMutation({
    mutationFn: async () => {
      if (!user || todayIntake.length === 0) throw new Error("Nothing to remove");

      const lastEntry = todayIntake[0];
      const { error } = await supabase
        .from("water_intake")
        .delete()
        .eq("id", lastEntry.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["water-intake", user?.id, today] });
    },
  });

  const totalMl = todayIntake.reduce((sum, entry) => sum + entry.amount_ml, 0);
  const progressPercent = Math.min((totalMl / DAILY_GOAL_ML) * 100, 100);
  const glasses = Math.round(totalMl / 250); // Approximate glasses (250ml each)

  return {
    todayIntake,
    totalMl,
    progressPercent,
    glasses,
    dailyGoal: DAILY_GOAL_ML,
    isLoading,
    addIntake: addIntake.mutate,
    removeLastIntake: removeLastIntake.mutate,
    isAdding: addIntake.isPending,
  };
}
