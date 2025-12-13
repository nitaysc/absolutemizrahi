import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_PRIMARY = "25 95% 53%"; // Orange default

export function useAccentColor() {
  const { user } = useAuth();

  // Fetch equipped theme from user inventory
  const { data: equippedTheme } = useQuery({
    queryKey: ["equipped-theme", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("user_inventory")
        .select("*, shop_items(*)")
        .eq("user_id", user.id)
        .eq("is_equipped", true);

      if (error) throw error;

      // Find equipped theme
      const theme = data?.find((inv: any) => inv.shop_items?.category === "theme");
      return theme?.shop_items ?? null;
    },
    enabled: !!user,
  });

  // Apply the accent color to CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const metadata = equippedTheme?.metadata as Record<string, unknown> | null;
    const color = (metadata?.color as string) ?? DEFAULT_PRIMARY;

    // Update CSS variables for primary color
    root.style.setProperty("--primary", color);
    root.style.setProperty("--ring", color);
    root.style.setProperty("--sidebar-primary", color);
    root.style.setProperty("--sidebar-ring", color);

    // Clean up on unmount
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--sidebar-primary");
      root.style.removeProperty("--sidebar-ring");
    };
  }, [equippedTheme]);

  const metadata = equippedTheme?.metadata as Record<string, unknown> | null;

  return {
    equippedTheme,
    currentColor: (metadata?.color as string) ?? DEFAULT_PRIMARY,
    themeName: equippedTheme?.name ?? "Default Orange",
  };
}
