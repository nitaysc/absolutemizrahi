CREATE OR REPLACE FUNCTION public.wordle_win(_word text, _attempts int)
RETURNS TABLE(new_balance bigint, awarded bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal bigint;
  _award bigint := 500;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _attempts < 1 OR _attempts > 6 THEN RAISE EXCEPTION 'Invalid attempts'; END IF;
  IF _word IS NULL OR length(_word) <> 5 THEN RAISE EXCEPTION 'Invalid word'; END IF;

  UPDATE public.profiles
    SET coins = coins + _award,
        total_won = total_won + _award,
        updated_at = now()
    WHERE id = _uid
    RETURNING coins INTO _bal;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (_uid, 'wordle', 0, _award, 0, true,
            jsonb_build_object('word', lower(_word), 'attempts', _attempts));

  RETURN QUERY SELECT _bal, _award;
END;
$$;