-- Multiplayer Blackjack tables + seats + split support
CREATE TABLE IF NOT EXISTS public.bj_tables (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'betting', -- betting | playing | dealer | settled
  min_bet bigint NOT NULL DEFAULT 1,
  seats int NOT NULL DEFAULT 5,
  dealer jsonb NOT NULL DEFAULT '[]'::jsonb,
  deck jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_seat int,
  current_hand int,
  phase_ends_at timestamptz,
  round_seq bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bj_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id text NOT NULL REFERENCES public.bj_tables(id) ON DELETE CASCADE,
  round_seq bigint NOT NULL,
  seat_index int NOT NULL,
  user_id uuid NOT NULL,
  username text NOT NULL,
  bet bigint NOT NULL,
  hands jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{cards:[], bet, doubled, status: playing|stand|bust|blackjack|win|lose|push, payout}]
  current_hand int NOT NULL DEFAULT 0,
  settled boolean NOT NULL DEFAULT false,
  total_payout bigint NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, round_seq, seat_index)
);

CREATE INDEX IF NOT EXISTS bj_seats_table_round_idx ON public.bj_seats(table_id, round_seq);

ALTER TABLE public.bj_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bj_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view bj tables" ON public.bj_tables FOR SELECT USING (true);
CREATE POLICY "Anyone can view bj seats"  ON public.bj_seats  FOR SELECT USING (true);

-- Seed a default shared table
INSERT INTO public.bj_tables (id, status, min_bet, seats, phase_ends_at)
VALUES ('main', 'betting', 1, 5, now() + interval '15 seconds')
ON CONFLICT (id) DO NOTHING;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.bj_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bj_seats;

-- ------------ helpers ------------
CREATE OR REPLACE FUNCTION public.bj_hand_value_arr(_cards jsonb)
RETURNS int LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE _c jsonb; _r text; _v int := 0; _aces int := 0;
BEGIN
  FOR _c IN SELECT * FROM jsonb_array_elements(_cards) LOOP
    _r := _c->>'r';
    IF _r IN ('J','Q','K') THEN _v := _v + 10;
    ELSIF _r = 'A' THEN _v := _v + 11; _aces := _aces + 1;
    ELSE _v := _v + _r::int; END IF;
  END LOOP;
  WHILE _v > 21 AND _aces > 0 LOOP _v := _v - 10; _aces := _aces - 1; END LOOP;
  RETURN _v;
END $$;

-- ------------ join seat (place bet during betting phase) ------------
CREATE OR REPLACE FUNCTION public.bj_join_seat(_table_id text, _bet bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _t RECORD; _bal bigint; _username text; _seat int; _existing int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;

  -- Auto-advance first so the table is in correct phase
  PERFORM public.bj_advance(_table_id);

  SELECT * INTO _t FROM public.bj_tables WHERE id = _table_id FOR UPDATE;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Unknown table'; END IF;
  IF _t.status <> 'betting' THEN RAISE EXCEPTION 'Betting closed'; END IF;
  IF _bet < _t.min_bet THEN RAISE EXCEPTION 'Below min bet'; END IF;

  SELECT COUNT(*) INTO _existing FROM public.bj_seats
    WHERE table_id = _table_id AND round_seq = _t.round_seq AND user_id = _uid;
  IF _existing > 0 THEN RAISE EXCEPTION 'Already seated'; END IF;

  -- Find next free seat index
  SELECT COALESCE(MIN(s), 0) INTO _seat FROM (
    SELECT generate_series(0, _t.seats - 1) AS s
    EXCEPT
    SELECT seat_index FROM public.bj_seats
      WHERE table_id = _table_id AND round_seq = _t.round_seq
  ) free;
  IF _seat IS NULL THEN RAISE EXCEPTION 'Table full'; END IF;

  SELECT coins, COALESCE(username, split_part(email,'@',1), 'player')
    INTO _bal, _username FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal < _bet THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  UPDATE public.profiles SET coins = coins - _bet,
    total_wagered = total_wagered + _bet, updated_at = now()
    WHERE id = _uid RETURNING coins INTO _bal;

  INSERT INTO public.bj_seats (table_id, round_seq, seat_index, user_id, username, bet, hands)
  VALUES (_table_id, _t.round_seq, _seat, _uid, _username, _bet,
          jsonb_build_array(jsonb_build_object(
            'cards','[]'::jsonb,'bet',_bet,'doubled',false,'status','playing','payout',0)));

  UPDATE public.bj_tables SET updated_at = now() WHERE id = _table_id;

  RETURN jsonb_build_object('seat', _seat, 'new_balance', _bal, 'round_seq', _t.round_seq);
END $$;

-- ------------ player action ------------
CREATE OR REPLACE FUNCTION public.bj_action(_table_id text, _action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _t RECORD; _s RECORD; _hands jsonb; _cur int; _hand jsonb; _cards jsonb;
  _deck jsonb; _card jsonb; _idx int; _v int; _bal bigint; _bet bigint;
  _new_hand jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  PERFORM public.bj_advance(_table_id);

  SELECT * INTO _t FROM public.bj_tables WHERE id = _table_id FOR UPDATE;
  IF _t.status <> 'playing' THEN RAISE EXCEPTION 'Not in playing phase'; END IF;

  SELECT * INTO _s FROM public.bj_seats
    WHERE table_id = _table_id AND round_seq = _t.round_seq
      AND seat_index = _t.current_seat AND user_id = _uid FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Not your turn'; END IF;

  _hands := _s.hands; _cur := _s.current_hand; _deck := _t.deck;
  _hand := _hands->_cur; _cards := _hand->'cards';
  _bet := (_hand->>'bet')::bigint;

  IF _action = 'hit' THEN
    _idx := 1 + floor(random() * jsonb_array_length(_deck))::int;
    _card := _deck->(_idx-1); _deck := _deck - (_idx-1);
    _cards := _cards || _card;
    _v := public.bj_hand_value_arr(_cards);
    _new_hand := jsonb_set(_hand, '{cards}', _cards);
    IF _v > 21 THEN
      _new_hand := jsonb_set(_new_hand, '{status}', '"bust"'::jsonb);
    END IF;
    _hands := jsonb_set(_hands, ARRAY[_cur::text], _new_hand);

  ELSIF _action = 'stand' THEN
    _new_hand := jsonb_set(_hand, '{status}', '"stand"'::jsonb);
    _hands := jsonb_set(_hands, ARRAY[_cur::text], _new_hand);

  ELSIF _action = 'double' THEN
    IF jsonb_array_length(_cards) <> 2 THEN RAISE EXCEPTION 'Can only double on first move'; END IF;
    SELECT coins INTO _bal FROM public.profiles WHERE id = _uid FOR UPDATE;
    IF _bal < _bet THEN RAISE EXCEPTION 'Insufficient coins to double'; END IF;
    UPDATE public.profiles SET coins = coins - _bet,
      total_wagered = total_wagered + _bet, updated_at = now() WHERE id = _uid;
    _idx := 1 + floor(random() * jsonb_array_length(_deck))::int;
    _card := _deck->(_idx-1); _deck := _deck - (_idx-1);
    _cards := _cards || _card;
    _v := public.bj_hand_value_arr(_cards);
    _new_hand := jsonb_set(jsonb_set(jsonb_set(_hand,
      '{cards}', _cards), '{doubled}', 'true'::jsonb), '{bet}', to_jsonb(_bet * 2));
    IF _v > 21 THEN
      _new_hand := jsonb_set(_new_hand, '{status}', '"bust"'::jsonb);
    ELSE
      _new_hand := jsonb_set(_new_hand, '{status}', '"stand"'::jsonb);
    END IF;
    _hands := jsonb_set(_hands, ARRAY[_cur::text], _new_hand);

  ELSIF _action = 'split' THEN
    IF jsonb_array_length(_cards) <> 2 THEN RAISE EXCEPTION 'Split requires exactly 2 cards'; END IF;
    DECLARE _v1 text; _v2 text; _r1 int; _r2 int;
    BEGIN
      _v1 := _cards->0->>'r'; _v2 := _cards->1->>'r';
      _r1 := CASE WHEN _v1 IN ('J','Q','K') THEN 10 WHEN _v1='A' THEN 11 ELSE _v1::int END;
      _r2 := CASE WHEN _v2 IN ('J','Q','K') THEN 10 WHEN _v2='A' THEN 11 ELSE _v2::int END;
      IF _r1 <> _r2 THEN RAISE EXCEPTION 'Cards must match in value to split'; END IF;
    END;
    IF jsonb_array_length(_hands) >= 4 THEN RAISE EXCEPTION 'Max 4 hands'; END IF;
    SELECT coins INTO _bal FROM public.profiles WHERE id = _uid FOR UPDATE;
    IF _bal < _bet THEN RAISE EXCEPTION 'Insufficient coins to split'; END IF;
    UPDATE public.profiles SET coins = coins - _bet,
      total_wagered = total_wagered + _bet, updated_at = now() WHERE id = _uid;

    -- Build two new hands with one card each, then deal one extra to current
    DECLARE _h1 jsonb; _h2 jsonb; _c1 jsonb; _c2 jsonb;
    BEGIN
      _c1 := _cards->0; _c2 := _cards->1;
      _idx := 1 + floor(random() * jsonb_array_length(_deck))::int;
      _card := _deck->(_idx-1); _deck := _deck - (_idx-1);
      _h1 := jsonb_build_object('cards', jsonb_build_array(_c1, _card),
        'bet', _bet, 'doubled', false, 'status','playing','payout',0,'split',true);
      _h2 := jsonb_build_object('cards', jsonb_build_array(_c2),
        'bet', _bet, 'doubled', false, 'status','playing','payout',0,'split',true);
      -- Replace current hand with _h1, append _h2 at end
      _hands := jsonb_set(_hands, ARRAY[_cur::text], _h1);
      _hands := _hands || jsonb_build_array(_h2);
    END;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;

  -- Advance current_hand if this hand is done
  IF _action <> 'split' AND ((_hands->_cur)->>'status') <> 'playing' THEN
    -- Move to next hand for this seat, if any still playing
    LOOP
      _cur := _cur + 1;
      EXIT WHEN _cur >= jsonb_array_length(_hands);
      EXIT WHEN ((_hands->_cur)->>'status') = 'playing';
    END LOOP;
  END IF;

  UPDATE public.bj_seats
    SET hands = _hands,
        current_hand = LEAST(_cur, jsonb_array_length(_hands) - 1)
    WHERE id = _s.id;

  -- Refresh deck and turn deadline
  UPDATE public.bj_tables SET deck = _deck,
    phase_ends_at = now() + interval '20 seconds',
    updated_at = now()
    WHERE id = _table_id;

  -- If seat is fully done, advance to next seat
  IF _cur >= jsonb_array_length(_hands) THEN
    PERFORM public.bj_next_seat(_table_id);
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

-- ------------ next seat ------------
CREATE OR REPLACE FUNCTION public.bj_next_seat(_table_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _t RECORD; _next int;
BEGIN
  SELECT * INTO _t FROM public.bj_tables WHERE id = _table_id FOR UPDATE;
  IF _t.status <> 'playing' THEN RETURN; END IF;
  SELECT MIN(seat_index) INTO _next FROM public.bj_seats
    WHERE table_id = _table_id AND round_seq = _t.round_seq
      AND seat_index > _t.current_seat
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(hands) h WHERE h->>'status' = 'playing');
  IF _next IS NULL THEN
    -- All players done → dealer phase
    UPDATE public.bj_tables SET status = 'dealer',
      current_seat = NULL, current_hand = NULL,
      phase_ends_at = now() + interval '1 second',
      updated_at = now()
      WHERE id = _table_id;
  ELSE
    UPDATE public.bj_tables SET current_seat = _next, current_hand = 0,
      phase_ends_at = now() + interval '20 seconds',
      updated_at = now()
      WHERE id = _table_id;
  END IF;
END $$;

-- ------------ advance phase / timers ------------
CREATE OR REPLACE FUNCTION public.bj_advance(_table_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _t RECORD; _s RECORD; _seat_count int; _first_seat int;
  _deck jsonb; _dealer jsonb; _card jsonb; _idx int; _v int;
  _hand jsonb; _hands jsonb; _new_hands jsonb; _i int; _hv int;
  _payout bigint; _profit bigint; _bet bigint; _status text;
  _bj_dealer boolean;
BEGIN
  SELECT * INTO _t FROM public.bj_tables WHERE id = _table_id FOR UPDATE;
  IF _t.id IS NULL THEN RETURN; END IF;

  -- BETTING → PLAYING (when timer expires)
  IF _t.status = 'betting' AND _t.phase_ends_at <= now() THEN
    SELECT COUNT(*) INTO _seat_count FROM public.bj_seats
      WHERE table_id = _t.id AND round_seq = _t.round_seq;
    IF _seat_count = 0 THEN
      -- No players, restart betting window
      UPDATE public.bj_tables SET phase_ends_at = now() + interval '15 seconds',
        updated_at = now() WHERE id = _t.id;
      RETURN;
    END IF;

    -- Build fresh deck and deal
    _deck := public.bj_fresh_deck();
    _dealer := '[]'::jsonb;
    -- Two passes: card to each player then dealer, twice
    FOR _i IN 1..2 LOOP
      FOR _s IN SELECT * FROM public.bj_seats WHERE table_id = _t.id AND round_seq = _t.round_seq ORDER BY seat_index LOOP
        _idx := 1 + floor(random() * jsonb_array_length(_deck))::int;
        _card := _deck->(_idx-1); _deck := _deck - (_idx-1);
        _hands := _s.hands;
        _hand := _hands->0;
        _hand := jsonb_set(_hand, '{cards}', (_hand->'cards') || _card);
        _hands := jsonb_set(_hands, '{0}', _hand);
        UPDATE public.bj_seats SET hands = _hands WHERE id = _s.id;
      END LOOP;
      _idx := 1 + floor(random() * jsonb_array_length(_deck))::int;
      _card := _deck->(_idx-1); _deck := _deck - (_idx-1);
      _dealer := _dealer || _card;
    END LOOP;

    -- Mark naturals (player blackjack with 21 on initial)
    FOR _s IN SELECT * FROM public.bj_seats WHERE table_id = _t.id AND round_seq = _t.round_seq LOOP
      _hand := _s.hands->0;
      _hv := public.bj_hand_value_arr(_hand->'cards');
      IF _hv = 21 THEN
        _hand := jsonb_set(_hand, '{status}', '"blackjack"'::jsonb);
        UPDATE public.bj_seats SET hands = jsonb_set(_s.hands, '{0}', _hand) WHERE id = _s.id;
      END IF;
    END LOOP;

    -- Find first seat with a hand still playing
    SELECT MIN(seat_index) INTO _first_seat FROM public.bj_seats
      WHERE table_id = _t.id AND round_seq = _t.round_seq
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(hands) h WHERE h->>'status' = 'playing');

    IF _first_seat IS NULL THEN
      -- All blackjacks → straight to dealer
      UPDATE public.bj_tables SET status='dealer', deck=_deck, dealer=_dealer,
        current_seat=NULL, current_hand=NULL,
        phase_ends_at = now() + interval '1 second', updated_at=now() WHERE id=_t.id;
    ELSE
      UPDATE public.bj_tables SET status='playing', deck=_deck, dealer=_dealer,
        current_seat=_first_seat, current_hand=0,
        phase_ends_at = now() + interval '20 seconds', updated_at=now() WHERE id=_t.id;
    END IF;
    RETURN;
  END IF;

  -- PLAYING: turn timeout = auto-stand current hand and advance
  IF _t.status = 'playing' AND _t.phase_ends_at <= now() THEN
    SELECT * INTO _s FROM public.bj_seats
      WHERE table_id = _t.id AND round_seq = _t.round_seq
        AND seat_index = _t.current_seat FOR UPDATE;
    IF _s.id IS NOT NULL THEN
      _hands := _s.hands; _i := _s.current_hand;
      _hand := _hands->_i;
      IF (_hand->>'status') = 'playing' THEN
        _hand := jsonb_set(_hand, '{status}', '"stand"'::jsonb);
        _hands := jsonb_set(_hands, ARRAY[_i::text], _hand);
        UPDATE public.bj_seats SET hands = _hands WHERE id = _s.id;
      END IF;
    END IF;
    PERFORM public.bj_next_seat(_t.id);
    RETURN;
  END IF;

  -- DEALER: play out then settle
  IF _t.status = 'dealer' AND _t.phase_ends_at <= now() THEN
    _deck := _t.deck; _dealer := _t.dealer;

    -- Only play dealer if at least one non-bust, non-blackjack hand exists
    SELECT EXISTS (
      SELECT 1 FROM public.bj_seats s, jsonb_array_elements(s.hands) h
      WHERE s.table_id=_t.id AND s.round_seq=_t.round_seq
        AND h->>'status' IN ('stand')
    ) INTO _bj_dealer;

    IF _bj_dealer THEN
      LOOP
        _v := public.bj_hand_value_arr(_dealer);
        EXIT WHEN _v >= 17;
        _idx := 1 + floor(random() * jsonb_array_length(_deck))::int;
        _card := _deck->(_idx-1); _deck := _deck - (_idx-1);
        _dealer := _dealer || _card;
      END LOOP;
    END IF;
    _v := public.bj_hand_value_arr(_dealer);

    -- Settle every seat / every hand
    FOR _s IN SELECT * FROM public.bj_seats WHERE table_id=_t.id AND round_seq=_t.round_seq FOR UPDATE LOOP
      _new_hands := '[]'::jsonb; _payout := 0;
      FOR _i IN 0..jsonb_array_length(_s.hands)-1 LOOP
        _hand := _s.hands->_i;
        _bet := (_hand->>'bet')::bigint;
        _hv := public.bj_hand_value_arr(_hand->'cards');
        _status := _hand->>'status';
        IF _status = 'blackjack' THEN
          _payout := _payout + FLOOR(_bet * 2.5)::bigint;
          _hand := jsonb_set(_hand, '{payout}', to_jsonb(FLOOR(_bet * 2.5)::bigint));
        ELSIF _status = 'bust' THEN
          _hand := jsonb_set(_hand, '{payout}', '0'::jsonb);
        ELSIF _v > 21 OR _hv > _v THEN
          _payout := _payout + _bet * 2;
          _hand := jsonb_set(jsonb_set(_hand, '{status}', '"win"'::jsonb), '{payout}', to_jsonb(_bet * 2));
        ELSIF _hv = _v THEN
          _payout := _payout + _bet;
          _hand := jsonb_set(jsonb_set(_hand, '{status}', '"push"'::jsonb), '{payout}', to_jsonb(_bet));
        ELSE
          _hand := jsonb_set(jsonb_set(_hand, '{status}', '"lose"'::jsonb), '{payout}', '0'::jsonb);
        END IF;
        _new_hands := _new_hands || _hand;
      END LOOP;
      -- Total wagered already deducted at join/double/split time; just credit payout
      _profit := GREATEST(_payout - (SELECT COALESCE(SUM((h->>'bet')::bigint),0)
                                     FROM jsonb_array_elements(_new_hands) h), 0);
      UPDATE public.profiles SET coins = coins + _payout,
        total_won = total_won + _profit, updated_at = now() WHERE id = _s.user_id;
      UPDATE public.bj_seats SET hands = _new_hands, settled = true, total_payout = _payout
        WHERE id = _s.id;
      INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
        VALUES (_s.user_id, 'blackjack', _s.bet, _payout,
                CASE WHEN _s.bet > 0 THEN _payout::numeric / _s.bet ELSE 0 END,
                _payout > _s.bet,
                jsonb_build_object('multiplayer', true, 'table', _t.id, 'round', _t.round_seq,
                  'hands', _new_hands, 'dealer', _dealer));
    END LOOP;

    UPDATE public.bj_tables SET status='settled', dealer=_dealer, deck=_deck,
      current_seat=NULL, current_hand=NULL,
      phase_ends_at = now() + interval '6 seconds', updated_at=now() WHERE id=_t.id;
    RETURN;
  END IF;

  -- SETTLED → next round (new betting window)
  IF _t.status = 'settled' AND _t.phase_ends_at <= now() THEN
    UPDATE public.bj_tables SET status='betting',
      dealer='[]'::jsonb, deck='[]'::jsonb,
      current_seat=NULL, current_hand=NULL,
      round_seq = round_seq + 1,
      phase_ends_at = now() + interval '15 seconds',
      updated_at = now() WHERE id=_t.id;
    RETURN;
  END IF;
END $$;

-- ------------ public read helper ------------
CREATE OR REPLACE FUNCTION public.bj_table_state(_table_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _t RECORD; _seats jsonb;
BEGIN
  PERFORM public.bj_advance(_table_id);
  SELECT * INTO _t FROM public.bj_tables WHERE id = _table_id;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Unknown table'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'seat_index', seat_index, 'user_id', user_id, 'username', username,
    'bet', bet, 'hands', hands, 'current_hand', current_hand,
    'settled', settled, 'total_payout', total_payout
  ) ORDER BY seat_index), '[]'::jsonb)
  INTO _seats FROM public.bj_seats WHERE table_id = _t.id AND round_seq = _t.round_seq;

  RETURN jsonb_build_object(
    'id', _t.id, 'status', _t.status, 'min_bet', _t.min_bet, 'seats_count', _t.seats,
    'dealer', _t.dealer, 'current_seat', _t.current_seat, 'current_hand', _t.current_hand,
    'phase_ends_at', _t.phase_ends_at, 'round_seq', _t.round_seq,
    'seats', _seats
  );
END $$;