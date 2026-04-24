
DROP FUNCTION IF EXISTS public.dragontower_pick(int);

CREATE OR REPLACE FUNCTION public.dragontower_pick(_tile int)
RETURNS TABLE(hit_egg boolean, multiplier numeric, progress int, eggs jsonb, ended boolean, new_balance bigint, payout bigint, all_floors jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _round jsonb;
  _bet bigint; _step numeric; _tiles int;
  _progress int; _floors jsonb; _picks jsonb; _eggs_row jsonb;
  _mult numeric; _bal bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT dragontower_round INTO _round FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::boolean THEN
    RAISE EXCEPTION 'No active round';
  END IF;

  _bet := (_round->>'bet')::bigint;
  _step := (_round->>'step')::numeric;
  _tiles := (_round->>'tiles')::int;
  _progress := (_round->>'progress')::int;
  _floors := _round->'floors';
  _picks := _round->'picks';

  IF _progress >= 9 THEN RAISE EXCEPTION 'Tower complete'; END IF;
  IF _tile < 0 OR _tile >= _tiles THEN RAISE EXCEPTION 'Invalid tile'; END IF;

  _eggs_row := _floors->_progress;
  IF _eggs_row @> to_jsonb(_tile) THEN
    UPDATE public.profiles SET dragontower_round = NULL, updated_at = now()
      WHERE id = _uid RETURNING coins INTO _bal;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_uid, 'dragontower', _bet, 0, 0, false,
              jsonb_build_object('difficulty', _round->>'difficulty', 'progress', _progress, 'tile', _tile));
    RETURN QUERY SELECT true, 0::numeric, _progress, _eggs_row, true, _bal, 0::bigint, _floors;
    RETURN;
  END IF;

  _progress := _progress + 1;
  _picks := _picks || to_jsonb(_tile);
  _mult := round(power(_step, _progress)::numeric, 4);

  UPDATE public.profiles
    SET dragontower_round = jsonb_set(jsonb_set(_round, '{progress}', to_jsonb(_progress)), '{picks}', _picks),
        updated_at = now()
    WHERE id = _uid;

  IF _progress >= 9 THEN
    DECLARE _payout bigint; _profit bigint;
    BEGIN
      _payout := FLOOR(_bet * _mult)::bigint;
      _profit := GREATEST(_payout - _bet, 0);
      UPDATE public.profiles
        SET coins = coins + _payout, total_won = total_won + _profit,
            dragontower_round = NULL, updated_at = now()
        WHERE id = _uid RETURNING coins INTO _bal;
      INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
        VALUES (_uid, 'dragontower', _bet, _payout, _mult, true,
                jsonb_build_object('difficulty', _round->>'difficulty', 'progress', _progress, 'completed', true));
      RETURN QUERY SELECT false, _mult, _progress, _eggs_row, true, _bal, _payout, _floors;
      RETURN;
    END;
  END IF;

  SELECT coins INTO _bal FROM public.profiles WHERE id = _uid;
  RETURN QUERY SELECT false, _mult, _progress, _eggs_row, false, _bal, 0::bigint, NULL::jsonb;
END $$;
