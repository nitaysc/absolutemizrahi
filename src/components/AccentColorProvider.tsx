import { useAccentColor } from "@/hooks/useAccentColor";

// This component applies the user's equipped theme color
// It must be rendered inside AuthProvider
export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  useAccentColor();
  return <>{children}</>;
}
