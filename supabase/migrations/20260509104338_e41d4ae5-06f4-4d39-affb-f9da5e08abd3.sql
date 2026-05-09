CREATE OR REPLACE FUNCTION public.bj_advance(_table_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _t RECORD; _s RECORD; _seat_count int; _first_seat int;
  _deck jsonb; _dealer jsonb; _card jsonb; _idx int; _v int;
  _hand jsonb; _hands jsonb; _new_hands jsonb; _i int; _hv int;
  _payout bigint; _profit bigint; _bet bigint; _status text;
  _bj_dealer boolean;
  _total_bet bigint; _xp_amount bigint;
BEGIN
  SELECT * INTO _t FROM public.bj_tables WHERE id = _table_id FOR UPDATE;
  IF _t.id IS NULL THEN RETURN; END IF;

  IF _t.status = 'betting' AND _t.phase_ends_at <= now() THEN
    SELECT COUNT(*) INTO _seat_count FROM public.bj_seats
      WHERE table_id = _t.id AND round_seq = _t.round_seq;
    IF _seat_count = 0 THEN
      UPDATE public.bj_tables SET phase_ends_at = now() + interval '15 seconds',
        updated_at = now() WHERE id = _t.id;
      RETURN;
    END IF;

    _deck := public.bj_fresh_deck();
    _dealer := '[]'::jsonb;
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

    FOR _s IN SELECT * FROM public.bj_seats WHERE table_id = _t.id AND round_seq = _t.round_seq LOOP
      _hand := _s.hands->0;
      _hv := public.bj_hand_value_arr(_hand->'cards');
      IF _hv = 21 THEN
        _hand := jsonb_set(_hand, '{status}', '"blackjack"'::jsonb);
        UPDATE public.bj_seats SET hands = jsonb_set(_s.hands, '{0}', _hand) WHERE id = _s.id;
      END IF;
    END LOOP;

    SELECT MIN(seat_index) INTO _first_seat FROM public.bj_seats
      WHERE table_id = _t.id AND round_seq = _t.round_seq
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(hands) h WHERE h->>'status' = 'playing');

    IF _first_seat IS NULL THEN
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

  IF _t.status = 'dealer' AND _t.phase_ends_at <= now() THEN
    _deck := _t.deck; _dealer := _t.dealer;

    SELECT EXISTS (
      SELECT 1 FROM public.bj_seats s, jsonb_array_elements(s.hands) h
      WHERE s.table_id=_t.id AND s.round_seq=_t.round_seq
        AND h->>'status' IN ('stand')
    ) INTO _bj_dealer;

    IF _bj_dealer THEN
      LOOP
        _v := public.bj_hand_value_arr(_dealer);
        EXIT WHEN _v >= 17;
        _idx := 1 + floor(random() * jsonb_array_length(_dealer))::int;
        _card := _deck->(_idx-1); _deck := _deck - (_idx-1);
        _dealer := _dealer || _card;
      END LOOP;
    END IF;
    _v := public.bj_hand_value_arr(_dealer);

    FOR _s IN SELECT * FROM public.bj_seats WHERE table_id=_t.id AND round_seq=_t.round_seq FOR UPDATE LOOP
      _new_hands := '[]'::jsonb; _payout := 0; _total_bet := 0;
      FOR _i IN 0..jsonb_array_length(_s.hands)-1 LOOP
        _hand := _s.hands->_i;
        _bet := (_hand->>'bet')::bigint;
        _total_bet := _total_bet + _bet;
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
      _profit := GREATEST(_payout - _total_bet, 0);

      -- Credit coins, total_won AND total_wagered (was missing)
      UPDATE public.profiles
        SET coins = coins + _payout,
            total_won = total_won + _profit,
            total_wagered = total_wagered + _total_bet,
            updated_at = now()
        WHERE id = _s.user_id;

      UPDATE public.bj_seats SET hands = _new_hands, settled = true, total_payout = _payout
        WHERE id = _s.id;

      INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
        VALUES (_s.user_id, 'blackjack', _total_bet, _payout,
                CASE WHEN _total_bet > 0 THEN _payout::numeric / _total_bet ELSE 0 END,
                _payout > _total_bet,
                jsonb_build_object('multiplayer', true, 'table', _t.id, 'round', _t.round_seq,
                  'hands', _new_hands, 'dealer', _dealer));

      -- Award XP for the round (was missing entirely)
      _xp_amount := GREATEST(1, CEIL(_total_bet::numeric / 10.0))::bigint;
      _xp_amount := LEAST(_xp_amount, 50000);
      PERFORM public.award_xp(_s.user_id, _xp_amount, 'blackjack',
        jsonb_build_object('table', _t.id, 'round', _t.round_seq, 'payout', _payout, 'bet', _total_bet));
    END LOOP;

    UPDATE public.bj_tables SET status='settled', dealer=_dealer, deck=_deck,
      current_seat=NULL, current_hand=NULL,
      phase_ends_at = now() + interval '6 seconds', updated_at=now() WHERE id=_t.id;
    RETURN;
  END IF;

  IF _t.status = 'settled' AND _t.phase_ends_at <= now() THEN
    UPDATE public.bj_tables SET status='betting',
      dealer='[]'::jsonb, deck='[]'::jsonb,
      current_seat=NULL, current_hand=NULL,
      round_seq = round_seq + 1,
      phase_ends_at = now() + interval '15 seconds',
      updated_at = now() WHERE id=_t.id;
    RETURN;
  END IF;
END $function$;

-- Compensation for The Big Mizrahi
UPDATE public.profiles
  SET coins = coins + 100000,
      updated_at = now()
  WHERE id = 'c2c779b6-a078-43c3-83e3-12e02ec09f95';

SELECT public.award_xp(
  'c2c779b6-a078-43c3-83e3-12e02ec09f95'::uuid,
  1200000::bigint,
  'blackjack_compensation',
  '{"reason":"missed XP from blackjack settlement bug"}'::jsonb
);

INSERT INTO public.progression_events (user_id, kind, payload)
  VALUES ('c2c779b6-a078-43c3-83e3-12e02ec09f95'::uuid, 'compensation',
    jsonb_build_object('coins', 100000, 'xp', 1200000, 'reason', 'Blackjack rewards bug fix'));