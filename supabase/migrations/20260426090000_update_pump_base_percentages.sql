-- Update pump_start base pop percentages per difficulty.
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
  _base NUMERIC;
  _grow NUMERIC;
  _cap  NUMERIC;
  _max_pumps INT := 60;
  _pop_at INT;
  _i INT;
  _chance NUMERIC;
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

  -- Per-difficulty curve: pop chance on pump i (1-indexed) = base + (i-1)*grow, capped.
  CASE _difficulty
    WHEN 'easy'   THEN _base := 0.04; _grow := 0.0020; _cap := 0.35;
    WHEN 'medium' THEN _base := 0.08; _grow := 0.0045; _cap := 0.55;
    WHEN 'hard'   THEN _base := 0.16; _grow := 0.0080; _cap := 0.75;
    WHEN 'insane' THEN _base := 0.42; _grow := 0.0150; _cap := 0.90;
  END CASE;

  _pop_at := _max_pumps + 1;
  FOR _i IN 1.._max_pumps LOOP
    _chance := LEAST(_cap, _base + (_i - 1) * _grow);
    IF random() < _chance THEN _pop_at := _i; EXIT; END IF;
  END LOOP;

  UPDATE public.profiles
  SET coins = coins - _bet_amount,
      total_wagered = total_wagered + _bet_amount,
      pump_round = jsonb_build_object(
        'active', true,
        'bet', _bet_amount,
        'difficulty', _difficulty,
        'pop_chance', _base,
        'pop_grow', _grow,
        'pop_cap', _cap,
        'pop_at', _pop_at,
        'pumps', 0
      ),
      updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;

  RETURN QUERY SELECT _bal;
END;
$function$;
