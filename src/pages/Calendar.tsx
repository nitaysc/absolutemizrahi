import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, X, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DayDetails {
  date: string;
  tasks: { title: string; category: string; is_done: boolean }[];
}

export default function Calendar() {
  const { user, loading: authLoading } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [completedDays, setCompletedDays] = useState<number[]>([]);
  const [streakDays, setStreakDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayDetails | null>(null);
  const [todayCompleted, setTodayCompleted] = useState(false);

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const daysInMonth = new Date(
    currentDate.getFullYear(), 
    currentDate.getMonth() + 1, 
    0
  ).getDate();
  
  const firstDayOfMonth = new Date(
    currentDate.getFullYear(), 
    currentDate.getMonth(), 
    1
  ).getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const today = new Date();
  const isCurrentMonth = currentDate.getMonth() === today.getMonth() && 
                         currentDate.getFullYear() === today.getFullYear();
  const todayDate = today.getDate();

  useEffect(() => {
    async function fetchCompletedDays() {
      if (!user) return;
      
      setLoading(true);
      
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const { data } = await supabase
        .from('daily_plans')
        .select('id, plan_date')
        .eq('user_id', user.id)
        .gte('plan_date', startOfMonth.toISOString().split('T')[0])
        .lte('plan_date', endOfMonth.toISOString().split('T')[0]);

      if (data) {
        const completed: number[] = [];
        const streak: number[] = [];
        
        for (const plan of data) {
          const { data: items } = await supabase
            .from('daily_plan_items')
            .select('is_done')
            .eq('daily_plan_id', plan.id);
          
          const day = new Date(plan.plan_date + 'T00:00:00').getDate();
          
          if (items && items.length > 0) {
            const completedItems = items.filter(i => i.is_done).length;
            const completionRate = completedItems / items.length;
            
            if (completionRate >= 0.5) {
              completed.push(day);
            }
            
            // Check if this is part of a streak (consecutive days)
            if (completionRate >= 0.8) {
              streak.push(day);
            }
          }
        }
        
        setCompletedDays(completed);
        setStreakDays(streak);
        setTodayCompleted(isCurrentMonth && completed.includes(todayDate));
      }
      
      setLoading(false);
    }
    
    fetchCompletedDays();
  }, [user, currentDate, isCurrentMonth, todayDate]);

  const handleDayPress = async (day: number) => {
    if (!user) return;
    
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    const { data: plan } = await supabase
      .from('daily_plans')
      .select('id')
      .eq('user_id', user.id)
      .eq('plan_date', dateStr)
      .single();
    
    if (plan) {
      const { data: items } = await supabase
        .from('daily_plan_items')
        .select('title, category, is_done')
        .eq('daily_plan_id', plan.id);
      
      if (items) {
        setSelectedDay({
          date: dateStr,
          tasks: items
        });
      }
    }
  };

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

  const getDayStatus = (day: number) => {
    if (!isCurrentMonth) return completedDays.includes(day) ? 'complete' : 'none';
    if (day > todayDate) return 'future';
    if (completedDays.includes(day)) return 'complete';
    if (day === todayDate) return 'today';
    return 'missed';
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const completedThisMonth = completedDays.length;
  const totalDaysSoFar = isCurrentMonth ? todayDate : daysInMonth;

  return (
    <div className="min-h-screen pb-28">
      <div className="app-container pt-2">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-foreground mb-2">Calendar</h1>
          <p className="text-muted-foreground">Track your consistency over time</p>
        </motion.div>

        {/* Monthly motivation */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-xl p-3 mb-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">This month</p>
              <p className="text-lg font-semibold text-foreground">
                {completedThisMonth}/{totalDaysSoFar} days completed
              </p>
            </div>
            {completedThisMonth >= totalDaysSoFar * 0.8 && (
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 0.5, repeatDelay: 2 }}
                className="text-2xl"
              >
                🔥
              </motion.div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            💡 Days count as complete when you finish 50%+ of tasks. Streak requires 80%+.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6"
        >
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground">{monthName}</h2>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Day Labels */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center text-xs text-muted-foreground py-2">
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
              const status = getDayStatus(day);
              const isToday = isCurrentMonth && day === todayDate;
              const isStreak = streakDays.includes(day);
              const showFlame = status === 'complete' && isStreak;
              
              return (
                <motion.button
                  key={day}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: day * 0.02 }}
                  onClick={() => handleDayPress(day)}
                  className={`
                    aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-medium
                    transition-all duration-200 relative
                    ${isToday && todayCompleted ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                    ${isToday && !todayCompleted ? 'ring-2 ring-muted-foreground/50 ring-offset-2 ring-offset-background' : ''}
                    ${status === 'complete' ? 'bg-primary text-primary-foreground' : ''}
                    ${status === 'missed' ? 'bg-destructive/20 text-destructive' : ''}
                    ${status === 'future' || status === 'none' ? 'text-muted-foreground' : ''}
                    ${status === 'today' && !todayCompleted ? 'text-foreground bg-muted' : ''}
                    hover:scale-105 active:scale-95
                  `}
                >
                  {/* Glow effect for today when completed */}
                  {isToday && todayCompleted && (
                    <motion.div
                      className="absolute inset-0 rounded-lg bg-primary/30"
                      animate={{ 
                        opacity: [0.3, 0.6, 0.3],
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ 
                        duration: 2, 
                        repeat: Infinity, 
                        ease: "easeInOut" 
                      }}
                    />
                  )}
                  
                  {showFlame && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1"
                    >
                      <Flame className="w-3 h-3 text-orange-400 fill-orange-400" />
                    </motion.div>
                  )}
                  <span className="relative z-10">{day}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-primary relative">
                <Flame className="w-2 h-2 text-orange-400 fill-orange-400 absolute -top-1 -right-1" />
              </div>
              <span className="text-xs text-muted-foreground">Streak day</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-primary" />
              <span className="text-xs text-muted-foreground">Complete</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-destructive/30" />
              <span className="text-xs text-muted-foreground">Missed</span>
            </div>
          </div>
        </motion.div>

        {/* Day Details Modal */}
        <AnimatePresence>
          {selectedDay && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-end"
              onClick={() => setSelectedDay(null)}
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25 }}
                className="w-full bg-card rounded-t-2xl p-6 max-h-[60vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground">
                    {new Date(selectedDay.date + 'T00:00:00').toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </h3>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedDay(null)}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {selectedDay.tasks.map((task, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`p-3 rounded-lg ${task.is_done ? 'bg-primary/10' : 'bg-muted'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={task.is_done ? 'text-primary' : 'text-muted-foreground'}>
                          {task.is_done ? '✓' : '○'}
                        </span>
                        <span className={`flex-1 ${task.is_done ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                          {task.title}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">{task.category}</span>
                      </div>
                    </motion.div>
                  ))}
                  
                  {selectedDay.tasks.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No tasks for this day</p>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
