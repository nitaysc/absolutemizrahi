-- Inventory table
CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_name text NOT NULL,
  item_image text,
  rarity text NOT NULL DEFAULT 'common',
  value bigint NOT NULL,
  source text NOT NULL DEFAULT 'solo', -- 'solo' | 'battle'
  source_ref uuid,                      -- battle_id or case_id
  status text NOT NULL DEFAULT 'held',  -- 'held' | 'sold'
  sold_for bigint,
  sold_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_user_status ON public.inventory(user_id, status, created_at DESC);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own inventory" ON public.inventory;
CREATE POLICY "Users view own inventory" ON public.inventory
  FOR SELECT USING (auth.uid() = user_id);

-- No direct insert/update/delete from clients — only via SECURITY DEFINER RPCs.

-- Sell a single inventory item: 95% of value (5% house cut on sell)
CREATE OR REPLACE FUNCTION public.sell_inventory_item(_item_id uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_value bigint; v_payout bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT value INTO v_value FROM public.inventory
    WHERE id = _item_id AND user_id = v_uid AND status = 'held' FOR UPDATE;
  IF v_value IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  v_payout := (v_value * 9500) / 10000;
  UPDATE public.inventory SET status = 'sold', sold_for = v_payout, sold_at = now()
    WHERE id = _item_id;
  IF v_payout > 0 THEN
    UPDATE public.profiles SET coins = coins + v_payout, total_won = total_won + v_payout
      WHERE id = v_uid;
  END IF;
  RETURN v_payout;
END $$;
GRANT EXECUTE ON FUNCTION public.sell_inventory_item(uuid) TO authenticated;

-- Sell every held item at once
CREATE OR REPLACE FUNCTION public.sell_all_inventory()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total bigint := 0; v_payout bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COALESCE(SUM((value * 9500) / 10000), 0) INTO v_payout
    FROM public.inventory WHERE user_id = v_uid AND status = 'held';
  UPDATE public.inventory SET status = 'sold', sold_for = (value * 9500)/10000, sold_at = now()
    WHERE user_id = v_uid AND status = 'held';
  IF v_payout > 0 THEN
    UPDATE public.profiles SET coins = coins + v_payout, total_won = total_won + v_payout
      WHERE id = v_uid;
    v_total := v_payout;
  END IF;
  RETURN v_total;
END $$;
GRANT EXECUTE ON FUNCTION public.sell_all_inventory() TO authenticated;

-- Solo case opening: deposit items into inventory (instead of paying coins).
-- Wager still deducted up-front. No coin payout — user must sell from inventory.
CREATE OR REPLACE FUNCTION public.open_case_solo(_case_id uuid, _count int)
RETURNS TABLE(item_id uuid, name text, image text, value bigint, rarity text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_price bigint; v_total bigint; v_balance bigint;
  i int; roll record; v_winnings bigint := 0;
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
  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
  VALUES (v_uid, 'cases', v_total, v_winnings,
          CASE WHEN v_total>0 THEN v_winnings::numeric / v_total ELSE 0 END,
          v_winnings > v_total,
          jsonb_build_object('case_id', _case_id, 'count', _count, 'to_inventory', true));

  RETURN QUERY SELECT * FROM _rolls;
END $$;

-- Battle settlement: deposit each winner's share as inventory items
-- (one inventory entry per round they rolled, scaled to their share of the pot).
-- Replaces the coin payout block from start_case_battle.
CREATE OR REPLACE FUNCTION public._settle_battle_to_inventory(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_winner_team int; v_pot bigint; team_size_total int; share bigint;
  pl record; r record; player_total bigint; scale numeric;
BEGIN
  SELECT winner_team, COALESCE(pot_payout,0) INTO v_winner_team, v_pot
    FROM public.case_battles WHERE id = _battle_id;
  IF v_winner_team IS NULL OR v_pot <= 0 THEN RETURN; END IF;

  SELECT count(*) INTO team_size_total FROM public.battle_players
    WHERE battle_id = _battle_id AND team = v_winner_team;
  IF team_size_total = 0 THEN RETURN; END IF;
  share := v_pot / team_size_total;

  FOR pl IN
    SELECT * FROM public.battle_players
      WHERE battle_id = _battle_id AND team = v_winner_team AND is_bot = false
  LOOP
    SELECT GREATEST(1, COALESCE(SUM(item_value),0))::bigint INTO player_total
      FROM public.battle_rounds WHERE battle_id = _battle_id AND player_slot = pl.slot;
    scale := share::numeric / player_total::numeric;
    FOR r IN SELECT * FROM public.battle_rounds
        WHERE battle_id = _battle_id AND player_slot = pl.slot LOOP
      INSERT INTO public.inventory(user_id, item_name, item_image, rarity, value, source, source_ref)
        VALUES (pl.user_id, r.item_name, r.item_image, r.rarity,
                GREATEST(0, FLOOR(r.item_value * scale))::bigint,
                'battle', _battle_id);
    END LOOP;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public._settle_battle_to_inventory(uuid) TO authenticated;

-- Patch start_case_battle to use inventory instead of crediting coins.
CREATE OR REPLACE FUNCTION public.start_case_battle(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record; cs record; pl record; roll record;
  v_value bigint; v_special text; v_jackpot uuid; v_jackpot_val bigint;
  v_low_val bigint; v_winner_team int; v_total_rolled bigint; v_payout bigint;
  team_count int;
BEGIN
  SELECT * INTO b FROM public.case_battles WHERE id = _battle_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF b.status <> 'waiting' THEN RAISE EXCEPTION 'Already started'; END IF;
  IF (SELECT count(*) FROM public.battle_players WHERE battle_id = _battle_id) < b.player_slots THEN
    RAISE EXCEPTION 'Not full';
  END IF;
  UPDATE public.case_battles SET status = 'rolling', started_at = now() WHERE id = _battle_id;

  FOR cs IN SELECT * FROM public.battle_cases WHERE battle_id = _battle_id ORDER BY position LOOP
    SELECT id, value INTO v_jackpot, v_jackpot_val FROM public.case_items
      WHERE case_id = cs.case_id ORDER BY value DESC LIMIT 1;
    SELECT MIN(value) INTO v_low_val FROM public.case_items WHERE case_id = cs.case_id;

    FOR pl IN SELECT * FROM public.battle_players WHERE battle_id = _battle_id ORDER BY slot LOOP
      v_special := 'none';
      IF b.type = 'empire' AND random() < 0.10 THEN v_special := 'empire';
      ELSIF b.type = 'duel' AND random() < 0.10 THEN v_special := 'duel';
      END IF;

      IF v_special = 'empire' THEN
        SELECT * INTO roll FROM public._roll_case_item(cs.case_id);
        DECLARE roll2 record;
        BEGIN
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

  -- Pay out as INVENTORY ITEMS (no coin credit).
  PERFORM public._settle_battle_to_inventory(_battle_id);
END $$;
GRANT EXECUTE ON FUNCTION public.start_case_battle(uuid) TO authenticated;