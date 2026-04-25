
-- ============ TABLES ============
CREATE TABLE public.chess_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('ai','pvp')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','finished')),
  white_id uuid,
  black_id uuid,
  white_username text,
  black_username text,
  white_avatar text DEFAULT '🎰',
  black_avatar text DEFAULT '🎰',
  bet bigint NOT NULL DEFAULT 0,
  ai_elo int,
  ai_color text CHECK (ai_color IN ('w','b')),
  time_control text NOT NULL DEFAULT '5+3',
  initial_ms int NOT NULL DEFAULT 300000,
  increment_ms int NOT NULL DEFAULT 3000,
  white_time_ms int NOT NULL DEFAULT 300000,
  black_time_ms int NOT NULL DEFAULT 300000,
  fen text NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn text NOT NULL DEFAULT '',
  turn text NOT NULL DEFAULT 'w' CHECK (turn IN ('w','b')),
  result text,
  result_reason text,
  draw_offered_by uuid,
  last_move_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX idx_chess_games_status ON public.chess_games(status, mode, bet, time_control);
CREATE INDEX idx_chess_games_players ON public.chess_games(white_id, black_id);

CREATE TABLE public.chess_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.chess_games(id) ON DELETE CASCADE,
  ply int NOT NULL,
  san text NOT NULL,
  uci text NOT NULL,
  fen_after text NOT NULL,
  time_left_ms int NOT NULL DEFAULT 0,
  by_user uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chess_moves_game ON public.chess_moves(game_id, ply);

ALTER TABLE public.chess_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view chess games" ON public.chess_games FOR SELECT USING (true);
CREATE POLICY "Anyone can view chess moves" ON public.chess_moves FOR SELECT USING (true);

CREATE TRIGGER trg_chess_games_updated BEFORE UPDATE ON public.chess_games
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.chess_games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chess_moves;
ALTER TABLE public.chess_games REPLICA IDENTITY FULL;
ALTER TABLE public.chess_moves REPLICA IDENTITY FULL;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.chess_tc_parse(_tc text, OUT initial_ms int, OUT increment_ms int)
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _tc = '1+0' THEN initial_ms := 60000; increment_ms := 0;
  ELSIF _tc = '5+3' THEN initial_ms := 300000; increment_ms := 3000;
  ELSIF _tc = '10+5' THEN initial_ms := 600000; increment_ms := 5000;
  ELSE RAISE EXCEPTION 'Invalid time control: %', _tc;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.chess_ai_multiplier(_elo int)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _elo <= 400 THEN 1.10
    WHEN _elo <= 800 THEN 1.30
    WHEN _elo <= 1200 THEN 1.70
    WHEN _elo <= 1600 THEN 2.20
    WHEN _elo <= 2000 THEN 3.00
    WHEN _elo <= 2400 THEN 4.50
    ELSE 8.00
  END::numeric
$$;

-- ============ SETTLE ============
CREATE OR REPLACE FUNCTION public.chess_settle(_game_id uuid, _result text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _g RECORD; _mult numeric; _payout bigint; _profit bigint;
  _human_id uuid; _human_color text; _won boolean;
BEGIN
  SELECT * INTO _g FROM public.chess_games WHERE id = _game_id FOR UPDATE;
  IF _g.status = 'finished' THEN RETURN; END IF;

  IF _g.mode = 'ai' THEN
    _human_color := CASE WHEN _g.ai_color = 'w' THEN 'b' ELSE 'w' END;
    _human_id := CASE WHEN _human_color = 'w' THEN _g.white_id ELSE _g.black_id END;
    _mult := public.chess_ai_multiplier(_g.ai_elo);

    IF _result = '1/2-1/2' THEN
      _payout := _g.bet; _profit := 0; _won := false;
    ELSIF (_result = '1-0' AND _human_color = 'w') OR (_result = '0-1' AND _human_color = 'b') THEN
      _payout := floor(_g.bet * _mult)::bigint;
      _profit := GREATEST(_payout - _g.bet, 0); _won := true;
    ELSE
      _payout := 0; _profit := 0; _won := false; _mult := 0;
    END IF;

    IF _payout > 0 THEN
      UPDATE public.profiles SET coins = coins + _payout, total_won = total_won + _profit, updated_at = now()
        WHERE id = _human_id;
    END IF;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_human_id, 'chess', _g.bet, _payout, _mult, _won,
        jsonb_build_object('mode','ai','elo',_g.ai_elo,'result',_result,'reason',_reason));
  ELSE
    -- PvP: 1.98x to winner, refund both on draw (1% rake on decisive)
    IF _result = '1/2-1/2' THEN
      IF _g.white_id IS NOT NULL THEN
        UPDATE public.profiles SET coins = coins + _g.bet, updated_at = now() WHERE id = _g.white_id;
        INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
          VALUES (_g.white_id, 'chess', _g.bet, _g.bet, 1, false,
            jsonb_build_object('mode','pvp','result',_result,'reason',_reason,'color','w'));
      END IF;
      IF _g.black_id IS NOT NULL THEN
        UPDATE public.profiles SET coins = coins + _g.bet, updated_at = now() WHERE id = _g.black_id;
        INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
          VALUES (_g.black_id, 'chess', _g.bet, _g.bet, 1, false,
            jsonb_build_object('mode','pvp','result',_result,'reason',_reason,'color','b'));
      END IF;
    ELSE
      DECLARE _winner uuid; _loser uuid; _wcolor text; _lcolor text;
      BEGIN
        IF _result = '1-0' THEN
          _winner := _g.white_id; _loser := _g.black_id; _wcolor := 'w'; _lcolor := 'b';
        ELSE
          _winner := _g.black_id; _loser := _g.white_id; _wcolor := 'b'; _lcolor := 'w';
        END IF;
        _payout := floor(_g.bet * 2 * 0.99)::bigint;
        _profit := GREATEST(_payout - _g.bet, 0);
        IF _winner IS NOT NULL THEN
          UPDATE public.profiles SET coins = coins + _payout, total_won = total_won + _profit, updated_at = now()
            WHERE id = _winner;
          INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
            VALUES (_winner, 'chess', _g.bet, _payout, 1.98, true,
              jsonb_build_object('mode','pvp','result',_result,'reason',_reason,'color',_wcolor));
        END IF;
        IF _loser IS NOT NULL THEN
          INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
            VALUES (_loser, 'chess', _g.bet, 0, 0, false,
              jsonb_build_object('mode','pvp','result',_result,'reason',_reason,'color',_lcolor));
        END IF;
      END;
    END IF;
  END IF;

  UPDATE public.chess_games SET status='finished', result=_result, result_reason=_reason,
    finished_at=now(), updated_at=now() WHERE id = _game_id;
END $$;

-- ============ CREATE AI ============
CREATE OR REPLACE FUNCTION public.chess_create_ai(_bet bigint, _elo int, _color text, _time_control text)
RETURNS TABLE(game_id uuid, new_balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _bal bigint; _username text; _avatar text;
  _human_color text; _ai_color text;
  _init int; _inc int; _gid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet < 0 THEN RAISE EXCEPTION 'Bet must be >= 0'; END IF;
  IF _elo < 200 OR _elo > 3200 THEN RAISE EXCEPTION 'Invalid Elo'; END IF;
  IF _color NOT IN ('w','b','random') THEN RAISE EXCEPTION 'Invalid color'; END IF;

  _human_color := CASE WHEN _color = 'random' THEN (CASE WHEN random() < 0.5 THEN 'w' ELSE 'b' END) ELSE _color END;
  _ai_color := CASE WHEN _human_color = 'w' THEN 'b' ELSE 'w' END;

  SELECT * INTO _init, _inc FROM public.chess_tc_parse(_time_control);

  SELECT coins, COALESCE(username, split_part(email,'@',1),'player'), COALESCE(avatar,'🎰')
    INTO _bal, _username, _avatar FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal < _bet THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  IF _bet > 0 THEN
    UPDATE public.profiles SET coins = coins - _bet, total_wagered = total_wagered + _bet, updated_at = now()
      WHERE id = _uid RETURNING coins INTO _bal;
  END IF;

  INSERT INTO public.chess_games (mode,status,bet,ai_elo,ai_color,time_control,initial_ms,increment_ms,
    white_time_ms,black_time_ms,
    white_id,white_username,white_avatar,black_id,black_username,black_avatar,
    last_move_at)
  VALUES ('ai','active',_bet,_elo,_ai_color,_time_control,_init,_inc,_init,_init,
    CASE WHEN _human_color='w' THEN _uid END,
    CASE WHEN _human_color='w' THEN _username ELSE 'Stockfish '||_elo END,
    CASE WHEN _human_color='w' THEN _avatar ELSE '🤖' END,
    CASE WHEN _human_color='b' THEN _uid END,
    CASE WHEN _human_color='b' THEN _username ELSE 'Stockfish '||_elo END,
    CASE WHEN _human_color='b' THEN _avatar ELSE '🤖' END,
    now())
  RETURNING id INTO _gid;

  RETURN QUERY SELECT _gid, _bal;
END $$;

-- ============ CREATE PVP / QUICK MATCH / JOIN ============
CREATE OR REPLACE FUNCTION public.chess_create_pvp(_bet bigint, _color_pref text, _time_control text)
RETURNS TABLE(game_id uuid, new_balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _bal bigint; _username text; _avatar text;
  _color text; _init int; _inc int; _gid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet < 0 THEN RAISE EXCEPTION 'Bet must be >= 0'; END IF;
  IF _color_pref NOT IN ('w','b','random') THEN RAISE EXCEPTION 'Invalid color'; END IF;

  _color := CASE WHEN _color_pref = 'random' THEN (CASE WHEN random() < 0.5 THEN 'w' ELSE 'b' END) ELSE _color_pref END;
  SELECT * INTO _init, _inc FROM public.chess_tc_parse(_time_control);

  SELECT coins, COALESCE(username, split_part(email,'@',1),'player'), COALESCE(avatar,'🎰')
    INTO _bal, _username, _avatar FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal < _bet THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  IF _bet > 0 THEN
    UPDATE public.profiles SET coins = coins - _bet, total_wagered = total_wagered + _bet, updated_at = now()
      WHERE id = _uid RETURNING coins INTO _bal;
  END IF;

  INSERT INTO public.chess_games (mode,status,bet,time_control,initial_ms,increment_ms,
    white_time_ms,black_time_ms,
    white_id,white_username,white_avatar,black_id,black_username,black_avatar)
  VALUES ('pvp','waiting',_bet,_time_control,_init,_inc,_init,_init,
    CASE WHEN _color='w' THEN _uid END,
    CASE WHEN _color='w' THEN _username END,
    CASE WHEN _color='w' THEN _avatar ELSE '🎰' END,
    CASE WHEN _color='b' THEN _uid END,
    CASE WHEN _color='b' THEN _username END,
    CASE WHEN _color='b' THEN _avatar ELSE '🎰' END)
  RETURNING id INTO _gid;

  RETURN QUERY SELECT _gid, _bal;
END $$;

CREATE OR REPLACE FUNCTION public.chess_join_pvp(_game_id uuid)
RETURNS TABLE(game_id uuid, new_balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _g RECORD; _bal bigint; _username text; _avatar text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _g FROM public.chess_games WHERE id = _game_id FOR UPDATE;
  IF _g.id IS NULL THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF _g.status <> 'waiting' OR _g.mode <> 'pvp' THEN RAISE EXCEPTION 'Game not joinable'; END IF;
  IF _g.white_id = _uid OR _g.black_id = _uid THEN RAISE EXCEPTION 'Already in game'; END IF;

  SELECT coins, COALESCE(username, split_part(email,'@',1),'player'), COALESCE(avatar,'🎰')
    INTO _bal, _username, _avatar FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal < _g.bet THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  IF _g.bet > 0 THEN
    UPDATE public.profiles SET coins = coins - _g.bet, total_wagered = total_wagered + _g.bet, updated_at = now()
      WHERE id = _uid RETURNING coins INTO _bal;
  END IF;

  IF _g.white_id IS NULL THEN
    UPDATE public.chess_games SET white_id=_uid, white_username=_username, white_avatar=_avatar,
      status='active', last_move_at=now(), updated_at=now() WHERE id=_game_id;
  ELSE
    UPDATE public.chess_games SET black_id=_uid, black_username=_username, black_avatar=_avatar,
      status='active', last_move_at=now(), updated_at=now() WHERE id=_game_id;
  END IF;

  RETURN QUERY SELECT _game_id, _bal;
END $$;

CREATE OR REPLACE FUNCTION public.chess_quick_match(_bet bigint, _time_control text)
RETURNS TABLE(game_id uuid, new_balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _existing uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO _existing FROM public.chess_games
    WHERE status='waiting' AND mode='pvp' AND bet=_bet AND time_control=_time_control
      AND white_id <> _uid AND (black_id IS NULL OR black_id <> _uid)
    ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF _existing IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.chess_join_pvp(_existing);
  ELSE
    RETURN QUERY SELECT * FROM public.chess_create_pvp(_bet, 'random', _time_control);
  END IF;
END $$;

-- ============ MOVES ============
CREATE OR REPLACE FUNCTION public.chess_make_move(
  _game_id uuid, _san text, _uci text, _fen_after text,
  _time_left_ms int, _next_turn text, _result text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _g RECORD; _expected uuid; _ply int;
  _elapsed_ms int; _new_white int; _new_black int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _g FROM public.chess_games WHERE id = _game_id FOR UPDATE;
  IF _g.id IS NULL THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF _g.status <> 'active' THEN RAISE EXCEPTION 'Game not active'; END IF;
  _expected := CASE WHEN _g.turn = 'w' THEN _g.white_id ELSE _g.black_id END;
  IF _expected <> _uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF _next_turn NOT IN ('w','b') THEN RAISE EXCEPTION 'Bad turn'; END IF;

  SELECT COALESCE(MAX(ply),0)+1 INTO _ply FROM public.chess_moves WHERE game_id = _game_id;
  _elapsed_ms := GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(_g.last_move_at, _g.created_at))) * 1000)::int;

  _new_white := _g.white_time_ms;
  _new_black := _g.black_time_ms;
  IF _g.turn = 'w' THEN
    _new_white := GREATEST(0, _g.white_time_ms - _elapsed_ms + _g.increment_ms);
  ELSE
    _new_black := GREATEST(0, _g.black_time_ms - _elapsed_ms + _g.increment_ms);
  END IF;

  INSERT INTO public.chess_moves (game_id, ply, san, uci, fen_after, time_left_ms, by_user)
    VALUES (_game_id, _ply, _san, _uci, _fen_after,
      CASE WHEN _g.turn='w' THEN _new_white ELSE _new_black END, _uid);

  UPDATE public.chess_games SET
    fen=_fen_after, turn=_next_turn,
    white_time_ms=_new_white, black_time_ms=_new_black,
    pgn = CASE WHEN pgn = '' THEN _san ELSE pgn || ' ' || _san END,
    last_move_at=now(), updated_at=now()
    WHERE id=_game_id;

  IF _result IS NOT NULL THEN
    PERFORM public.chess_settle(_game_id, _result, COALESCE(_reason,'normal'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.chess_ai_move(
  _game_id uuid, _san text, _uci text, _fen_after text, _next_turn text,
  _result text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _g RECORD; _human uuid; _ply int;
  _elapsed_ms int; _new_white int; _new_black int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _g FROM public.chess_games WHERE id = _game_id FOR UPDATE;
  IF _g.id IS NULL OR _g.mode <> 'ai' THEN RAISE EXCEPTION 'Not an AI game'; END IF;
  IF _g.status <> 'active' THEN RAISE EXCEPTION 'Game not active'; END IF;
  IF _g.turn <> _g.ai_color THEN RAISE EXCEPTION 'Not AI turn'; END IF;
  _human := CASE WHEN _g.ai_color='w' THEN _g.black_id ELSE _g.white_id END;
  IF _human <> _uid THEN RAISE EXCEPTION 'Not your game'; END IF;

  SELECT COALESCE(MAX(ply),0)+1 INTO _ply FROM public.chess_moves WHERE game_id = _game_id;
  _elapsed_ms := GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(_g.last_move_at, _g.created_at))) * 1000)::int;
  _new_white := _g.white_time_ms; _new_black := _g.black_time_ms;
  IF _g.turn = 'w' THEN
    _new_white := GREATEST(0, _g.white_time_ms - _elapsed_ms + _g.increment_ms);
  ELSE
    _new_black := GREATEST(0, _g.black_time_ms - _elapsed_ms + _g.increment_ms);
  END IF;

  INSERT INTO public.chess_moves (game_id, ply, san, uci, fen_after, time_left_ms, by_user)
    VALUES (_game_id, _ply, _san, _uci, _fen_after,
      CASE WHEN _g.turn='w' THEN _new_white ELSE _new_black END, NULL);

  UPDATE public.chess_games SET fen=_fen_after, turn=_next_turn,
    white_time_ms=_new_white, black_time_ms=_new_black,
    pgn = CASE WHEN pgn='' THEN _san ELSE pgn||' '||_san END,
    last_move_at=now(), updated_at=now() WHERE id=_game_id;

  IF _result IS NOT NULL THEN
    PERFORM public.chess_settle(_game_id, _result, COALESCE(_reason,'normal'));
  END IF;
END $$;

-- ============ RESIGN / DRAW / TIMEOUT ============
CREATE OR REPLACE FUNCTION public.chess_resign(_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _g RECORD; _result text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _g FROM public.chess_games WHERE id = _game_id FOR UPDATE;
  IF _g.status <> 'active' THEN RAISE EXCEPTION 'Game not active'; END IF;
  IF _uid NOT IN (_g.white_id, _g.black_id) THEN RAISE EXCEPTION 'Not in game'; END IF;
  _result := CASE WHEN _uid = _g.white_id THEN '0-1' ELSE '1-0' END;
  PERFORM public.chess_settle(_game_id, _result, 'resign');
END $$;

CREATE OR REPLACE FUNCTION public.chess_offer_draw(_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _g RECORD;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _g FROM public.chess_games WHERE id = _game_id FOR UPDATE;
  IF _g.status <> 'active' THEN RAISE EXCEPTION 'Game not active'; END IF;
  IF _uid NOT IN (_g.white_id, _g.black_id) THEN RAISE EXCEPTION 'Not in game'; END IF;
  UPDATE public.chess_games SET draw_offered_by = _uid, updated_at = now() WHERE id = _game_id;
END $$;

CREATE OR REPLACE FUNCTION public.chess_accept_draw(_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _g RECORD;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _g FROM public.chess_games WHERE id = _game_id FOR UPDATE;
  IF _g.status <> 'active' THEN RAISE EXCEPTION 'Game not active'; END IF;
  IF _g.draw_offered_by IS NULL OR _g.draw_offered_by = _uid THEN RAISE EXCEPTION 'No draw offer to accept'; END IF;
  IF _uid NOT IN (_g.white_id, _g.black_id) THEN RAISE EXCEPTION 'Not in game'; END IF;
  PERFORM public.chess_settle(_game_id, '1/2-1/2', 'agreement');
END $$;

CREATE OR REPLACE FUNCTION public.chess_claim_timeout(_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _g RECORD; _elapsed_ms int; _remaining int; _result text;
BEGIN
  SELECT * INTO _g FROM public.chess_games WHERE id = _game_id FOR UPDATE;
  IF _g.status <> 'active' THEN RAISE EXCEPTION 'Game not active'; END IF;
  _elapsed_ms := GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(_g.last_move_at, _g.created_at))) * 1000)::int;
  _remaining := CASE WHEN _g.turn = 'w' THEN _g.white_time_ms ELSE _g.black_time_ms END;
  IF _elapsed_ms < _remaining THEN RAISE EXCEPTION 'Time not expired'; END IF;
  _result := CASE WHEN _g.turn = 'w' THEN '0-1' ELSE '1-0' END;
  PERFORM public.chess_settle(_game_id, _result, 'timeout');
END $$;
