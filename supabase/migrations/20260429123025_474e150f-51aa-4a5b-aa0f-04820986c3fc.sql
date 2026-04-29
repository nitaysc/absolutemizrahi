
-- 1) WEEKLY MISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.weekly_missions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  target NUMERIC NOT NULL,
  progress NUMERIC NOT NULL DEFAULT 0,
  reward_coins BIGINT NOT NULL DEFAULT 0,
  reward_xp BIGINT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS weekly_missions_user_idx ON public.weekly_missions(user_id, expires_at);
ALTER TABLE public.weekly_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own weekly missions" ON public.weekly_missions;
CREATE POLICY "Users view own weekly missions" ON public.weekly_missions
  FOR SELECT USING (auth.uid() = user_id);

-- 2) ROLL WEEKLY MISSIONS
CREATE OR REPLACE FUNCTION public.roll_weekly_missions()
RETURNS SETOF public.weekly_missions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _active_count INTEGER;
  _pool JSONB;
  _picked JSONB;
  i INTEGER;
  _expire TIMESTAMPTZ;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT count(*) INTO _active_count FROM public.weekly_missions
    WHERE user_id = _uid AND expires_at > now();

  IF _active_count >= 3 THEN
    RETURN QUERY SELECT * FROM public.weekly_missions
      WHERE user_id = _uid AND expires_at > now()
      ORDER BY created_at;
    RETURN;
  END IF;

  -- Hard but achievable weekly pool
  _pool := '[
    {"kind":"bet_total","desc":"Wager 250,000 coins this week","target":250000,"coins":15000,"xp":6000},
    {"kind":"bet_total","desc":"Wager 1,000,000 coins this week","target":1000000,"coins":60000,"xp":25000},
    {"kind":"win_bets","desc":"Win 100 bets this week","target":100,"coins":12000,"xp":5000},
    {"kind":"win_bets","desc":"Win 250 bets this week","target":250,"coins":35000,"xp":14000},
    {"kind":"play_games","desc":"Play 300 rounds this week","target":300,"coins":10000,"xp":4000},
    {"kind":"open_cases","desc":"Open 75 cases this week","target":75,"coins":18000,"xp":7500},
    {"kind":"open_cases","desc":"Open 200 cases this week","target":200,"coins":50000,"xp":20000},
    {"kind":"big_multiplier","desc":"Hit a 100x or higher multiplier","target":1,"coins":25000,"xp":10000},
    {"kind":"big_multiplier","desc":"Hit a 500x or higher multiplier","target":1,"coins":80000,"xp":35000},
    {"kind":"battles_played","desc":"Play 25 case battles","target":25,"coins":20000,"xp":8000},
    {"kind":"battle_wins","desc":"Win 10 case battles","target":10,"coins":40000,"xp":16000},
    {"kind":"upgrade_wins","desc":"Win 15 upgrades this week","target":15,"coins":22000,"xp":9000}
  ]'::jsonb;

  -- Wipe expired
  DELETE FROM public.weekly_missions WHERE user_id = _uid AND expires_at <= now();

  -- Expires next Monday 00:00 UTC
  _expire := date_trunc('week', now()) + interval '7 days';

  FOR i IN 1..(3 - _active_count) LOOP
    _picked := _pool -> floor(random() * jsonb_array_length(_pool))::int;
    INSERT INTO public.weekly_missions (user_id, kind, description, target, reward_coins, reward_xp, expires_at)
      VALUES (_uid,
        _picked->>'kind',
        _picked->>'desc',
        (_picked->>'target')::numeric,
        (_picked->>'coins')::bigint,
        (_picked->>'xp')::bigint,
        _expire);
  END LOOP;

  RETURN QUERY SELECT * FROM public.weekly_missions
    WHERE user_id = _uid AND expires_at > now()
    ORDER BY created_at;
END $$;

-- 3) BUMP WEEKLY MISSION (mirror of bump_mission)
CREATE OR REPLACE FUNCTION public.bump_weekly_mission(_user_id uuid, _kind text, _amount numeric DEFAULT 1)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _r RECORD;
BEGIN
  FOR _r IN
    SELECT id, target, progress, reward_coins, reward_xp, description
      FROM public.weekly_missions
      WHERE user_id = _user_id AND kind = _kind
        AND completed = false AND expires_at > now()
      FOR UPDATE
  LOOP
    UPDATE public.weekly_missions
      SET progress = LEAST(_r.target, _r.progress + _amount),
          completed = (_r.progress + _amount) >= _r.target
      WHERE id = _r.id;

    IF (_r.progress + _amount) >= _r.target THEN
      UPDATE public.profiles
        SET coins = coins + _r.reward_coins, updated_at = now()
        WHERE id = _user_id;
      INSERT INTO public.progression_events (user_id, kind, payload)
        VALUES (_user_id, 'mission_complete', jsonb_build_object(
          'description', _r.description,
          'reward_coins', _r.reward_coins,
          'reward_xp', _r.reward_xp,
          'weekly', true
        ));
      PERFORM public.award_xp(_user_id, _r.reward_xp, 'weekly_mission', jsonb_build_object('kind', _kind));
    END IF;
  END LOOP;
END $$;

-- Helper: bump both daily and weekly for a kind
CREATE OR REPLACE FUNCTION public._bump_missions(_user_id uuid, _kind text, _amount numeric DEFAULT 1)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.bump_mission(_user_id, _kind, _amount);
  PERFORM public.bump_weekly_mission(_user_id, _kind, _amount);
END $$;

-- 4) NEW ACHIEVEMENTS (battle related + big case value)
INSERT INTO public.achievements (code, name, description, icon, reward_coins, reward_xp, category) VALUES
  ('battle_played_1', 'Warrior', 'Play your first case battle', '⚔️', 500, 200, 'battles'),
  ('battle_winner_1', 'Champion', 'Win your first case battle', '🏆', 1500, 600, 'battles'),
  ('battle_winner_25', 'Battle Master', 'Win 25 case battles', '👑', 25000, 10000, 'battles'),
  ('case_value_big', 'Golden Pull', 'Pull a single case item worth 50,000+ coins', '💎', 5000, 2500, 'cases')
ON CONFLICT (code) DO NOTHING;

-- 5) HOOK open_case_solo: XP, missions, achievements
CREATE OR REPLACE FUNCTION public.open_case_solo(_case_id uuid, _count integer)
RETURNS TABLE(item_id uuid, name text, image text, value bigint, rarity text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_price bigint; v_total bigint; v_balance bigint;
  i int; roll record; v_winnings bigint := 0;
  v_max_value bigint := 0;
  v_xp bigint;
  v_total_opened bigint;
  v_mult numeric;
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
    IF roll.value > v_max_value THEN v_max_value := roll.value; END IF;
  END LOOP;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
  VALUES (v_uid, 'cases', v_total, v_winnings,
          CASE WHEN v_total>0 THEN v_winnings::numeric / v_total ELSE 0 END,
          v_winnings > v_total,
          jsonb_build_object('case_id', _case_id, 'count', _count, 'to_inventory', true));

  -- Progression hooks
  v_xp := GREATEST(1, FLOOR(v_total / 10.0))::bigint;  -- ~10% of wager as XP
  PERFORM public.award_xp(v_uid, v_xp, 'cases', jsonb_build_object('case_id', _case_id, 'count', _count));

  PERFORM public._bump_missions(v_uid, 'bet_total', v_total);
  PERFORM public._bump_missions(v_uid, 'play_games', _count);
  PERFORM public._bump_missions(v_uid, 'open_cases', _count);
  IF v_winnings > v_total THEN
    PERFORM public._bump_missions(v_uid, 'win_bets', 1);
  END IF;

  v_mult := CASE WHEN v_total > 0 THEN v_winnings::numeric / v_total ELSE 0 END;
  IF v_mult >= 10 THEN PERFORM public._bump_missions(v_uid, 'big_multiplier', 1); END IF;

  -- Achievements
  IF v_mult >= 10  THEN PERFORM public.unlock_achievement(v_uid, 'big_hit_10x'); END IF;
  IF v_mult >= 100 THEN PERFORM public.unlock_achievement(v_uid, 'big_hit_100x'); END IF;
  IF v_mult >= 500 THEN PERFORM public.unlock_achievement(v_uid, 'big_hit_500x'); END IF;
  IF v_max_value >= 50000 THEN PERFORM public.unlock_achievement(v_uid, 'case_value_big'); END IF;

  -- Lifetime case opens for case_opener_* achievements
  SELECT COUNT(*) INTO v_total_opened FROM public.inventory WHERE user_id = v_uid AND source = 'solo';
  IF v_total_opened >= 10   THEN PERFORM public.unlock_achievement(v_uid, 'case_opener_10');   END IF;
  IF v_total_opened >= 100  THEN PERFORM public.unlock_achievement(v_uid, 'case_opener_100');  END IF;
  IF v_total_opened >= 1000 THEN PERFORM public.unlock_achievement(v_uid, 'case_opener_1000'); END IF;

  IF v_winnings > 0 THEN PERFORM public.unlock_achievement(v_uid, 'first_win'); END IF;

  RETURN QUERY SELECT * FROM _rolls;
END $$;

-- 6) HOOK battle settle: XP, missions, achievements
CREATE OR REPLACE FUNCTION public._settle_battle_to_inventory(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_winner_team int; v_pot bigint; team_size_total int; share bigint;
  pl record; r record; player_total bigint; scale numeric;
  awarded bigint; remainder bigint;
  v_per_cost bigint; v_winner_count bigint;
BEGIN
  SELECT winner_team, COALESCE(pot_payout,0), COALESCE(per_player_cost,0)
    INTO v_winner_team, v_pot, v_per_cost
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
    remainder := share - awarded;
    IF remainder > 0 THEN
      INSERT INTO public.inventory(user_id, item_name, item_image, rarity, value, source, source_ref)
        VALUES (pl.user_id, 'Cash Voucher', NULL, 'uncommon', remainder, 'battle', _battle_id);
    END IF;

    -- Progression for winners
    PERFORM public.award_xp(pl.user_id, GREATEST(1, FLOOR(share / 8.0))::bigint,
                            'battle_win', jsonb_build_object('battle_id', _battle_id));
    PERFORM public._bump_missions(pl.user_id, 'battle_wins', 1);
    PERFORM public._bump_missions(pl.user_id, 'win_bets', 1);
    PERFORM public.unlock_achievement(pl.user_id, 'battle_winner_1');

    SELECT COUNT(*) INTO v_winner_count
      FROM public.case_battles cb
      JOIN public.battle_players bp ON bp.battle_id = cb.id
      WHERE bp.user_id = pl.user_id AND bp.team = cb.winner_team AND cb.winner_team IS NOT NULL;
    IF v_winner_count >= 25 THEN
      PERFORM public.unlock_achievement(pl.user_id, 'battle_winner_25');
    END IF;
  END LOOP;

  -- Progression for ALL human participants (battle played + wager)
  FOR pl IN
    SELECT * FROM public.battle_players
      WHERE battle_id = _battle_id AND is_bot = false
  LOOP
    PERFORM public._bump_missions(pl.user_id, 'battles_played', 1);
    PERFORM public._bump_missions(pl.user_id, 'play_games', 1);
    IF v_per_cost > 0 THEN
      PERFORM public._bump_missions(pl.user_id, 'bet_total', v_per_cost);
      PERFORM public.award_xp(pl.user_id, GREATEST(1, FLOOR(v_per_cost / 20.0))::bigint,
                              'battle_play', jsonb_build_object('battle_id', _battle_id));
    END IF;
    PERFORM public.unlock_achievement(pl.user_id, 'battle_played_1');
  END LOOP;
END $$;
