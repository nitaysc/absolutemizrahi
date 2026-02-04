import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WorkoutLog {
  id: string;
  user_id: string;
  workout_date: string;
  xp_earned: number;
  created_at: string;
}

export function useWorkouts() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkouts = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('workout_date', { ascending: false });

    if (error) {
      console.error('Error fetching workouts:', error);
    } else {
      setWorkouts(data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchWorkouts();
    }
  }, [user, fetchWorkouts]);

  const logWorkout = async (date: Date = new Date()) => {
    if (!user) return { error: new Error('No user') };
    
    const dateStr = date.toISOString().split('T')[0];
    
    // Check if already logged for this date
    const existing = workouts.find(w => w.workout_date === dateStr);
    if (existing) {
      toast.error('Workout already logged for this day');
      return { error: new Error('Already logged') };
    }
    
    const { data, error } = await supabase
      .from('workout_logs')
      .insert({
        user_id: user.id,
        workout_date: dateStr,
        xp_earned: 10,
      })
      .select()
      .single();

    if (error) {
      console.error('Error logging workout:', error);
      toast.error('Failed to log workout');
      return { error };
    }

    setWorkouts(prev => [data, ...prev]);
    toast.success('+10 XP! Workout logged 💪');
    return { error: null, data };
  };

  const removeWorkout = async (date: string) => {
    if (!user) return { error: new Error('No user') };
    
    const { error } = await supabase
      .from('workout_logs')
      .delete()
      .eq('user_id', user.id)
      .eq('workout_date', date);

    if (error) {
      console.error('Error removing workout:', error);
      toast.error('Failed to remove workout');
      return { error };
    }

    setWorkouts(prev => prev.filter(w => w.workout_date !== date));
    toast.success('Workout removed');
    return { error: null };
  };

  const hasWorkedOut = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return workouts.some(w => w.workout_date === dateStr);
  };

  const getWorkoutsForMonth = (year: number, month: number) => {
    return workouts.filter(w => {
      const d = new Date(w.workout_date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  };

  return { 
    workouts, 
    loading, 
    logWorkout, 
    removeWorkout, 
    hasWorkedOut, 
    getWorkoutsForMonth,
    refetch: fetchWorkouts 
  };
}
