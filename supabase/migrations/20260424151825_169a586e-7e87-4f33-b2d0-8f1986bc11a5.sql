-- Mines: drop and recreate cashout to return bombs
DROP FUNCTION IF EXISTS public.mines_cashout();

CREATE FUNCTION public.mines_cashout()
RETURNS TABLE(new_balance bigint, payout bigint, multiplier numeric, bombs jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _round JSONB;
  _bet BIGINT;
  _mines INT;
  _safe_revealed INT;
  _mult NUMERIC := 1;
  _i INT;
  _payout BIGINT;
  _bal BIGINT;
  _bombs JSONB;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT mines_round INTO _round FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::BOOLEAN THEN
    RAISE EXCEPTION 'No active round';
  END IF;
  _bet := (_round->>'bet')::BIGINT;
  _mines := (_round->>'mines')::INT;
  _bombs := _round->'bombs';
  _safe_revealed := jsonb_array_length(_round->'revealed');
  IF _safe_revealed = 0 THEN RAISE EXCEPTION 'Reveal at least one tile first'; END IF;
  _mult := 1;
  FOR _i IN 0.._safe_revealed - 1 LOOP
    _mult := _mult * (25 - _i)::NUMERIC / (25 - _mines - _i)::NUMERIC;
  END LOOP;
  _mult := round(_mult * 0.99, 4);
  _payout := FLOOR(_bet * _mult)::BIGINT;
  UPDATE public.profiles
  SET coins = coins + _payout, total_won = total_won + _payout, mines_round = NULL, updated_at = now()
  WHERE id = _uid RETURNING coins INTO _bal;
  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
  VALUES (_uid, 'mines', _bet, _payout, _mult, true, jsonb_build_object('mines', _mines, 'safe', _safe_revealed, 'bombs', _bombs));
  RETURN QUERY SELECT _bal, _payout, _mult, _bombs;
END;
$$;

-- Crash tables
CREATE TABLE IF NOT EXISTS public.crash_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'waiting',
  crash_at NUMERIC(10,2) NOT NULL,
  start_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  seq BIGSERIAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crash_rounds_seq ON public.crash_rounds(seq DESC);

CREATE TABLE IF NOT EXISTS public.crash_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.crash_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  username TEXT NOT NULL,
  bet_amount BIGINT NOT NULL,
  auto_cashout NUMERIC(10,2),
  cashed_out_at NUMERIC(10,2),
  payout BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_crash_bets_round ON public.crash_bets(round_id);

ALTER TABLE public.crash_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crash_bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view crash rounds" ON public.crash_rounds;
CREATE POLICY "Anyone can view crash rounds" ON public.crash_rounds FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can view crash bets" ON public.crash_bets;
CREATE POLICY "Anyone can view crash bets" ON public.crash_bets FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.crash_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crash_bets;

-- Crash multiplier picker (1% house edge)
CREATE OR REPLACE FUNCTION public.crash_pick_multiplier()
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE _u NUMERIC := random(); _m NUMERIC;
BEGIN
  IF _u < 0.01 THEN RETURN 1.00; END IF;
  _m := 0.99 / GREATEST(_u, 0.0001);
  RETURN LEAST(round(_m, 2), 1000);
END;
$$;

-- Get or create the current round
CREATE OR REPLACE FUNCTION public.crash_current_round()
RETURNS TABLE(id uuid, status text, crash_at numeric, start_at timestamptz, ended_at timestamptz, seq bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r RECORD; _new_id UUID; _crash NUMERIC;
BEGIN
  SELECT r.id, r.status, r.crash_at, r.start_at, r.ended_at, r.seq INTO _r
    FROM public.crash_rounds r ORDER BY r.seq DESC LIMIT 1;
  IF _r.id IS NULL OR (_r.status = 'crashed' AND _r.ended_at < now() - interval '5 seconds') THEN
    _crash := public.crash_pick_multiplier();
    INSERT INTO public.crash_rounds (status, crash_at) VALUES ('waiting', _crash) RETURNING crash_rounds.id INTO _new_id;
    RETURN QUERY SELECT cr.id, cr.status, NULL::NUMERIC, cr.start_at, cr.ended_at, cr.seq
      FROM public.crash_rounds cr WHERE cr.id = _new_id;
  ELSE
    RETURN QUERY SELECT _r.id, _r.status,
      CASE WHEN _r.status = 'crashed' THEN _r.crash_at ELSE NULL END,
      _r.start_at, _r.ended_at, _r.seq;
  END IF;
END;
$$;

-- Place a bet
CREATE OR REPLACE FUNCTION public.crash_place_bet(_bet_amount bigint, _auto_cashout numeric DEFAULT NULL)
RETURNS TABLE(round_id uuid, new_balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _round_id UUID; _status TEXT; _bal BIGINT; _username TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;
  IF _auto_cashout IS NOT NULL AND _auto_cashout < 1.01 THEN RAISE EXCEPTION 'Auto cashout too low'; END IF;
  SELECT id, status INTO _round_id, _status FROM public.crash_rounds ORDER BY seq DESC LIMIT 1;
  IF _round_id IS NULL OR _status <> 'waiting' THEN RAISE EXCEPTION 'No waiting round'; END IF;
  SELECT coins, COALESCE(username, split_part(email, '@', 1), 'player') INTO _bal, _username
    FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal < _bet_amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;
  UPDATE public.profiles SET coins = coins - _bet_amount,
    total_wagered = total_wagered + _bet_amount, updated_at = now()
    WHERE id = _uid RETURNING coins INTO _bal;
  INSERT INTO public.crash_bets (round_id, user_id, username, bet_amount, auto_cashout)
    VALUES (_round_id, _uid, _username, _bet_amount, _auto_cashout);
  RETURN QUERY SELECT _round_id, _bal;
END;
$$;

-- Start the round
CREATE OR REPLACE FUNCTION public.crash_start()
RETURNS TABLE(round_id uuid, start_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r RECORD;
BEGIN
  SELECT id, status INTO _r FROM public.crash_rounds ORDER BY seq DESC LIMIT 1 FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'waiting' THEN
    RETURN QUERY SELECT cr.id, cr.start_at FROM public.crash_rounds cr WHERE cr.id = _r.id;
    RETURN;
  END IF;
  UPDATE public.crash_rounds SET status = 'running', start_at = now() WHERE id = _r.id;
  RETURN QUERY SELECT cr.id, cr.start_at FROM public.crash_rounds cr WHERE cr.id = _r.id;
END;
$$;

-- Cashout
CREATE OR REPLACE FUNCTION public.crash_cashout()
RETURNS TABLE(payout bigint, multiplier numeric, new_balance bigint, busted boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _r RECORD; _bet RECORD; _elapsed NUMERIC; _now_mult NUMERIC; _payout BIGINT; _bal BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id, status, crash_at, start_at INTO _r FROM public.crash_rounds ORDER BY seq DESC LIMIT 1;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'No round'; END IF;
  SELECT * INTO _bet FROM public.crash_bets WHERE round_id = _r.id AND user_id = _uid FOR UPDATE;
  IF _bet.id IS NULL THEN RAISE EXCEPTION 'No bet on this round'; END IF;
  IF _bet.cashed_out_at IS NOT NULL THEN RAISE EXCEPTION 'Already cashed out'; END IF;
  IF _r.status = 'waiting' OR _r.start_at IS NULL THEN RAISE EXCEPTION 'Round has not started'; END IF;
  _elapsed := EXTRACT(EPOCH FROM (now() - _r.start_at));
  _now_mult := round(exp(_elapsed * 0.06)::NUMERIC, 2);
  IF _now_mult >= _r.crash_at OR _r.status = 'crashed' THEN
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_uid, 'crash', _bet.bet_amount, 0, _r.crash_at, false,
              jsonb_build_object('round_id', _r.id, 'crash_at', _r.crash_at));
    SELECT coins INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN QUERY SELECT 0::BIGINT, _r.crash_at, _bal, true;
    RETURN;
  END IF;
  _payout := FLOOR(_bet.bet_amount * _now_mult)::BIGINT;
  UPDATE public.crash_bets SET cashed_out_at = _now_mult, payout = _payout WHERE id = _bet.id;
  UPDATE public.profiles SET coins = coins + _payout, total_won = total_won + _payout, updated_at = now()
    WHERE id = _uid RETURNING coins INTO _bal;
  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (_uid, 'crash', _bet.bet_amount, _payout, _now_mult, true, jsonb_build_object('round_id', _r.id));
  RETURN QUERY SELECT _payout, _now_mult, _bal, false;
END;
$$;

-- Settle round
CREATE OR REPLACE FUNCTION public.crash_settle()
RETURNS TABLE(round_id uuid, crash_at numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r RECORD; _b RECORD; _elapsed NUMERIC; _payout BIGINT;
BEGIN
  SELECT * INTO _r FROM public.crash_rounds ORDER BY seq DESC LIMIT 1 FOR UPDATE;
  IF _r.id IS NULL THEN RETURN; END IF;
  IF _r.status = 'crashed' THEN RETURN QUERY SELECT _r.id, _r.crash_at; RETURN; END IF;
  IF _r.status <> 'running' OR _r.start_at IS NULL THEN RETURN; END IF;
  _elapsed := EXTRACT(EPOCH FROM (now() - _r.start_at));
  IF round(exp(_elapsed * 0.06)::NUMERIC, 2) < _r.crash_at THEN RETURN; END IF;
  FOR _b IN SELECT * FROM public.crash_bets
    WHERE round_id = _r.id AND cashed_out_at IS NULL AND auto_cashout IS NOT NULL AND auto_cashout < _r.crash_at
  LOOP
    _payout := FLOOR(_b.bet_amount * _b.auto_cashout)::BIGINT;
    UPDATE public.crash_bets SET cashed_out_at = _b.auto_cashout, payout = _payout WHERE id = _b.id;
    UPDATE public.profiles SET coins = coins + _payout, total_won = total_won + _payout, updated_at = now() WHERE id = _b.user_id;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_b.user_id, 'crash', _b.bet_amount, _payout, _b.auto_cashout, true, jsonb_build_object('round_id', _r.id, 'auto', true));
  END LOOP;
  FOR _b IN SELECT * FROM public.crash_bets WHERE round_id = _r.id AND cashed_out_at IS NULL
  LOOP
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_b.user_id, 'crash', _b.bet_amount, 0, _r.crash_at, false, jsonb_build_object('round_id', _r.id));
  END LOOP;
  UPDATE public.crash_rounds SET status = 'crashed', ended_at = now() WHERE id = _r.id;
  RETURN QUERY SELECT _r.id, _r.crash_at;
END;
$$;