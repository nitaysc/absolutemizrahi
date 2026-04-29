-- 1) Refund the abandoned chess games whose bets were never returned.
DO $$
DECLARE
  _g RECORD;
  _human_id uuid;
BEGIN
  FOR _g IN
    SELECT id, mode, bet, white_id, black_id, ai_color
    FROM public.chess_games
    WHERE result_reason = 'abandoned'
      AND result IS NULL
      AND bet > 0
  LOOP
    IF _g.mode = 'ai' THEN
      _human_id := CASE WHEN _g.ai_color = 'w' THEN _g.black_id ELSE _g.white_id END;
      IF _human_id IS NOT NULL THEN
        UPDATE public.profiles
          SET coins = coins + _g.bet, updated_at = now()
          WHERE id = _human_id;
        INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
          VALUES (_human_id, 'chess', _g.bet, _g.bet, 1, false,
            jsonb_build_object('mode','ai','reason','abandoned_refund','result','1/2-1/2'));
      END IF;
    ELSE
      IF _g.white_id IS NOT NULL THEN
        UPDATE public.profiles SET coins = coins + _g.bet, updated_at = now() WHERE id = _g.white_id;
        INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
          VALUES (_g.white_id, 'chess', _g.bet, _g.bet, 1, false,
            jsonb_build_object('mode','pvp','reason','abandoned_refund','result','1/2-1/2','color','w'));
      END IF;
      IF _g.black_id IS NOT NULL THEN
        UPDATE public.profiles SET coins = coins + _g.bet, updated_at = now() WHERE id = _g.black_id;
        INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
          VALUES (_g.black_id, 'chess', _g.bet, _g.bet, 1, false,
            jsonb_build_object('mode','pvp','reason','abandoned_refund','result','1/2-1/2','color','b'));
      END IF;
    END IF;
    UPDATE public.chess_games
      SET result = '1/2-1/2', result_reason = 'abandoned'
      WHERE id = _g.id;
  END LOOP;
END $$;

-- 2) New RPC: human's client triggers AI draw acceptance.
CREATE OR REPLACE FUNCTION public.chess_ai_accept_draw(_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _g RECORD;
  _human_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _g FROM public.chess_games WHERE id = _game_id FOR UPDATE;
  IF _g.id IS NULL THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF _g.mode <> 'ai' THEN RAISE EXCEPTION 'Not an AI game'; END IF;
  IF _g.status <> 'active' THEN RAISE EXCEPTION 'Game not active'; END IF;
  _human_id := CASE WHEN _g.ai_color = 'w' THEN _g.black_id ELSE _g.white_id END;
  IF _human_id <> _uid THEN RAISE EXCEPTION 'Not your game'; END IF;
  IF _g.draw_offered_by IS NULL OR _g.draw_offered_by <> _uid THEN
    RAISE EXCEPTION 'No draw offer to accept';
  END IF;
  PERFORM public.chess_settle(_game_id, '1/2-1/2', 'agreement');
END $function$;

GRANT EXECUTE ON FUNCTION public.chess_ai_accept_draw(uuid) TO authenticated;