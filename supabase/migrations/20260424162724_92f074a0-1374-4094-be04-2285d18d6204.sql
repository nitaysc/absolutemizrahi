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
  IF _game NOT IN ('dice', 'coinflip', 'limbo', 'chicken') THEN RAISE EXCEPTION 'Unknown game'; END IF;
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