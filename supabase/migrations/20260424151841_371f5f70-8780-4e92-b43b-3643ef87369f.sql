CREATE OR REPLACE FUNCTION public.crash_pick_multiplier()
RETURNS NUMERIC
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE _u NUMERIC := random(); _m NUMERIC;
BEGIN
  IF _u < 0.01 THEN RETURN 1.00; END IF;
  _m := 0.99 / GREATEST(_u, 0.0001);
  RETURN LEAST(round(_m, 2), 1000);
END;
$$;