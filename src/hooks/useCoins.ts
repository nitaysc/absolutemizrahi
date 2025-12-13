import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type CoinReason = 
  | "task_complete" 
  | "daily_bonus" 
  | "streak_bonus" 
  | "milestone" 
  | "purchase";

const COIN_REWARDS = {
  task_complete: 5,
  daily_bonus: 25,
  streak_3: 10,
  streak_7: 25,
  streak_14: 50,
  streak_30: 100,
  streak_60: 200,
  streak_100: 500,
};

export function useCoins() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const addCoinsMutation = useMutation({
    mutationFn: async ({ amount, reason }: { amount: number; reason: CoinReason }) => {
      if (!user) throw new Error("Not authenticated");

      // Get current coins
      const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("coins")
        .eq("id", user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const currentCoins = profile?.coins ?? 0;
      const newCoins = currentCoins + amount;

      // Update coins
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ coins: newCoins })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // Log transaction
      await supabase.from("coin_transactions").insert({
        user_id: user.id,
        amount,
        reason,
      });

      return { newCoins, amount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-coins"] });
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
  });

  const awardTaskComplete = () => {
    addCoinsMutation.mutate({ 
      amount: COIN_REWARDS.task_complete, 
      reason: "task_complete" 
    });
  };

  const awardDailyBonus = () => {
    addCoinsMutation.mutate({ 
      amount: COIN_REWARDS.daily_bonus, 
      reason: "daily_bonus" 
    });
  };

  const awardStreakBonus = (streakDays: number) => {
    let bonus = 0;
    
    if (streakDays === 3) bonus = COIN_REWARDS.streak_3;
    else if (streakDays === 7) bonus = COIN_REWARDS.streak_7;
    else if (streakDays === 14) bonus = COIN_REWARDS.streak_14;
    else if (streakDays === 30) bonus = COIN_REWARDS.streak_30;
    else if (streakDays === 60) bonus = COIN_REWARDS.streak_60;
    else if (streakDays === 100) bonus = COIN_REWARDS.streak_100;

    if (bonus > 0) {
      addCoinsMutation.mutate({ 
        amount: bonus, 
        reason: "streak_bonus" 
      });
    }

    return bonus;
  };

  return {
    addCoins: addCoinsMutation.mutate,
    awardTaskComplete,
    awardDailyBonus,
    awardStreakBonus,
    COIN_REWARDS,
  };
}
