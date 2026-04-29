-- 1) Tune Empire/Duel spin probabilities + Empire mythic rarity
CREATE OR REPLACE FUNCTION public.start_case_battle(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b record; pcount int; bot_n int := 1; s int; v_team int;
  cs record; pl record; roll record; v_value bigint; v_special text;
  v_winner_team int;
  team_total_value bigint; team_size_actual int;
  share bigint;
  v_has_empire_legendary boolean;
  v_has_empire_mythic boolean;
  v_has_duel_legendary boolean;
  v_has_duel_common boolean;
  v_target_rarity text;
  v_pool_total numeric;
  bot_names text[] := ARRAY['BOT #1','BOT #2','BOT #3','BOT #4','BOT #5','BOT #6','BOT #7','BOT #8'];
  bot_avs   text[] := ARRAY['🤖','👾','🛸','💀','🎃','🐺','🦾','🐉'];
BEGIN
  SELECT * INTO b FROM public.case_battles WHERE id = _battle_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'No battle'; END IF;
  IF b.status <> 'waiting' THEN RAISE EXCEPTION 'Already started'; END IF;
  IF b.host_id <> auth.uid() THEN RAISE EXCEPTION 'Only host'; END IF;

  SELECT count(*) INTO pcount FROM public.battle_players WHERE battle_id = _battle_id;

  IF pcount < b.player_slots THEN
    IF NOT b.fill_with_bots THEN RAISE EXCEPTION 'Need more players'; END IF;
    FOR s IN 0..b.player_slots-1 LOOP
      IF NOT EXISTS (SELECT 1 FROM public.battle_players WHERE battle_id = _battle_id AND slot = s) THEN
        v_team := s / b.team_size;
        INSERT INTO public.battle_players(battle_id, slot, team, user_id, is_bot, display_name, avatar)
        VALUES (_battle_id, s, v_team, NULL, true,
          bot_names[((bot_n-1) % 8) + 1], bot_avs[((bot_n-1) % 8) + 1]);
        bot_n := bot_n + 1;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.case_battles SET status = 'running', started_at = now() WHERE id = _battle_id;

  FOR cs IN SELECT * FROM public.battle_cases WHERE battle_id = _battle_id ORDER BY position LOOP
    SELECT EXISTS (SELECT 1 FROM public.case_items WHERE case_id = cs.case_id AND rarity = 'legendary' AND weight > 0) INTO v_has_empire_legendary;
    SELECT EXISTS (SELECT 1 FROM public.case_items WHERE case_id = cs.case_id AND rarity = 'mythic'    AND weight > 0) INTO v_has_empire_mythic;
    v_has_duel_legendary := v_has_empire_legendary;
    SELECT EXISTS (SELECT 1 FROM public.case_items WHERE case_id = cs.case_id AND rarity = 'common'    AND weight > 0) INTO v_has_duel_common;

    FOR pl IN SELECT * FROM public.battle_players WHERE battle_id = _battle_id ORDER BY slot LOOP
      v_special := 'none';
      -- Duel slightly more frequent than Empire (3% vs 2%); roll Duel first so empire stays rarer.
      IF v_has_duel_legendary AND v_has_duel_common AND random() < 0.03 THEN
        v_special := 'duel';
      END IF;
      IF v_special = 'none' AND (v_has_empire_legendary OR v_has_empire_mythic) AND random() < 0.02 THEN
        v_special := 'empire';
      END IF;

      IF v_special = 'empire' THEN
        -- Mythic is much rarer than Legendary inside Empire (15% vs 85%).
        IF v_has_empire_legendary AND v_has_empire_mythic THEN
          v_target_rarity := CASE WHEN random() < 0.85 THEN 'legendary' ELSE 'mythic' END;
        ELSIF v_has_empire_legendary THEN
          v_target_rarity := 'legendary';
        ELSE
          v_target_rarity := 'mythic';
        END IF;

        SELECT COALESCE(SUM(ci.weight), 0) INTO v_pool_total
        FROM public.case_items ci
        WHERE ci.case_id = cs.case_id AND ci.rarity = v_target_rarity AND ci.weight > 0;

        SELECT ci.id AS item_id, ci.name, ci.image, ci.value, ci.rarity, ci.weight
          INTO roll
        FROM public.case_items ci
        CROSS JOIN LATERAL (SELECT random() * v_pool_total AS r) pick
        CROSS JOIN LATERAL (
          SELECT SUM(ci2.weight) AS cum
          FROM public.case_items ci2
          WHERE ci2.case_id = cs.case_id
            AND ci2.rarity = v_target_rarity
            AND ci2.weight > 0
            AND ci2.id <= ci.id
        ) running
        WHERE ci.case_id = cs.case_id
          AND ci.rarity = v_target_rarity
          AND ci.weight > 0
          AND pick.r <= running.cum
        ORDER BY ci.id
        LIMIT 1;

        IF roll.item_id IS NULL THEN
          SELECT * INTO roll FROM public._roll_case_item(cs.case_id);
          v_special := 'none';
        END IF;

        v_value := roll.value;
        INSERT INTO public.battle_rounds(battle_id, round_index, player_slot, case_id, item_id, item_name, item_image, item_value, rarity, special_spin)
        VALUES (_battle_id, cs.position, pl.slot, cs.case_id, roll.item_id, roll.name, roll.image, v_value, roll.rarity, v_special);
      ELSIF v_special = 'duel' THEN
        v_target_rarity := CASE WHEN random() < 0.50 THEN 'legendary' ELSE 'common' END;

        SELECT COALESCE(SUM(ci.weight), 0) INTO v_pool_total
        FROM public.case_items ci
        WHERE ci.case_id = cs.case_id AND ci.rarity = v_target_rarity AND ci.weight > 0;

        SELECT ci.id AS item_id, ci.name, ci.image, ci.value, ci.rarity, ci.weight
          INTO roll
        FROM public.case_items ci
        CROSS JOIN LATERAL (SELECT random() * v_pool_total AS r) pick
        CROSS JOIN LATERAL (
          SELECT SUM(ci2.weight) AS cum
          FROM public.case_items ci2
          WHERE ci2.case_id = cs.case_id
            AND ci2.rarity = v_target_rarity
            AND ci2.weight > 0
            AND ci2.id <= ci.id
        ) running
        WHERE ci.case_id = cs.case_id
          AND ci.rarity = v_target_rarity
          AND ci.weight > 0
          AND pick.r <= running.cum
        ORDER BY ci.id
        LIMIT 1;

        IF roll.item_id IS NULL THEN
          SELECT * INTO roll FROM public._roll_case_item(cs.case_id);
          v_special := 'none';
        END IF;

        v_value := roll.value;
        INSERT INTO public.battle_rounds(battle_id, round_index, player_slot, case_id, item_id, item_name, item_image, item_value, rarity, special_spin)
        VALUES (_battle_id, cs.position, pl.slot, cs.case_id, roll.item_id, roll.name, roll.image, v_value, roll.rarity, v_special);
      ELSE
        SELECT * INTO roll FROM public._roll_case_item(cs.case_id);
        v_value := roll.value;
        INSERT INTO public.battle_rounds(battle_id, round_index, player_slot, case_id, item_id, item_name, item_image, item_value, rarity, special_spin)
        VALUES (_battle_id, cs.position, pl.slot, cs.case_id, roll.item_id, roll.name, roll.image, v_value, roll.rarity, v_special);
      END IF;

      UPDATE public.battle_players
        SET total_winnings = total_winnings + v_value
        WHERE battle_id = _battle_id AND slot = pl.slot;
    END LOOP;
  END LOOP;

  -- Pick winning team (highest team total)
  SELECT team INTO v_winner_team
  FROM public.battle_players
  WHERE battle_id = _battle_id
  GROUP BY team
  ORDER BY SUM(total_winnings) DESC, team ASC
  LIMIT 1;

  -- Pot payout = total_cost minus house edge bps; full pot to winning team (split inside team)
  SELECT GREATEST(0, b.total_cost - (b.total_cost * b.house_edge_bps / 10000)) INTO share;

  UPDATE public.case_battles
    SET status = 'finished',
        finished_at = now(),
        winner_team = v_winner_team,
        pot_payout = share,
        current_round = b.rounds_total
    WHERE id = _battle_id;

  PERFORM public._distribute_battle_payout(_battle_id);
END;
$$;

-- 2) Admin: grant XP to a player by username (uses the existing award_xp pipeline)
CREATE OR REPLACE FUNCTION public.admin_grant_xp(
  _recipient_username text,
  _amount bigint
)
RETURNS TABLE(recipient_username text, amount bigint, recipient_level int, recipient_xp_total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _target uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT id INTO _target FROM public.profiles
   WHERE lower(username) = lower(_recipient_username) LIMIT 1;
  IF _target IS NULL THEN RAISE EXCEPTION 'Player not found: %', _recipient_username; END IF;

  PERFORM public.award_xp(_target, _amount, 'admin_grant', '{}'::jsonb);

  RETURN QUERY
    SELECT p.username, _amount, p.level, p.xp_total
    FROM public.profiles p WHERE p.id = _target;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_xp(text, bigint) TO authenticated;

-- 3) Spectate: friend-scoped read of recent bets (RLS bypass via SECURITY DEFINER,
--    only returns rows when caller is an accepted friend of the target).
CREATE OR REPLACE FUNCTION public.get_friend_recent_bets(
  _friend_id uuid,
  _limit int DEFAULT 30,
  _since timestamptz DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  game text,
  bet_amount bigint,
  payout bigint,
  multiplier numeric,
  won boolean,
  created_at timestamptz,
  details jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_friend boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF auth.uid() = _friend_id THEN
    _is_friend := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.requester = auth.uid() AND f.addressee = _friend_id)
          OR (f.addressee = auth.uid() AND f.requester = _friend_id))
    ) INTO _is_friend;
  END IF;
  IF NOT _is_friend THEN
    RAISE EXCEPTION 'Not friends with this player';
  END IF;

  RETURN QUERY
    SELECT b.id, b.game, b.bet_amount, b.payout, b.multiplier, b.won, b.created_at, b.details
    FROM public.bets b
    WHERE b.user_id = _friend_id
      AND (_since IS NULL OR b.created_at > _since)
    ORDER BY b.created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 100));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_recent_bets(uuid, int, timestamptz) TO authenticated;