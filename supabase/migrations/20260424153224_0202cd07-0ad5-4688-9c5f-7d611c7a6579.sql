
-- 1) place_bet: total_won += profit only (payout - bet) when won
CREATE OR REPLACE FUNCTION public.place_bet(_game text, _bet_amount bigint, _won boolean, _multiplier numeric, _details jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(new_balance bigint, payout bigint, bet_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _bal BIGINT;
  _payout BIGINT;
  _profit BIGINT;
  _bid UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;
  IF _game NOT IN ('dice', 'coinflip', 'limbo') THEN RAISE EXCEPTION 'Unknown game'; END IF;
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
$function$;

-- 2) mines_cashout: total_won += profit only
CREATE OR REPLACE FUNCTION public.mines_cashout()
 RETURNS TABLE(new_balance bigint, payout bigint, multiplier numeric, bombs jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _round JSONB;
  _bet BIGINT;
  _mines INT;
  _safe_revealed INT;
  _mult NUMERIC := 1;
  _i INT;
  _payout BIGINT;
  _profit BIGINT;
  _bal BIGINT;
  _bombs JSONB;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT mines_round INTO _round FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::BOOLEAN THEN
    RAISE EXCEPTION 'No active round';
  END IF;
  _bet := (_round->>'bet')::BIGINT;
  _mines := (_round->>'mines')::INT;
  _bombs := _round->'bombs';
  _safe_revealed := jsonb_array_length(_round->'revealed');
  IF _safe_revealed = 0 THEN RAISE EXCEPTION 'Reveal at least one tile first'; END IF;
  _mult := 1;
  FOR _i IN 0.._safe_revealed - 1 LOOP
    _mult := _mult * (25 - _i)::NUMERIC / (25 - _mines - _i)::NUMERIC;
  END LOOP;
  _mult := round(_mult * 0.99, 4);
  _payout := FLOOR(_bet * _mult)::BIGINT;
  _profit := GREATEST(_payout - _bet, 0);
  UPDATE public.profiles
  SET coins = coins + _payout, total_won = total_won + _profit, mines_round = NULL, updated_at = now()
  WHERE id = _uid RETURNING coins INTO _bal;
  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
  VALUES (_uid, 'mines', _bet, _payout, _mult, true, jsonb_build_object('mines', _mines, 'safe', _safe_revealed, 'bombs', _bombs));
  RETURN QUERY SELECT _bal, _payout, _mult, _bombs;
END;
$function$;

-- 3) crash_cashout: total_won += profit only
CREATE OR REPLACE FUNCTION public.crash_cashout()
 RETURNS TABLE(payout bigint, multiplier numeric, new_balance bigint, busted boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _now_mult := round(exp(_elapsed * 0.06)::NUMERIC, 2);
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
$function$;

-- 4) crash_settle: total_won += profit only for auto-cashout winners
CREATE OR REPLACE FUNCTION public.crash_settle()
 RETURNS TABLE(round_id uuid, crash_at numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r RECORD; _b RECORD; _elapsed NUMERIC; _payout BIGINT; _profit BIGINT;
BEGIN
  SELECT * INTO _r FROM public.crash_rounds ORDER BY seq DESC LIMIT 1 FOR UPDATE;
  IF _r.id IS NULL THEN RETURN; END IF;
  IF _r.status = 'crashed' THEN RETURN QUERY SELECT _r.id, _r.crash_at; RETURN; END IF;
  IF _r.status <> 'running' OR _r.start_at IS NULL THEN RETURN; END IF;
  _elapsed := EXTRACT(EPOCH FROM (now() - _r.start_at));
  IF round(exp(_elapsed * 0.06)::NUMERIC, 2) < _r.crash_at THEN RETURN; END IF;

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
$function$;

-- 5) redeem_code: add 3 new codes
CREATE OR REPLACE FUNCTION public.redeem_code(_code text)
 RETURNS TABLE(new_balance bigint, awarded bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _norm TEXT := lower(trim(_code));
  _amount BIGINT := 5000;
  _bal BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _norm NOT IN ('barmitzva', 'cooked', 'mizrahi', 'ez', 'kipa', 'para', 'bakbok', 'bomb') THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;

  BEGIN
    INSERT INTO public.redeemed_codes (user_id, code, amount)
    VALUES (_uid, _norm, _amount);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Code already redeemed';
  END;

  UPDATE public.profiles
  SET coins = coins + _amount, updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;

  RETURN QUERY SELECT _bal, _amount;
END;
$function$;

-- 6) Backfill total_won from bets history (sum of profits on winning bets)
UPDATE public.profiles p
SET total_won = COALESCE((
  SELECT SUM(GREATEST(b.payout - b.bet_amount, 0))
  FROM public.bets b
  WHERE b.user_id = p.id AND b.won = true
), 0);
