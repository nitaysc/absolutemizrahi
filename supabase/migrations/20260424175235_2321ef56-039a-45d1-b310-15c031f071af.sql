
DROP FUNCTION IF EXISTS public.send_coins(TEXT, BIGINT, TEXT);
DROP TABLE IF EXISTS public.coin_transfers;

CREATE OR REPLACE FUNCTION public.admin_grant_coins(_recipient_username TEXT, _amount BIGINT)
RETURNS TABLE(recipient_username TEXT, amount BIGINT, recipient_balance BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _admin_email TEXT;
  _rid UUID;
  _rname TEXT;
  _bal BIGINT;
  _norm TEXT := lower(trim(_recipient_username));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT email INTO _admin_email FROM public.profiles WHERE id = _uid;
  IF _admin_email IS NULL OR lower(_admin_email) <> 'ps4spotifynitay@gmail.com' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _amount IS NULL OR _amount = 0 THEN RAISE EXCEPTION 'Amount required'; END IF;
  IF _norm IS NULL OR _norm = '' THEN RAISE EXCEPTION 'Enter a username'; END IF;

  SELECT id, username INTO _rid, _rname FROM public.profiles
    WHERE lower(username) = _norm LIMIT 1;
  IF _rid IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;

  UPDATE public.profiles
    SET coins = GREATEST(coins + _amount, 0), updated_at = now()
    WHERE id = _rid
    RETURNING coins INTO _bal;

  RETURN QUERY SELECT _rname, _amount, _bal;
END;
$$;
