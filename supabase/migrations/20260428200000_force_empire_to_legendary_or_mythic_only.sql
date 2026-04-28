CREATE OR REPLACE FUNCTION public.start_case_battle(_battle_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b record; pcount int; bot_n int := 1; s int; v_team int;
  cs record; pl record; roll record; v_value bigint; v_special text;
  v_winner_team int;
  team_total_value bigint; team_size_actual int;
  share bigint;
  v_empire_legendary_weight numeric;
  v_empire_mythic_weight numeric;
  v_duel_common_weight numeric;
  v_duel_legendary_weight numeric;
  v_pick_rarity text;
  bot_names text[] := ARRAY['BOT #1','BOT #2','BOT #3','BOT #4','BOT #5','BOT #6','BOT #7','BOT #8'];
  bot_avs text[] := ARRAY['🤖','👾','🛸','💀','🎃','🐺','🦾','🐉'];
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
    SELECT COALESCE(SUM(weight), 0)
      INTO v_empire_legendary_weight
      FROM public.case_items
      WHERE case_id = cs.case_id AND rarity = 'legendary';

    SELECT COALESCE(SUM(weight), 0)
      INTO v_empire_mythic_weight
      FROM public.case_items
      WHERE case_id = cs.case_id AND rarity = 'mythic';

    SELECT COALESCE(SUM(weight), 0)
      INTO v_duel_common_weight
      FROM public.case_items
      WHERE case_id = cs.case_id AND rarity = 'common';

    SELECT COALESCE(SUM(weight), 0)
      INTO v_duel_legendary_weight
      FROM public.case_items
      WHERE case_id = cs.case_id AND rarity = 'legendary';

    FOR pl IN SELECT * FROM public.battle_players WHERE battle_id = _battle_id ORDER BY slot LOOP
      v_special := 'none';
      -- Tuned: keep specials rare so they remain exciting
      IF random() < 0.0025 THEN v_special := 'empire'; END IF;
      IF v_special = 'none' AND random() < 0.01 THEN v_special := 'duel'; END IF;

      IF v_special = 'empire' AND (v_empire_legendary_weight + v_empire_mythic_weight) > 0 THEN
        -- Empire spins only roll legendary/mythic, with mythic intentionally rarer (now 10% when both rarities exist).
        IF v_empire_legendary_weight > 0 AND v_empire_mythic_weight > 0 THEN
          v_pick_rarity := CASE WHEN random() < 0.90 THEN 'legendary' ELSE 'mythic' END;
        ELSIF v_empire_legendary_weight > 0 THEN
          v_pick_rarity := 'legendary';
        ELSE
          v_pick_rarity := 'mythic';
        END IF;

        SELECT ci.id AS item_id, ci.name, ci.image, ci.value, ci.rarity, ci.weight
          INTO roll
        FROM public.case_items ci
        CROSS JOIN LATERAL (
          SELECT random() * CASE
            WHEN v_pick_rarity = 'legendary' THEN v_empire_legendary_weight
            ELSE v_empire_mythic_weight
          END AS r
        ) pick
        CROSS JOIN LATERAL (
          SELECT SUM(ci2.weight) AS cum
          FROM public.case_items ci2
          WHERE ci2.case_id = cs.case_id
            AND ci2.rarity = v_pick_rarity
            AND (ci2.id <= ci.id)
        ) running
        WHERE ci.case_id = cs.case_id
          AND ci.rarity = v_pick_rarity
          AND pick.r <= running.cum
        ORDER BY ci.id
        LIMIT 1;

        IF roll.item_id IS NULL THEN
          -- Safety fallback: even if weighted selection misses, empire must never drop below legendary.
          SELECT ci.id AS item_id, ci.name, ci.image, ci.value, ci.rarity, ci.weight
            INTO roll
          FROM public.case_items ci
          WHERE ci.case_id = cs.case_id
            AND ci.rarity IN ('legendary', 'mythic')
          ORDER BY random()
          LIMIT 1;

          IF roll.item_id IS NULL THEN
            SELECT * INTO roll FROM public._roll_case_item(cs.case_id);
            v_special := 'none';
          END IF;
        END IF;

        v_value := roll.value;
        INSERT INTO public.battle_rounds(battle_id, round_index, player_slot, case_id, item_id, item_name, item_image, item_value, rarity, special_spin)
        VALUES (_battle_id, cs.position, pl.slot, cs.case_id, roll.item_id, roll.name, roll.image, v_value, roll.rarity, v_special);
      ELSIF v_special = 'duel' AND (v_duel_common_weight + v_duel_legendary_weight) > 0 THEN
        -- Duel spins are exactly rarity coin-flips: 50% legendary / 50% common.
        IF v_duel_common_weight > 0 AND v_duel_legendary_weight > 0 THEN
          v_pick_rarity := CASE WHEN random() < 0.5 THEN 'legendary' ELSE 'common' END;
        ELSIF v_duel_legendary_weight > 0 THEN
          v_pick_rarity := 'legendary';
        ELSE
          v_pick_rarity := 'common';
        END IF;

        SELECT ci.id AS item_id, ci.name, ci.image, ci.value, ci.rarity, ci.weight
          INTO roll
        FROM public.case_items ci
        CROSS JOIN LATERAL (
          SELECT random() * CASE
            WHEN v_pick_rarity = 'legendary' THEN v_duel_legendary_weight
            ELSE v_duel_common_weight
          END AS r
        ) pick
        CROSS JOIN LATERAL (
          SELECT SUM(ci2.weight) AS cum
          FROM public.case_items ci2
          WHERE ci2.case_id = cs.case_id
            AND ci2.rarity = v_pick_rarity
            AND (ci2.id <= ci.id)
        ) running
        WHERE ci.case_id = cs.case_id
          AND ci.rarity = v_pick_rarity
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
        VALUES (_battle_id, cs.position, pl.slot, cs.case_id, roll.item_id, roll.name, roll.image, v_value, roll.rarity, 'none');
      END IF;

      UPDATE public.battle_players SET total_winnings = total_winnings + v_value
        WHERE battle_id = _battle_id AND slot = pl.slot;
    END LOOP;

    UPDATE public.case_battles SET current_round = cs.position + 1 WHERE id = _battle_id;
    UPDATE public.cases SET total_opened = total_opened + 1, total_wagered = total_wagered + price
      WHERE id = cs.case_id;
  END LOOP;

  team_size_actual := b.team_size;
  IF b.type = 'crazy' THEN
    SELECT team INTO v_winner_team FROM public.battle_players
      WHERE battle_id = _battle_id GROUP BY team ORDER BY SUM(total_winnings) ASC LIMIT 1;
  ELSE
    SELECT team INTO v_winner_team FROM public.battle_players
      WHERE battle_id = _battle_id GROUP BY team ORDER BY SUM(total_winnings) DESC LIMIT 1;
  END IF;

  SELECT COALESCE(SUM(total_winnings), 0) INTO team_total_value
  FROM public.battle_players WHERE battle_id = _battle_id AND team = v_winner_team;

  share := team_total_value / GREATEST(team_size_actual, 1);

  UPDATE public.case_battles SET status = 'finished', finished_at = now(),
    winner_team = v_winner_team, pot_payout = team_total_value WHERE id = _battle_id;

  DECLARE
    w record; r record;
    given bigint; remainder bigint; debt bigint;
    v_inv_id uuid; v_item_value bigint;
    v_paid bigint;
    v_won boolean;
    v_mult numeric;
    v_xp bigint;
  BEGIN
    FOR w IN SELECT * FROM public.battle_players
      WHERE battle_id = _battle_id AND team = v_winner_team AND is_bot = false
      ORDER BY slot
    LOOP
      given := 0;
      FOR r IN
        SELECT * FROM public.battle_rounds
        WHERE battle_id = _battle_id AND player_slot = w.slot
        ORDER BY item_value ASC
      LOOP
        EXIT WHEN given + r.item_value > share;
        INSERT INTO public.inventory(user_id, item_name, item_image, value, rarity, source, source_ref, status)
        VALUES (w.user_id, r.item_name, r.item_image, r.item_value, r.rarity, 'battle', _battle_id, 'held');
        given := given + r.item_value;
      END LOOP;

      remainder := GREATEST(share - given, 0);

      debt := w.borrowed;
      IF debt > 0 AND remainder > 0 THEN
        IF debt >= remainder THEN
          debt := debt - remainder;
          remainder := 0;
        ELSE
          remainder := remainder - debt;
          debt := 0;
        END IF;
      END IF;

      IF remainder > 0 THEN
        INSERT INTO public.inventory(user_id, item_name, item_image, value, rarity, source, source_ref, status)
        VALUES (w.user_id, 'Money Voucher', NULL, remainder, 'common', 'battle', _battle_id, 'held');
      END IF;

      IF debt > 0 THEN
        FOR v_inv_id, v_item_value IN
          SELECT id, value FROM public.inventory
          WHERE user_id = w.user_id AND source = 'battle' AND source_ref = _battle_id AND status = 'held'
          ORDER BY value ASC
        LOOP
          EXIT WHEN debt <= 0;
          UPDATE public.inventory
          SET status = 'sold', sold_for = v_item_value, sold_at = now()
          WHERE id = v_inv_id;
          debt := debt - v_item_value;
        END LOOP;
      END IF;
    END LOOP;

    -- Award progression to every human participant after settlement.
    FOR w IN SELECT * FROM public.battle_players WHERE battle_id = _battle_id AND is_bot = false LOOP
      v_paid := GREATEST(COALESCE(b.per_player_cost, 0), 0);
      v_won := (w.team = v_winner_team);
      v_mult := CASE WHEN v_paid > 0 THEN COALESCE(w.total_winnings, 0)::numeric / v_paid ELSE 0 END;

      v_xp := GREATEST(1, CEIL((v_paid::numeric / 10.0) * (1 + (ln(GREATEST(v_mult, 1)) / ln(10)) / 2)))::bigint;
      v_xp := LEAST(v_xp, 10000);

      PERFORM public.award_xp(
        w.user_id,
        v_xp,
        'bet',
        jsonb_build_object('game', 'case_battle', 'bet', v_paid, 'mult', v_mult, 'won', v_won, 'battle_id', _battle_id)
      );

      PERFORM public.bump_mission(w.user_id, 'bet_total', v_paid);
      PERFORM public.bump_mission(w.user_id, 'play_games', 1);
      PERFORM public.bump_mission(w.user_id, 'open_cases', b.rounds_total);
      IF v_won THEN
        PERFORM public.bump_mission(w.user_id, 'win_bets', 1);
      END IF;
      IF v_mult >= 10 THEN
        PERFORM public.bump_mission(w.user_id, 'big_multiplier', 1);
        PERFORM public.unlock_achievement(w.user_id, 'big_hit_10x');
      END IF;
      IF v_mult >= 100 THEN
        PERFORM public.unlock_achievement(w.user_id, 'big_hit_100x');
      END IF;
      IF v_mult >= 500 THEN
        PERFORM public.unlock_achievement(w.user_id, 'big_hit_500x');
      END IF;

    END LOOP;
  END;
END $function$;
