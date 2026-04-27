
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
  v_balance bigint; v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _target_value <= 0 THEN RAISE EXCEPTION 'Bad target'; END IF;
  IF _cash < 0 THEN _cash := 0; END IF;

  -- Lock + sum staked items (lock first, then aggregate; FOR UPDATE not allowed with SUM)
  IF _item_ids IS NOT NULL AND array_length(_item_ids,1) > 0 THEN
    PERFORM 1 FROM public.inventory
      WHERE id = ANY(_item_ids) AND user_id = v_uid AND status = 'held'
      FOR UPDATE;

    SELECT COALESCE(SUM(value),0), COUNT(*) INTO v_stake, v_count
      FROM public.inventory
      WHERE id = ANY(_item_ids) AND user_id = v_uid AND status = 'held';

    IF v_count <> array_length(_item_ids,1) THEN
      RAISE EXCEPTION 'Some staked items unavailable';
    END IF;
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
