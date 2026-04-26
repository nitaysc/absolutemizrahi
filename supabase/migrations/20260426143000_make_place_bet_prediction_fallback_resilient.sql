-- Final hardening pass for place_bet game normalization.
-- Previous fixes only handled a narrow alias list and could still raise
-- "Unknown game" if old/new clients drifted on game naming.
CREATE OR REPLACE FUNCTION public.place_bet(_game text, _bet_amount bigint, _won boolean, _multiplier numeric, _details jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(bet_id uuid, new_balance bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _prof profiles%ROWTYPE;
  _payout BIGINT;
  _normalized_game TEXT := lower(trim(coalesce(_game, '')));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount < 1 THEN RAISE EXCEPTION 'Bet amount must be >= 1'; END IF;
  IF _multiplier < 1 THEN RAISE EXCEPTION 'Multiplier must be >= 1'; END IF;

  -- Normalize historical aliases and minor naming drift.
  _normalized_game := replace(_normalized_game, ' ', '');

  IF _normalized_game IN ('predictions', 'nba_prediction', 'nba-prediction', 'nbaprediction', 'aviamasters') THEN
    _normalized_game := 'prediction';
  ELSIF _normalized_game IN ('coin_flip') THEN
    _normalized_game := 'coinflip';
  ELSIF _normalized_game IN ('dragon-tower', 'dragon_tower', 'dragontowergame') THEN
    _normalized_game := 'dragontower';
  END IF;

  -- If caller game is still unrecognized, infer prediction from details payload.
  IF _normalized_game NOT IN (
    'dice', 'coinflip', 'limbo', 'chicken', 'plinko', 'pump',
    'snakes', 'moles', 'prediction', 'blackjack', 'crash',
    'chess', 'poker', 'dragontower', 'mines', 'wordle'
  ) THEN
    IF coalesce(_details->>'market', '') = 'nba-live-leader' THEN
      _normalized_game := 'prediction';
    ELSE
      RAISE EXCEPTION 'Unknown game';
    END IF;
  END IF;

  SELECT * INTO _prof
  FROM profiles
  WHERE id = _uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF _prof.coins < _bet_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE profiles
  SET coins = coins - _bet_amount,
      updated_at = now()
  WHERE id = _uid;

  _payout := CASE WHEN _won THEN FLOOR(_bet_amount * _multiplier)::BIGINT ELSE 0 END;

  IF _payout > 0 THEN
    UPDATE profiles
    SET coins = coins + _payout,
        updated_at = now()
    WHERE id = _uid;
  END IF;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
  VALUES (_uid, _normalized_game, _bet_amount, _payout, _multiplier, _won, _details)
  RETURNING id INTO bet_id;

  SELECT coins INTO new_balance FROM profiles WHERE id = _uid;
  RETURN NEXT;
END;
$function$;
