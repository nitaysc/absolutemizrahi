CREATE OR REPLACE FUNCTION public.admin_reset_player(_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT id INTO _uid FROM public.profiles WHERE lower(username) = lower(_username) LIMIT 1;
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Player not found: %', _username;
  END IF;

  -- Wipe activity / history
  DELETE FROM public.bets WHERE user_id = _uid;
  DELETE FROM public.inventory WHERE user_id = _uid;
  DELETE FROM public.daily_missions WHERE user_id = _uid;
  DELETE FROM public.user_achievements WHERE user_id = _uid;
  DELETE FROM public.progression_events WHERE user_id = _uid;
  DELETE FROM public.redeemed_codes WHERE user_id = _uid;

  -- Battle history rows owned by this user (best-effort; ignore FK weirdness)
  BEGIN
    DELETE FROM public.battle_rounds WHERE battle_id IN (
      SELECT id FROM public.case_battles WHERE host_id = _uid
    );
    DELETE FROM public.battle_cases WHERE battle_id IN (
      SELECT id FROM public.case_battles WHERE host_id = _uid
    );
    DELETE FROM public.battle_players WHERE user_id = _uid;
    DELETE FROM public.case_battles WHERE host_id = _uid;
  EXCEPTION WHEN OTHERS THEN
    -- non-fatal
    NULL;
  END;

  -- Reset profile to defaults
  UPDATE public.profiles
  SET
    coins = 1000,
    coins_decimal = 0,
    total_wagered = 0,
    total_won = 0,
    level = 1,
    xp = 0,
    xp_total = 0,
    streak_days = 0,
    win_streak = 0,
    lose_streak = 0,
    last_daily_bonus = NULL,
    last_streak_claim = NULL,
    xp_booster_until = NULL,
    mines_round = NULL,
    blackjack_round = NULL,
    pump_round = NULL,
    dragontower_round = NULL,
    updated_at = now()
  WHERE id = _uid;

  RETURN jsonb_build_object('ok', true, 'user_id', _uid, 'username', _username);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_player(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_reset_player(text) TO authenticated;