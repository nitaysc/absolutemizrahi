import { useEffect, useRef } from "react";
import { useAccentColor } from "@/hooks/useAccentColor";

// This component applies the user's equipped theme color
// It must be rendered inside AuthProvider
export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const { currentColor } = useAccentColor();
  const previousColorRef = useRef<string | null>(null);

  // Add a smooth fade/transition class whenever the accent color changes
  useEffect(() => {
    const root = document.documentElement;

    if (previousColorRef.current && previousColorRef.current !== currentColor) {
      root.classList.add("theme-transition");
      const timeout = setTimeout(() => {
        root.classList.remove("theme-transition");
      }, 300);
      return () => clearTimeout(timeout);
    }

    previousColorRef.current = currentColor;
  }, [currentColor]);

  return <>{children}</>;
}
