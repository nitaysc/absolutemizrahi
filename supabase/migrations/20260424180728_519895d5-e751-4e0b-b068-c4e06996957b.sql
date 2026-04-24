CREATE OR REPLACE FUNCTION public.pump_pump()
 RETURNS TABLE(popped boolean, pumps integer, multiplier numeric, pop_at integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _round JSONB;
  _pumps INT;
  _pop_at INT;
  _bet BIGINT;
  _diff TEXT;
  _pop_chance NUMERIC;
  _mult NUMERIC;
  _step NUMERIC;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT pump_round INTO _round FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::BOOLEAN THEN
    RAISE EXCEPTION 'No active round';
  END IF;

  _pumps  := (_round->>'pumps')::INT + 1;
  _pop_at := (_round->>'pop_at')::INT;
  _bet    := (_round->>'bet')::BIGINT;
  _diff   := _round->>'difficulty';
  _pop_chance := (_round->>'pop_chance')::NUMERIC;

  _step := CASE _diff
    WHEN 'easy'   THEN 1.015
    WHEN 'medium' THEN 1.06
    WHEN 'hard'   THEN 1.16
    WHEN 'insane' THEN 1.35
  END;
  _mult := round(power(_step, _pumps)::NUMERIC * 0.97, 4);

  IF _pumps >= _pop_at THEN
    UPDATE public.profiles SET pump_round = NULL, updated_at = now() WHERE id = _uid;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_uid, 'pump', _bet, 0, 0, false,
              jsonb_build_object('difficulty', _diff, 'pumps', _pumps, 'pop_at', _pop_at));
    RETURN QUERY SELECT true, _pumps, 0::NUMERIC, _pop_at;
    RETURN;
  END IF;

  UPDATE public.profiles
    SET pump_round = jsonb_set(_round, '{pumps}', to_jsonb(_pumps)),
        updated_at = now()
    WHERE id = _uid;

  RETURN QUERY SELECT false, _pumps, _mult, _pop_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pump_cashout()
 RETURNS TABLE(new_balance bigint, payout bigint, multiplier numeric, pop_at integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _round JSONB;
  _pumps INT;
  _pop_at INT;
  _bet BIGINT;
  _diff TEXT;
  _step NUMERIC;
  _mult NUMERIC;
  _payout BIGINT;
  _profit BIGINT;
  _bal BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT pump_round INTO _round FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::BOOLEAN THEN
    RAISE EXCEPTION 'No active round';
  END IF;

  _pumps  := (_round->>'pumps')::INT;
  _pop_at := (_round->>'pop_at')::INT;
  _bet    := (_round->>'bet')::BIGINT;
  _diff   := _round->>'difficulty';

  IF _pumps < 1 THEN RAISE EXCEPTION 'Pump at least once first'; END IF;

  _step := CASE _diff
    WHEN 'easy'   THEN 1.015
    WHEN 'medium' THEN 1.06
    WHEN 'hard'   THEN 1.16
    WHEN 'insane' THEN 1.35
  END;
  _mult := round(power(_step, _pumps)::NUMERIC * 0.97, 4);

  _payout := FLOOR(_bet * _mult)::BIGINT;
  _profit := GREATEST(_payout - _bet, 0);

  UPDATE public.profiles
    SET coins = coins + _payout,
        total_won = total_won + _profit,
        pump_round = NULL,
        updated_at = now()
    WHERE id = _uid
    RETURNING coins INTO _bal;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (_uid, 'pump', _bet, _payout, _mult, true,
            jsonb_build_object('difficulty', _diff, 'pumps', _pumps, 'pop_at', _pop_at));

  RETURN QUERY SELECT _bal, _payout, _mult, _pop_at;
END;
$function$;