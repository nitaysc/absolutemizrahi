
-- 1) 100% sellback (remove 5% house cut)
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
  v_payout := v_value;
  UPDATE public.inventory SET status = 'sold', sold_for = v_payout, sold_at = now()
    WHERE id = _item_id;
  IF v_payout > 0 THEN
    UPDATE public.profiles SET coins = coins + v_payout, total_won = total_won + v_payout
      WHERE id = v_uid;
  END IF;
  RETURN v_payout;
END $$;

CREATE OR REPLACE FUNCTION public.sell_all_inventory()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payout bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COALESCE(SUM(value), 0) INTO v_payout
    FROM public.inventory WHERE user_id = v_uid AND status = 'held';
  UPDATE public.inventory SET status = 'sold', sold_for = value, sold_at = now()
    WHERE user_id = v_uid AND status = 'held';
  IF v_payout > 0 THEN
    UPDATE public.profiles SET coins = coins + v_payout, total_won = total_won + v_payout
      WHERE id = v_uid;
  END IF;
  RETURN COALESCE(v_payout, 0);
END $$;

-- 2) Sell only items from a specific battle (for quick-sell after battle)
CREATE OR REPLACE FUNCTION public.sell_battle_inventory(_battle_id uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payout bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COALESCE(SUM(value),0) INTO v_payout
    FROM public.inventory
    WHERE user_id = v_uid AND status = 'held' AND source = 'battle' AND source_ref = _battle_id;
  UPDATE public.inventory SET status='sold', sold_for=value, sold_at=now()
    WHERE user_id = v_uid AND status='held' AND source='battle' AND source_ref = _battle_id;
  IF v_payout > 0 THEN
    UPDATE public.profiles SET coins = coins + v_payout, total_won = total_won + v_payout
      WHERE id = v_uid;
  END IF;
  RETURN COALESCE(v_payout,0);
END $$;
GRANT EXECUTE ON FUNCTION public.sell_battle_inventory(uuid) TO authenticated;

-- 3) Battle settlement: balance leftover with a voucher item so the share is exact
CREATE OR REPLACE FUNCTION public._settle_battle_to_inventory(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_winner_team int; v_pot bigint; team_size_total int; share bigint;
  pl record; r record; player_total bigint; scale numeric;
  awarded bigint; remainder bigint;
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
    awarded := 0;
    FOR r IN SELECT * FROM public.battle_rounds
        WHERE battle_id = _battle_id AND player_slot = pl.slot LOOP
      INSERT INTO public.inventory(user_id, item_name, item_image, rarity, value, source, source_ref)
        VALUES (pl.user_id, r.item_name, r.item_image, r.rarity,
                GREATEST(0, FLOOR(r.item_value * scale))::bigint,
                'battle', _battle_id);
      awarded := awarded + GREATEST(0, FLOOR(r.item_value * scale))::bigint;
    END LOOP;
    -- Voucher for any leftover (rounding remainder OR pure cash share)
    remainder := share - awarded;
    IF remainder > 0 THEN
      INSERT INTO public.inventory(user_id, item_name, item_image, rarity, value, source, source_ref)
        VALUES (pl.user_id, 'Cash Voucher', NULL, 'uncommon', remainder, 'battle', _battle_id);
    END IF;
  END LOOP;
END $$;

-- 4) Upgrader: stake N inventory items + optional cash for a chance at a target item.
-- Chance = (sum_of_stakes / target_value) * 0.90  (10% house edge), capped at 0.95.
-- Win  -> stakes consumed, target item added to inventory.
-- Lose -> stakes consumed, nothing added.
CREATE OR REPLACE FUNCTION public.upgrade_inventory(
  _item_ids uuid[],
  _cash bigint,
  _target_value bigint,
  _target_name text,
  _target_image text,
  _target_rarity text
)
RETURNS TABLE(won boolean, chance numeric, roll numeric, stake bigint, target_value bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_stake bigint := 0; v_chance numeric; v_roll numeric; v_won boolean;
  v_balance bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _target_value <= 0 THEN RAISE EXCEPTION 'Bad target'; END IF;
  IF _cash < 0 THEN _cash := 0; END IF;

  -- Lock + sum staked items
  IF _item_ids IS NOT NULL AND array_length(_item_ids,1) > 0 THEN
    SELECT COALESCE(SUM(value),0) INTO v_stake FROM public.inventory
      WHERE id = ANY(_item_ids) AND user_id = v_uid AND status = 'held' FOR UPDATE;
    IF v_stake = 0 OR (SELECT count(*) FROM public.inventory
        WHERE id = ANY(_item_ids) AND user_id = v_uid AND status = 'held') <> array_length(_item_ids,1)
    THEN RAISE EXCEPTION 'Some staked items unavailable'; END IF;
  END IF;

  -- Cash side
  IF _cash > 0 THEN
    SELECT coins INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
    IF v_balance < _cash THEN RAISE EXCEPTION 'Insufficient coins'; END IF;
    UPDATE public.profiles SET coins = coins - _cash, total_wagered = total_wagered + _cash WHERE id = v_uid;
  END IF;
  v_stake := v_stake + _cash;
  IF v_stake <= 0 THEN RAISE EXCEPTION 'Nothing to stake'; END IF;
  IF v_stake >= _target_value THEN RAISE EXCEPTION 'Stake must be lower than target'; END IF;

  -- Consume staked items
  IF _item_ids IS NOT NULL AND array_length(_item_ids,1) > 0 THEN
    UPDATE public.inventory SET status = 'sold', sold_for = 0, sold_at = now()
      WHERE id = ANY(_item_ids) AND user_id = v_uid AND status = 'held';
  END IF;

  v_chance := LEAST(0.95, (v_stake::numeric / _target_value::numeric) * 0.90);
  v_roll := random();
  v_won := v_roll < v_chance;

  IF v_won THEN
    INSERT INTO public.inventory(user_id, item_name, item_image, rarity, value, source, source_ref)
      VALUES (v_uid, _target_name, _target_image, COALESCE(_target_rarity,'rare'), _target_value, 'upgrade', NULL);
    UPDATE public.profiles SET total_won = total_won + _target_value WHERE id = v_uid;
  END IF;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (v_uid, 'upgrade', v_stake,
            CASE WHEN v_won THEN _target_value ELSE 0 END,
            CASE WHEN v_stake>0 THEN (CASE WHEN v_won THEN _target_value ELSE 0 END)::numeric / v_stake ELSE 0 END,
            v_won,
            jsonb_build_object('target', _target_name, 'chance', v_chance, 'roll', v_roll));

  RETURN QUERY SELECT v_won, v_chance, v_roll, v_stake, _target_value;
END $$;
GRANT EXECUTE ON FUNCTION public.upgrade_inventory(uuid[],bigint,bigint,text,text,text) TO authenticated;
