
-- Add hidden fractional coin balance to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coins_decimal NUMERIC(12,6) NOT NULL DEFAULT 0;

-- Update place_bet to support fractional payouts (e.g. 0.25× returns).
-- The integer part adds to coins immediately; the leftover fraction
-- accumulates in coins_decimal silently. When coins_decimal crosses 1
-- it carries over to coins, so players slowly earn back tiny amounts.
CREATE OR REPLACE FUNCTION public.place_bet(
  _game text,
  _bet_amount bigint,
  _won boolean,
  _multiplier numeric,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(new_balance bigint, payout bigint, bet_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _bal BIGINT;
  _frac NUMERIC;
  _raw_payout NUMERIC;
  _payout BIGINT;
  _payout_frac NUMERIC;
  _carry BIGINT;
  _new_frac NUMERIC;
  _profit BIGINT;
  _bid UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;
  IF _game IS NULL OR length(_game) = 0 OR length(_game) > 32 OR _game !~ '^[a-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Unknown game';
  END IF;
  IF _multiplier < 0 OR _multiplier > 1000000 THEN RAISE EXCEPTION 'Invalid multiplier'; END IF;

  SELECT coins, coins_decimal INTO _bal, _frac FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;
  IF _bal < _bet_amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  IF _won THEN
    _raw_payout := (_bet_amount)::numeric * _multiplier;
    _payout := FLOOR(_raw_payout)::BIGINT;
    _payout_frac := _raw_payout - _payout;
  ELSE
    _payout := 0;
    _payout_frac := 0;
  END IF;

  -- accumulate hidden fractional balance, carry whole units into coins
  _new_frac := _frac + _payout_frac;
  _carry := FLOOR(_new_frac)::BIGINT;
  _new_frac := _new_frac - _carry;

  _profit := GREATEST(_payout + _carry - _bet_amount, 0);

  UPDATE public.profiles
    SET coins = coins - _bet_amount + _payout + _carry,
        coins_decimal = _new_frac,
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
