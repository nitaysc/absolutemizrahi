-- 1) Restore correct pot_payout: the winning team's actual rolled value (minus house edge),
--    so winners receive the full value of items they pulled.
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
  team_total_value bigint;
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
      IF v_has_duel_legendary AND v_has_duel_common AND random() < 0.03 THEN
        v_special := 'duel';
      END IF;
      IF v_special = 'none' AND (v_has_empire_legendary OR v_has_empire_mythic) AND random() < 0.02 THEN
        v_special := 'empire';
      END IF;

      IF v_special = 'empire' THEN
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

  -- Pot payout = the WINNING team's total rolled value (minus house edge in bps).
  -- This way the winner receives the actual value of the items they pulled.
  SELECT COALESCE(SUM(bp.total_winnings), 0)
    INTO team_total_value
    FROM public.battle_players bp
    WHERE bp.battle_id = _battle_id AND bp.team = v_winner_team;

  team_total_value := GREATEST(0, team_total_value - (team_total_value * b.house_edge_bps / 10000));

  UPDATE public.case_battles
    SET status = 'finished',
        finished_at = now(),
        winner_team = v_winner_team,
        pot_payout = team_total_value,
        current_round = b.rounds_total
    WHERE id = _battle_id;

  PERFORM public._distribute_battle_payout(_battle_id);
END;
$$;

-- 2) Retroactively compensate winners of recent under-paid battles.
--    For each finished battle where the winner's actual rolled team value exceeds
--    what was awarded, top them up with a Cash Voucher in their inventory.
DO $$
DECLARE
  rec record;
  v_team_total bigint;
  v_awarded bigint;
  v_deficit bigint;
BEGIN
  FOR rec IN
    SELECT cb.id AS battle_id, bp.user_id, cb.winner_team
    FROM public.case_battles cb
    JOIN public.battle_players bp
      ON bp.battle_id = cb.id AND bp.team = cb.winner_team AND bp.is_bot = false
    WHERE cb.status = 'finished'
      AND cb.winner_team IS NOT NULL
      AND cb.finished_at >= now() - interval '7 days'
  LOOP
    SELECT COALESCE(SUM(br.item_value), 0) INTO v_team_total
    FROM public.battle_rounds br
    JOIN public.battle_players bp ON bp.battle_id = br.battle_id AND bp.slot = br.player_slot
    WHERE br.battle_id = rec.battle_id AND bp.team = rec.winner_team;

    SELECT COALESCE(SUM(value), 0) INTO v_awarded
    FROM public.inventory
    WHERE source_ref = rec.battle_id AND user_id = rec.user_id;

    v_deficit := v_team_total - v_awarded;
    IF v_deficit > 0 THEN
      INSERT INTO public.inventory(user_id, item_name, item_image, rarity, value, source, source_ref)
      VALUES (rec.user_id, 'Battle Fix Refund', NULL, 'epic', v_deficit, 'battle', rec.battle_id);
    END IF;
  END LOOP;
END $$;