import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function Calendar() {
  const { user, loading: authLoading } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [completedDays, setCompletedDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

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
        .select('plan_date')
        .eq('user_id', user.id)
        .gte('plan_date', startOfMonth.toISOString().split('T')[0])
        .lte('plan_date', endOfMonth.toISOString().split('T')[0]);

      if (data) {
        const completed: number[] = [];
        for (const plan of data) {
          const { data: items } = await supabase
            .from('daily_plan_items')
            .select('is_done')
            .eq('daily_plan_id', plan.plan_date);
          
          // For simplicity, mark days with plans as completed
          const day = new Date(plan.plan_date).getDate();
          completed.push(day);
        }
        setCompletedDays(completed);
      }
      
      setLoading(false);
    }
    
    fetchCompletedDays();
  }, [user, currentDate]);

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

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-foreground mb-2">Calendar</h1>
          <p className="text-muted-foreground">Track your consistency over time</p>
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
              
              return (
                <motion.div
                  key={day}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: day * 0.02 }}
                  className={`
                    aspect-square rounded-lg flex items-center justify-center text-sm font-medium
                    transition-all duration-200
                    ${isToday ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                    ${status === 'complete' ? 'bg-primary text-primary-foreground' : ''}
                    ${status === 'missed' ? 'bg-destructive/20 text-destructive' : ''}
                    ${status === 'future' || status === 'none' || status === 'today' ? 'text-muted-foreground' : ''}
                  `}
                >
                  {day}
                </motion.div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-border">
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
      </div>
    </div>
  );
}
