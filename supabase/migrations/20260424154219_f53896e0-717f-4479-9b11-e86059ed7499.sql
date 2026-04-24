
-- =========================================================
-- 1. Crash: process auto-cashouts mid-round
-- =========================================================
CREATE OR REPLACE FUNCTION public.crash_process_autos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _r RECORD;
  _b RECORD;
  _elapsed NUMERIC;
  _now_mult NUMERIC;
  _payout BIGINT;
  _profit BIGINT;
BEGIN
  SELECT * INTO _r FROM public.crash_rounds ORDER BY seq DESC LIMIT 1;
  IF _r.id IS NULL OR _r.status <> 'running' OR _r.start_at IS NULL THEN RETURN; END IF;

  _elapsed := EXTRACT(EPOCH FROM (now() - _r.start_at));
  _now_mult := round(exp(_elapsed * 0.06)::NUMERIC, 2);

  -- Don't pay above the actual crash point
  IF _now_mult >= _r.crash_at THEN RETURN; END IF;

  FOR _b IN
    SELECT cb.* FROM public.crash_bets cb
    WHERE cb.round_id = _r.id
      AND cb.cashed_out_at IS NULL
      AND cb.auto_cashout IS NOT NULL
      AND cb.auto_cashout <= _now_mult
      AND cb.auto_cashout < _r.crash_at
    FOR UPDATE
  LOOP
    _payout := FLOOR(_b.bet_amount * _b.auto_cashout)::BIGINT;
    _profit := GREATEST(_payout - _b.bet_amount, 0);
    UPDATE public.crash_bets
      SET cashed_out_at = _b.auto_cashout, payout = _payout
      WHERE id = _b.id;
    UPDATE public.profiles
      SET coins = coins + _payout,
          total_won = total_won + _profit,
          updated_at = now()
      WHERE id = _b.user_id;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_b.user_id, 'crash', _b.bet_amount, _payout, _b.auto_cashout, true,
              jsonb_build_object('round_id', _r.id, 'auto', true));
  END LOOP;
END;
$$;

-- =========================================================
-- 2. Blackjack
-- =========================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blackjack_round JSONB;

-- Helpers ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bj_hand_value(_hand JSONB)
RETURNS INT
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE _c JSONB; _r TEXT; _v INT := 0; _aces INT := 0;
BEGIN
  FOR _c IN SELECT * FROM jsonb_array_elements(_hand) LOOP
    _r := _c->>'r';
    IF _r IN ('J','Q','K') THEN _v := _v + 10;
    ELSIF _r = 'A' THEN _v := _v + 11; _aces := _aces + 1;
    ELSE _v := _v + _r::INT;
    END IF;
  END LOOP;
  WHILE _v > 21 AND _aces > 0 LOOP _v := _v - 10; _aces := _aces - 1; END LOOP;
  RETURN _v;
END;
$$;

CREATE OR REPLACE FUNCTION public.bj_draw(_deck JSONB, OUT card JSONB, OUT new_deck JSONB)
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE _idx INT;
BEGIN
  _idx := 1 + floor(random() * jsonb_array_length(_deck))::INT;
  card := _deck->(_idx - 1);
  new_deck := (_deck - (_idx - 1));
END;
$$;

CREATE OR REPLACE FUNCTION public.bj_fresh_deck()
RETURNS JSONB LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE _d JSONB := '[]'::jsonb; _s TEXT; _r TEXT;
BEGIN
  FOREACH _s IN ARRAY ARRAY['S','H','D','C'] LOOP
    FOREACH _r IN ARRAY ARRAY['A','2','3','4','5','6','7','8','9','10','J','Q','K'] LOOP
      _d := _d || jsonb_build_object('s', _s, 'r', _r);
    END LOOP;
  END LOOP;
  RETURN _d;
END;
$$;

-- Start ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bj_start(_bet_amount BIGINT)
RETURNS TABLE(new_balance BIGINT, player JSONB, dealer JSONB, status TEXT, payout BIGINT, multiplier NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid UUID := auth.uid();
  _bal BIGINT; _existing JSONB;
  _deck JSONB; _player JSONB := '[]'::jsonb; _dealer JSONB := '[]'::jsonb;
  _card JSONB; _pv INT; _dv INT; _status TEXT := 'playing';
  _payout BIGINT := 0; _profit BIGINT := 0; _mult NUMERIC := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;
  SELECT coins, blackjack_round INTO _bal, _existing FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;
  IF _existing IS NOT NULL AND (_existing->>'active')::BOOLEAN THEN
    RAISE EXCEPTION 'Active blackjack round exists';
  END IF;
  IF _bal < _bet_amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  _deck := public.bj_fresh_deck();
  SELECT card, new_deck INTO _card, _deck FROM public.bj_draw(_deck); _player := _player || _card;
  SELECT card, new_deck INTO _card, _deck FROM public.bj_draw(_deck); _dealer := _dealer || _card;
  SELECT card, new_deck INTO _card, _deck FROM public.bj_draw(_deck); _player := _player || _card;
  SELECT card, new_deck INTO _card, _deck FROM public.bj_draw(_deck); _dealer := _dealer || _card;

  _pv := public.bj_hand_value(_player);
  _dv := public.bj_hand_value(_dealer);

  -- Wager taken now
  UPDATE public.profiles
    SET coins = coins - _bet_amount,
        total_wagered = total_wagered + _bet_amount,
        updated_at = now()
    WHERE id = _uid RETURNING coins INTO _bal;

  -- Natural blackjack handling
  IF _pv = 21 AND _dv = 21 THEN
    _status := 'push'; _payout := _bet_amount; _mult := 1;
  ELSIF _pv = 21 THEN
    _status := 'blackjack'; _payout := FLOOR(_bet_amount * 2.5)::BIGINT; _mult := 2.5;
  ELSIF _dv = 21 THEN
    _status := 'dealer_blackjack'; _payout := 0; _mult := 0;
  END IF;

  IF _status <> 'playing' THEN
    _profit := GREATEST(_payout - _bet_amount, 0);
    UPDATE public.profiles
      SET coins = coins + _payout,
          total_won = total_won + _profit,
          blackjack_round = NULL,
          updated_at = now()
      WHERE id = _uid RETURNING coins INTO _bal;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_uid, 'blackjack', _bet_amount, _payout, _mult, _payout > _bet_amount,
              jsonb_build_object('player', _player, 'dealer', _dealer, 'status', _status));
  ELSE
    UPDATE public.profiles SET blackjack_round = jsonb_build_object(
      'active', true, 'bet', _bet_amount,
      'deck', _deck, 'player', _player, 'dealer', _dealer
    ), updated_at = now() WHERE id = _uid;
  END IF;

  RETURN QUERY SELECT _bal, _player, _dealer, _status, _payout, _mult;
END;
$$;

-- Hit --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bj_hit()
RETURNS TABLE(new_balance BIGINT, player JSONB, dealer JSONB, status TEXT, payout BIGINT, multiplier NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid UUID := auth.uid();
  _round JSONB; _bet BIGINT; _deck JSONB; _player JSONB; _dealer JSONB;
  _card JSONB; _pv INT; _bal BIGINT; _status TEXT := 'playing';
  _payout BIGINT := 0; _profit BIGINT := 0; _mult NUMERIC := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT blackjack_round INTO _round FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::BOOLEAN THEN RAISE EXCEPTION 'No active round'; END IF;

  _bet := (_round->>'bet')::BIGINT;
  _deck := _round->'deck';
  _player := _round->'player';
  _dealer := _round->'dealer';

  SELECT card, new_deck INTO _card, _deck FROM public.bj_draw(_deck);
  _player := _player || _card;
  _pv := public.bj_hand_value(_player);

  IF _pv > 21 THEN
    _status := 'bust'; _payout := 0; _mult := 0;
    UPDATE public.profiles SET blackjack_round = NULL, updated_at = now() WHERE id = _uid RETURNING coins INTO _bal;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_uid, 'blackjack', _bet, 0, 0, false,
              jsonb_build_object('player', _player, 'dealer', _dealer, 'status', _status));
  ELSE
    UPDATE public.profiles SET blackjack_round =
      jsonb_set(jsonb_set(_round, '{deck}', _deck), '{player}', _player),
      updated_at = now() WHERE id = _uid RETURNING coins INTO _bal;
  END IF;

  RETURN QUERY SELECT _bal, _player, _dealer, _status, _payout, _mult;
END;
$$;

-- Stand ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bj_stand()
RETURNS TABLE(new_balance BIGINT, player JSONB, dealer JSONB, status TEXT, payout BIGINT, multiplier NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid UUID := auth.uid();
  _round JSONB; _bet BIGINT; _deck JSONB; _player JSONB; _dealer JSONB;
  _card JSONB; _pv INT; _dv INT; _bal BIGINT; _status TEXT;
  _payout BIGINT := 0; _profit BIGINT := 0; _mult NUMERIC := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT blackjack_round INTO _round FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::BOOLEAN THEN RAISE EXCEPTION 'No active round'; END IF;

  _bet := (_round->>'bet')::BIGINT;
  _deck := _round->'deck';
  _player := _round->'player';
  _dealer := _round->'dealer';
  _pv := public.bj_hand_value(_player);

  -- Dealer hits to 17 (stands on all 17, including soft 17)
  LOOP
    _dv := public.bj_hand_value(_dealer);
    EXIT WHEN _dv >= 17;
    SELECT card, new_deck INTO _card, _deck FROM public.bj_draw(_deck);
    _dealer := _dealer || _card;
  END LOOP;

  IF _dv > 21 OR _pv > _dv THEN
    _status := 'win'; _payout := _bet * 2; _mult := 2;
  ELSIF _pv = _dv THEN
    _status := 'push'; _payout := _bet; _mult := 1;
  ELSE
    _status := 'lose'; _payout := 0; _mult := 0;
  END IF;

  _profit := GREATEST(_payout - _bet, 0);
  UPDATE public.profiles
    SET coins = coins + _payout,
        total_won = total_won + _profit,
        blackjack_round = NULL,
        updated_at = now()
    WHERE id = _uid RETURNING coins INTO _bal;
  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (_uid, 'blackjack', _bet, _payout, _mult, _payout > _bet,
            jsonb_build_object('player', _player, 'dealer', _dealer, 'status', _status));

  RETURN QUERY SELECT _bal, _player, _dealer, _status, _payout, _mult;
END;
$$;

-- Double down ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bj_double()
RETURNS TABLE(new_balance BIGINT, player JSONB, dealer JSONB, status TEXT, payout BIGINT, multiplier NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid UUID := auth.uid();
  _round JSONB; _bet BIGINT; _deck JSONB; _player JSONB; _dealer JSONB;
  _card JSONB; _pv INT; _dv INT; _bal BIGINT; _status TEXT;
  _payout BIGINT := 0; _profit BIGINT := 0; _mult NUMERIC := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT blackjack_round, coins INTO _round, _bal FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::BOOLEAN THEN RAISE EXCEPTION 'No active round'; END IF;

  _bet := (_round->>'bet')::BIGINT;
  IF jsonb_array_length(_round->'player') <> 2 THEN RAISE EXCEPTION 'Can only double on first move'; END IF;
  IF _bal < _bet THEN RAISE EXCEPTION 'Insufficient coins to double'; END IF;

  _deck := _round->'deck';
  _player := _round->'player';
  _dealer := _round->'dealer';

  -- Take additional wager
  UPDATE public.profiles
    SET coins = coins - _bet,
        total_wagered = total_wagered + _bet,
        updated_at = now()
    WHERE id = _uid;

  SELECT card, new_deck INTO _card, _deck FROM public.bj_draw(_deck);
  _player := _player || _card;
  _pv := public.bj_hand_value(_player);

  IF _pv > 21 THEN
    _status := 'bust'; _payout := 0; _mult := 0;
    UPDATE public.profiles SET blackjack_round = NULL, updated_at = now() WHERE id = _uid RETURNING coins INTO _bal;
  ELSE
    LOOP
      _dv := public.bj_hand_value(_dealer);
      EXIT WHEN _dv >= 17;
      SELECT card, new_deck INTO _card, _deck FROM public.bj_draw(_deck);
      _dealer := _dealer || _card;
    END LOOP;
    IF _dv > 21 OR _pv > _dv THEN
      _status := 'win'; _payout := _bet * 4; _mult := 2;  -- 2× on 2× wager
    ELSIF _pv = _dv THEN
      _status := 'push'; _payout := _bet * 2; _mult := 1;
    ELSE
      _status := 'lose'; _payout := 0; _mult := 0;
    END IF;
    _profit := GREATEST(_payout - (_bet * 2), 0);
    UPDATE public.profiles
      SET coins = coins + _payout,
          total_won = total_won + _profit,
          blackjack_round = NULL,
          updated_at = now()
      WHERE id = _uid RETURNING coins INTO _bal;
  END IF;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (_uid, 'blackjack', _bet * 2, _payout, _mult, _payout > _bet * 2,
            jsonb_build_object('player', _player, 'dealer', _dealer, 'status', _status, 'doubled', true));

  RETURN QUERY SELECT _bal, _player, _dealer, _status, _payout, _mult;
END;
$$;
