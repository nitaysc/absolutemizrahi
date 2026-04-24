
-- Reset legacy workout-app structure we don't need
DROP TRIGGER IF EXISTS on_workout_insert ON public.workout_logs;
DROP TRIGGER IF EXISTS on_workout_delete ON public.workout_logs;
DROP FUNCTION IF EXISTS public.update_user_stats_on_workout() CASCADE;
DROP FUNCTION IF EXISTS public.update_user_stats_on_workout_delete() CASCADE;
DROP FUNCTION IF EXISTS public.get_rank_from_xp(integer) CASCADE;
DROP TABLE IF EXISTS public.workout_logs CASCADE;
DROP TABLE IF EXISTS public.streaks CASCADE;

-- Reshape profiles for the casino
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS total_xp,
  DROP COLUMN IF EXISTS current_streak,
  DROP COLUMN IF EXISTS longest_streak,
  DROP COLUMN IF EXISTS last_workout_date,
  DROP COLUMN IF EXISTS current_rank,
  DROP COLUMN IF EXISTS onboarding_complete;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS coins BIGINT NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS total_wagered BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_won BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_daily_bonus TIMESTAMPTZ;

-- Bets log
CREATE TABLE IF NOT EXISTS public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  bet_amount BIGINT NOT NULL CHECK (bet_amount > 0),
  payout BIGINT NOT NULL DEFAULT 0,
  multiplier NUMERIC(10,4) NOT NULL DEFAULT 0,
  won BOOLEAN NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bets_user_idx ON public.bets(user_id, created_at DESC);

ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own bets" ON public.bets;
CREATE POLICY "Users view own bets" ON public.bets FOR SELECT USING (auth.uid() = user_id);

-- No direct INSERT on bets — only the SECURITY DEFINER function may insert.

-- New-user trigger: create profile with 1000 coins
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, coins)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    1000
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Atomic bet settlement
CREATE OR REPLACE FUNCTION public.place_bet(
  _game TEXT,
  _bet_amount BIGINT,
  _won BOOLEAN,
  _multiplier NUMERIC,
  _details JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (new_balance BIGINT, payout BIGINT, bet_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _bal BIGINT;
  _payout BIGINT;
  _bid UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;
  IF _game NOT IN ('dice', 'coinflip') THEN RAISE EXCEPTION 'Unknown game'; END IF;
  IF _multiplier < 0 OR _multiplier > 1000 THEN RAISE EXCEPTION 'Invalid multiplier'; END IF;

  SELECT coins INTO _bal FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;
  IF _bal < _bet_amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  _payout := CASE WHEN _won THEN FLOOR(_bet_amount * _multiplier)::BIGINT ELSE 0 END;

  UPDATE public.profiles
  SET coins = coins - _bet_amount + _payout,
      total_wagered = total_wagered + _bet_amount,
      total_won = total_won + _payout,
      updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
  VALUES (_uid, _game, _bet_amount, _payout, _multiplier, _won, _details)
  RETURNING id INTO _bid;

  RETURN QUERY SELECT _bal, _payout, _bid;
END;
$$;

-- Daily bonus: 250 coins, once per 24h
CREATE OR REPLACE FUNCTION public.claim_daily_bonus()
RETURNS TABLE (new_balance BIGINT, awarded BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _last TIMESTAMPTZ;
  _bal BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT last_daily_bonus, coins INTO _last, _bal FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _last IS NOT NULL AND _last > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Daily bonus already claimed';
  END IF;
  UPDATE public.profiles
  SET coins = coins + 250, last_daily_bonus = now(), updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;
  RETURN QUERY SELECT _bal, 250::BIGINT;
END;
$$;
