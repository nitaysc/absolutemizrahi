-- Add water goal setting to profiles
ALTER TABLE public.profiles 
ADD COLUMN water_goal_ml integer DEFAULT 2000;