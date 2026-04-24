
-- 1) Add avatar column to profiles + seat tables
ALTER TABLE public.profiles    ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT '🎰';
ALTER TABLE public.bj_seats    ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT '🎰';
ALTER TABLE public.poker_seats ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT '🎰';

-- 2) bj_join_seat: copy avatar from profile when seating
CREATE OR REPLACE FUNCTION public.bj_join_seat(_table_id text, _bet bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _t RECORD; _bal bigint; _username text; _avatar text; _seat int; _existing int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;

  PERFORM public.bj_advance(_table_id);

  SELECT * INTO _t FROM public.bj_tables WHERE id = _table_id FOR UPDATE;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Unknown table'; END IF;
  IF _t.status <> 'betting' THEN RAISE EXCEPTION 'Betting closed'; END IF;
  IF _bet < _t.min_bet THEN RAISE EXCEPTION 'Below min bet'; END IF;

  SELECT COUNT(*) INTO _existing FROM public.bj_seats
    WHERE table_id = _table_id AND round_seq = _t.round_seq AND user_id = _uid;
  IF _existing > 0 THEN RAISE EXCEPTION 'Already seated'; END IF;

  SELECT COALESCE(MIN(s), 0) INTO _seat FROM (
    SELECT generate_series(0, _t.seats - 1) AS s
    EXCEPT
    SELECT seat_index FROM public.bj_seats
      WHERE table_id = _table_id AND round_seq = _t.round_seq
  ) free;
  IF _seat IS NULL THEN RAISE EXCEPTION 'Table full'; END IF;

  SELECT coins,
         COALESCE(username, split_part(email,'@',1), 'player'),
         COALESCE(avatar, '🎰')
    INTO _bal, _username, _avatar
    FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal < _bet THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  UPDATE public.profiles SET coins = coins - _bet,
    total_wagered = total_wagered + _bet, updated_at = now()
    WHERE id = _uid RETURNING coins INTO _bal;

  INSERT INTO public.bj_seats (table_id, round_seq, seat_index, user_id, username, avatar, bet, hands)
  VALUES (_table_id, _t.round_seq, _seat, _uid, _username, _avatar, _bet,
          jsonb_build_array(jsonb_build_object(
            'cards','[]'::jsonb,'bet',_bet,'doubled',false,'status','playing','payout',0)));

  UPDATE public.bj_tables SET updated_at = now() WHERE id = _table_id;

  RETURN jsonb_build_object('seat', _seat, 'new_balance', _bal, 'round_seq', _t.round_seq);
END $function$;

-- 3) bj_table_state: include avatar in returned seats
CREATE OR REPLACE FUNCTION public.bj_table_state(_table_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _t RECORD; _seats jsonb;
BEGIN
  PERFORM public.bj_advance(_table_id);
  SELECT * INTO _t FROM public.bj_tables WHERE id = _table_id;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Unknown table'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'seat_index', seat_index, 'user_id', user_id, 'username', username,
    'avatar', COALESCE(avatar, '🎰'),
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

-- 4) poker_buy_in: copy avatar onto seat
CREATE OR REPLACE FUNCTION public.poker_buy_in(_table_id text, _seat_index int, _amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _t RECORD; _bal bigint; _username text; _avatar text; _existing int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _t FROM public.poker_tables WHERE id = _table_id FOR UPDATE;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Unknown table'; END IF;
  IF _seat_index < 0 OR _seat_index >= _t.seats THEN RAISE EXCEPTION 'Bad seat'; END IF;
  IF _amount < _t.min_buy_in OR _amount > _t.max_buy_in THEN
    RAISE EXCEPTION 'Buy-in must be between % and %', _t.min_buy_in, _t.max_buy_in;
  END IF;
  SELECT COUNT(*) INTO _existing FROM public.poker_seats WHERE table_id = _table_id AND user_id = _uid;
  IF _existing > 0 THEN RAISE EXCEPTION 'Already seated'; END IF;
  SELECT COUNT(*) INTO _existing FROM public.poker_seats WHERE table_id = _table_id AND seat_index = _seat_index;
  IF _existing > 0 THEN RAISE EXCEPTION 'Seat taken'; END IF;
  SELECT coins, COALESCE(username, split_part(email,'@',1), 'player'), COALESCE(avatar, '🎰')
    INTO _bal, _username, _avatar FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal < _amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;
  UPDATE public.profiles SET coins = coins - _amount, updated_at = now() WHERE id = _uid;
  INSERT INTO public.poker_seats (table_id, seat_index, user_id, username, avatar, stack, status)
    VALUES (_table_id, _seat_index, _uid, _username, _avatar, _amount,
      CASE WHEN _t.status = 'waiting' THEN 'waiting' ELSE 'sittingout' END);
  UPDATE public.poker_tables SET updated_at = now() WHERE id = _table_id;
  IF _t.status = 'waiting' THEN PERFORM public.poker_try_start_hand(_table_id); END IF;
  RETURN jsonb_build_object('seat', _seat_index, 'stack', _amount);
END $fn$;

-- 5) poker_table_state: include avatar
CREATE OR REPLACE FUNCTION public.poker_table_state(_table_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _t RECORD; _s RECORD; _seats jsonb := '[]'::jsonb; _seat jsonb;
  _to_call bigint;
BEGIN
  SELECT * INTO _t FROM public.poker_tables WHERE id = _table_id;
  IF _t.id IS NULL THEN RETURN NULL; END IF;
  IF _t.phase_ends_at IS NOT NULL AND _t.phase_ends_at <= now() THEN
    IF _t.status IN ('preflop','flop','turn','river') AND _t.current_seat IS NOT NULL THEN
      SELECT _t.current_bet - poker_seats.current_bet INTO _to_call
        FROM public.poker_seats WHERE table_id = _table_id AND seat_index = _t.current_seat;
      IF _to_call IS NOT NULL THEN
        IF _to_call <= 0 THEN
          UPDATE public.poker_seats SET has_acted=true, updated_at=now()
            WHERE table_id=_table_id AND seat_index=_t.current_seat;
        ELSE
          UPDATE public.poker_seats SET status='folded', has_acted=true, hole='[]'::jsonb, updated_at=now()
            WHERE table_id=_table_id AND seat_index=_t.current_seat;
        END IF;
      END IF;
      PERFORM public.poker_advance(_table_id);
    ELSIF _t.status = 'showdown' THEN
      PERFORM public.poker_try_start_hand(_table_id);
    END IF;
    SELECT * INTO _t FROM public.poker_tables WHERE id = _table_id;
  END IF;

  FOR _s IN SELECT * FROM public.poker_seats WHERE table_id = _table_id ORDER BY seat_index LOOP
    _seat := jsonb_build_object(
      'seat_index', _s.seat_index, 'user_id', _s.user_id, 'username', _s.username,
      'avatar', COALESCE(_s.avatar, '🎰'),
      'stack', _s.stack, 'current_bet', _s.current_bet,
      'total_committed', _s.total_committed, 'status', _s.status, 'has_acted', _s.has_acted,
      'hole', CASE
        WHEN _s.user_id = _uid THEN _s.hole
        WHEN _t.status = 'showdown' AND _s.status IN ('active','allin') AND jsonb_array_length(_s.hole) > 0 THEN _s.hole
        ELSE jsonb_build_array(jsonb_array_length(_s.hole))
      END,
      'is_me', _s.user_id = _uid
    );
    _seats := _seats || _seat;
  END LOOP;

  RETURN jsonb_build_object(
    'id', _t.id, 'status', _t.status,
    'small_blind', _t.small_blind, 'big_blind', _t.big_blind,
    'min_buy_in', _t.min_buy_in, 'max_buy_in', _t.max_buy_in,
    'seats_count', _t.seats, 'hand_seq', _t.hand_seq,
    'dealer_button', _t.dealer_button, 'current_seat', _t.current_seat,
    'current_bet', _t.current_bet, 'last_raise_size', _t.last_raise_size,
    'pot', _t.pot, 'board', _t.board,
    'phase_ends_at', _t.phase_ends_at, 'seats', _seats
  );
END $function$;
