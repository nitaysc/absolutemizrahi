
-- Update create_case_battle to accept _borrow_pct (0..80) for the host
CREATE OR REPLACE FUNCTION public.create_case_battle(
  _mode text, _type text, _case_ids uuid[],
  _fill_with_bots boolean, _fast boolean, _private boolean,
  _allow_borrow boolean DEFAULT false,
  _borrow_pct int DEFAULT 0
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots int; v_team int; v_total bigint := 0; v_battle uuid; cid uuid; pos int := 0;
  v_user_balance bigint; v_pay bigint; v_borrow bigint := 0; v_pct int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _type NOT IN ('normal','crazy','group','terminal') THEN RAISE EXCEPTION 'Invalid type'; END IF;
  SELECT slots, team_size INTO v_slots, v_team FROM public._slots_for_mode(_mode);
  IF v_slots IS NULL THEN RAISE EXCEPTION 'Invalid mode'; END IF;
  IF array_length(_case_ids,1) IS NULL OR array_length(_case_ids,1) > 50 THEN
    RAISE EXCEPTION 'Pick 1-50 cases'; END IF;

  v_total := 0;
  FOREACH cid IN ARRAY _case_ids LOOP
    v_total := v_total + (SELECT price FROM public.cases WHERE id = cid AND status = 'approved');
  END LOOP;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Invalid cases'; END IF;

  v_pct := COALESCE(_borrow_pct, 0);
  IF NOT _allow_borrow THEN v_pct := 0; END IF;
  IF v_pct < 0 THEN v_pct := 0; END IF;
  IF v_pct > 80 THEN v_pct := 80; END IF;

  v_borrow := (v_total * v_pct) / 100;
  v_pay := v_total - v_borrow;

  SELECT coins INTO v_user_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_user_balance < v_pay THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  UPDATE public.profiles SET coins = coins - v_pay,
    total_wagered = total_wagered + v_total WHERE id = v_uid;

  INSERT INTO public.case_battles(host_id, mode, type, total_cost, per_player_cost,
    fill_with_bots, fast, is_private, team_size, player_slots, rounds_total, allow_borrow)
  VALUES (v_uid, _mode, _type, v_total * v_slots, v_total,
    _fill_with_bots, _fast, _private, v_team, v_slots, array_length(_case_ids,1), _allow_borrow)
  RETURNING id INTO v_battle;

  FOREACH cid IN ARRAY _case_ids LOOP
    INSERT INTO public.battle_cases(battle_id, case_id, position, qty)
    VALUES (v_battle, cid, pos, 1);
    pos := pos + 1;
  END LOOP;

  INSERT INTO public.battle_players(battle_id, slot, team, user_id, is_bot, display_name, avatar, borrowed)
  SELECT v_battle, 0, 0, v_uid, false,
    COALESCE(p.username,'player'), COALESCE(p.avatar,'🎰'), v_borrow
  FROM public.profiles p WHERE p.id = v_uid;

  RETURN v_battle;
END $$;

-- join_case_battle with per-player borrow_pct
CREATE OR REPLACE FUNCTION public.join_case_battle(
  _battle_id uuid,
  _borrow_pct int DEFAULT 0
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  b record; v_slot int; v_team int; v_balance bigint;
  v_pay bigint; v_borrow bigint := 0; v_pct int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.case_battles WHERE id = _battle_id FOR UPDATE;
  IF b IS NULL OR b.status <> 'waiting' THEN RAISE EXCEPTION 'Battle not joinable'; END IF;
  IF EXISTS (SELECT 1 FROM public.battle_players WHERE battle_id = _battle_id AND user_id = v_uid)
    THEN RAISE EXCEPTION 'Already joined'; END IF;

  SELECT s INTO v_slot FROM generate_series(0, b.player_slots-1) s
    WHERE NOT EXISTS (SELECT 1 FROM public.battle_players WHERE battle_id = _battle_id AND slot = s)
    ORDER BY s LIMIT 1;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'Battle full'; END IF;
  v_team := v_slot / b.team_size;

  v_pct := COALESCE(_borrow_pct, 0);
  IF NOT b.allow_borrow THEN v_pct := 0; END IF;
  IF v_pct < 0 THEN v_pct := 0; END IF;
  IF v_pct > 80 THEN v_pct := 80; END IF;
  v_borrow := (b.per_player_cost * v_pct) / 100;
  v_pay := b.per_player_cost - v_borrow;

  SELECT coins INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance < v_pay THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  UPDATE public.profiles SET coins = coins - v_pay,
    total_wagered = total_wagered + b.per_player_cost WHERE id = v_uid;

  INSERT INTO public.battle_players(battle_id, slot, team, user_id, is_bot, display_name, avatar, borrowed)
  SELECT _battle_id, v_slot, v_team, v_uid, false,
    COALESCE(p.username,'player'), COALESCE(p.avatar,'🎰'), v_borrow
  FROM public.profiles p WHERE p.id = v_uid;
END $$;

-- start_case_battle: deduct borrowed from each winner's share; losers' loans are forgiven
CREATE OR REPLACE FUNCTION public.start_case_battle(_battle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record; pcount int; bot_n int := 1; s int; v_team int;
  cs record; pl record; roll record; v_value bigint; v_special text;
  v_jackpot uuid; v_jackpot_val bigint; v_low_val bigint;
  v_winner_team int; v_winner_user uuid; v_max bigint; v_min bigint;
  v_team_total bigint; v_payout bigint; team_count int;
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
      IF random() < 0.03 THEN v_special := 'empire'; END IF;
      IF v_special = 'none' AND random() < 0.07 THEN v_special := 'duel'; END IF;

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

  team_count := b.player_slots / b.team_size;
  IF b.type = 'crazy' THEN
    SELECT team INTO v_winner_team FROM public.battle_players
      WHERE battle_id = _battle_id GROUP BY team ORDER BY SUM(total_winnings) ASC LIMIT 1;
  ELSE
    SELECT team INTO v_winner_team FROM public.battle_players
      WHERE battle_id = _battle_id GROUP BY team ORDER BY SUM(total_winnings) DESC LIMIT 1;
  END IF;

  v_payout := (b.total_cost * (10000 - b.house_edge_bps)) / 10000;
  UPDATE public.case_battles SET status = 'finished', finished_at = now(),
    winner_team = v_winner_team, pot_payout = v_payout WHERE id = _battle_id;

  -- Equal share among winning humans, minus their borrowed amount.
  -- Losers' borrowed amounts are forgiven (not clawed back).
  DECLARE
    human_count int; share bigint; w record; net_share bigint;
  BEGIN
    SELECT count(*) INTO human_count FROM public.battle_players
      WHERE battle_id = _battle_id AND team = v_winner_team AND is_bot = false;
    IF human_count > 0 THEN
      share := v_payout / human_count;
      FOR w IN SELECT * FROM public.battle_players
        WHERE battle_id = _battle_id AND team = v_winner_team AND is_bot = false
      LOOP
        net_share := GREATEST(share - w.borrowed, 0);
        IF net_share > 0 THEN
          UPDATE public.profiles SET coins = coins + net_share,
            total_won = total_won + net_share WHERE id = w.user_id;
        END IF;
      END LOOP;
    END IF;
  END;
END $$;

-- leave_case_battle: refund only what was actually paid (per_player_cost - borrowed)
CREATE OR REPLACE FUNCTION public.leave_case_battle(_battle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); b record; v_my_borrow bigint;
BEGIN
  SELECT * INTO b FROM public.case_battles WHERE id = _battle_id FOR UPDATE;
  IF b IS NULL OR b.status <> 'waiting' THEN RAISE EXCEPTION 'Cannot leave'; END IF;
  SELECT borrowed INTO v_my_borrow FROM public.battle_players
    WHERE battle_id = _battle_id AND user_id = v_uid;
  IF v_my_borrow IS NULL THEN RAISE EXCEPTION 'Not in battle'; END IF;

  UPDATE public.profiles SET coins = coins + (b.per_player_cost - v_my_borrow) WHERE id = v_uid;
  DELETE FROM public.battle_players WHERE battle_id = _battle_id AND user_id = v_uid;

  IF b.host_id = v_uid THEN
    UPDATE public.profiles p
      SET coins = coins + (b.per_player_cost - bp.borrowed)
      FROM public.battle_players bp
      WHERE bp.battle_id = _battle_id AND bp.user_id = p.id;
    DELETE FROM public.battle_players WHERE battle_id = _battle_id;
    UPDATE public.case_battles SET status = 'cancelled' WHERE id = _battle_id;
  END IF;
END $$;
