import { motion } from "framer-motion";
import { BottomNav } from "@/components/bottom-nav";
import { Dumbbell, BookOpen, Sparkles, Flame, Target, TrendingUp } from "lucide-react";

const stats = [
  { label: "Workouts", value: 24, icon: Dumbbell, color: "text-workout", bg: "bg-workout/10" },
  { label: "Study Hours", value: 18, icon: BookOpen, color: "text-study", bg: "bg-study/10" },
  { label: "Tasks Done", value: 67, icon: Sparkles, color: "text-productive", bg: "bg-productive/10" },
  { label: "Best Streak", value: 12, icon: Flame, color: "text-primary", bg: "bg-primary/10" },
];

const weeklyData = [
  { day: 'M', workout: 85, study: 60 },
  { day: 'T', workout: 100, study: 80 },
  { day: 'W', workout: 75, study: 90 },
  { day: 'T', workout: 90, study: 70 },
  { day: 'F', workout: 100, study: 85 },
  { day: 'S', workout: 60, study: 40 },
  { day: 'S', workout: 0, study: 20 },
];

export default function Stats() {
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
                    animate={{ height: `${day.workout}%` }}
                    transition={{ delay: 0.5 + index * 0.05, duration: 0.5 }}
                    className="w-full bg-workout rounded-t"
                    style={{ marginTop: 'auto' }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{day.day}</span>
              </div>
            ))}
          </div>
          
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-workout" />
              <span className="text-xs text-muted-foreground">Workout</span>
            </div>
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
            <h2 className="text-lg font-semibold text-foreground">Monthly Goals</h2>
          </div>
          
          <div className="space-y-4">
            {[
              { label: "Complete 20 workouts", current: 24, target: 20 },
              { label: "Study 15 hours", current: 18, target: 15 },
              { label: "7 day streak", current: 7, target: 7 },
            ].map((goal, index) => (
              <div key={goal.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-foreground">{goal.label}</span>
                  <span className="text-muted-foreground">{goal.current}/{goal.target}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((goal.current / goal.target) * 100, 100)}%` }}
                    transition={{ delay: 0.6 + index * 0.1, duration: 0.5 }}
                    className="h-full bg-primary rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
      
      <BottomNav />
    </div>
  );
}
