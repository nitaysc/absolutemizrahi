-- Wire progression hooks into case openings and case battles.

CREATE OR REPLACE FUNCTION public.open_case_solo(_case_id uuid, _count int)
RETURNS TABLE(item_id uuid, name text, image text, value bigint, rarity text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_price bigint; v_total bigint; v_balance bigint;
  i int; roll record; v_winnings bigint := 0;
  v_mult numeric;
  v_xp bigint;
  v_total_cases bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _count < 1 OR _count > 10 THEN RAISE EXCEPTION 'Count 1-10'; END IF;
  SELECT price INTO v_price FROM public.cases WHERE id = _case_id AND status = 'approved';
  IF v_price IS NULL THEN RAISE EXCEPTION 'Case not available'; END IF;
  v_total := v_price * _count;
  SELECT coins INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance < v_total THEN RAISE EXCEPTION 'Insufficient coins'; END IF;
  UPDATE public.profiles SET coins = coins - v_total, total_wagered = total_wagered + v_total WHERE id = v_uid;
  UPDATE public.cases SET total_opened = total_opened + _count, total_wagered = total_wagered + v_total WHERE id = _case_id;

  CREATE TEMP TABLE _rolls (item_id uuid, name text, image text, value bigint, rarity text) ON COMMIT DROP;
  FOR i IN 1.._count LOOP
    SELECT * INTO roll FROM public._roll_case_item(_case_id);
    INSERT INTO _rolls VALUES (roll.item_id, roll.name, roll.image, roll.value, roll.rarity);
    INSERT INTO public.inventory(user_id, item_name, item_image, rarity, value, source, source_ref)
      VALUES (v_uid, roll.name, roll.image, roll.rarity, roll.value, 'solo', _case_id);
    v_winnings := v_winnings + roll.value;
  END LOOP;

  -- Bet log uses gross item value as "payout" for stats.
  v_mult := CASE WHEN v_total > 0 THEN v_winnings::numeric / v_total ELSE 0 END;
  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
  VALUES (
    v_uid,
    'cases',
    v_total,
    v_winnings,
    v_mult,
    v_winnings > v_total,
    jsonb_build_object('case_id', _case_id, 'count', _count, 'to_inventory', true)
  );

  -- ===== PROGRESSION HOOKS =====
  -- Keep case-opening XP on the same curve as regular bets.
  v_xp := GREATEST(1, CEIL((v_total::numeric / 10.0) * (1 + (ln(GREATEST(v_mult, 1)) / ln(10)) / 2)))::bigint;
  v_xp := LEAST(v_xp, 10000);
  PERFORM public.award_xp(
    v_uid,
    v_xp,
    'bet',
    jsonb_build_object('game', 'cases', 'bet', v_total, 'mult', v_mult, 'won', v_winnings > v_total, 'count', _count)
  );

  PERFORM public.bump_mission(v_uid, 'bet_total', v_total);
  PERFORM public.bump_mission(v_uid, 'play_games', 1);
  PERFORM public.bump_mission(v_uid, 'open_cases', _count);
  IF v_winnings > v_total THEN
    PERFORM public.bump_mission(v_uid, 'win_bets', 1);
  END IF;
  IF v_mult >= 10 THEN
    PERFORM public.bump_mission(v_uid, 'big_multiplier', 1);
    PERFORM public.unlock_achievement(v_uid, 'big_hit_10x');
  END IF;
  IF v_mult >= 100 THEN
    PERFORM public.unlock_achievement(v_uid, 'big_hit_100x');
  END IF;
  IF v_mult >= 500 THEN
    PERFORM public.unlock_achievement(v_uid, 'big_hit_500x');
  END IF;

  SELECT COALESCE(SUM(GREATEST(COALESCE((details->>'count')::int, 1), 1)),0)::bigint INTO v_total_cases
  FROM public.bets
  WHERE user_id = v_uid AND game = 'cases';

  IF v_total_cases >= 10 THEN
    PERFORM public.unlock_achievement(v_uid, 'case_opener_10');
  END IF;
  IF v_total_cases >= 100 THEN
    PERFORM public.unlock_achievement(v_uid, 'case_opener_100');
  END IF;
  IF v_total_cases >= 1000 THEN
    PERFORM public.unlock_achievement(v_uid, 'case_opener_1000');
  END IF;

  RETURN QUERY SELECT * FROM _rolls;
END $$;

CREATE OR REPLACE FUNCTION public.start_case_battle(_battle_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b record; pcount int; bot_n int := 1; s int; v_team int;
  cs record; pl record; roll record; v_value bigint; v_special text;
  v_jackpot uuid; v_jackpot_val bigint; v_low_val bigint;
  v_winner_team int;
  team_total_value bigint; team_size_actual int;
  share bigint;
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
    v_jackpot := NULL; v_jackpot_val := 0; v_low_val := NULL;
    SELECT id, value INTO v_jackpot, v_jackpot_val FROM public.case_items
      WHERE case_id = cs.case_id ORDER BY value DESC LIMIT 1;
    SELECT MIN(value) INTO v_low_val FROM public.case_items WHERE case_id = cs.case_id;

    FOR pl IN SELECT * FROM public.battle_players WHERE battle_id = _battle_id ORDER BY slot LOOP
      v_special := 'none';
      -- Tuned: keep specials rare so they remain exciting
      IF random() < 0.01 THEN v_special := 'empire'; END IF;
      IF v_special = 'none' AND random() < 0.03 THEN v_special := 'duel'; END IF;

      IF v_special = 'empire' THEN
        SELECT * INTO roll FROM public._roll_case_item(cs.case_id);
        DECLARE roll2 record; BEGIN
          SELECT * INTO roll2 FROM public._roll_case_item(cs.case_id);
          IF roll2.value > roll.value THEN roll := roll2; END IF;
        END;
        v_value := roll.value;
        INSERT INTO public.battle_rounds(battle_id, round_index, player_slot, case_id, item_id, item_name, item_image, item_value, rarity, special_spin)
        VALUES (_battle_id, cs.position, pl.slot, cs.case_id, roll.item_id, roll.name, roll.image, v_value, roll.rarity, 'empire');
      ELSIF v_special = 'duel' THEN
        IF random() < 0.5 THEN
          v_value := v_jackpot_val;
          INSERT INTO public.battle_rounds(battle_id, round_index, player_slot, case_id, item_id, item_name, item_image, item_value, rarity, special_spin)
          SELECT _battle_id, cs.position, pl.slot, cs.case_id, ci.id, ci.name, ci.image, ci.value, ci.rarity, 'duel'
          FROM public.case_items ci WHERE ci.id = v_jackpot;
        ELSE
          INSERT INTO public.battle_rounds(battle_id, round_index, player_slot, case_id, item_id, item_name, item_image, item_value, rarity, special_spin)
          SELECT _battle_id, cs.position, pl.slot, cs.case_id, ci.id, ci.name, ci.image, ci.value, ci.rarity, 'duel'
          FROM public.case_items ci WHERE ci.case_id = cs.case_id AND ci.value = v_low_val ORDER BY ci.id LIMIT 1;
          SELECT v_low_val INTO v_value;
        END IF;
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
