import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Dumbbell, BookOpen, Sparkles, Flame, Target, TrendingUp, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
          current: streakData.current_streak,
          longest: streakData.longest_streak,
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

  const weeklyData = [
    { day: 'Mon', value: 85 },
    { day: 'Tue', value: 100 },
    { day: 'Wed', value: 75 },
    { day: 'Thu', value: 90 },
    { day: 'Fri', value: 100 },
    { day: 'Sat', value: 60 },
    { day: 'Sun', value: 20 },
  ];

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6">
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
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
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
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Weekly Overview</h2>
              </div>
              
              <div className="flex items-end justify-between h-32 gap-2">
                {weeklyData.map((day, index) => (
                  <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col gap-1 h-24">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${day.value}%` }}
                        transition={{ delay: 0.5 + index * 0.05, duration: 0.5 }}
                        className="w-full bg-workout rounded-t"
                        style={{ marginTop: 'auto' }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{day.day}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Goals */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Current Streak</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">Current streak</span>
                    <span className="text-muted-foreground">{streak.current} days</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((streak.current / Math.max(streak.longest, 7)) * 100, 100)}%` }}
                      transition={{ delay: 0.6, duration: 0.5 }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">Best streak</span>
                    <span className="text-muted-foreground">{streak.longest} days</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
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
