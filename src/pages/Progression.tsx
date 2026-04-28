import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  useProgression,
  xpForLevel,
  titleForLevel,
  badgeColorForLevel,
} from "@/hooks/useProgression";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { Flame, Sparkles, Target, Trophy, Lock, Gift, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export default function Progression() {
  const { stats, missions, achievements, unlockedCodes } = useProgression();
  const [boosterRemaining, setBoosterRemaining] = useState<string | null>(null);

  // tick countdown for booster
  useEffect(() => {
    if (!stats?.xp_booster_until) {
      setBoosterRemaining(null);
      return;
    }
    const t = setInterval(() => {
      const ms = new Date(stats.xp_booster_until!).getTime() - Date.now();
      if (ms <= 0) setBoosterRemaining(null);
      else {
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        setBoosterRemaining(`${m}:${s.toString().padStart(2, "0")}`);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [stats?.xp_booster_until]);

  const need = stats ? xpForLevel(stats.level) : 100;
  const pct = stats ? Math.min(100, (stats.xp / need) * 100) : 0;
  const nextNeed = stats ? xpForLevel(stats.level + 1) : 100;
  const nextRewardCoins = stats ? 100 * (stats.level + 1) : 100;
  const isMilestone5 = stats ? (stats.level + 1) % 5 === 0 : false;
  const isMilestone10 = stats ? (stats.level + 1) % 10 === 0 : false;

  const sortedAch = useMemo(() => {
    return [...achievements].sort((a, b) => {
      const au = unlockedCodes.has(a.code) ? 1 : 0;
      const bu = unlockedCodes.has(b.code) ? 1 : 0;
      if (au !== bu) return au - bu; // unlocked last (so locked are visible to chase)
      return a.reward_coins - b.reward_coins;
    });
  }, [achievements, unlockedCodes]);

  if (!stats) {
    return (
      <div className="text-center text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/60 to-amber-700/10 p-5 shadow-[0_0_50px_hsl(var(--primary)/0.25)] backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <motion.div
            initial={{ scale: 0.85 }}
            animate={{ scale: 1 }}
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br text-4xl font-black shadow-2xl",
              badgeColorForLevel(stats.level),
            )}
          >
            {stats.level}
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Level</p>
            <h1 className="truncate text-2xl font-black">{titleForLevel(stats.level)}</h1>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{stats.xp.toLocaleString()} / {need.toLocaleString()} XP</span>
              <span>·</span>
              <span>{stats.xp_total.toLocaleString()} lifetime</span>
            </div>
            <div className="relative mt-2 h-3 overflow-hidden rounded-full border border-border/60 bg-card/80">
              <motion.div
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", damping: 22, stiffness: 120 }}
                className="h-full bg-gradient-to-r from-primary via-amber-400 to-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)]"
              />
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-12 w-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                animate={{ x: ["0%", "350%"] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
              />
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat
            icon={<Flame className="h-4 w-4 text-orange-300" />}
            label="Streak"
            value={`${stats.streak_days}d`}
            tone="orange"
          />
          <Stat
            icon={<Trophy className="h-4 w-4 text-amber-300" />}
            label="Achievements"
            value={`${unlockedCodes.size}/${achievements.length}`}
            tone="amber"
          />
          <Stat
            icon={<Sparkles className="h-4 w-4 text-fuchsia-300" />}
            label={boosterRemaining ? "2× XP" : "No booster"}
            value={boosterRemaining ?? "—"}
            tone="fuchsia"
          />
        </div>

        {/* Next reward preview */}
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-amber-300" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-200">
                Next reward · level {stats.level + 1}
              </p>
              <p className="text-sm font-black">
                {(nextRewardCoins + (isMilestone5 ? 500 * (stats.level + 1) : 0) + (isMilestone10 ? 2000 * (stats.level + 1) : 0)).toLocaleString()} coins
                {isMilestone10 && " + 1h 2× XP"}
                {isMilestone5 && !isMilestone10 && " · ★ milestone"}
              </p>
            </div>
          </div>
          <p className="text-xs font-bold text-muted-foreground">{(nextNeed - 0).toLocaleString()} XP gate</p>
        </div>
      </section>

      {/* DAILY STREAK CLAIM */}
      <section className="rounded-3xl border border-orange-400/30 bg-gradient-to-br from-orange-500/10 to-rose-700/10 p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ scale: claimedToday ? 1 : [1, 1.12, 1] }}
              transition={{ duration: 1.6, repeat: claimedToday ? 0 : Infinity }}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-400/25"
            >
              <Flame className="h-6 w-6 text-orange-300" />
            </motion.div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-orange-200">
                Daily login bonus
              </p>
              <p className="text-base font-black">
                {claimedToday ? `Day ${stats.streak_days} claimed ✓` : `Claim day ${stats.streak_days + 1}`}
              </p>
              <p className="text-[11px] text-orange-200/70">
                {claimedToday ? "Come back tomorrow to keep your streak" : `Reward: ${(200 * Math.min(stats.streak_days + 1, 7)).toLocaleString()} coins + ${50 * Math.min(stats.streak_days + 1, 7)} XP`}
              </p>
            </div>
          </div>
          <button
            disabled={claimedToday || claiming}
            onClick={onClaimStreak}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-black transition",
              claimedToday
                ? "cursor-default bg-card text-muted-foreground"
                : "bg-gradient-to-r from-orange-400 to-rose-500 text-white shadow-[0_0_20px_hsl(20_90%_55%/0.5)] hover:brightness-110",
            )}
          >
            {claimedToday ? "Claimed" : "Claim"}
          </button>
        </div>
      </section>

      {/* DAILY MISSIONS */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Target className="h-5 w-5 text-emerald-300" /> Daily missions
          </h2>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" /> resets at midnight UTC
          </p>
        </header>
        <div className="grid gap-2 sm:grid-cols-2">
          {missions.map((m) => {
            const pct = Math.min(100, (Number(m.progress) / Number(m.target)) * 100);
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-2xl border p-3 backdrop-blur transition",
                  m.completed
                    ? "border-emerald-400/50 bg-emerald-500/10"
                    : "border-border bg-card/60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold">{m.description}</p>
                  {m.completed && (
                    <span className="rounded-full bg-emerald-400/25 px-2 py-0.5 text-[10px] font-black text-emerald-200">
                      DONE
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <Progress value={pct} className="h-2" />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-muted-foreground">
                    {Number(m.progress).toLocaleString()} / {Number(m.target).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-2 font-bold">
                    <span className="flex items-center gap-0.5 text-emerald-300">
                      <MizrahiCoin size={10} /> {m.reward_coins.toLocaleString()}
                    </span>
                    <span className="text-amber-300">+{m.reward_xp} XP</span>
                  </span>
                </div>
              </div>
            );
          })}
          {missions.length === 0 && (
            <p className="col-span-full text-center text-sm text-muted-foreground">
              Loading missions…
            </p>
          )}
        </div>
      </section>

      {/* ACHIEVEMENTS */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Trophy className="h-5 w-5 text-amber-300" /> Achievements
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {unlockedCodes.size} / {achievements.length} unlocked
          </p>
        </header>
        <div className="grid gap-2 sm:grid-cols-2">
          {sortedAch.map((a) => {
            const unlocked = unlockedCodes.has(a.code);
            return (
              <div
                key={a.code}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-3 backdrop-blur transition",
                  unlocked
                    ? "border-amber-300/50 bg-gradient-to-br from-amber-400/10 to-orange-700/10 shadow-[0_0_18px_hsl(45_90%_55%/0.18)]"
                    : "border-border bg-card/40 opacity-70",
                )}
              >
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl text-2xl",
                    unlocked ? "bg-amber-400/20" : "bg-secondary",
                  )}
                >
                  {unlocked ? a.icon : <Lock className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{a.name}</p>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{a.description}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[11px] font-bold">
                    <span className="flex items-center gap-0.5 text-emerald-300">
                      <MizrahiCoin size={10} /> {a.reward_coins.toLocaleString()}
                    </span>
                    {a.reward_xp > 0 && <span className="text-amber-300">+{a.reward_xp} XP</span>}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "orange" | "amber" | "fuchsia";
}) {
  const toneCls =
    tone === "orange"
      ? "border-orange-400/30 bg-orange-500/5"
      : tone === "amber"
        ? "border-amber-400/30 bg-amber-500/5"
        : "border-fuchsia-400/30 bg-fuchsia-500/5";
  return (
    <div className={cn("rounded-xl border p-2.5", toneCls)}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 text-base font-black tabular-nums">{value}</p>
    </div>
  );
}
