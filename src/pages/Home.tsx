import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Loader2, ChevronLeft, ChevronRight, Check, Flame, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useUserProfile } from "@/hooks/useUserProfile";
import { RankBadge } from "@/components/RankBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { getProgressToNextRank } from "@/lib/ranks";
import { cn } from "@/lib/utils";

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { profile, refetch: refetchProfile } = useUserProfile();
  const { workouts, logWorkout, removeWorkout, hasWorkedOut, getWorkoutsForMonth, refetch: refetchWorkouts } = useWorkouts();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isLogging, setIsLogging] = useState(false);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const hasWorkedOutToday = hasWorkedOut(today);

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const isCurrentMonth = currentDate.getMonth() === today.getMonth() && 
                         currentDate.getFullYear() === today.getFullYear();
  const todayDate = today.getDate();

  const monthWorkouts = getWorkoutsForMonth(currentDate.getFullYear(), currentDate.getMonth());
  const workoutDates = new Set(monthWorkouts.map(w => new Date(w.workout_date + 'T00:00:00').getDate()));

  const handleLogToday = async () => {
    setIsLogging(true);
    await logWorkout(today);
    await refetchProfile();
    setIsLogging(false);
  };

  const handleDayClick = async (day: number) => {
    const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const clickedStr = clickedDate.toISOString().split('T')[0];
    
    // Only allow clicking today or past days
    if (clickedDate > today) return;
    
    const hasWorkout = workoutDates.has(day);
    
    if (hasWorkout) {
      await removeWorkout(clickedStr);
      await refetchProfile();
    } else {
      await logWorkout(clickedDate);
      await refetchProfile();
    }
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    if (nextDate <= today) {
      setCurrentDate(nextDate);
    }
  };

  const rankProgress = profile ? getProgressToNextRank(profile.total_xp) : null;

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

  return (
    <div className="min-h-screen pb-28">
      <div className="app-container pt-4">
        {/* Header with stats */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {profile?.display_name || 'Warrior'}
              </h1>
              <p className="text-muted-foreground text-sm">Keep pushing forward</p>
            </div>
            {profile && <RankBadge xp={profile.total_xp} size="md" />}
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-3">
            <motion.div 
              className="glass rounded-xl p-3 text-center"
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xl font-bold text-foreground">{profile?.total_xp ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total XP</p>
            </motion.div>

            <motion.div 
              className="glass rounded-xl p-3 text-center"
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <Flame className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-xl font-bold text-foreground">{profile?.current_streak ?? 0}</p>
              <p className="text-xs text-muted-foreground">Streak</p>
            </motion.div>

            <motion.div 
              className="glass rounded-xl p-3 text-center"
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="text-sm">🏆</span>
              </div>
              <p className="text-xl font-bold text-foreground">{profile?.longest_streak ?? 0}</p>
              <p className="text-xs text-muted-foreground">Best</p>
            </motion.div>
          </div>

          {/* Rank progress */}
          {rankProgress && rankProgress.next && (
            <motion.div 
              className="glass rounded-xl p-4 mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{rankProgress.current.icon}</span>
                  <span className={cn("text-sm font-medium", rankProgress.current.color)}>
                    {rankProgress.current.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-medium", rankProgress.next.color)}>
                    {rankProgress.next.name}
                  </span>
                  <span className="text-lg">{rankProgress.next.icon}</span>
                </div>
              </div>
              <ProgressBar progress={rankProgress.progress} />
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {rankProgress.xpNeeded} XP to next rank
              </p>
            </motion.div>
          )}
        </motion.div>

        {/* Log workout button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <Button
            onClick={handleLogToday}
            disabled={hasWorkedOutToday || isLogging}
            className={cn(
              "w-full h-16 text-lg font-semibold rounded-2xl transition-all",
              hasWorkedOutToday 
                ? "bg-green-600 hover:bg-green-600 text-white" 
                : "bg-primary hover:bg-primary/90"
            )}
          >
            {isLogging ? (
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
            ) : hasWorkedOutToday ? (
              <>
                <Check className="w-6 h-6 mr-2" />
                Workout Logged Today!
              </>
            ) : (
              <>
                <Zap className="w-6 h-6 mr-2" />
                Log Today's Workout (+10 XP)
              </>
            )}
          </Button>
        </motion.div>

        {/* Calendar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-2xl p-5"
        >
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-5">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground">{monthName}</h2>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={nextMonth}
              disabled={isCurrentMonth}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Day Labels */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center text-xs text-muted-foreground py-2 font-medium">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {emptyDays.map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {days.map((day) => {
              const hasWorkout = workoutDates.has(day);
              const isToday = isCurrentMonth && day === todayDate;
              const isFuture = isCurrentMonth && day > todayDate;
              
              return (
                <motion.button
                  key={day}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: day * 0.01 }}
                  onClick={() => handleDayClick(day)}
                  disabled={isFuture}
                  className={cn(
                    "aspect-square rounded-xl flex items-center justify-center text-sm font-medium transition-all relative",
                    hasWorkout && "bg-green-500 text-white shadow-lg shadow-green-500/30",
                    !hasWorkout && isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background bg-muted",
                    !hasWorkout && !isToday && !isFuture && "text-muted-foreground hover:bg-muted",
                    isFuture && "text-muted-foreground/30 cursor-not-allowed",
                    "hover:scale-105 active:scale-95"
                  )}
                >
                  {hasWorkout && (
                    <motion.div
                      className="absolute inset-0 rounded-xl bg-green-400/20"
                      animate={{ 
                        opacity: [0.2, 0.4, 0.2],
                        scale: [1, 1.05, 1]
                      }}
                      transition={{ 
                        duration: 2, 
                        repeat: Infinity, 
                        ease: "easeInOut" 
                      }}
                    />
                  )}
                  <span className="relative z-10">
                    {hasWorkout ? <Check className="w-4 h-4" /> : day}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-5 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs text-muted-foreground">Worked out</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-muted ring-2 ring-primary" />
              <span className="text-xs text-muted-foreground">Today</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
