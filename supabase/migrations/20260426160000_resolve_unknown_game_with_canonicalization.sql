-- Canonicalize place_bet game names aggressively to eliminate lingering
-- "Unknown game" errors caused by punctuation/casing/legacy aliases.
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
  _raw_game TEXT := lower(trim(coalesce(_game, '')));
  _compact_game TEXT := regexp_replace(lower(trim(coalesce(_game, ''))), '[^a-z0-9]+', '', 'g');
  _normalized_game TEXT;
  _market TEXT := lower(trim(coalesce(_details->>'market', '')));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount < 1 THEN RAISE EXCEPTION 'Bet amount must be >= 1'; END IF;
  IF _multiplier < 1 THEN RAISE EXCEPTION 'Multiplier must be >= 1'; END IF;

  IF _compact_game IN ('prediction', 'predictions', 'nbaprediction', 'sportsprediction', 'aviamasters')
     OR _raw_game IN ('nba_prediction', 'nba-prediction', 'nba prediction') THEN
    _normalized_game := 'prediction';
  ELSIF _compact_game IN ('coinflip', 'coin') OR _raw_game = 'coin_flip' THEN
    _normalized_game := 'coinflip';
  ELSIF _compact_game IN ('dragontower', 'dragontowergame') THEN
    _normalized_game := 'dragontower';
  ELSIF _compact_game IN (
    'dice', 'limbo', 'chicken', 'plinko', 'pump', 'snakes', 'moles',
    'blackjack', 'crash', 'chess', 'poker', 'mines', 'wordle'
  ) THEN
    _normalized_game := _compact_game;
  END IF;

  IF _normalized_game IS NULL THEN
    IF _market IN ('nba-live-leader', 'nba_live_leader')
       OR (_details ? 'picked_team_id' AND _details ? 'event_id') THEN
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
