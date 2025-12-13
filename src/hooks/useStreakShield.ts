import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export function useStreakShield() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch user's streak shields count
  const { data: shieldCount = 0 } = useQuery({
    queryKey: ["streak-shields", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data } = await supabase
        .from("profiles")
        .select("streak_shields")
        .eq("id", user.id)
        .single();
      return data?.streak_shields ?? 0;
    },
    enabled: !!user,
  });

  // Purchase a streak shield
  const purchaseShieldMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      // Get current coins and shields
      const { data: profile } = await supabase
        .from("profiles")
        .select("coins, streak_shields")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const shieldPrice = 150;
      if ((profile.coins ?? 0) < shieldPrice) {
        throw new Error("Not enough coins");
      }

      // Update coins and shields
      const { error } = await supabase
        .from("profiles")
        .update({
          coins: (profile.coins ?? 0) - shieldPrice,
          streak_shields: (profile.streak_shields ?? 0) + 1,
        })
        .eq("id", user.id);

      if (error) throw error;

      // Log transaction
      await supabase.from("coin_transactions").insert({
        user_id: user.id,
        amount: -shieldPrice,
        reason: "purchase",
      });

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streak-shields"] });
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["user-coins"] });
      toast({
        title: "🛡️ Streak Shield Acquired!",
        description: "Your next missed day will be protected.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Purchase failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Use a streak shield (called when streak would break)
  const useShieldMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("streak_shields")
        .eq("id", user.id)
        .single();

      if (!profile || (profile.streak_shields ?? 0) < 1) {
        throw new Error("No shields available");
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          streak_shields: (profile.streak_shields ?? 0) - 1,
        })
        .eq("id", user.id);

      if (error) throw error;

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streak-shields"] });
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
  });

  return {
    shieldCount,
    purchaseShield: purchaseShieldMutation.mutate,
    useShield: useShieldMutation.mutateAsync,
    isPurchasing: purchaseShieldMutation.isPending,
  };
}
