import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useThemePreview } from "@/contexts/ThemePreviewContext";

const DEFAULT_PRIMARY = "25 95% 53%"; // Orange default

export function useAccentColor() {
  const { user } = useAuth();
  const { previewColor } = useThemePreview();

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

  // Derive the equipped color
  const metadata = equippedTheme?.metadata as Record<string, unknown> | null;
  const equippedRawColor = (metadata?.color as string) ?? DEFAULT_PRIMARY;
  const hslPattern = /^\d+\s+\d+%\s+\d+%$/;
  const equippedColor = hslPattern.test(equippedRawColor) ? equippedRawColor : DEFAULT_PRIMARY;

  // Preview color takes priority over equipped color
  const activeColor = previewColor && hslPattern.test(previewColor) ? previewColor : equippedColor;

  // Apply the accent color to CSS variables
  useEffect(() => {
    const root = document.documentElement;

    // Update CSS variables for primary color (used via hsl(var(--primary)))
    root.style.setProperty("--primary", activeColor);
    root.style.setProperty("--ring", activeColor);
    root.style.setProperty("--sidebar-primary", activeColor);
    root.style.setProperty("--sidebar-ring", activeColor);

    // Clean up on unmount
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--sidebar-primary");
      root.style.removeProperty("--sidebar-ring");
    };
  }, [activeColor]);

  return {
    equippedTheme,
    currentColor: activeColor,
    equippedColor,
    isPreviewActive: !!previewColor,
    themeName: equippedTheme?.name ?? "Default Orange",
  };
}
