-- 1) Crash: lower house edge from 1% → 0.4%, slow growth (0.06 → 0.045)
CREATE OR REPLACE FUNCTION public.crash_pick_multiplier()
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE _u NUMERIC := random(); _m NUMERIC;
BEGIN
  IF _u < 0.005 THEN RETURN 1.00; END IF;
  _m := 0.996 / GREATEST(_u, 0.0001);
  RETURN LEAST(round(_m, 2), 1000);
END;
$$;

CREATE OR REPLACE FUNCTION public.crash_cashout()
 RETURNS TABLE(payout bigint, multiplier numeric, new_balance bigint, busted boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE _uid UUID := auth.uid(); _r RECORD; _bet RECORD; _elapsed NUMERIC; _now_mult NUMERIC; _payout BIGINT; _profit BIGINT; _bal BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id, status, crash_at, start_at INTO _r FROM public.crash_rounds ORDER BY seq DESC LIMIT 1;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'No round'; END IF;
  SELECT * INTO _bet FROM public.crash_bets WHERE round_id = _r.id AND user_id = _uid FOR UPDATE;
  IF _bet.id IS NULL THEN RAISE EXCEPTION 'No bet on this round'; END IF;
  IF _bet.cashed_out_at IS NOT NULL THEN RAISE EXCEPTION 'Already cashed out'; END IF;
  IF _r.status = 'waiting' OR _r.start_at IS NULL THEN RAISE EXCEPTION 'Round has not started'; END IF;
  _elapsed := EXTRACT(EPOCH FROM (now() - _r.start_at));
  _now_mult := round(exp(_elapsed * 0.045)::NUMERIC, 2);
  IF _now_mult >= _r.crash_at OR _r.status = 'crashed' THEN
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_uid, 'crash', _bet.bet_amount, 0, _r.crash_at, false,
              jsonb_build_object('round_id', _r.id, 'crash_at', _r.crash_at));
    SELECT coins INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN QUERY SELECT 0::BIGINT, _r.crash_at, _bal, true;
    RETURN;
  END IF;
  _payout := FLOOR(_bet.bet_amount * _now_mult)::BIGINT;
  _profit := GREATEST(_payout - _bet.bet_amount, 0);
  UPDATE public.crash_bets SET cashed_out_at = _now_mult, payout = _payout WHERE id = _bet.id;
  UPDATE public.profiles SET coins = coins + _payout, total_won = total_won + _profit, updated_at = now()
    WHERE id = _uid RETURNING coins INTO _bal;
  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (_uid, 'crash', _bet.bet_amount, _payout, _now_mult, true, jsonb_build_object('round_id', _r.id));
  RETURN QUERY SELECT _payout, _now_mult, _bal, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.crash_process_autos()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _r RECORD;
  _b RECORD;
  _elapsed NUMERIC;
  _now_mult NUMERIC;
  _payout BIGINT;
  _profit BIGINT;
BEGIN
  SELECT * INTO _r FROM public.crash_rounds ORDER BY seq DESC LIMIT 1;
  IF _r.id IS NULL OR _r.status <> 'running' OR _r.start_at IS NULL THEN RETURN; END IF;
  _elapsed := EXTRACT(EPOCH FROM (now() - _r.start_at));
  _now_mult := round(exp(_elapsed * 0.045)::NUMERIC, 2);
  IF _now_mult >= _r.crash_at THEN RETURN; END IF;
  FOR _b IN
    SELECT cb.* FROM public.crash_bets cb
    WHERE cb.round_id = _r.id
      AND cb.cashed_out_at IS NULL
      AND cb.auto_cashout IS NOT NULL
      AND cb.auto_cashout <= _now_mult
      AND cb.auto_cashout < _r.crash_at
    FOR UPDATE
  LOOP
    _payout := FLOOR(_b.bet_amount * _b.auto_cashout)::BIGINT;
    _profit := GREATEST(_payout - _b.bet_amount, 0);
    UPDATE public.crash_bets SET cashed_out_at = _b.auto_cashout, payout = _payout WHERE id = _b.id;
    UPDATE public.profiles SET coins = coins + _payout, total_won = total_won + _profit, updated_at = now()
      WHERE id = _b.user_id;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_b.user_id, 'crash', _b.bet_amount, _payout, _b.auto_cashout, true,
              jsonb_build_object('round_id', _r.id, 'auto', true));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.crash_settle()
 RETURNS TABLE(round_id uuid, crash_at numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE _r RECORD; _b RECORD; _elapsed NUMERIC; _payout BIGINT; _profit BIGINT;
BEGIN
  SELECT * INTO _r FROM public.crash_rounds ORDER BY seq DESC LIMIT 1 FOR UPDATE;
  IF _r.id IS NULL THEN RETURN; END IF;
  IF _r.status = 'crashed' THEN RETURN QUERY SELECT _r.id, _r.crash_at; RETURN; END IF;
  IF _r.status <> 'running' OR _r.start_at IS NULL THEN RETURN; END IF;
  _elapsed := EXTRACT(EPOCH FROM (now() - _r.start_at));
  IF round(exp(_elapsed * 0.045)::NUMERIC, 2) < _r.crash_at THEN RETURN; END IF;

  FOR _b IN SELECT cb.* FROM public.crash_bets cb
    WHERE cb.round_id = _r.id AND cb.cashed_out_at IS NULL
      AND cb.auto_cashout IS NOT NULL AND cb.auto_cashout < _r.crash_at
  LOOP
    _payout := FLOOR(_b.bet_amount * _b.auto_cashout)::BIGINT;
    _profit := GREATEST(_payout - _b.bet_amount, 0);
    UPDATE public.crash_bets SET cashed_out_at = _b.auto_cashout, payout = _payout WHERE id = _b.id;
    UPDATE public.profiles SET coins = coins + _payout, total_won = total_won + _profit, updated_at = now() WHERE id = _b.user_id;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_b.user_id, 'crash', _b.bet_amount, _payout, _b.auto_cashout, true, jsonb_build_object('round_id', _r.id, 'auto', true));
  END LOOP;

  FOR _b IN SELECT cb.* FROM public.crash_bets cb WHERE cb.round_id = _r.id AND cb.cashed_out_at IS NULL
  LOOP
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_b.user_id, 'crash', _b.bet_amount, 0, _r.crash_at, false, jsonb_build_object('round_id', _r.id));
  END LOOP;

  UPDATE public.crash_rounds SET status = 'crashed', ended_at = now() WHERE id = _r.id;
  RETURN QUERY SELECT _r.id, _r.crash_at;
END;
$$;

-- 2) Pump game: add 'pump' to allowed games for place_bet
CREATE OR REPLACE FUNCTION public.place_bet(_game text, _bet_amount bigint, _won boolean, _multiplier numeric, _details jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(new_balance bigint, payout bigint, bet_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _bal BIGINT;
  _payout BIGINT;
  _profit BIGINT;
  _bid UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;
  IF _game NOT IN ('dice', 'coinflip', 'limbo', 'chicken', 'plinko', 'pump') THEN RAISE EXCEPTION 'Unknown game'; END IF;
  IF _multiplier < 0 OR _multiplier > 1000000 THEN RAISE EXCEPTION 'Invalid multiplier'; END IF;

  SELECT coins INTO _bal FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;
  IF _bal < _bet_amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  _payout := CASE WHEN _won THEN FLOOR(_bet_amount * _multiplier)::BIGINT ELSE 0 END;
  _profit := GREATEST(_payout - _bet_amount, 0);

  UPDATE public.profiles
  SET coins = coins - _bet_amount + _payout,
      total_wagered = total_wagered + _bet_amount,
      total_won = total_won + _profit,
      updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
  VALUES (_uid, _game, _bet_amount, _payout, _multiplier, _won, _details)
  RETURNING id INTO _bid;

  RETURN QUERY SELECT _bal, _payout, _bid;
END;
$$;

-- 3) Pump game: server-authoritative round on profiles.pump_round
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pump_round JSONB;

-- Difficulty pop chances per pump (provably fair-ish, server picks pop pump up-front):
--   easy:   1% pop chance per pump → mult x ~1.03
--   medium: 4% pop                 → mult x ~1.10
--   hard:   10% pop                → mult x ~1.25
--   insane: 25% pop                → mult x ~1.55

CREATE OR REPLACE FUNCTION public.pump_start(_bet_amount bigint, _difficulty text)
 RETURNS TABLE(new_balance bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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

  _pop_chance := CASE _difficulty
    WHEN 'easy'   THEN 0.01
    WHEN 'medium' THEN 0.04
    WHEN 'hard'   THEN 0.10
    WHEN 'insane' THEN 0.25
  END;

  -- Pre-roll the pop pump: geometric distribution
  _pop_at := _max_pumps + 1; -- never pops within range
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
$$;

CREATE OR REPLACE FUNCTION public.pump_pump()
 RETURNS TABLE(popped boolean, pumps int, multiplier numeric, pop_at int)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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

  -- Multiplier per pump — exponential, 0.99 house edge baked in via pop_chance
  _step := CASE _diff
    WHEN 'easy'   THEN 1.03
    WHEN 'medium' THEN 1.10
    WHEN 'hard'   THEN 1.25
    WHEN 'insane' THEN 1.55
  END;
  _mult := round(power(_step, _pumps)::NUMERIC * 0.99, 4);

  IF _pumps >= _pop_at THEN
    -- Popped
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
$$;

CREATE OR REPLACE FUNCTION public.pump_cashout()
 RETURNS TABLE(new_balance bigint, payout bigint, multiplier numeric, pop_at int)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
    WHEN 'easy'   THEN 1.03
    WHEN 'medium' THEN 1.10
    WHEN 'hard'   THEN 1.25
    WHEN 'insane' THEN 1.55
  END;
  _mult := round(power(_step, _pumps)::NUMERIC * 0.99, 4);

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
$$;