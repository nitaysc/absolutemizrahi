-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  workout_style TEXT DEFAULT 'mixed' CHECK (workout_style IN ('gym', 'calisthenics', 'mixed')),
  equipment JSONB DEFAULT '[]'::jsonb,
  study_focus JSONB DEFAULT '[]'::jsonb,
  daily_time TEXT DEFAULT 'medium' CHECK (daily_time IN ('short', 'medium', 'long')),
  training_split TEXT DEFAULT 'ppl' CHECK (training_split IN ('ppl', 'upper_lower', 'full_body', 'hybrid')),
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Task library table
CREATE TABLE public.task_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('workout', 'study', 'productive', 'rest', 'mindset')),
  tags JSONB DEFAULT '[]'::jsonb,
  title TEXT NOT NULL,
  description TEXT,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  duration_min INTEGER DEFAULT 15,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily plans table
CREATE TABLE public.daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rerolls_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, plan_date)
);

-- Daily plan items table
CREATE TABLE public.daily_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_plan_id UUID NOT NULL REFERENCES public.daily_plans(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.task_library(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  duration_min INTEGER,
  order_index INTEGER DEFAULT 0,
  is_done BOOLEAN DEFAULT false,
  log JSONB DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Streaks table
CREATE TABLE public.streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_completed_date DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Task library is public read
CREATE POLICY "Anyone can view tasks" ON public.task_library FOR SELECT USING (true);

-- Daily plans policies
CREATE POLICY "Users can view own plans" ON public.daily_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own plans" ON public.daily_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plans" ON public.daily_plans FOR UPDATE USING (auth.uid() = user_id);

-- Daily plan items policies
CREATE POLICY "Users can view own plan items" ON public.daily_plan_items FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.daily_plans WHERE id = daily_plan_id AND user_id = auth.uid()));
CREATE POLICY "Users can create own plan items" ON public.daily_plan_items FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.daily_plans WHERE id = daily_plan_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own plan items" ON public.daily_plan_items FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.daily_plans WHERE id = daily_plan_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own plan items" ON public.daily_plan_items FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.daily_plans WHERE id = daily_plan_id AND user_id = auth.uid()));

-- Streaks policies
CREATE POLICY "Users can view own streaks" ON public.streaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own streaks" ON public.streaks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own streaks" ON public.streaks FOR UPDATE USING (auth.uid() = user_id);

-- Create profile and streak on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO public.streaks (user_id, current_streak, longest_streak)
  VALUES (NEW.id, 0, 0);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_streaks_updated_at
  BEFORE UPDATE ON public.streaks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();