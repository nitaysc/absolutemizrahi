-- Track which promo codes a user has redeemed (one-time use per user)
CREATE TABLE IF NOT EXISTS public.redeemed_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);

ALTER TABLE public.redeemed_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own redemptions"
ON public.redeemed_codes FOR SELECT
USING (auth.uid() = user_id);

-- No direct inserts: only the SECURITY DEFINER function may write.

CREATE OR REPLACE FUNCTION public.redeem_code(_code TEXT)
RETURNS TABLE(new_balance BIGINT, awarded BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _norm TEXT := lower(trim(_code));
  _amount BIGINT := 5000;
  _bal BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _norm NOT IN ('barmitzva', 'cooked', 'mizrahi', 'ez', 'kipa') THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;

  -- Insert redemption row (unique constraint blocks reuse)
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
$$;