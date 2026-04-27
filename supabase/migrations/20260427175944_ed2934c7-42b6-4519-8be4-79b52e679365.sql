-- 1) Manual "Call a bot" RPC: host fills the next empty slot with a bot
CREATE OR REPLACE FUNCTION public.add_bot_to_battle(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  s int;
  v_team int;
  v_used int;
  bot_names text[] := ARRAY['BOT #1','BOT #2','BOT #3','BOT #4','BOT #5','BOT #6','BOT #7','BOT #8'];
  bot_avs text[] := ARRAY['🤖','👾','🛸','💀','🎃','🐺','🦾','🐉'];
BEGIN
  SELECT * INTO b FROM public.case_battles WHERE id = _battle_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'No battle'; END IF;
  IF b.status <> 'waiting' THEN RAISE EXCEPTION 'Battle already started'; END IF;
  IF b.host_id <> auth.uid() THEN RAISE EXCEPTION 'Only host can add bots'; END IF;

  -- pick the smallest empty slot
  SELECT MIN(g.slot) INTO s
  FROM generate_series(0, b.player_slots - 1) AS g(slot)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.battle_players bp
    WHERE bp.battle_id = _battle_id AND bp.slot = g.slot
  );

  IF s IS NULL THEN
    RAISE EXCEPTION 'Battle is already full';
  END IF;

  v_team := s / b.team_size;

  SELECT count(*) INTO v_used
  FROM public.battle_players
  WHERE battle_id = _battle_id AND is_bot = true;

  INSERT INTO public.battle_players(battle_id, slot, team, user_id, is_bot, display_name, avatar)
  VALUES (
    _battle_id, s, v_team, NULL, true,
    bot_names[((v_used) % 8) + 1],
    bot_avs[((v_used) % 8) + 1]
  );
END $$;

GRANT EXECUTE ON FUNCTION public.add_bot_to_battle(uuid) TO authenticated;


-- 2) Update start_case_battle so the pot is split across the FULL winning team
--    (humans + bots). Bots' shares are forfeited; humans only receive their fair share.
CREATE OR REPLACE FUNCTION public.start_case_battle(_battle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record; pcount int; bot_n int := 1; s int; v_team int;
  cs record; pl record; roll record; v_value bigint; v_special text;
  v_jackpot uuid; v_jackpot_val bigint; v_low_val bigint;
  v_winner_team int; v_payout bigint; team_count int;
  v_total_rolled bigint;
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
      IF random() < 0.015 THEN v_special := 'empire'; END IF;
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
          v_value := COALESCE(v_low_val, 0);
          INSERT INTO public.battle_rounds(battle_id, round_index, player_slot, case_id, item_id, item_name, item_image, item_value, rarity, special_spin)
          SELECT _battle_id, cs.position, pl.slot, cs.case_id, ci.id, ci.name, ci.image, ci.value, ci.rarity, 'duel'
          FROM public.case_items ci WHERE ci.case_id = cs.case_id AND ci.value = v_low_val LIMIT 1;
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

    UPDATE public.cases SET total_opened = total_opened + (SELECT COUNT(*) FROM public.battle_players WHERE battle_id = _battle_id),
      total_wagered = total_wagered + b.per_player_cost
      WHERE id = cs.case_id;
  END LOOP;

  team_count := b.player_slots / b.team_size;
  IF b.type = 'crazy' THEN
    SELECT team INTO v_winner_team FROM public.battle_players
      WHERE battle_id = _battle_id GROUP BY team ORDER BY SUM(total_winnings) ASC LIMIT 1;
  ELSE
    SELECT team INTO v_winner_team FROM public.battle_players
      WHERE battle_id = _battle_id GROUP BY team ORDER BY SUM(total_winnings) DESC LIMIT 1;
  END IF;

  SELECT COALESCE(SUM(total_winnings), 0) INTO v_total_rolled
    FROM public.battle_players WHERE battle_id = _battle_id;
  v_payout := v_total_rolled;

  UPDATE public.case_battles SET status = 'finished', finished_at = now(),
    winner_team = v_winner_team, pot_payout = v_payout WHERE id = _battle_id;

  DECLARE
    team_size_total int; share bigint;
  BEGIN
    -- NEW: split across the FULL winning team (humans + bots).
    -- Bots forfeit their share; humans only get their fair fraction.
    SELECT count(*) INTO team_size_total FROM public.battle_players
      WHERE battle_id = _battle_id AND team = v_winner_team;
    IF team_size_total > 0 AND v_payout > 0 THEN
      share := v_payout / team_size_total;
      UPDATE public.profiles p SET coins = coins + share, total_won = total_won + share
        FROM public.battle_players bp
        WHERE bp.battle_id = _battle_id AND bp.team = v_winner_team
          AND bp.is_bot = false AND bp.user_id = p.id;
    END IF;
  END;
END $$;