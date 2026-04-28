import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { useProgression, titleForLevel, badgeColorForLevel } from "@/hooks/useProgression";
import { MizrahiCoin } from "./MizrahiCoin";
import { Sparkles, Trophy, Target, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

/** Renders one popup at a time from the queue, dismisses after a few seconds. */
export function ProgressionOverlay() {
  const { popQueue, consumePop } = useProgression();
  const current = popQueue[0];

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => consumePop(current.id), 3800);
    return () => clearTimeout(t);
  }, [current, consumePop]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4">
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: -30, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: "spring", damping: 18, stiffness: 220 }}
            className="pointer-events-auto"
            onClick={() => consumePop(current.id)}
          >
            <PopCard event={current} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PopCard({ event }: { event: ReturnType<typeof useProgression>["popQueue"][number] }) {
  const p = event.payload as Record<string, unknown>;

  if (event.kind === "level_up") {
    const lvl = Number(p.new_level ?? 1);
    const reward = Number(p.coins_reward ?? 0);
    const milestone10 = !!p.milestone_10;
    const milestone5 = !!p.milestone_5;
    return (
      <div className="relative">
        {(milestone10 || milestone5) && <Confetti big={milestone10} />}
        <div
          className={cn(
            "relative w-[300px] overflow-hidden rounded-2xl border-2 p-4 shadow-2xl backdrop-blur-xl",
            milestone10
              ? "border-amber-300 bg-gradient-to-br from-amber-500/30 via-orange-600/30 to-rose-600/30 shadow-[0_0_60px_hsl(45_100%_60%/0.6)]"
              : milestone5
                ? "border-fuchsia-300 bg-gradient-to-br from-fuchsia-500/25 to-purple-700/30 shadow-[0_0_50px_hsl(290_90%_60%/0.5)]"
                : "border-primary/60 bg-gradient-to-br from-primary/15 to-amber-600/15 shadow-[0_0_40px_hsl(var(--primary)/0.5)]",
          )}
        >
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ rotate: -20, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", damping: 10, stiffness: 200, delay: 0.05 }}
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br text-2xl font-black",
                badgeColorForLevel(lvl),
              )}
            >
              {lvl}
            </motion.div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-200">
                Level up!
              </p>
              <p className="truncate text-lg font-black">{titleForLevel(lvl)}</p>
              {reward > 0 && (
                <div className="mt-1 flex items-center gap-1 text-sm font-bold text-emerald-300">
                  <MizrahiCoin size={14} /> +{reward.toLocaleString()}
                </div>
              )}
              {milestone10 && (
                <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-amber-200">
                  ★ Milestone · 1h 2× XP booster
                </p>
              )}
              {milestone5 && !milestone10 && (
                <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-fuchsia-200">
                  ★ Milestone bonus
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (event.kind === "achievement") {
    return (
      <div className="relative">
        <Confetti />
        <div className="relative w-[300px] overflow-hidden rounded-2xl border-2 border-amber-300/70 bg-gradient-to-br from-amber-500/25 via-yellow-600/20 to-orange-700/25 p-4 shadow-[0_0_50px_hsl(45_95%_55%/0.55)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0, rotate: -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", damping: 9, stiffness: 220 }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-300/30 text-3xl shadow-[0_0_20px_hsl(45_95%_55%/0.7)]"
            >
              {String(p.icon ?? "🏆")}
            </motion.div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-amber-200">
                <Trophy className="h-3 w-3" /> Achievement unlocked
              </p>
              <p className="truncate text-base font-black">{String(p.name ?? "")}</p>
              <p className="line-clamp-2 text-[11px] text-amber-100/80">
                {String(p.description ?? "")}
              </p>
              {Number(p.reward_coins ?? 0) > 0 && (
                <div className="mt-1 flex items-center gap-1 text-sm font-bold text-emerald-300">
                  <MizrahiCoin size={14} /> +{Number(p.reward_coins).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (event.kind === "mission_complete") {
    return (
      <div className="w-[280px] overflow-hidden rounded-2xl border border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 to-teal-700/20 p-3.5 shadow-[0_0_30px_hsl(160_80%_50%/0.35)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/25">
            <Target className="h-5 w-5 text-emerald-200" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">
              Mission complete
            </p>
            <p className="truncate text-sm font-black">{String(p.description ?? "")}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs font-bold">
              <span className="flex items-center gap-1 text-emerald-300">
                <MizrahiCoin size={11} /> +{Number(p.reward_coins ?? 0).toLocaleString()}
              </span>
              <span className="text-amber-200">+{Number(p.reward_xp ?? 0)} XP</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (event.kind === "streak") {
    const day = Number(p.day ?? 1);
    return (
      <div className="w-[280px] overflow-hidden rounded-2xl border border-orange-400/60 bg-gradient-to-br from-orange-500/20 to-rose-700/20 p-3.5 shadow-[0_0_30px_hsl(20_90%_55%/0.4)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-400/25"
          >
            <Flame className="h-6 w-6 text-orange-300" />
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-200">
              Daily streak · day {day}
            </p>
            <p className="truncate text-sm font-black">+{Number(p.coins ?? 0).toLocaleString()} coins</p>
            <p className="text-[10px] text-orange-200/80">+{Number(p.xp ?? 0)} XP · keep it going!</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/** Lightweight confetti burst (no extra deps). */
function Confetti({ big = false }: { big?: boolean }) {
  const count = big ? 28 : 16;
  const pieces = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      i,
      x: (Math.random() - 0.5) * (big ? 280 : 200),
      y: -(80 + Math.random() * (big ? 160 : 100)),
      r: Math.random() * 360,
      hue: Math.floor(Math.random() * 360),
      d: 0.9 + Math.random() * 0.6,
    }));
  }, [count, big]);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-visible">
      {pieces.map((p) => (
        <motion.span
          key={p.i}
          initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
          animate={{ opacity: 0, x: p.x, y: p.y, rotate: p.r }}
          transition={{ duration: p.d, ease: "easeOut" }}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 8,
            height: 12,
            background: `hsl(${p.hue} 90% 60%)`,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}
