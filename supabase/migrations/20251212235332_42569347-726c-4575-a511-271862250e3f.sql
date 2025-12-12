-- Allow users to delete their own plans (needed when preferences change)
CREATE POLICY "Users can delete own plans" 
ON public.daily_plans 
FOR DELETE 
USING (auth.uid() = user_id);