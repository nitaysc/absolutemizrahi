-- Expand roulette canonicalization/inference in place_bet to avoid
-- accidental "Unknown game" for legacy roulette payload variants.
CREATE OR REPLACE FUNCTION public.place_bet(_game text, _bet_amount bigint, _won boolean, _multiplier numeric, _details jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(new_balance bigint, payout bigint, bet_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _bal BIGINT;
  _payout BIGINT;
  _profit BIGINT;
  _bid UUID;
  _normalized_game TEXT := lower(trim(coalesce(_game, '')));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;

  -- Canonicalize common historical/new-client naming drift.
  _normalized_game := regexp_replace(_normalized_game, '[^a-z0-9]+', '', 'g');

  IF _normalized_game IN ('predictions', 'nbaprediction', 'nbaliveprediction', 'aviamasters') THEN
    _normalized_game := 'prediction';
  ELSIF _normalized_game IN (
    'roulettegame',
    'europeanroulette',
    'europeroulette',
    'roulettetable',
    'roulettewheel',
    'roullete'
  ) THEN
    _normalized_game := 'roulette';
  END IF;

  -- Fallback inference for roulette/prediction payloads to avoid false negatives.
  IF _normalized_game NOT IN ('dice','coinflip','limbo','chicken','plinko','pump','snakes','moles','prediction','roulette') THEN
    IF (
      (_details ? 'bets') AND
      (_details ? 'winning' OR _details ? 'winningNumber' OR _details ? 'winning_number' OR _details ? 'result')
    ) THEN
      _normalized_game := 'roulette';
    ELSIF coalesce(_details->>'market', '') = 'nba-live-leader' THEN
      _normalized_game := 'prediction';
    ELSE
      RAISE EXCEPTION 'Unknown game';
    END IF;
  END IF;

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
  VALUES (_uid, _normalized_game, _bet_amount, _payout, _multiplier, _won, _details)
  RETURNING id INTO _bid;

  RETURN QUERY SELECT _bal, _payout, _bid;
END;
$function$;
