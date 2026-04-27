
-- ============ ROLES ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Seed Fx nitay as admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('2b4715bd-be5d-4bda-aa2f-597659ff894b', 'admin')
ON CONFLICT DO NOTHING;

-- ============ CASES ============
CREATE TABLE IF NOT EXISTS public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image text,
  price bigint NOT NULL CHECK (price > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  is_official boolean NOT NULL DEFAULT false,
  creator_id uuid,
  rejection_reason text,
  total_opened bigint NOT NULL DEFAULT 0,
  total_wagered bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone view approved cases" ON public.cases;
CREATE POLICY "Anyone view approved cases" ON public.cases FOR SELECT
USING (status = 'approved' OR creator_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users create own cases" ON public.cases;
CREATE POLICY "Users create own cases" ON public.cases FOR INSERT
WITH CHECK (auth.uid() = creator_id AND status = 'pending' AND is_official = false);

DROP POLICY IF EXISTS "Owners edit pending" ON public.cases;
CREATE POLICY "Owners edit pending" ON public.cases FOR UPDATE
USING ((creator_id = auth.uid() AND status = 'pending') OR public.is_admin());

DROP POLICY IF EXISTS "Owners delete pending" ON public.cases;
CREATE POLICY "Owners delete pending" ON public.cases FOR DELETE
USING ((creator_id = auth.uid() AND status = 'pending') OR public.is_admin());

CREATE TABLE IF NOT EXISTS public.case_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  name text NOT NULL,
  image text,
  value bigint NOT NULL CHECK (value >= 0),
  weight numeric NOT NULL CHECK (weight > 0),
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','uncommon','rare','epic','legendary','mythic')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_items_case ON public.case_items(case_id);
ALTER TABLE public.case_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View items of visible cases" ON public.case_items;
CREATE POLICY "View items of visible cases" ON public.case_items FOR SELECT
USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND (c.status = 'approved' OR c.creator_id = auth.uid() OR public.is_admin())));

DROP POLICY IF EXISTS "Owners manage items pending" ON public.case_items;
CREATE POLICY "Owners manage items pending" ON public.case_items FOR ALL
USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND ((c.creator_id = auth.uid() AND c.status = 'pending') OR public.is_admin())))
WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND ((c.creator_id = auth.uid() AND c.status = 'pending') OR public.is_admin())));

-- ============ BATTLES ============
CREATE TABLE IF NOT EXISTS public.case_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL,
  mode text NOT NULL,                 -- '1v1','1v1v1','1v1v1v1','2v2','3v3'
  type text NOT NULL DEFAULT 'normal' CHECK (type IN ('normal','crazy','group','terminal')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','running','finished','cancelled')),
  total_cost bigint NOT NULL,
  per_player_cost bigint NOT NULL,
  fill_with_bots boolean NOT NULL DEFAULT false,
  fast boolean NOT NULL DEFAULT false,
  is_private boolean NOT NULL DEFAULT false,
  team_size integer NOT NULL DEFAULT 1,
  player_slots integer NOT NULL,
  rounds_total integer NOT NULL,
  current_round integer NOT NULL DEFAULT 0,
  winner_user_id uuid,
  winner_team integer,
  pot_payout bigint,
  house_edge_bps integer NOT NULL DEFAULT 500,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
ALTER TABLE public.case_battles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone view battles" ON public.case_battles;
CREATE POLICY "Anyone view battles" ON public.case_battles FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.battle_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.case_battles(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id),
  position integer NOT NULL,
  qty integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_battle_cases_battle ON public.battle_cases(battle_id);
ALTER TABLE public.battle_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone view battle cases" ON public.battle_cases;
CREATE POLICY "Anyone view battle cases" ON public.battle_cases FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.battle_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.case_battles(id) ON DELETE CASCADE,
  slot integer NOT NULL,
  team integer NOT NULL DEFAULT 0,
  user_id uuid,                       -- null = bot
  is_bot boolean NOT NULL DEFAULT false,
  display_name text NOT NULL,
  avatar text NOT NULL DEFAULT '🤖',
  total_winnings bigint NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(battle_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_battle_players_battle ON public.battle_players(battle_id);
ALTER TABLE public.battle_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone view battle players" ON public.battle_players;
CREATE POLICY "Anyone view battle players" ON public.battle_players FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.battle_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.case_battles(id) ON DELETE CASCADE,
  round_index integer NOT NULL,
  player_slot integer NOT NULL,
  case_id uuid NOT NULL,
  item_id uuid NOT NULL,
  item_name text NOT NULL,
  item_image text,
  item_value bigint NOT NULL,
  rarity text NOT NULL DEFAULT 'common',
  special_spin text NOT NULL DEFAULT 'none' CHECK (special_spin IN ('none','empire','duel')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_battle_rounds_battle ON public.battle_rounds(battle_id);
ALTER TABLE public.battle_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone view battle rounds" ON public.battle_rounds;
CREATE POLICY "Anyone view battle rounds" ON public.battle_rounds FOR SELECT USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_battles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_rounds;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public._slots_for_mode(_mode text)
RETURNS TABLE(slots int, team_size int) LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _mode
    WHEN '1v1' THEN 2 WHEN '1v1v1' THEN 3 WHEN '1v1v1v1' THEN 4
    WHEN '2v2' THEN 4 WHEN '3v3' THEN 6 ELSE 2 END,
  CASE _mode
    WHEN '2v2' THEN 2 WHEN '3v3' THEN 3 ELSE 1 END;
$$;

CREATE OR REPLACE FUNCTION public._roll_case_item(_case_id uuid)
RETURNS TABLE(item_id uuid, name text, image text, value bigint, rarity text, weight numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE total numeric; r numeric; cum numeric := 0; rec RECORD;
BEGIN
  SELECT COALESCE(SUM(weight),0) INTO total FROM public.case_items WHERE case_id = _case_id;
  IF total <= 0 THEN RAISE EXCEPTION 'Case has no items'; END IF;
  r := random() * total;
  FOR rec IN SELECT * FROM public.case_items WHERE case_id = _case_id ORDER BY id LOOP
    cum := cum + rec.weight;
    IF r <= cum THEN
      RETURN QUERY SELECT rec.id, rec.name, rec.image, rec.value, rec.rarity, rec.weight;
      RETURN;
    END IF;
  END LOOP;
  -- fallback last
  RETURN QUERY SELECT rec.id, rec.name, rec.image, rec.value, rec.rarity, rec.weight;
END $$;

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.create_case_battle(
  _mode text, _type text, _case_ids uuid[],
  _fill_with_bots boolean, _fast boolean, _private boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots int; v_team int; v_total bigint := 0; v_battle uuid; cid uuid; pos int := 0;
  v_user_balance bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _type NOT IN ('normal','crazy','group','terminal') THEN RAISE EXCEPTION 'Invalid type'; END IF;
  SELECT slots, team_size INTO v_slots, v_team FROM public._slots_for_mode(_mode);
  IF v_slots IS NULL THEN RAISE EXCEPTION 'Invalid mode'; END IF;
  IF array_length(_case_ids,1) IS NULL OR array_length(_case_ids,1) > 50 THEN
    RAISE EXCEPTION 'Pick 1-50 cases'; END IF;

  SELECT COALESCE(SUM(price),0) INTO v_total FROM public.cases
    WHERE id = ANY(_case_ids) AND status = 'approved';
  -- preserve duplicates / order via array
  v_total := 0;
  FOREACH cid IN ARRAY _case_ids LOOP
    v_total := v_total + (SELECT price FROM public.cases WHERE id = cid AND status = 'approved');
  END LOOP;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Invalid cases'; END IF;

  SELECT coins INTO v_user_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_user_balance < v_total THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  UPDATE public.profiles SET coins = coins - v_total,
    total_wagered = total_wagered + v_total WHERE id = v_uid;

  INSERT INTO public.case_battles(host_id, mode, type, total_cost, per_player_cost,
    fill_with_bots, fast, is_private, team_size, player_slots, rounds_total)
  VALUES (v_uid, _mode, _type, v_total * v_slots, v_total,
    _fill_with_bots, _fast, _private, v_team, v_slots, array_length(_case_ids,1))
  RETURNING id INTO v_battle;

  FOREACH cid IN ARRAY _case_ids LOOP
    INSERT INTO public.battle_cases(battle_id, case_id, position, qty)
    VALUES (v_battle, cid, pos, 1);
    pos := pos + 1;
  END LOOP;

  INSERT INTO public.battle_players(battle_id, slot, team, user_id, is_bot, display_name, avatar)
  SELECT v_battle, 0, 0, v_uid, false,
    COALESCE(p.username,'player'), COALESCE(p.avatar,'🎰')
  FROM public.profiles p WHERE p.id = v_uid;

  RETURN v_battle;
END $$;

CREATE OR REPLACE FUNCTION public.join_case_battle(_battle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  b record; v_slot int; v_team int; v_balance bigint;
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

  SELECT coins INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance < b.per_player_cost THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  UPDATE public.profiles SET coins = coins - b.per_player_cost,
    total_wagered = total_wagered + b.per_player_cost WHERE id = v_uid;

  INSERT INTO public.battle_players(battle_id, slot, team, user_id, is_bot, display_name, avatar)
  SELECT _battle_id, v_slot, v_team, v_uid, false,
    COALESCE(p.username,'player'), COALESCE(p.avatar,'🎰')
  FROM public.profiles p WHERE p.id = v_uid;
END $$;

CREATE OR REPLACE FUNCTION public.leave_case_battle(_battle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); b record;
BEGIN
  SELECT * INTO b FROM public.case_battles WHERE id = _battle_id FOR UPDATE;
  IF b IS NULL OR b.status <> 'waiting' THEN RAISE EXCEPTION 'Cannot leave'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.battle_players WHERE battle_id = _battle_id AND user_id = v_uid)
    THEN RAISE EXCEPTION 'Not in battle'; END IF;
  UPDATE public.profiles SET coins = coins + b.per_player_cost WHERE id = v_uid;
  DELETE FROM public.battle_players WHERE battle_id = _battle_id AND user_id = v_uid;
  IF b.host_id = v_uid THEN
    -- refund any remaining players too and cancel
    UPDATE public.profiles p SET coins = coins + b.per_player_cost
      FROM public.battle_players bp WHERE bp.battle_id = _battle_id AND bp.user_id = p.id;
    DELETE FROM public.battle_players WHERE battle_id = _battle_id;
    UPDATE public.case_battles SET status = 'cancelled' WHERE id = _battle_id;
  END IF;
END $$;

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

  -- Roll all rounds
  FOR cs IN SELECT * FROM public.battle_cases WHERE battle_id = _battle_id ORDER BY position LOOP
    -- Pick at most one Empire and Duel spin per round across players
    v_jackpot := NULL; v_jackpot_val := 0; v_low_val := NULL;
    -- Determine top item (jackpot) and lowest item in this case for special spins
    SELECT id, value INTO v_jackpot, v_jackpot_val FROM public.case_items
      WHERE case_id = cs.case_id ORDER BY value DESC LIMIT 1;
    SELECT MIN(value) INTO v_low_val FROM public.case_items WHERE case_id = cs.case_id;

    FOR pl IN SELECT * FROM public.battle_players WHERE battle_id = _battle_id ORDER BY slot LOOP
      v_special := 'none';
      IF random() < 0.03 THEN v_special := 'empire'; END IF;
      IF v_special = 'none' AND random() < 0.07 THEN v_special := 'duel'; END IF;

      IF v_special = 'empire' THEN
        -- reroll favoring high tier: roll twice, take better
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

  -- Determine winner team based on type (crazy = lowest)
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

  -- Distribute payout equally among human winners on the team
  DECLARE
    human_count int; share bigint;
  BEGIN
    SELECT count(*) INTO human_count FROM public.battle_players
      WHERE battle_id = _battle_id AND team = v_winner_team AND is_bot = false;
    IF human_count > 0 THEN
      share := v_payout / human_count;
      UPDATE public.profiles p SET coins = coins + share, total_won = total_won + share
        FROM public.battle_players bp
        WHERE bp.battle_id = _battle_id AND bp.team = v_winner_team
          AND bp.is_bot = false AND bp.user_id = p.id;
    END IF;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.open_case_solo(_case_id uuid, _count int)
RETURNS TABLE(item_id uuid, name text, image text, value bigint, rarity text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_price bigint; v_total bigint; v_balance bigint;
  i int; roll record; v_winnings bigint := 0; v_payout bigint;
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
    v_winnings := v_winnings + roll.value;
  END LOOP;

  v_payout := (v_winnings * 9500) / 10000;  -- 5% house edge
  IF v_payout > 0 THEN
    UPDATE public.profiles SET coins = coins + v_payout, total_won = total_won + v_payout WHERE id = v_uid;
  END IF;
  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
  VALUES (v_uid, 'cases', v_total, v_payout, CASE WHEN v_total>0 THEN v_payout::numeric / v_total ELSE 0 END,
    v_payout > v_total, jsonb_build_object('case_id', _case_id, 'count', _count));

  RETURN QUERY SELECT * FROM _rolls;
END $$;

CREATE OR REPLACE FUNCTION public.approve_case(_case_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.cases SET status = 'approved', approved_at = now(), rejection_reason = NULL WHERE id = _case_id;
END $$;

CREATE OR REPLACE FUNCTION public.reject_case(_case_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.cases SET status = 'rejected', rejection_reason = _reason WHERE id = _case_id;
END $$;
