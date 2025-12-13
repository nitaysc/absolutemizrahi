import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface AvatarData {
  emoji: string;
  name: string;
}

export function useEquippedAvatar() {
  const { user } = useAuth();

  const { data: avatar } = useQuery({
    queryKey: ["equipped-avatar", user?.id],
    queryFn: async (): Promise<AvatarData | null> => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("user_inventory")
        .select(`
          shop_items!inner (
            name,
            category,
            metadata
          )
        `)
        .eq("user_id", user.id)
        .eq("is_equipped", true)
        .eq("shop_items.category", "avatar")
        .single();

      if (error || !data) return null;

      const shopItem = data.shop_items as unknown as {
        name: string;
        category: string;
        metadata: { emoji?: string } | null;
      };

      return {
        emoji: shopItem.metadata?.emoji || "👤",
        name: shopItem.name,
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  return {
    avatar,
    emoji: avatar?.emoji || "👤",
    name: avatar?.name,
  };
}
