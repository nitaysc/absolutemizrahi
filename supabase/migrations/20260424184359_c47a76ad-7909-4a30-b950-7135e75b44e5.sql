
-- Add dragon tower round storage on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dragontower_round jsonb;

-- Difficulty config used by both start & pick:
--   easy   : 4 tiles, 1 egg  (3 safe)  step ~ 4/3 * 0.99 = 1.32
--   medium : 3 tiles, 1 egg  (2 safe)  step ~ 3/2 * 0.99 = 1.485
--   hard   : 2 tiles, 1 egg  (1 safe)  step ~ 2/1 * 0.99 = 1.98
--   expert : 3 tiles, 2 eggs (1 safe)  step ~ 3/1 * 0.99 = 2.97
--   master : 4 tiles, 3 eggs (1 safe)  step ~ 4/1 * 0.99 = 3.96
-- 9 floors total.

CREATE OR REPLACE FUNCTION public.dt_config(_diff text)
RETURNS TABLE(tiles int, eggs int, step numeric)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT
    CASE _diff WHEN 'easy' THEN 4 WHEN 'medium' THEN 3 WHEN 'hard' THEN 2 WHEN 'expert' THEN 3 WHEN 'master' THEN 4 END,
    CASE _diff WHEN 'easy' THEN 1 WHEN 'medium' THEN 1 WHEN 'hard' THEN 1 WHEN 'expert' THEN 2 WHEN 'master' THEN 3 END,
    CASE _diff
      WHEN 'easy'   THEN 1.32::numeric
      WHEN 'medium' THEN 1.485::numeric
      WHEN 'hard'   THEN 1.98::numeric
      WHEN 'expert' THEN 2.97::numeric
      WHEN 'master' THEN 3.96::numeric
    END;
$$;

CREATE OR REPLACE FUNCTION public.dragontower_start(_bet_amount bigint, _difficulty text)
RETURNS TABLE(new_balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal bigint;
  _existing jsonb;
  _tiles int; _eggs int; _step numeric;
  _floors jsonb := '[]'::jsonb;
  _i int; _j int; _row jsonb;
  _positions int[];
  _picked int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;
  IF _difficulty NOT IN ('easy','medium','hard','expert','master') THEN
    RAISE EXCEPTION 'Invalid difficulty';
  END IF;

  SELECT coins, dragontower_round INTO _bal, _existing FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;
  IF _existing IS NOT NULL AND (_existing->>'active')::boolean THEN
    RAISE EXCEPTION 'Active dragon tower round exists';
  END IF;
  IF _bal < _bet_amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  SELECT * INTO _tiles, _eggs, _step FROM public.dt_config(_difficulty);

  -- Build 9 floors, each with random egg positions
  FOR _i IN 1..9 LOOP
    _positions := ARRAY(SELECT generate_series(0, _tiles - 1));
    _row := '[]'::jsonb;
    FOR _j IN 1.._eggs LOOP
      _picked := _positions[1 + floor(random() * array_length(_positions, 1))::int];
      _row := _row || to_jsonb(_picked);
      _positions := array_remove(_positions, _picked);
    END LOOP;
    _floors := _floors || jsonb_build_array(_row);
  END LOOP;

  UPDATE public.profiles
  SET coins = coins - _bet_amount,
      total_wagered = total_wagered + _bet_amount,
      dragontower_round = jsonb_build_object(
        'active', true,
        'bet', _bet_amount,
        'difficulty', _difficulty,
        'tiles', _tiles,
        'step', _step,
        'floors', _floors,         -- array of 9 sub-arrays of egg indices
        'progress', 0,             -- floors cleared
        'picks', '[]'::jsonb       -- chosen tile per floor
      ),
      updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;

  RETURN QUERY SELECT _bal;
END $$;

CREATE OR REPLACE FUNCTION public.dragontower_pick(_tile int)
RETURNS TABLE(hit_egg boolean, multiplier numeric, progress int, eggs jsonb, ended boolean, new_balance bigint, payout bigint)
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
  -- Egg hit?
  IF _eggs_row @> to_jsonb(_tile) THEN
    UPDATE public.profiles SET dragontower_round = NULL, updated_at = now()
      WHERE id = _uid RETURNING coins INTO _bal;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_uid, 'dragontower', _bet, 0, 0, false,
              jsonb_build_object('difficulty', _round->>'difficulty', 'progress', _progress, 'tile', _tile));
    RETURN QUERY SELECT true, 0::numeric, _progress, _eggs_row, true, _bal, 0::bigint;
    RETURN;
  END IF;

  _progress := _progress + 1;
  _picks := _picks || to_jsonb(_tile);
  _mult := round(power(_step, _progress)::numeric, 4);

  UPDATE public.profiles
    SET dragontower_round = jsonb_set(jsonb_set(_round, '{progress}', to_jsonb(_progress)), '{picks}', _picks),
        updated_at = now()
    WHERE id = _uid;

  -- If tower complete, auto-cashout
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
      RETURN QUERY SELECT false, _mult, _progress, _eggs_row, true, _bal, _payout;
      RETURN;
    END;
  END IF;

  SELECT coins INTO _bal FROM public.profiles WHERE id = _uid;
  RETURN QUERY SELECT false, _mult, _progress, _eggs_row, false, _bal, 0::bigint;
END $$;

CREATE OR REPLACE FUNCTION public.dragontower_cashout()
RETURNS TABLE(new_balance bigint, payout bigint, multiplier numeric, floors jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _round jsonb;
  _bet bigint; _step numeric; _progress int;
  _mult numeric; _payout bigint; _profit bigint; _bal bigint;
  _floors jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT dragontower_round INTO _round FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::boolean THEN
    RAISE EXCEPTION 'No active round';
  END IF;

  _bet := (_round->>'bet')::bigint;
  _step := (_round->>'step')::numeric;
  _progress := (_round->>'progress')::int;
  _floors := _round->'floors';
  IF _progress < 1 THEN RAISE EXCEPTION 'Climb at least one floor first'; END IF;

  _mult := round(power(_step, _progress)::numeric, 4);
  _payout := FLOOR(_bet * _mult)::bigint;
  _profit := GREATEST(_payout - _bet, 0);

  UPDATE public.profiles
    SET coins = coins + _payout, total_won = total_won + _profit,
        dragontower_round = NULL, updated_at = now()
    WHERE id = _uid RETURNING coins INTO _bal;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (_uid, 'dragontower', _bet, _payout, _mult, true,
            jsonb_build_object('difficulty', _round->>'difficulty', 'progress', _progress));

  RETURN QUERY SELECT _bal, _payout, _mult, _floors;
END $$;

CREATE OR REPLACE FUNCTION public.dragontower_abandon()
RETURNS TABLE(new_balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _round jsonb; _bet bigint; _bal bigint; _progress int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT dragontower_round, coins INTO _round, _bal FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _round IS NULL OR NOT (_round->>'active')::boolean THEN
    RETURN QUERY SELECT _bal; RETURN;
  END IF;
  _bet := (_round->>'bet')::bigint;
  _progress := (_round->>'progress')::int;
  IF _progress = 0 THEN
    UPDATE public.profiles
      SET coins = coins + _bet, total_wagered = total_wagered - _bet,
          dragontower_round = NULL, updated_at = now()
      WHERE id = _uid RETURNING coins INTO _bal;
  ELSE
    UPDATE public.profiles SET dragontower_round = NULL, updated_at = now() WHERE id = _uid;
    INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
      VALUES (_uid, 'dragontower', _bet, 0, 0, false, jsonb_build_object('abandoned', true));
  END IF;
  RETURN QUERY SELECT _bal;
END $$;
