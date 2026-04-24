
CREATE OR REPLACE FUNCTION public.dt_config(_diff text)
RETURNS TABLE(tiles int, eggs int, step numeric)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT
    CASE _diff WHEN 'easy' THEN 4 WHEN 'medium' THEN 3 WHEN 'hard' THEN 2 WHEN 'expert' THEN 3 WHEN 'master' THEN 4 END,
    CASE _diff WHEN 'easy' THEN 1 WHEN 'medium' THEN 1 WHEN 'hard' THEN 1 WHEN 'expert' THEN 2 WHEN 'master' THEN 3 END,
    CASE _diff
      WHEN 'easy'   THEN 1.18::numeric
      WHEN 'medium' THEN 1.32::numeric
      WHEN 'hard'   THEN 1.65::numeric
      WHEN 'expert' THEN 2.20::numeric
      WHEN 'master' THEN 2.90::numeric
    END;
$$;
