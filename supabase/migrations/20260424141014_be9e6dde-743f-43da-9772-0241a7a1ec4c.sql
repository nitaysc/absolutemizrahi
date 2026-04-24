
-- Active mines round per user (server-side state so client can't cheat)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mines_round JSONB;

-- Replace place_bet to accept new games
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
  IF _game NOT IN ('dice', 'coinflip', 'limbo') THEN RAISE EXCEPTION 'Unknown game'; END IF;
  IF _multiplier < 0 OR _multiplier > 1000000 THEN RAISE EXCEPTION 'Invalid multiplier'; END IF;

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

-- Start a mines round: deduct bet, place mines, return safe count of revealed (0)
CREATE OR REPLACE FUNCTION public.mines_start(
  _bet_amount BIGINT,
  _mines INT
)
RETURNS TABLE (new_balance BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _bal BIGINT;
  _existing JSONB;
  _bombs INT[];
  _all INT[] := ARRAY(SELECT generate_series(0, 24));
  _picked INT;
  _i INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;
  IF _mines < 1 OR _mines > 24 THEN RAISE EXCEPTION 'Mines must be 1-24'; END IF;

  SELECT coins, mines_round INTO _bal, _existing FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;
  IF _existing IS NOT NULL AND (_existing->>'active')::BOOLEAN THEN
    RAISE EXCEPTION 'Active round exists';
  END IF;
  IF _bal < _bet_amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  -- Pick _mines unique random positions 0..24
  _bombs := ARRAY[]::INT[];
  FOR _i IN 1.._mines LOOP
    _picked := _all[1 + floor(random() * array_length(_all, 1))::INT];
    _bombs := array_append(_bombs, _picked);
    _all := array_remove(_all, _picked);
  END LOOP;

  UPDATE public.profiles
  SET coins = coins - _bet_amount,
      total_wagered = total_wagered + _bet_amount,
      mines_round = jsonb_build_object(
        'active', true,
        'bet', _bet_amount,
        'mines', _mines,
        'bombs', to_jsonb(_bombs),
        'revealed', '[]'::jsonb
      ),
      updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;

  RETURN QUERY SELECT _bal;
END;
$$;

-- Reveal a tile: returns hit_bomb, multiplier, revealed array; if bomb, end round (loss).
CREATE OR REPLACE FUNCTION public.mines_reveal(
  _tile INT
)
RETURNS TABLE (hit_bomb BOOLEAN, multiplier NUMERIC, revealed JSONB, bombs JSONB, ended BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _round JSONB;
  _bombs JSONB;
  _revealed JSONB;
  _bet BIGINT;
  _mines INT;
  _safe_revealed INT;
  _safe_total INT;
  _mult NUMERIC := 1;
  _i INT;
  _prob NUMERIC;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _tile < 0 OR _tile > 24 THEN RAISE EXCEPTION 'Invalid tile'; END IF;

  SELECT mines_round INTO _round FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::BOOLEAN THEN
    RAISE EXCEPTION 'No active round';
  END IF;

  _bombs := _round->'bombs';
  _revealed := _round->'revealed';
  _bet := (_round->>'bet')::BIGINT;
  _mines := (_round->>'mines')::INT;

  -- Already revealed?
  IF _revealed @> to_jsonb(_tile) THEN
    RAISE EXCEPTION 'Already revealed';
  END IF;

  -- Bomb?
  IF _bombs @> to_jsonb(_tile) THEN
    UPDATE public.profiles
    SET mines_round = NULL, updated_at = now()
    WHERE id = _uid;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (_uid, 'mines', _bet, 0, 0, false, jsonb_build_object('mines', _mines, 'tile', _tile));
    RETURN QUERY SELECT true, 0::NUMERIC, _revealed, _bombs, true;
    RETURN;
  END IF;

  -- Safe: append, compute multiplier
  _revealed := _revealed || to_jsonb(_tile);
  _safe_revealed := jsonb_array_length(_revealed);
  _safe_total := 25 - _mines;

  -- Multiplier formula: product of (25-i)/(25-mines-i) for i=0..safe_revealed-1, with 1% house edge
  _mult := 1;
  FOR _i IN 0.._safe_revealed - 1 LOOP
    _mult := _mult * (25 - _i)::NUMERIC / (25 - _mines - _i)::NUMERIC;
  END LOOP;
  _mult := round(_mult * 0.99, 4);

  UPDATE public.profiles
  SET mines_round = jsonb_set(_round, '{revealed}', _revealed),
      updated_at = now()
  WHERE id = _uid;

  RETURN QUERY SELECT false, _mult, _revealed, _bombs, false;
END;
$$;

-- Cashout active mines round
CREATE OR REPLACE FUNCTION public.mines_cashout()
RETURNS TABLE (new_balance BIGINT, payout BIGINT, multiplier NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF _safe_revealed = 0 THEN
    RAISE EXCEPTION 'Reveal at least one tile first';
  END IF;

  _mult := 1;
  FOR _i IN 0.._safe_revealed - 1 LOOP
    _mult := _mult * (25 - _i)::NUMERIC / (25 - _mines - _i)::NUMERIC;
  END LOOP;
  _mult := round(_mult * 0.99, 4);
  _payout := FLOOR(_bet * _mult)::BIGINT;

  UPDATE public.profiles
  SET coins = coins + _payout,
      total_won = total_won + _payout,
      mines_round = NULL,
      updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
  VALUES (_uid, 'mines', _bet, _payout, _mult, true, jsonb_build_object('mines', _mines, 'safe', _safe_revealed, 'bombs', _bombs));

  RETURN QUERY SELECT _bal, _payout, _mult;
END;
$$;

-- Force-end any stuck active round (refund bet) — safety valve
CREATE OR REPLACE FUNCTION public.mines_abandon()
RETURNS TABLE (new_balance BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _round JSONB;
  _bet BIGINT;
  _bal BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT mines_round, coins INTO _round, _bal FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::BOOLEAN THEN
    RETURN QUERY SELECT _bal;
    RETURN;
  END IF;
  _bet := (_round->>'bet')::BIGINT;
  -- If no tiles revealed, refund bet (treat as cancellation)
  IF jsonb_array_length(_round->'revealed') = 0 THEN
    UPDATE public.profiles
    SET coins = coins + _bet,
        total_wagered = total_wagered - _bet,
        mines_round = NULL,
        updated_at = now()
    WHERE id = _uid
    RETURNING coins INTO _bal;
  ELSE
    -- Already played, count as loss
    UPDATE public.profiles
    SET mines_round = NULL, updated_at = now() WHERE id = _uid;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (_uid, 'mines', _bet, 0, 0, false, jsonb_build_object('abandoned', true));
  END IF;
  RETURN QUERY SELECT _bal;
END;
$$;
