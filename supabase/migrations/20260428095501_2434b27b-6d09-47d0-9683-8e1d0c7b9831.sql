-- Make the lobby's Daily Bonus also drive the streak system, so users only need
-- to claim from one place. Streak increments by 1 on consecutive calendar days
-- (UTC), resets if a day is skipped, and stays the same if claimed twice the
-- same day (which the existing 24h gate already prevents).

CREATE OR REPLACE FUNCTION public.claim_daily_bonus()
RETURNS TABLE(new_balance bigint, awarded bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _last TIMESTAMPTZ;
  _last_claim DATE;
  _today DATE := (now() AT TIME ZONE 'UTC')::date;
  _new_streak INTEGER;
  _bal BIGINT;
  _coins BIGINT;
  _xp BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT last_daily_bonus, last_streak_claim, streak_days
    INTO _last, _last_claim, _new_streak
  FROM public.profiles WHERE id = _uid FOR UPDATE;

  IF _last IS NOT NULL AND _last > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Daily bonus already claimed';
  END IF;

  -- Streak math
  IF _last_claim IS NULL THEN
    _new_streak := 1;
  ELSIF _last_claim = _today - 1 THEN
    _new_streak := COALESCE(_new_streak, 0) + 1;
  ELSIF _last_claim = _today THEN
    _new_streak := COALESCE(_new_streak, 1); -- shouldn't happen due to 24h gate
  ELSE
    _new_streak := 1; -- broken streak
  END IF;

  -- Reward scales with streak (capped at day 7) on top of base 250
  _coins := 250 + 50 * LEAST(_new_streak, 7);
  _xp    := 25  * LEAST(_new_streak, 7);

  UPDATE public.profiles
  SET coins = coins + _coins,
      last_daily_bonus = now(),
      last_streak_claim = _today,
      streak_days = _new_streak,
      updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;

  -- Award XP through the standard pipeline (also fires level_up events if any)
  PERFORM public.award_xp(_uid, _xp, 'daily_bonus', jsonb_build_object('day', _new_streak));

  -- Emit streak event so the overlay celebrates it
  INSERT INTO public.progression_events (user_id, kind, payload)
  VALUES (_uid, 'streak', jsonb_build_object(
    'day', _new_streak,
    'coins', _coins,
    'xp', _xp
  ));

  RETURN QUERY SELECT _bal, _coins;
END;
$function$;