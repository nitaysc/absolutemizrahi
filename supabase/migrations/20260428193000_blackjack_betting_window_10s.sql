-- Reduce blackjack betting window from 15s to 10s
-- and align currently waiting rounds.

CREATE OR REPLACE FUNCTION public.bj_advance(_table_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _t RECORD;
  _s RECORD;
  _deck jsonb;
  _dealer jsonb;
  _card jsonb;
  _new_deck jsonb;
  _arr jsonb;
  _i int;
  _hand jsonb;
  _hands jsonb;
  _v int;
  _active_count int;
  _next_seat int;
  _uid uuid;
  _bal bigint;
  _bet bigint;
  _payout bigint;
  _status text;
  _mult numeric;
BEGIN
  SELECT * INTO _t FROM public.bj_tables WHERE id = _table_id FOR UPDATE;
  IF _t.id IS NULL THEN RETURN; END IF;

  IF _t.status = 'betting' AND _t.phase_ends_at <= now() THEN
    SELECT COUNT(*) INTO _active_count FROM public.bj_seats WHERE table_id=_t.id AND round_seq=_t.round_seq;
    IF _active_count = 0 THEN
      UPDATE public.bj_tables SET phase_ends_at = now() + interval '10 seconds',
        updated_at=now() WHERE id=_t.id;
      RETURN;
    END IF;

    _deck := public.bj_fresh_deck();
    _dealer := '[]'::jsonb;
    FOR _i IN 1..2 LOOP
      SELECT card, new_deck INTO _card, _new_deck FROM public.bj_draw(_deck); _deck := _new_deck; _dealer := _dealer || _card;
    END LOOP;

    FOR _s IN SELECT * FROM public.bj_seats WHERE table_id=_t.id AND round_seq=_t.round_seq ORDER BY seat_index LOOP
      _hands := '[]'::jsonb;
      _hand := jsonb_build_object('cards','[]'::jsonb,'bet',_s.bet,'doubled',false,'status','playing','payout',0);
      FOR _i IN 1..2 LOOP
        SELECT card, new_deck INTO _card, _new_deck FROM public.bj_draw(_deck); _deck := _new_deck;
        _hand := jsonb_set(_hand,'{cards}', (_hand->'cards') || _card);
      END LOOP;
      _v := public.bj_hand_value(_hand->'cards');
      IF _v = 21 THEN
        _hand := jsonb_set(_hand, '{status}', '"blackjack"'::jsonb);
      END IF;
      _hands := _hands || _hand;
      UPDATE public.bj_seats SET hands=_hands, current_hand=0, settled=false, total_payout=0 WHERE id=_s.id;
    END LOOP;

    SELECT COUNT(*) INTO _active_count
    FROM public.bj_seats s
    WHERE s.table_id=_t.id AND s.round_seq=_t.round_seq
      AND COALESCE((s.hands->0->>'status'),'') <> 'blackjack';

    IF _active_count = 0 THEN
      UPDATE public.bj_tables SET status='dealer', deck=_deck, dealer=_dealer,
        current_seat=NULL, current_hand=NULL,
        phase_ends_at = now() + interval '1 second', updated_at=now() WHERE id=_t.id;
    ELSE
      UPDATE public.bj_tables SET status='playing', deck=_deck, dealer=_dealer,
        current_seat = (SELECT MIN(seat_index) FROM public.bj_seats WHERE table_id=_t.id AND round_seq=_t.round_seq), current_hand=0,
        phase_ends_at = now() + interval '20 seconds', updated_at=now() WHERE id=_t.id;
    END IF;
    RETURN;
  END IF;

  IF _t.status = 'playing' AND _t.phase_ends_at <= now() THEN
    FOR _s IN SELECT * FROM public.bj_seats WHERE table_id=_t.id AND round_seq=_t.round_seq ORDER BY seat_index LOOP
      _hands := _s.hands;
      FOR _i IN 0..jsonb_array_length(_hands)-1 LOOP
        _hand := _hands->_i;
        IF COALESCE(_hand->>'status','') = 'playing' THEN
          _hand := jsonb_set(_hand,'{status}','"stand"'::jsonb);
          _hands := jsonb_set(_hands, ARRAY[_i::text], _hand);
        END IF;
      END LOOP;
      UPDATE public.bj_seats SET hands=_hands WHERE id=_s.id;
    END LOOP;
    UPDATE public.bj_tables SET status='dealer', phase_ends_at = now() + interval '1 second', updated_at=now() WHERE id=_t.id;
    RETURN;
  END IF;

  IF _t.status = 'dealer' AND _t.phase_ends_at <= now() THEN
    _deck := _t.deck; _dealer := _t.dealer;

    LOOP
      _v := public.bj_hand_value(_dealer);
      EXIT WHEN _v >= 17;
      SELECT card, new_deck INTO _card, _new_deck FROM public.bj_draw(_deck); _deck := _new_deck;
      _dealer := _dealer || _card;
    END LOOP;

    FOR _s IN SELECT * FROM public.bj_seats WHERE table_id=_t.id AND round_seq=_t.round_seq ORDER BY seat_index LOOP
      _hands := _s.hands; _payout := 0;
      FOR _i IN 0..jsonb_array_length(_hands)-1 LOOP
        _hand := _hands->_i;
        _bet := COALESCE((_hand->>'bet')::bigint,0);
        _status := COALESCE(_hand->>'status','lose');
        _mult := 0;
        IF _status = 'blackjack' THEN
          _mult := 2.5;
          _status := 'blackjack';
        ELSE
          _v := public.bj_hand_value(_hand->'cards');
          IF _v > 21 THEN _status := 'bust'; _mult := 0;
          ELSE
            IF public.bj_hand_value(_dealer) > 21 OR _v > public.bj_hand_value(_dealer) THEN _status := 'win'; _mult := 2;
            ELSIF _v = public.bj_hand_value(_dealer) THEN _status := 'push'; _mult := 1;
            ELSE _status := 'lose'; _mult := 0;
            END IF;
          END IF;
        END IF;

        _hand := jsonb_set(_hand, '{status}', to_jsonb(_status));
        _hand := jsonb_set(_hand, '{payout}', to_jsonb(FLOOR(_bet * _mult)::bigint));
        _hands := jsonb_set(_hands, ARRAY[_i::text], _hand);
        _payout := _payout + FLOOR(_bet * _mult)::bigint;
      END LOOP;

      UPDATE public.bj_seats SET hands=_hands, settled=true, total_payout=_payout WHERE id=_s.id;
      IF _payout > 0 THEN
        UPDATE public.profiles SET coins = coins + _payout, updated_at = now() WHERE id = _s.user_id RETURNING coins INTO _bal;
      ELSE
        SELECT coins INTO _bal FROM public.profiles WHERE id = _s.user_id;
      END IF;

      INSERT INTO public.bet_history (user_id, game, bet_amount, payout, multiplier, won, metadata, created_at)
      VALUES (_s.user_id, 'blackjack', _s.bet, _payout,
        CASE WHEN _s.bet > 0 THEN (_payout::numeric / _s.bet::numeric) ELSE 0 END,
        _payout > _s.bet,
        jsonb_build_object('table',_t.id,'round_seq',_t.round_seq,'hands',_hands,'dealer',_dealer,'balance_after',_bal), now());
    END LOOP;

    UPDATE public.bj_tables SET status='settled', dealer=_dealer, deck=_deck,
      current_seat=NULL, current_hand=NULL,
      phase_ends_at = now() + interval '6 seconds', updated_at=now() WHERE id=_t.id;
    RETURN;
  END IF;

  IF _t.status = 'settled' AND _t.phase_ends_at <= now() THEN
    UPDATE public.bj_tables SET status='betting',
      dealer='[]'::jsonb, deck='[]'::jsonb, current_seat=NULL, current_hand=NULL,
      round_seq = round_seq + 1,
      phase_ends_at = now() + interval '10 seconds',
      updated_at = now()
    WHERE id=_t.id;
    DELETE FROM public.bj_seats WHERE table_id=_t.id AND round_seq=_t.round_seq;
    RETURN;
  END IF;
END $fn$;

UPDATE public.bj_tables
SET phase_ends_at = LEAST(phase_ends_at, now() + interval '10 seconds')
WHERE status = 'betting';
