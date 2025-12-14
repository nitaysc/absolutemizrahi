-- Create water intake table
CREATE TABLE public.water_intake (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_ml INTEGER NOT NULL,
  logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.water_intake ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own water intake"
ON public.water_intake
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own water intake"
ON public.water_intake
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own water intake"
ON public.water_intake
FOR DELETE
USING (auth.uid() = user_id);

-- Index for faster queries by user and date
CREATE INDEX idx_water_intake_user_date ON public.water_intake(user_id, logged_at);