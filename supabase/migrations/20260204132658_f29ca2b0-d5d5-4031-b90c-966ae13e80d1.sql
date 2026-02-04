-- Fix search_path for get_rank_from_xp function
CREATE OR REPLACE FUNCTION public.get_rank_from_xp(xp INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
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
$$;