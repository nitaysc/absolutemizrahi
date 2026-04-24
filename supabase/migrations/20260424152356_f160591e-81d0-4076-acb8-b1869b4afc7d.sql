CREATE OR REPLACE FUNCTION public.crash_settle()
 RETURNS TABLE(round_id uuid, crash_at numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r RECORD; _b RECORD; _elapsed NUMERIC; _payout BIGINT;
BEGIN
  SELECT * INTO _r FROM public.crash_rounds ORDER BY seq DESC LIMIT 1 FOR UPDATE;
  IF _r.id IS NULL THEN RETURN; END IF;
  IF _r.status = 'crashed' THEN RETURN QUERY SELECT _r.id, _r.crash_at; RETURN; END IF;
  IF _r.status <> 'running' OR _r.start_at IS NULL THEN RETURN; END IF;
  _elapsed := EXTRACT(EPOCH FROM (now() - _r.start_at));
  IF round(exp(_elapsed * 0.06)::NUMERIC, 2) < _r.crash_at THEN RETURN; END IF;

  -- Auto-cashout winners
  FOR _b IN SELECT cb.* FROM public.crash_bets cb
    WHERE cb.round_id = _r.id AND cb.cashed_out_at IS NULL
      AND cb.auto_cashout IS NOT NULL AND cb.auto_cashout < _r.crash_at
  LOOP
    _payout := FLOOR(_b.bet_amount * _b.auto_cashout)::BIGINT;
    UPDATE public.crash_bets SET cashed_out_at = _b.auto_cashout, payout = _payout WHERE id = _b.id;
    UPDATE public.profiles SET coins = coins + _payout, total_won = total_won + _payout, updated_at = now() WHERE id = _b.user_id;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_b.user_id, 'crash', _b.bet_amount, _payout, _b.auto_cashout, true, jsonb_build_object('round_id', _r.id, 'auto', true));
  END LOOP;

  -- Busted bets
  FOR _b IN SELECT cb.* FROM public.crash_bets cb WHERE cb.round_id = _r.id AND cb.cashed_out_at IS NULL
  LOOP
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_b.user_id, 'crash', _b.bet_amount, 0, _r.crash_at, false, jsonb_build_object('round_id', _r.id));
  END LOOP;

  UPDATE public.crash_rounds SET status = 'crashed', ended_at = now() WHERE id = _r.id;
  RETURN QUERY SELECT _r.id, _r.crash_at;
END;
$function$;