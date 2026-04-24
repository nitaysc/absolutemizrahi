CREATE OR REPLACE FUNCTION public.pump_start(_bet_amount bigint, _difficulty text)
 RETURNS TABLE(new_balance bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _bal BIGINT;
  _existing JSONB;
  _pop_chance NUMERIC;
  _max_pumps INT := 50;
  _pop_at INT;
  _i INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;
  IF _difficulty NOT IN ('easy','medium','hard','insane') THEN RAISE EXCEPTION 'Invalid difficulty'; END IF;

  SELECT coins, pump_round INTO _bal, _existing FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;
  IF _existing IS NOT NULL AND (_existing->>'active')::BOOLEAN THEN
    RAISE EXCEPTION 'Active pump round exists';
  END IF;
  IF _bal < _bet_amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  -- Random pop-chance within the difficulty's range
  _pop_chance := CASE _difficulty
    WHEN 'easy'   THEN 0.01 + random() * 0.03  -- 1% – 4%
    WHEN 'medium' THEN 0.04 + random() * 0.04  -- 4% – 8%
    WHEN 'hard'   THEN 0.10 + random() * 0.10  -- 10% – 20%
    WHEN 'insane' THEN 0.25 + random() * 0.10  -- 25% – 35%
  END;

  _pop_at := _max_pumps + 1;
  FOR _i IN 1.._max_pumps LOOP
    IF random() < _pop_chance THEN _pop_at := _i; EXIT; END IF;
  END LOOP;

  UPDATE public.profiles
  SET coins = coins - _bet_amount,
      total_wagered = total_wagered + _bet_amount,
      pump_round = jsonb_build_object(
        'active', true,
        'bet', _bet_amount,
        'difficulty', _difficulty,
        'pop_chance', _pop_chance,
        'pop_at', _pop_at,
        'pumps', 0
      ),
      updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;

  RETURN QUERY SELECT _bal;
END;
$function$;