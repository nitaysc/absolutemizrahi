
CREATE TABLE public.coin_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coin_transfers_sender ON public.coin_transfers(sender_id, created_at DESC);
CREATE INDEX idx_coin_transfers_recipient ON public.coin_transfers(recipient_id, created_at DESC);

ALTER TABLE public.coin_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own transfers"
ON public.coin_transfers
FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.send_coins(_recipient_username TEXT, _amount BIGINT, _note TEXT DEFAULT NULL)
RETURNS TABLE(new_balance BIGINT, recipient_username TEXT, amount BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _rid UUID;
  _rname TEXT;
  _bal BIGINT;
  _norm TEXT := lower(trim(_recipient_username));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF _norm IS NULL OR _norm = '' THEN RAISE EXCEPTION 'Enter a username'; END IF;

  SELECT id, username INTO _rid, _rname FROM public.profiles
    WHERE lower(username) = _norm LIMIT 1;
  IF _rid IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;
  IF _rid = _uid THEN RAISE EXCEPTION 'Cannot send coins to yourself'; END IF;

  SELECT coins INTO _bal FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;
  IF _bal < _amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  UPDATE public.profiles
    SET coins = coins - _amount, updated_at = now()
    WHERE id = _uid
    RETURNING coins INTO _bal;

  UPDATE public.profiles
    SET coins = coins + _amount, updated_at = now()
    WHERE id = _rid;

  INSERT INTO public.coin_transfers (sender_id, recipient_id, amount, note)
    VALUES (_uid, _rid, _amount, NULLIF(trim(_note), ''));

  RETURN QUERY SELECT _bal, _rname, _amount;
END;
$$;
