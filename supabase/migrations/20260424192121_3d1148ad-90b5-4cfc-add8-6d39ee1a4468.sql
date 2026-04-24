
CREATE TABLE IF NOT EXISTS public.poker_tables (
  id              text PRIMARY KEY,
  small_blind     bigint NOT NULL DEFAULT 1,
  big_blind       bigint NOT NULL DEFAULT 2,
  min_buy_in      bigint NOT NULL DEFAULT 100,
  max_buy_in      bigint NOT NULL DEFAULT 10000,
  seats           int    NOT NULL DEFAULT 6,
  status          text   NOT NULL DEFAULT 'waiting',
  hand_seq        bigint NOT NULL DEFAULT 0,
  dealer_button   int,
  current_seat    int,
  current_bet     bigint NOT NULL DEFAULT 0,
  last_raise_size bigint NOT NULL DEFAULT 0,
  pot             bigint NOT NULL DEFAULT 0,
  deck            jsonb  NOT NULL DEFAULT '[]'::jsonb,
  board           jsonb  NOT NULL DEFAULT '[]'::jsonb,
  phase_ends_at   timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.poker_seats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id        text NOT NULL REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  seat_index      int  NOT NULL,
  user_id         uuid NOT NULL,
  username        text NOT NULL,
  stack           bigint NOT NULL DEFAULT 0,
  hole            jsonb  NOT NULL DEFAULT '[]'::jsonb,
  current_bet     bigint NOT NULL DEFAULT 0,
  total_committed bigint NOT NULL DEFAULT 0,
  status          text   NOT NULL DEFAULT 'waiting',
  has_acted       boolean NOT NULL DEFAULT false,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(table_id, seat_index)
);

CREATE INDEX IF NOT EXISTS poker_seats_table_idx ON public.poker_seats(table_id);
CREATE INDEX IF NOT EXISTS poker_seats_user_idx  ON public.poker_seats(user_id);

ALTER TABLE public.poker_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_seats  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view poker tables" ON public.poker_tables;
DROP POLICY IF EXISTS "Anyone can view poker seats"  ON public.poker_seats;
CREATE POLICY "Anyone can view poker tables" ON public.poker_tables FOR SELECT USING (true);
CREATE POLICY "Anyone can view poker seats"  ON public.poker_seats  FOR SELECT USING (true);

ALTER TABLE public.poker_tables REPLICA IDENTITY FULL;
ALTER TABLE public.poker_seats  REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='poker_tables';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.poker_tables; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='poker_seats';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.poker_seats; END IF;
END $$;

INSERT INTO public.poker_tables (id, small_blind, big_blind, min_buy_in, max_buy_in, seats)
VALUES ('main', 1, 2, 100, 10000, 6)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.poker_fresh_deck()
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE _d jsonb := '[]'::jsonb; _s text; _r text;
BEGIN
  FOREACH _s IN ARRAY ARRAY['S','H','D','C'] LOOP
    FOREACH _r IN ARRAY ARRAY['2','3','4','5','6','7','8','9','T','J','Q','K','A'] LOOP
      _d := _d || jsonb_build_object('s', _s, 'r', _r);
    END LOOP;
  END LOOP;
  RETURN _d;
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_draw(_deck jsonb, OUT card jsonb, OUT new_deck jsonb)
RETURNS record LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _idx int;
BEGIN
  _idx := 1 + floor(random() * jsonb_array_length(_deck))::int;
  card := _deck->(_idx - 1);
  new_deck := (_deck - (_idx - 1));
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_rank_value(_r text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE _r
    WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11 WHEN 'T' THEN 10
    ELSE _r::int END;
$fn$;

CREATE OR REPLACE FUNCTION public.poker_eval7(_cards jsonb)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE
  ranks int[] := ARRAY[]::int[];
  suits text[] := ARRAY[]::text[];
  i int; c jsonb;
  count_by_rank int[] := array_fill(0, ARRAY[15]);
  cs int := 0; ch int := 0; cd int := 0; cc int := 0;
  flush_suit text;
  flush_ranks int[];
  uniq_ranks int[];
  k1 int := 0; k2 int := 0; k3 int := 0; k4 int := 0; k5 int := 0;
  cat int := 1;
  best_str int := 0;
  best_str_flush int := 0;
  pairs int[] := ARRAY[]::int[];
  trips int[] := ARRAY[]::int[];
  quads int[] := ARRAY[]::int[];
  score bigint;
  r int; s text;
  fr int[];
  jj int;
  run_n int; top_n int; prev_n int;
BEGIN
  FOR i IN 0..jsonb_array_length(_cards)-1 LOOP
    c := _cards->i;
    r := public.poker_rank_value(c->>'r');
    s := c->>'s';
    ranks := ranks || r;
    suits := suits || s;
    count_by_rank[r] := count_by_rank[r] + 1;
    IF s='S' THEN cs := cs+1; ELSIF s='H' THEN ch := ch+1; ELSIF s='D' THEN cd := cd+1; ELSE cc := cc+1; END IF;
  END LOOP;

  IF cs>=5 THEN flush_suit := 'S'; ELSIF ch>=5 THEN flush_suit := 'H'; ELSIF cd>=5 THEN flush_suit := 'D'; ELSIF cc>=5 THEN flush_suit := 'C'; END IF;

  uniq_ranks := ARRAY[]::int[];
  FOR r IN REVERSE 14..2 LOOP
    IF count_by_rank[r] > 0 THEN uniq_ranks := uniq_ranks || r; END IF;
  END LOOP;

  run_n := 0; top_n := 0; prev_n := -1;
  FOREACH r IN ARRAY uniq_ranks LOOP
    IF prev_n = -1 THEN run_n := 1;
    ELSIF prev_n - r = 1 THEN run_n := run_n + 1;
    ELSE run_n := 1;
    END IF;
    IF run_n >= 5 AND top_n = 0 THEN top_n := r + 4; END IF;
    prev_n := r;
  END LOOP;
  IF top_n = 0 AND 14 = ANY(uniq_ranks) AND 2 = ANY(uniq_ranks)
     AND 3 = ANY(uniq_ranks) AND 4 = ANY(uniq_ranks) AND 5 = ANY(uniq_ranks) THEN
    top_n := 5;
  END IF;
  best_str := top_n;

  IF flush_suit IS NOT NULL THEN
    flush_ranks := ARRAY[]::int[];
    FOR i IN 1..array_length(ranks,1) LOOP
      IF suits[i] = flush_suit THEN flush_ranks := flush_ranks || ranks[i]; END IF;
    END LOOP;
    SELECT array_agg(DISTINCT v ORDER BY v DESC) INTO flush_ranks FROM unnest(flush_ranks) v;
    run_n := 0; top_n := 0; prev_n := -1;
    FOREACH r IN ARRAY flush_ranks LOOP
      IF prev_n = -1 THEN run_n := 1;
      ELSIF prev_n - r = 1 THEN run_n := run_n + 1;
      ELSE run_n := 1;
      END IF;
      IF run_n >= 5 AND top_n = 0 THEN top_n := r + 4; END IF;
      prev_n := r;
    END LOOP;
    IF top_n = 0 AND 14 = ANY(flush_ranks) AND 2 = ANY(flush_ranks)
       AND 3 = ANY(flush_ranks) AND 4 = ANY(flush_ranks) AND 5 = ANY(flush_ranks) THEN
      top_n := 5;
    END IF;
    best_str_flush := top_n;
  END IF;

  FOR r IN REVERSE 14..2 LOOP
    IF count_by_rank[r] = 4 THEN quads := quads || r;
    ELSIF count_by_rank[r] = 3 THEN trips := trips || r;
    ELSIF count_by_rank[r] = 2 THEN pairs := pairs || r;
    END IF;
  END LOOP;

  IF best_str_flush > 0 THEN
    cat := 9; k1 := best_str_flush;
  ELSIF COALESCE(array_length(quads,1),0) >= 1 THEN
    cat := 8; k1 := quads[1];
    FOR r IN REVERSE 14..2 LOOP
      IF r <> quads[1] AND count_by_rank[r] > 0 THEN k2 := r; EXIT; END IF;
    END LOOP;
  ELSIF COALESCE(array_length(trips,1),0) >= 1 AND (COALESCE(array_length(trips,1),0) >= 2 OR COALESCE(array_length(pairs,1),0) >= 1) THEN
    cat := 7; k1 := trips[1];
    IF COALESCE(array_length(trips,1),0) >= 2 THEN k2 := trips[2]; ELSE k2 := pairs[1]; END IF;
  ELSIF flush_suit IS NOT NULL THEN
    cat := 6;
    fr := ARRAY[]::int[];
    FOR i IN 1..array_length(ranks,1) LOOP
      IF suits[i] = flush_suit THEN fr := fr || ranks[i]; END IF;
    END LOOP;
    SELECT array_agg(v ORDER BY v DESC) INTO fr FROM unnest(fr) v;
    k1 := fr[1]; k2 := fr[2]; k3 := fr[3]; k4 := fr[4]; k5 := fr[5];
  ELSIF best_str > 0 THEN
    cat := 5; k1 := best_str;
  ELSIF COALESCE(array_length(trips,1),0) >= 1 THEN
    cat := 4; k1 := trips[1];
    jj := 2;
    FOR r IN REVERSE 14..2 LOOP
      IF r <> trips[1] AND count_by_rank[r] > 0 THEN
        IF jj = 2 THEN k2 := r; ELSIF jj = 3 THEN k3 := r; END IF;
        jj := jj + 1;
        EXIT WHEN jj > 3;
      END IF;
    END LOOP;
  ELSIF COALESCE(array_length(pairs,1),0) >= 2 THEN
    cat := 3; k1 := pairs[1]; k2 := pairs[2];
    FOR r IN REVERSE 14..2 LOOP
      IF r <> pairs[1] AND r <> pairs[2] AND count_by_rank[r] > 0 THEN k3 := r; EXIT; END IF;
    END LOOP;
  ELSIF COALESCE(array_length(pairs,1),0) = 1 THEN
    cat := 2; k1 := pairs[1];
    jj := 2;
    FOR r IN REVERSE 14..2 LOOP
      IF r <> pairs[1] AND count_by_rank[r] > 0 THEN
        IF jj = 2 THEN k2 := r; ELSIF jj = 3 THEN k3 := r; ELSIF jj = 4 THEN k4 := r; END IF;
        jj := jj + 1;
        EXIT WHEN jj > 4;
      END IF;
    END LOOP;
  ELSE
    cat := 1;
    jj := 1;
    FOR r IN REVERSE 14..2 LOOP
      IF count_by_rank[r] > 0 THEN
        IF jj = 1 THEN k1 := r; ELSIF jj = 2 THEN k2 := r; ELSIF jj = 3 THEN k3 := r; ELSIF jj = 4 THEN k4 := r; ELSE k5 := r; END IF;
        jj := jj + 1;
        EXIT WHEN jj > 5;
      END IF;
    END LOOP;
  END IF;

  score := cat::bigint * 1048576::bigint
         + k1::bigint * 65536::bigint
         + k2::bigint * 4096::bigint
         + k3::bigint * 256::bigint
         + k4::bigint * 16
         + k5::bigint;
  RETURN score;
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_next_actor(_table_id text, _from int)
RETURNS int LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE _seats int; _i int; _idx int; _s RECORD;
BEGIN
  SELECT seats INTO _seats FROM public.poker_tables WHERE id = _table_id;
  FOR _i IN 1.._seats LOOP
    _idx := (_from + _i) % _seats;
    SELECT * INTO _s FROM public.poker_seats
      WHERE table_id = _table_id AND seat_index = _idx;
    IF _s.id IS NOT NULL AND _s.status = 'active' THEN RETURN _idx; END IF;
  END LOOP;
  RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_collect_bets(_table_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _sum bigint; _bb bigint;
BEGIN
  SELECT COALESCE(SUM(current_bet), 0) INTO _sum FROM public.poker_seats WHERE table_id = _table_id;
  SELECT big_blind INTO _bb FROM public.poker_tables WHERE id = _table_id;
  UPDATE public.poker_tables SET pot = pot + _sum,
    current_bet = 0, last_raise_size = _bb, updated_at = now()
    WHERE id = _table_id;
  UPDATE public.poker_seats SET current_bet = 0, has_acted = false, updated_at = now()
    WHERE table_id = _table_id AND status IN ('active','allin');
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_try_start_hand(_table_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _t RECORD; _eligible RECORD; _eligible_count int; _seats int;
  _deck jsonb; _card jsonb; _new_deck jsonb;
  _btn int; _sb_seat int; _bb_seat int; _first_to_act int; _i int;
BEGIN
  SELECT * INTO _t FROM public.poker_tables WHERE id = _table_id FOR UPDATE;
  IF _t.status NOT IN ('waiting','showdown') THEN RETURN; END IF;
  _seats := _t.seats;

  SELECT COUNT(*) INTO _eligible_count FROM public.poker_seats
    WHERE table_id = _table_id AND stack >= _t.big_blind;
  IF _eligible_count < 2 THEN
    UPDATE public.poker_tables SET status = 'waiting',
      board = '[]'::jsonb, deck = '[]'::jsonb, pot = 0,
      current_bet = 0, last_raise_size = 0, current_seat = NULL,
      phase_ends_at = NULL, updated_at = now() WHERE id = _table_id;
    UPDATE public.poker_seats SET status = 'waiting', hole = '[]'::jsonb,
      current_bet = 0, total_committed = 0, has_acted = false, updated_at = now()
      WHERE table_id = _table_id;
    RETURN;
  END IF;

  IF _t.dealer_button IS NULL THEN
    SELECT seat_index INTO _btn FROM public.poker_seats
      WHERE table_id = _table_id AND stack >= _t.big_blind
      ORDER BY seat_index LIMIT 1;
  ELSE
    _btn := _t.dealer_button;
    FOR _i IN 1.._seats LOOP
      _btn := (_btn + 1) % _seats;
      IF EXISTS (SELECT 1 FROM public.poker_seats
                 WHERE table_id = _table_id AND seat_index = _btn AND stack >= _t.big_blind) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.poker_seats SET
    hole = '[]'::jsonb, current_bet = 0, total_committed = 0, has_acted = false,
    status = CASE WHEN stack >= _t.big_blind THEN 'active' ELSE 'sittingout' END,
    updated_at = now()
    WHERE table_id = _table_id;

  IF _eligible_count = 2 THEN
    _sb_seat := _btn;
    _bb_seat := public.poker_next_actor(_table_id, _btn);
  ELSE
    _sb_seat := public.poker_next_actor(_table_id, _btn);
    _bb_seat := public.poker_next_actor(_table_id, _sb_seat);
  END IF;

  UPDATE public.poker_seats SET
    current_bet = LEAST(_t.small_blind, stack),
    total_committed = LEAST(_t.small_blind, stack),
    stack = stack - LEAST(_t.small_blind, stack),
    updated_at = now()
    WHERE table_id = _table_id AND seat_index = _sb_seat;

  UPDATE public.poker_seats SET
    current_bet = LEAST(_t.big_blind, stack),
    total_committed = LEAST(_t.big_blind, stack),
    stack = stack - LEAST(_t.big_blind, stack),
    updated_at = now()
    WHERE table_id = _table_id AND seat_index = _bb_seat;

  UPDATE public.poker_seats SET status = 'allin'
    WHERE table_id = _table_id AND status = 'active' AND stack = 0;

  _deck := public.poker_fresh_deck();
  FOR _i IN 1..2 LOOP
    FOR _eligible IN
      SELECT * FROM public.poker_seats
       WHERE table_id = _table_id AND status IN ('active','allin')
       ORDER BY seat_index
    LOOP
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck);
      _deck := _new_deck;
      UPDATE public.poker_seats SET hole = hole || _card, updated_at = now() WHERE id = _eligible.id;
    END LOOP;
  END LOOP;

  _first_to_act := public.poker_next_actor(_table_id, _bb_seat);
  IF _first_to_act IS NULL THEN _first_to_act := _bb_seat; END IF;

  UPDATE public.poker_tables SET
    status = 'preflop', hand_seq = hand_seq + 1, dealer_button = _btn,
    current_seat = _first_to_act, current_bet = _t.big_blind,
    last_raise_size = _t.big_blind, pot = 0, deck = _deck, board = '[]'::jsonb,
    phase_ends_at = now() + interval '25 seconds', updated_at = now()
    WHERE id = _table_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_settle(_table_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _t RECORD; _alive_count int; _winner RECORD;
  _commits bigint[]; _scores bigint[]; _ids uuid[]; _statuses text[]; _holes jsonb[];
  _prev_cap bigint := 0; _cap bigint;
  _i int; _j int; _n int;
  _layer_pot bigint; _layer_winners int[]; _share bigint; _remainder bigint;
  _best bigint; _all7 jsonb;
BEGIN
  SELECT * INTO _t FROM public.poker_tables WHERE id = _table_id FOR UPDATE;
  PERFORM public.poker_collect_bets(_table_id);
  SELECT * INTO _t FROM public.poker_tables WHERE id = _table_id FOR UPDATE;

  SELECT COUNT(*) INTO _alive_count FROM public.poker_seats
    WHERE table_id = _table_id AND status IN ('active','allin');

  IF _alive_count = 1 THEN
    SELECT * INTO _winner FROM public.poker_seats
      WHERE table_id = _table_id AND status IN ('active','allin') LIMIT 1;
    UPDATE public.poker_seats SET stack = stack + _t.pot, updated_at = now() WHERE id = _winner.id;
    UPDATE public.poker_tables SET pot = 0, status = 'showdown',
      phase_ends_at = now() + interval '4 seconds', updated_at = now() WHERE id = _table_id;
    RETURN;
  END IF;

  SELECT array_agg(total_committed ORDER BY total_committed),
         array_agg(id ORDER BY total_committed),
         array_agg(status ORDER BY total_committed),
         array_agg(hole ORDER BY total_committed)
    INTO _commits, _ids, _statuses, _holes
    FROM public.poker_seats WHERE table_id = _table_id;

  _n := array_length(_ids, 1);
  _scores := array_fill(0::bigint, ARRAY[_n]);
  FOR _i IN 1.._n LOOP
    IF _statuses[_i] IN ('active','allin') THEN
      _all7 := _holes[_i] || _t.board;
      _scores[_i] := public.poker_eval7(_all7);
    END IF;
  END LOOP;

  FOR _i IN 1.._n LOOP
    _cap := _commits[_i];
    IF _cap <= _prev_cap THEN CONTINUE; END IF;

    _layer_pot := 0;
    FOR _j IN 1.._n LOOP
      IF _commits[_j] >= _cap THEN
        _layer_pot := _layer_pot + (_cap - _prev_cap);
      END IF;
    END LOOP;

    IF _layer_pot > 0 THEN
      _layer_winners := ARRAY[]::int[];
      _best := 0;
      FOR _j IN 1.._n LOOP
        IF _commits[_j] >= _cap AND _statuses[_j] IN ('active','allin') THEN
          IF _scores[_j] > _best THEN
            _best := _scores[_j];
            _layer_winners := ARRAY[_j];
          ELSIF _scores[_j] = _best THEN
            _layer_winners := _layer_winners || _j;
          END IF;
        END IF;
      END LOOP;

      IF COALESCE(array_length(_layer_winners, 1),0) > 0 THEN
        _share := _layer_pot / array_length(_layer_winners, 1);
        _remainder := _layer_pot - _share * array_length(_layer_winners, 1);
        FOR _j IN 1..array_length(_layer_winners, 1) LOOP
          UPDATE public.poker_seats
            SET stack = stack + _share + (CASE WHEN _j = 1 THEN _remainder ELSE 0 END),
                updated_at = now()
            WHERE id = _ids[_layer_winners[_j]];
        END LOOP;
      END IF;
    END IF;
    _prev_cap := _cap;
  END LOOP;

  UPDATE public.poker_tables SET pot = 0, status = 'showdown',
    phase_ends_at = now() + interval '5 seconds', updated_at = now() WHERE id = _table_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_advance(_table_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _t RECORD; _alive int; _can_act int;
  _all_acted boolean; _all_matched boolean;
  _next int; _deck jsonb; _card jsonb; _new_deck jsonb; _i int;
BEGIN
  SELECT * INTO _t FROM public.poker_tables WHERE id = _table_id FOR UPDATE;
  IF _t.status NOT IN ('preflop','flop','turn','river') THEN
    IF _t.status = 'showdown' AND (_t.phase_ends_at IS NULL OR _t.phase_ends_at <= now()) THEN
      PERFORM public.poker_try_start_hand(_table_id);
    END IF;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO _alive FROM public.poker_seats
    WHERE table_id = _table_id AND status IN ('active','allin');
  IF _alive <= 1 THEN PERFORM public.poker_settle(_table_id); RETURN; END IF;

  SELECT COUNT(*) INTO _can_act FROM public.poker_seats
    WHERE table_id = _table_id AND status = 'active';

  SELECT
    COALESCE(bool_and(has_acted) FILTER (WHERE status = 'active'), true),
    COALESCE(bool_and(current_bet = _t.current_bet) FILTER (WHERE status = 'active'), true)
    INTO _all_acted, _all_matched
    FROM public.poker_seats WHERE table_id = _table_id;

  IF _can_act = 0 THEN
    _deck := _t.deck;
    IF _t.status = 'preflop' THEN
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
      FOR _i IN 1..3 LOOP
        SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
        UPDATE public.poker_tables SET board = board || _card WHERE id = _table_id;
      END LOOP;
    END IF;
    IF _t.status IN ('preflop','flop') THEN
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
      UPDATE public.poker_tables SET board = board || _card WHERE id = _table_id;
    END IF;
    IF _t.status IN ('preflop','flop','turn') THEN
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
      UPDATE public.poker_tables SET board = board || _card WHERE id = _table_id;
    END IF;
    UPDATE public.poker_tables SET deck = _deck, status = 'river', updated_at = now() WHERE id = _table_id;
    PERFORM public.poker_settle(_table_id);
    RETURN;
  END IF;

  IF _all_acted AND _all_matched THEN
    PERFORM public.poker_collect_bets(_table_id);
    SELECT * INTO _t FROM public.poker_tables WHERE id = _table_id FOR UPDATE;
    _deck := _t.deck;
    IF _t.status = 'preflop' THEN
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
      FOR _i IN 1..3 LOOP
        SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
        UPDATE public.poker_tables SET board = board || _card WHERE id = _table_id;
      END LOOP;
      UPDATE public.poker_tables SET status = 'flop', deck = _deck WHERE id = _table_id;
    ELSIF _t.status = 'flop' THEN
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
      UPDATE public.poker_tables SET board = board || _card, status = 'turn', deck = _deck WHERE id = _table_id;
    ELSIF _t.status = 'turn' THEN
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
      SELECT card, new_deck INTO _card, _new_deck FROM public.poker_draw(_deck); _deck := _new_deck;
      UPDATE public.poker_tables SET board = board || _card, status = 'river', deck = _deck WHERE id = _table_id;
    ELSIF _t.status = 'river' THEN
      PERFORM public.poker_settle(_table_id); RETURN;
    END IF;
    _next := public.poker_next_actor(_table_id, _t.dealer_button);
    UPDATE public.poker_tables SET current_seat = _next,
      phase_ends_at = now() + interval '25 seconds', updated_at = now() WHERE id = _table_id;
    RETURN;
  END IF;

  _next := public.poker_next_actor(_table_id, _t.current_seat);
  UPDATE public.poker_tables SET current_seat = _next,
    phase_ends_at = now() + interval '25 seconds', updated_at = now() WHERE id = _table_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_buy_in(_table_id text, _seat_index int, _amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _t RECORD; _bal bigint; _username text; _existing int;
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
  SELECT coins, COALESCE(username, split_part(email,'@',1), 'player')
    INTO _bal, _username FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal < _amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;
  UPDATE public.profiles SET coins = coins - _amount, updated_at = now() WHERE id = _uid;
  INSERT INTO public.poker_seats (table_id, seat_index, user_id, username, stack, status)
    VALUES (_table_id, _seat_index, _uid, _username, _amount,
      CASE WHEN _t.status = 'waiting' THEN 'waiting' ELSE 'sittingout' END);
  UPDATE public.poker_tables SET updated_at = now() WHERE id = _table_id;
  IF _t.status = 'waiting' THEN PERFORM public.poker_try_start_hand(_table_id); END IF;
  RETURN jsonb_build_object('seat', _seat_index, 'stack', _amount);
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_leave(_table_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _s RECORD; _t RECORD;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _s FROM public.poker_seats WHERE table_id = _table_id AND user_id = _uid FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Not seated'; END IF;
  SELECT * INTO _t FROM public.poker_tables WHERE id = _table_id FOR UPDATE;
  IF _t.status IN ('preflop','flop','turn','river') AND _s.status IN ('active','allin') THEN
    UPDATE public.poker_seats SET status = 'folded', has_acted = true, hole = '[]'::jsonb, updated_at = now() WHERE id = _s.id;
    IF _t.current_seat = _s.seat_index THEN PERFORM public.poker_advance(_table_id); END IF;
  END IF;
  UPDATE public.profiles SET coins = coins + _s.stack, updated_at = now() WHERE id = _uid;
  DELETE FROM public.poker_seats WHERE id = _s.id;
  UPDATE public.poker_tables SET updated_at = now() WHERE id = _table_id;
  RETURN jsonb_build_object('refunded', _s.stack);
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_action(_table_id text, _action text, _amount bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _t RECORD; _s RECORD;
  _to_call bigint; _add bigint; _min_raise bigint; _new_total bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _t FROM public.poker_tables WHERE id = _table_id FOR UPDATE;
  IF _t.status NOT IN ('preflop','flop','turn','river') THEN RAISE EXCEPTION 'Hand not in progress'; END IF;
  SELECT * INTO _s FROM public.poker_seats WHERE table_id = _table_id AND user_id = _uid FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Not seated'; END IF;
  IF _t.current_seat IS NULL OR _s.seat_index <> _t.current_seat THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF _s.status <> 'active' THEN RAISE EXCEPTION 'You cannot act'; END IF;
  _to_call := _t.current_bet - _s.current_bet;

  IF _action = 'fold' THEN
    UPDATE public.poker_seats SET status='folded', has_acted=true, hole='[]'::jsonb, updated_at=now() WHERE id=_s.id;
  ELSIF _action = 'check' THEN
    IF _to_call > 0 THEN RAISE EXCEPTION 'Cannot check, % to call', _to_call; END IF;
    UPDATE public.poker_seats SET has_acted=true, updated_at=now() WHERE id=_s.id;
  ELSIF _action = 'call' THEN
    _add := LEAST(_to_call, _s.stack);
    UPDATE public.poker_seats SET stack=stack-_add, current_bet=current_bet+_add,
      total_committed=total_committed+_add, has_acted=true,
      status=CASE WHEN stack-_add=0 THEN 'allin' ELSE status END, updated_at=now() WHERE id=_s.id;
  ELSIF _action IN ('bet','raise') THEN
    IF _amount <= _t.current_bet THEN RAISE EXCEPTION 'Raise must exceed current bet'; END IF;
    _min_raise := _t.current_bet + _t.last_raise_size;
    IF _amount < _min_raise AND _amount - _s.current_bet < _s.stack THEN
      RAISE EXCEPTION 'Min raise to %', _min_raise;
    END IF;
    _add := _amount - _s.current_bet;
    IF _add > _s.stack THEN RAISE EXCEPTION 'Not enough chips'; END IF;
    UPDATE public.poker_seats SET stack=stack-_add, current_bet=_amount,
      total_committed=total_committed+_add, has_acted=true,
      status=CASE WHEN stack-_add=0 THEN 'allin' ELSE status END, updated_at=now() WHERE id=_s.id;
    UPDATE public.poker_tables SET current_bet=_amount,
      last_raise_size=GREATEST(_amount - _t.current_bet, _t.last_raise_size), updated_at=now()
      WHERE id=_table_id;
    UPDATE public.poker_seats SET has_acted=false, updated_at=now()
      WHERE table_id=_table_id AND status='active' AND id<>_s.id;
    UPDATE public.poker_seats SET has_acted=true WHERE id=_s.id;
  ELSIF _action = 'allin' THEN
    _add := _s.stack;
    IF _add = 0 THEN RAISE EXCEPTION 'No chips'; END IF;
    _new_total := _s.current_bet + _add;
    UPDATE public.poker_seats SET stack=0, current_bet=_new_total,
      total_committed=total_committed+_add, has_acted=true, status='allin', updated_at=now()
      WHERE id=_s.id;
    IF _new_total > _t.current_bet THEN
      UPDATE public.poker_tables SET current_bet=_new_total,
        last_raise_size=GREATEST(_new_total - _t.current_bet, _t.last_raise_size), updated_at=now()
        WHERE id=_table_id;
      UPDATE public.poker_seats SET has_acted=false, updated_at=now()
        WHERE table_id=_table_id AND status='active' AND id<>_s.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown action %', _action;
  END IF;

  PERFORM public.poker_advance(_table_id);
  RETURN jsonb_build_object('ok', true);
END $fn$;

CREATE OR REPLACE FUNCTION public.poker_table_state(_table_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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
END $fn$;
