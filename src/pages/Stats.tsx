import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Dumbbell, BookOpen, Sparkles, Flame, Target, TrendingUp, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Motivational micro-copy based on stats
function getStreakMessage(current: number, longest: number) {
  if (current === 0) return { text: "Start today. Future you will thank you 🙏", type: "start" };
  if (current === 1) return { text: "Day 1 done. The hardest step is behind you 👀", type: "begin" };
  if (current < 3) return { text: `${3 - current} more days to hit your first milestone! 🎯`, type: "push" };
  if (current < 7) return { text: "You're building momentum. Don't stop now 🔥", type: "momentum" };
  if (current < 14) return { text: "Consistency beats intensity. You're proving it 💪", type: "consistent" };
  if (current < 30) return { text: "You're becoming unstoppable. Keep going ⚡", type: "unstoppable" };
  if (current >= longest && current > 0) return { text: "You're at your BEST streak ever! 🏆", type: "best" };
  return { text: "Legend status unlocked. You're different 👑", type: "legend" };
}

function getNextMilestone(current: number) {
  const milestones = [3, 7, 14, 21, 30, 50, 75, 100];
  const next = milestones.find(m => m > current);
  if (!next) return null;
  return { days: next, remaining: next - current };
}

function getMostProductiveDay(weeklyData: { day: string; value: number }[]) {
  const max = Math.max(...weeklyData.map(d => d.value));
  const bestDay = weeklyData.find(d => d.value === max);
  return bestDay;
}

function getWeeklyInsight(weeklyData: { day: string; value: number }[]) {
  const midWeekAvg = weeklyData.slice(1, 5).reduce((a, b) => a + b.value, 0) / 4;
  const weekendAvg = (weeklyData[0].value + weeklyData[6].value) / 2;
  
  if (midWeekAvg > weekendAvg + 20) return "You're strongest mid-week 👊";
  if (weekendAvg > midWeekAvg + 20) return "Weekend warrior mode 🦾";
  return "Balanced across the week 🧘";
}

export default function Stats() {
  const { user, loading: authLoading } = useAuth();
  const [streak, setStreak] = useState({ current: 0, longest: 0 });
  const [taskCounts, setTaskCounts] = useState({ workout: 0, study: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!user) return;
      
      setLoading(true);

      // Fetch streak
      const { data: streakData } = await supabase
        .from('streaks')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (streakData) {
        setStreak({
          current: streakData.current_streak ?? 0,
          longest: streakData.longest_streak ?? 0,
        });
      }

      // Fetch completed tasks count
      const { data: plans } = await supabase
        .from('daily_plans')
        .select('id')
        .eq('user_id', user.id);

      if (plans && plans.length > 0) {
        const planIds = plans.map(p => p.id);
        const { data: items } = await supabase
          .from('daily_plan_items')
          .select('category, is_done')
          .in('daily_plan_id', planIds)
          .eq('is_done', true);

        if (items) {
          const workoutCount = items.filter(i => i.category === 'workout').length;
          const studyCount = items.filter(i => i.category === 'study').length;
          setTaskCounts({
            workout: workoutCount,
            study: studyCount,
            total: items.length,
          });
        }
      }

      setLoading(false);
    }

    fetchStats();
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const stats = [
    { label: "Workouts", value: taskCounts.workout, icon: Dumbbell, color: "text-workout", bg: "bg-workout/10" },
    { label: "Study Sessions", value: taskCounts.study, icon: BookOpen, color: "text-study", bg: "bg-study/10" },
    { label: "Tasks Done", value: taskCounts.total, icon: Sparkles, color: "text-productive", bg: "bg-productive/10" },
    { label: "Best Streak", value: streak.longest, icon: Flame, color: "text-primary", bg: "bg-primary/10" },
  ];

  // Only show real data - no fake placeholder data
  const hasEnoughData = taskCounts.total >= 3; // At least 3 tasks completed
  const weeklyData = [
    { day: 'Mon', value: 0 },
    { day: 'Tue', value: 0 },
    { day: 'Wed', value: 0 },
    { day: 'Thu', value: 0 },
    { day: 'Fri', value: 0 },
    { day: 'Sat', value: 0 },
    { day: 'Sun', value: 0 },
  ];

  const streakMessage = getStreakMessage(streak.current, streak.longest);
  const nextMilestone = getNextMilestone(streak.current);
  const mostProductiveDay = hasEnoughData ? getMostProductiveDay(weeklyData) : null;
  const weeklyInsight = hasEnoughData ? getWeeklyInsight(weeklyData) : null;

  return (
    <div className="min-h-screen pb-28">
      <div className="app-container pt-2">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-foreground mb-2">Statistics</h1>
          <p className="text-muted-foreground">Your progress at a glance</p>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Motivational Banner */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-2xl p-4 mb-6 text-center relative overflow-hidden"
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5"
                animate={{ x: [-100, 100, -100] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative z-10">
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-lg font-medium text-foreground"
                >
                  {streakMessage.text}
                </motion.p>
                {nextMilestone && streak.current > 0 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-sm text-muted-foreground mt-1"
                  >
                    Next milestone: {nextMilestone.days} days ({nextMilestone.remaining} to go)
                  </motion.p>
                )}
              </div>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="glass rounded-xl p-4"
                >
                  <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <motion.p 
                    className="text-2xl font-bold text-foreground"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3 + index * 0.1, type: "spring" }}
                  >
                    {stat.value}
                  </motion.p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </motion.div>
              ))}
            </div>

            {/* Weekly Progress Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="glass rounded-2xl p-6 mb-6"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Weekly Overview</h2>
                </div>
              </div>
              
              {/* Weekly insight - only show if enough data */}
              {hasEnoughData && weeklyInsight ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-sm text-muted-foreground mb-4"
                >
                  {weeklyInsight}
                </motion.p>
              ) : (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-sm text-muted-foreground mb-4"
                >
                  Complete a few more tasks to unlock weekly insights 📊
                </motion.p>
              )}
              
              {hasEnoughData ? (
                <div className="flex items-end justify-between h-32 gap-2">
                  {weeklyData.map((day, index) => {
                    const isBest = mostProductiveDay?.day === day.day;
                    return (
                      <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex flex-col gap-1 h-24 relative">
                          {isBest && day.value > 0 && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 1 }}
                              className="absolute -top-5 left-1/2 -translate-x-1/2 text-sm"
                            >
                              🔥
                            </motion.span>
                          )}
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${day.value}%` }}
                            transition={{ delay: 0.5 + index * 0.05, duration: 0.5 }}
                            className={`w-full rounded-t ${isBest ? 'bg-primary' : 'bg-workout'}`}
                            style={{ marginTop: 'auto' }}
                          />
                        </div>
                        <span className={`text-xs ${isBest ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                          {day.day}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-center">
                  <div className="space-y-2">
                    <div className="text-4xl">📈</div>
                    <p className="text-sm text-muted-foreground">
                      Your weekly chart will appear here
                    </p>
                  </div>
                </div>
              )}
              
              {hasEnoughData && mostProductiveDay && mostProductiveDay.value > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  className="text-center text-sm text-primary font-medium mt-3"
                >
                  Most productive day: {mostProductiveDay.day} 🔥
                </motion.p>
              )}
            </motion.div>

            {/* Streak Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Streak Progress</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground flex items-center gap-1">
                      Current streak
                      {streak.current >= streak.longest && streak.current > 0 && (
                        <motion.span
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                        >
                          👑
                        </motion.span>
                      )}
                    </span>
                    <span className="text-muted-foreground">{streak.current} days</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((streak.current / Math.max(streak.longest, 7)) * 100, 100)}%` }}
                      transition={{ delay: 0.6, duration: 0.5 }}
                      className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full relative"
                    >
                      <motion.div
                        className="absolute inset-0 bg-white/20"
                        animate={{ x: [-100, 200] }}
                        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                      />
                    </motion.div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">Best streak</span>
                    <span className="text-muted-foreground">{streak.longest} days</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ delay: 0.7, duration: 0.5 }}
                      className="h-full bg-workout rounded-full"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
