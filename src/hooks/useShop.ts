import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useHaptics } from "@/hooks/useHaptics";

export interface ShopItem {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price: number;
  streak_requirement: number;
  metadata: Record<string, any>;
  rarity: string;
}

export interface UserInventoryItem {
  id: string;
  item_id: string;
  is_equipped: boolean;
  purchased_at: string;
  shop_items: ShopItem;
}

export function useShop() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const haptics = useHaptics();

  // Fetch all shop items
  const { data: shopItems, isLoading: loadingItems } = useQuery({
    queryKey: ["shop-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_items")
        .select("*")
        .order("price", { ascending: true });

      if (error) throw error;
      return data as ShopItem[];
    },
  });

  // Fetch user's inventory
  const { data: inventory, isLoading: loadingInventory } = useQuery({
    queryKey: ["user-inventory", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_inventory")
        .select("*, shop_items(*)")
        .eq("user_id", user.id);

      if (error) throw error;
      return data as UserInventoryItem[];
    },
    enabled: !!user,
  });

  // Fetch user's coin balance
  const { data: userCoins, isLoading: loadingCoins } = useQuery({
    queryKey: ["user-coins", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from("profiles")
        .select("coins")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data?.coins ?? 0;
    },
    enabled: !!user,
  });

  // Fetch user's current streak for prestige requirements
  const { data: userStreak } = useQuery({
    queryKey: ["user-streak-shop", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from("streaks")
        .select("current_streak")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data?.current_streak ?? 0;
    },
    enabled: !!user,
  });

  // Purchase item mutation
  const purchaseMutation = useMutation({
    mutationFn: async (item: ShopItem) => {
      if (!user) throw new Error("Not authenticated");

      // Check if already owned
      const owned = inventory?.some((inv) => inv.item_id === item.id);
      if (owned) throw new Error("Item already owned");

      // Check coins
      if ((userCoins ?? 0) < item.price) {
        throw new Error("Not enough coins");
      }

      // Check streak requirement
      if (item.streak_requirement > 0 && (userStreak ?? 0) < item.streak_requirement) {
        throw new Error(`Requires ${item.streak_requirement}-day streak`);
      }

      // Deduct coins
      const { error: coinsError } = await supabase
        .from("profiles")
        .update({ coins: (userCoins ?? 0) - item.price })
        .eq("id", user.id);

      if (coinsError) throw coinsError;

      // Add to inventory
      const { error: invError } = await supabase
        .from("user_inventory")
        .insert({ user_id: user.id, item_id: item.id });

      if (invError) throw invError;

      // Log transaction
      await supabase.from("coin_transactions").insert({
        user_id: user.id,
        amount: -item.price,
        reason: "purchase",
      });

      return item;
    },
    onSuccess: (item) => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ["user-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["user-coins"] });
      toast({
        title: "🎉 Item Unlocked!",
        description: `You now own ${item.name}`,
      });
    },
    onError: (error: Error) => {
      haptics.error();
      toast({
        title: "Purchase Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Equip item mutation
  const equipMutation = useMutation({
    mutationFn: async ({ itemId, category }: { itemId: string; category: string }) => {
      if (!user) throw new Error("Not authenticated");

      // Unequip all items of same category first
      const sameCategory = inventory?.filter(
        (inv) => inv.shop_items.category === category && inv.is_equipped
      );

      for (const inv of sameCategory ?? []) {
        await supabase
          .from("user_inventory")
          .update({ is_equipped: false })
          .eq("id", inv.id);
      }

      // Equip selected item
      const { error } = await supabase
        .from("user_inventory")
        .update({ is_equipped: true })
        .eq("user_id", user.id)
        .eq("item_id", itemId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      haptics.medium();
      // Refresh inventory and equipped items so they update instantly
      queryClient.invalidateQueries({ queryKey: ["user-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["equipped-theme", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["equipped-avatar", user?.id] });
      toast({
        title: "✨ Equipped!",
        description: "Your new style is active",
      });
    },
  });

  // Unequip item mutation
  const unequipMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_inventory")
        .update({ is_equipped: false })
        .eq("user_id", user.id)
        .eq("item_id", itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      haptics.light();
      queryClient.invalidateQueries({ queryKey: ["user-inventory"] });
      // Refresh equipped items so they reset when unequipping
      queryClient.invalidateQueries({ queryKey: ["equipped-theme", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["equipped-avatar", user?.id] });
    },
  });

  // Get equipped items by category
  const getEquippedItem = (category: string) => {
    return inventory?.find(
      (inv) => inv.shop_items.category === category && inv.is_equipped
    );
  };

  // Check if item is owned
  const isOwned = (itemId: string) => {
    return inventory?.some((inv) => inv.item_id === itemId);
  };

  // Check if item can be purchased (coins + streak)
  const canPurchase = (item: ShopItem) => {
    if (isOwned(item.id)) return false;
    if ((userCoins ?? 0) < item.price) return false;
    if (item.streak_requirement > 0 && (userStreak ?? 0) < item.streak_requirement) return false;
    return true;
  };

  return {
    shopItems,
    inventory,
    userCoins: userCoins ?? 0,
    userStreak: userStreak ?? 0,
    loading: loadingItems || loadingInventory || loadingCoins,
    purchaseItem: purchaseMutation.mutate,
    equipItem: equipMutation.mutate,
    unequipItem: unequipMutation.mutate,
    getEquippedItem,
    isOwned,
    canPurchase,
    isPurchasing: purchaseMutation.isPending,
  };
}
