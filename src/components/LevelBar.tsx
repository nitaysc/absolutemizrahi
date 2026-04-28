import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useProgression, xpForLevel, badgeColorForLevel, titleForLevel } from "@/hooks/useProgression";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

/** Compact level bar shown in the header. */
export function LevelBar({ className }: { className?: string }) {
  const { stats, xpTicks, consumeTick } = useProgression();
  const [pulseKey, setPulseKey] = useState(0);
  const prevLvl = useRef<number | null>(null);

  useEffect(() => {
    if (!stats) return;
    if (prevLvl.current !== null && stats.level > prevLvl.current) {
      setPulseKey((k) => k + 1);
    }
    prevLvl.current = stats.level;
  }, [stats?.level]);

  if (!stats) return null;
  const need = xpForLevel(stats.level);
  const pct = Math.max(0, Math.min(100, (stats.xp / need) * 100));
  const boosterActive =
    !!stats.xp_booster_until && new Date(stats.xp_booster_until).getTime() > Date.now();

  return (
    <div className={cn("relative flex items-center gap-2", className)}>
      <motion.div
        key={pulseKey}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.18, 1] }}
        transition={{ duration: 0.6 }}
        className={cn(
          "flex h-8 min-w-8 items-center justify-center rounded-lg bg-gradient-to-br px-1.5 text-xs font-black shadow-[0_0_12px_hsl(var(--primary)/0.4)]",
          badgeColorForLevel(stats.level),
        )}
        title={titleForLevel(stats.level)}
      >
        {stats.level}
      </motion.div>

      <div className="relative h-2.5 w-28 overflow-hidden rounded-full border border-border/60 bg-card/80 sm:w-40">
        <motion.div
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", damping: 22, stiffness: 120 }}
          className="h-full bg-gradient-to-r from-primary via-amber-400 to-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)]"
        />
        {/* shimmer */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-10 w-10 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          animate={{ x: ["0%", "300%"] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {boosterActive && (
        <span
          title="2x XP active"
          className="hidden items-center gap-1 rounded-full border border-amber-300/50 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-black text-amber-200 sm:inline-flex"
        >
          <Sparkles className="h-3 w-3" /> 2x
        </span>
      )}

      {/* floating +XP ticks */}
      <div className="pointer-events-none absolute -top-3 right-0 z-10">
        {xpTicks.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 0, scale: 0.7 }}
            animate={{ opacity: 1, y: -22, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
            onAnimationComplete={() => setTimeout(() => consumeTick(t.id), 100)}
            className="absolute right-0 whitespace-nowrap rounded-full bg-primary/90 px-1.5 py-0.5 text-[10px] font-black text-primary-foreground shadow-[0_0_10px_hsl(var(--primary)/0.6)]"
          >
            +{t.amount} XP
          </motion.div>
        ))}
      </div>
    </div>
  );
}
