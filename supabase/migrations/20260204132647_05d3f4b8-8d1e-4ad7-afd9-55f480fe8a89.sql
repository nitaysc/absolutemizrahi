-- Drop old tables that are no longer needed
DROP TABLE IF EXISTS public.water_intake CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.daily_plan_items CASCADE;
DROP TABLE IF EXISTS public.daily_plans CASCADE;
DROP TABLE IF EXISTS public.user_inventory CASCADE;
DROP TABLE IF EXISTS public.coin_transactions CASCADE;
DROP TABLE IF EXISTS public.shop_items CASCADE;
DROP TABLE IF EXISTS public.task_library CASCADE;

-- Create workout_logs table to track workout days
CREATE TABLE public.workout_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workout_date DATE NOT NULL DEFAULT CURRENT_DATE,
  xp_earned INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, workout_date)
);

-- Update profiles table for new app
ALTER TABLE public.profiles 
  DROP COLUMN IF EXISTS workout_style,
  DROP COLUMN IF EXISTS daily_time,
  DROP COLUMN IF EXISTS training_split,
  DROP COLUMN IF EXISTS study_focus,
  DROP COLUMN IF EXISTS equipment,
  DROP COLUMN IF EXISTS has_dog,
  DROP COLUMN IF EXISTS water_goal_ml,
  DROP COLUMN IF EXISTS coins,
  DROP COLUMN IF EXISTS streak_shields;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_workout_date DATE,
  ADD COLUMN IF NOT EXISTS current_rank TEXT DEFAULT 'wood';

-- Enable RLS on workout_logs
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for workout_logs
CREATE POLICY "Users can view own workout logs"
  ON public.workout_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout logs"
  ON public.workout_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout logs"
  ON public.workout_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Policy for viewing leaderboard (all profiles)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view all profiles for leaderboard"
  ON public.profiles FOR SELECT
  USING (true);

-- Create function to calculate rank based on XP
CREATE OR REPLACE FUNCTION public.get_rank_from_xp(xp INTEGER)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    WHEN xp >= 10000 THEN 'olympian'
    WHEN xp >= 5000 THEN 'titan'
    WHEN xp >= 2500 THEN 'champion'
    WHEN xp >= 1500 THEN 'diamond'
    WHEN xp >= 1000 THEN 'platinum'
    WHEN xp >= 500 THEN 'gold'
    WHEN xp >= 250 THEN 'silver'
    WHEN xp >= 100 THEN 'bronze'
    ELSE 'wood'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update user stats after workout log
CREATE OR REPLACE FUNCTION public.update_user_stats_on_workout()
RETURNS TRIGGER AS $$
DECLARE
  prev_date DATE;
  new_streak INTEGER;
BEGIN
  -- Get user's last workout date
  SELECT last_workout_date INTO prev_date FROM public.profiles WHERE id = NEW.user_id;
  
  -- Calculate new streak
  IF prev_date IS NULL OR NEW.workout_date - prev_date > 1 THEN
    new_streak := 1;
  ELSIF NEW.workout_date - prev_date = 1 THEN
    SELECT current_streak + 1 INTO new_streak FROM public.profiles WHERE id = NEW.user_id;
  ELSE
    SELECT current_streak INTO new_streak FROM public.profiles WHERE id = NEW.user_id;
  END IF;
  
  -- Update profile
  UPDATE public.profiles SET
    total_xp = total_xp + NEW.xp_earned,
    current_streak = new_streak,
    longest_streak = GREATEST(longest_streak, new_streak),
    last_workout_date = NEW.workout_date,
    current_rank = public.get_rank_from_xp(total_xp + NEW.xp_earned),
    updated_at = now()
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for workout log insert
DROP TRIGGER IF EXISTS on_workout_log_insert ON public.workout_logs;
CREATE TRIGGER on_workout_log_insert
  AFTER INSERT ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_user_stats_on_workout();

-- Function to handle workout deletion (recalculate stats)
CREATE OR REPLACE FUNCTION public.update_user_stats_on_workout_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate total XP
  UPDATE public.profiles SET
    total_xp = GREATEST(0, total_xp - OLD.xp_earned),
    current_rank = public.get_rank_from_xp(GREATEST(0, total_xp - OLD.xp_earned)),
    updated_at = now()
  WHERE id = OLD.user_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_workout_log_delete ON public.workout_logs;
CREATE TRIGGER on_workout_log_delete
  BEFORE DELETE ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_user_stats_on_workout_delete();