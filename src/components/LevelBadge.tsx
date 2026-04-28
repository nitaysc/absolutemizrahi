import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { badgeColorForLevel, titleForLevel } from "@/hooks/useProgression";
import { cn } from "@/lib/utils";

/** Tiny level badge to display next to a username anywhere. */
export function LevelBadge({
  level,
  size = "sm",
  className,
}: {
  level: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const sizeClass =
    size === "xs"
      ? "h-4 min-w-4 px-1 text-[9px]"
      : size === "md"
        ? "h-7 min-w-7 px-1.5 text-xs"
        : "h-5 min-w-5 px-1 text-[10px]";
  return (
    <span
      title={`Lvl ${level} · ${titleForLevel(level)}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-gradient-to-br font-black",
        badgeColorForLevel(level),
        sizeClass,
        className,
      )}
    >
      {level}
    </span>
  );
}

/** Fetches a user's level by id (cheap, single column). */
export function useUserLevel(userId: string | null | undefined) {
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("level")
        .eq("id", userId)
        .maybeSingle();
      if (!cancelled && data) setLevel(Number(data.level ?? 1));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return level;
}
