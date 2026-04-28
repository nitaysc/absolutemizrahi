
-- ============================================================
-- PROGRESSION SYSTEM: XP, Levels, Missions, Achievements, Streaks
-- ============================================================

-- 1) Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS xp BIGINT NOT NULL DEFAULT 0,                -- xp inside current level
  ADD COLUMN IF NOT EXISTS xp_total BIGINT NOT NULL DEFAULT 0,          -- lifetime xp
  ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_streak_claim DATE,
  ADD COLUMN IF NOT EXISTS xp_booster_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lose_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS win_streak INTEGER NOT NULL DEFAULT 0;

-- 2) Daily missions
CREATE TABLE IF NOT EXISTS public.daily_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,            -- 'bet_total' | 'open_cases' | 'win_bets' | 'big_multiplier' | 'upgrade_wins' | 'play_games'
  description TEXT NOT NULL,
  target NUMERIC NOT NULL,
  progress NUMERIC NOT NULL DEFAULT 0,
  reward_coins BIGINT NOT NULL DEFAULT 0,
  reward_xp BIGINT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_missions_user_idx ON public.daily_missions(user_id, expires_at);
ALTER TABLE public.daily_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own missions" ON public.daily_missions;
CREATE POLICY "Users view own missions" ON public.daily_missions
  FOR SELECT USING (auth.uid() = user_id);

-- 3) Achievements catalog
CREATE TABLE IF NOT EXISTS public.achievements (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏆',
  reward_coins BIGINT NOT NULL DEFAULT 0,
  reward_xp BIGINT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general'
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone view achievements" ON public.achievements;
CREATE POLICY "Anyone view achievements" ON public.achievements FOR SELECT USING (true);

-- 4) User achievements
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  code TEXT NOT NULL REFERENCES public.achievements(code) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own achievements" ON public.user_achievements;
CREATE POLICY "Users view own achievements" ON public.user_achievements
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Anyone view achievement counts" ON public.user_achievements;
CREATE POLICY "Anyone view achievement counts" ON public.user_achievements
  FOR SELECT USING (true);

-- 5) Progression event feed (consumed by the client to show pops)
CREATE TABLE IF NOT EXISTS public.progression_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,           -- 'xp' | 'level_up' | 'mission_complete' | 'achievement' | 'streak'
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  seen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS progression_events_user_idx
  ON public.progression_events(user_id, seen, created_at);
ALTER TABLE public.progression_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own events" ON public.progression_events;
CREATE POLICY "Users view own events" ON public.progression_events
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users mark own events seen" ON public.progression_events;
CREATE POLICY "Users mark own events seen" ON public.progression_events
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Realtime: clients subscribe to events
ALTER PUBLICATION supabase_realtime ADD TABLE public.progression_events;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- XP curve: progressive. Need = 100 * level^1.55 (rounded).
CREATE OR REPLACE FUNCTION public.xp_for_level(_level INTEGER)
RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(100, FLOOR(100 * POWER(GREATEST(_level,1)::numeric, 1.55))::BIGINT)
$$;

-- Get title/badge for a level
CREATE OR REPLACE FUNCTION public.title_for_level(_level INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _level >= 100 THEN 'Mizrahi Legend'
    WHEN _level >= 75  THEN 'Whale'
    WHEN _level >= 50  THEN 'High Roller'
    WHEN _level >= 35  THEN 'Risk Taker'
    WHEN _level >= 25  THEN 'Veteran'
    WHEN _level >= 15  THEN 'Grinder'
    WHEN _level >= 10  THEN 'Hustler'
    WHEN _level >= 5   THEN 'Apprentice'
    ELSE 'Beginner'
  END
$$;

-- ============================================================
-- AWARD XP (handles level-ups + rewards + emits events)
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_xp(
  _user_id UUID,
  _amount BIGINT,
  _reason TEXT DEFAULT 'misc',
  _meta JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _lvl INTEGER;
  _xp BIGINT;
  _need BIGINT;
  _booster TIMESTAMPTZ;
  _multiplied BIGINT;
  _levels_gained INTEGER := 0;
  _total_coins_reward BIGINT := 0;
  _milestone_5 BOOLEAN := false;
  _milestone_10 BOOLEAN := false;
  _booster_granted BOOLEAN := false;
BEGIN
  IF _amount <= 0 THEN RETURN; END IF;
  SELECT level, xp, xp_booster_until INTO _lvl, _xp, _booster
    FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF _lvl IS NULL THEN RETURN; END IF;

  -- 2x XP if booster active
  _multiplied := _amount;
  IF _booster IS NOT NULL AND _booster > now() THEN
    _multiplied := _amount * 2;
  END IF;

  _xp := _xp + _multiplied;

  -- Level up loop
  LOOP
    _need := public.xp_for_level(_lvl);
    EXIT WHEN _xp < _need;
    _xp := _xp - _need;
    _lvl := _lvl + 1;
    _levels_gained := _levels_gained + 1;

    -- Per-level coin reward: 100 * level (scaling)
    _total_coins_reward := _total_coins_reward + (100 * _lvl);

    -- Milestone every 5 levels: +500 * level
    IF _lvl % 5 = 0 THEN
      _total_coins_reward := _total_coins_reward + (500 * _lvl);
      _milestone_5 := true;
    END IF;
    -- Milestone every 10 levels: +2000 * level + 1h XP booster
    IF _lvl % 10 = 0 THEN
      _total_coins_reward := _total_coins_reward + (2000 * _lvl);
      _milestone_10 := true;
      _booster_granted := true;
    END IF;
  END LOOP;

  UPDATE public.profiles
    SET level = _lvl,
        xp = _xp,
        xp_total = xp_total + _multiplied,
        coins = coins + _total_coins_reward,
        xp_booster_until = CASE WHEN _booster_granted THEN GREATEST(COALESCE(xp_booster_until, now()), now()) + interval '1 hour' ELSE xp_booster_until END,
        updated_at = now()
    WHERE id = _user_id;

  -- Emit XP event (small)
  INSERT INTO public.progression_events (user_id, kind, payload)
    VALUES (_user_id, 'xp', jsonb_build_object('amount', _multiplied, 'reason', _reason, 'meta', _meta));

  -- Emit level_up event(s)
  IF _levels_gained > 0 THEN
    INSERT INTO public.progression_events (user_id, kind, payload)
      VALUES (_user_id, 'level_up', jsonb_build_object(
        'new_level', _lvl,
        'levels_gained', _levels_gained,
        'coins_reward', _total_coins_reward,
        'milestone_5', _milestone_5,
        'milestone_10', _milestone_10,
        'booster_granted', _booster_granted,
        'title', public.title_for_level(_lvl)
      ));
  END IF;
END;
$$;

-- ============================================================
-- BUMP MISSION PROGRESS
-- ============================================================
CREATE OR REPLACE FUNCTION public.bump_mission(
  _user_id UUID,
  _kind TEXT,
  _amount NUMERIC DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _r RECORD;
BEGIN
  FOR _r IN
    SELECT id, target, progress, reward_coins, reward_xp, description
      FROM public.daily_missions
      WHERE user_id = _user_id
        AND kind = _kind
        AND completed = false
        AND expires_at > now()
      FOR UPDATE
  LOOP
    UPDATE public.daily_missions
      SET progress = LEAST(_r.target, _r.progress + _amount),
          completed = (_r.progress + _amount) >= _r.target
      WHERE id = _r.id;

    IF (_r.progress + _amount) >= _r.target THEN
      -- award coins
      UPDATE public.profiles
        SET coins = coins + _r.reward_coins,
            updated_at = now()
        WHERE id = _user_id;
      -- emit completion event
      INSERT INTO public.progression_events (user_id, kind, payload)
        VALUES (_user_id, 'mission_complete', jsonb_build_object(
          'description', _r.description,
          'reward_coins', _r.reward_coins,
          'reward_xp', _r.reward_xp
        ));
      -- award XP (which may also trigger level up event)
      PERFORM public.award_xp(_user_id, _r.reward_xp, 'mission', jsonb_build_object('kind', _kind));
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- UNLOCK ACHIEVEMENT (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.unlock_achievement(
  _user_id UUID,
  _code TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _ach RECORD;
  _existing UUID;
BEGIN
  SELECT * INTO _ach FROM public.achievements WHERE code = _code;
  IF _ach IS NULL THEN RETURN; END IF;
  SELECT id INTO _existing FROM public.user_achievements WHERE user_id = _user_id AND code = _code;
  IF _existing IS NOT NULL THEN RETURN; END IF;

  INSERT INTO public.user_achievements (user_id, code) VALUES (_user_id, _code);
  UPDATE public.profiles
    SET coins = coins + _ach.reward_coins, updated_at = now()
    WHERE id = _user_id;

  INSERT INTO public.progression_events (user_id, kind, payload)
    VALUES (_user_id, 'achievement', jsonb_build_object(
      'code', _ach.code,
      'name', _ach.name,
      'description', _ach.description,
      'icon', _ach.icon,
      'reward_coins', _ach.reward_coins,
      'reward_xp', _ach.reward_xp
    ));

  IF _ach.reward_xp > 0 THEN
    PERFORM public.award_xp(_user_id, _ach.reward_xp, 'achievement', jsonb_build_object('code', _ach.code));
  END IF;
END;
$$;

-- ============================================================
-- ROLL DAILY MISSIONS (called by client when needed)
-- ============================================================
CREATE OR REPLACE FUNCTION public.roll_daily_missions()
RETURNS SETOF public.daily_missions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _active_count INTEGER;
  _pool JSONB;
  _picked JSONB;
  i INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Expire old / count active
  SELECT count(*) INTO _active_count
    FROM public.daily_missions
    WHERE user_id = _uid AND expires_at > now();

  IF _active_count >= 3 THEN
    RETURN QUERY SELECT * FROM public.daily_missions
      WHERE user_id = _uid AND expires_at > now()
      ORDER BY created_at;
    RETURN;
  END IF;

  -- Pool of mission templates
  _pool := '[
    {"kind":"bet_total","desc":"Bet 1,000 coins total","target":1000,"coins":250,"xp":100},
    {"kind":"bet_total","desc":"Bet 5,000 coins total","target":5000,"coins":750,"xp":300},
    {"kind":"bet_total","desc":"Bet 25,000 coins total","target":25000,"coins":3000,"xp":1200},
    {"kind":"win_bets","desc":"Win 5 bets","target":5,"coins":300,"xp":150},
    {"kind":"win_bets","desc":"Win 15 bets","target":15,"coins":900,"xp":450},
    {"kind":"play_games","desc":"Play 10 rounds","target":10,"coins":200,"xp":120},
    {"kind":"play_games","desc":"Play 30 rounds","target":30,"coins":600,"xp":350},
    {"kind":"open_cases","desc":"Open 5 cases","target":5,"coins":500,"xp":250},
    {"kind":"open_cases","desc":"Open 15 cases","target":15,"coins":1500,"xp":750},
    {"kind":"big_multiplier","desc":"Hit a 10x or higher multiplier","target":1,"coins":1000,"xp":500},
    {"kind":"big_multiplier","desc":"Hit a 50x or higher multiplier","target":1,"coins":3500,"xp":1500},
    {"kind":"upgrade_wins","desc":"Win 3 upgrades","target":3,"coins":1200,"xp":600}
  ]'::jsonb;

  -- Wipe expired so the new ones replace cleanly
  DELETE FROM public.daily_missions WHERE user_id = _uid AND expires_at <= now();

  FOR i IN 1..(3 - _active_count) LOOP
    _picked := _pool -> floor(random() * jsonb_array_length(_pool))::int;
    INSERT INTO public.daily_missions (user_id, kind, description, target, reward_coins, reward_xp, expires_at)
      VALUES (
        _uid,
        _picked->>'kind',
        _picked->>'desc',
        (_picked->>'target')::numeric,
        (_picked->>'coins')::bigint,
        (_picked->>'xp')::bigint,
        date_trunc('day', now()) + interval '1 day'
      );
  END LOOP;

  RETURN QUERY SELECT * FROM public.daily_missions
    WHERE user_id = _uid AND expires_at > now()
    ORDER BY created_at;
END;
$$;

-- ============================================================
-- CLAIM DAILY STREAK
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_daily_streak()
RETURNS TABLE(streak_days INTEGER, reward_coins BIGINT, reward_xp BIGINT, already_claimed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _last DATE;
  _today DATE := (now() AT TIME ZONE 'UTC')::date;
  _new_streak INTEGER;
  _coins BIGINT;
  _xp BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT last_streak_claim, streak_days INTO _last, _new_streak
    FROM public.profiles WHERE id = _uid FOR UPDATE;

  IF _last = _today THEN
    RETURN QUERY SELECT _new_streak, 0::bigint, 0::bigint, true;
    RETURN;
  END IF;

  IF _last IS NULL OR _last < _today - 1 THEN
    _new_streak := 1;
  ELSE
    _new_streak := COALESCE(_new_streak,0) + 1;
  END IF;

  -- Reward scales with streak day, capped at day 7
  _coins := 200 * LEAST(_new_streak, 7);
  _xp := 50 * LEAST(_new_streak, 7);

  UPDATE public.profiles
    SET streak_days = _new_streak,
        last_streak_claim = _today,
        coins = coins + _coins,
        updated_at = now()
    WHERE id = _uid;

  INSERT INTO public.progression_events (user_id, kind, payload)
    VALUES (_uid, 'streak', jsonb_build_object('day', _new_streak, 'coins', _coins, 'xp', _xp));

  PERFORM public.award_xp(_uid, _xp, 'streak', jsonb_build_object('day', _new_streak));

  -- Streak achievements
  IF _new_streak >= 7 THEN PERFORM public.unlock_achievement(_uid, 'streak_7'); END IF;
  IF _new_streak >= 30 THEN PERFORM public.unlock_achievement(_uid, 'streak_30'); END IF;

  RETURN QUERY SELECT _new_streak, _coins, _xp, false;
END;
$$;

-- ============================================================
-- MARK EVENTS AS SEEN
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_progression_events_seen(_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.progression_events
    SET seen = true
    WHERE user_id = _uid AND id = ANY(_ids);
END;
$$;

-- ============================================================
-- INTEGRATE INTO place_bet
-- ============================================================
CREATE OR REPLACE FUNCTION public.place_bet(
  _game text,
  _bet_amount bigint,
  _won boolean,
  _multiplier numeric,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(new_balance bigint, payout bigint, bet_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _bal BIGINT;
  _frac NUMERIC;
  _raw_payout NUMERIC;
  _payout BIGINT;
  _payout_frac NUMERIC;
  _carry BIGINT;
  _new_frac NUMERIC;
  _profit BIGINT;
  _bid UUID;
  _xp BIGINT;
  _risk NUMERIC;
  _losestreak INTEGER;
  _winstreak INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet_amount <= 0 THEN RAISE EXCEPTION 'Bet must be positive'; END IF;
  IF _game IS NULL OR length(_game) = 0 OR length(_game) > 32 OR _game !~ '^[a-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Unknown game';
  END IF;
  IF _multiplier < 0 OR _multiplier > 1000000 THEN RAISE EXCEPTION 'Invalid multiplier'; END IF;

  SELECT coins, coins_decimal, lose_streak, win_streak
    INTO _bal, _frac, _losestreak, _winstreak
    FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;
  IF _bal < _bet_amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  IF _won THEN
    _raw_payout := (_bet_amount)::numeric * _multiplier;
    _payout := FLOOR(_raw_payout)::BIGINT;
    _payout_frac := _raw_payout - _payout;
  ELSE
    _payout := 0;
    _payout_frac := 0;
  END IF;

  _new_frac := _frac + _payout_frac;
  _carry := FLOOR(_new_frac)::BIGINT;
  _new_frac := _new_frac - _carry;

  _profit := GREATEST(_payout + _carry - _bet_amount, 0);

  -- update streaks
  IF _won THEN
    _winstreak := COALESCE(_winstreak,0) + 1;
    _losestreak := 0;
  ELSE
    _losestreak := COALESCE(_losestreak,0) + 1;
    _winstreak := 0;
  END IF;

  UPDATE public.profiles
    SET coins = coins - _bet_amount + _payout + _carry,
        coins_decimal = _new_frac,
        total_wagered = total_wagered + _bet_amount,
        total_won = total_won + _profit,
        win_streak = _winstreak,
        lose_streak = _losestreak,
        updated_at = now()
    WHERE id = _uid
    RETURNING coins INTO _bal;

  INSERT INTO public.bets (user_id, game, bet_amount, payout, multiplier, won, details)
    VALUES (_uid, _game, _bet_amount, _payout, _multiplier, _won, _details)
    RETURNING id INTO _bid;

  -- ===== PROGRESSION HOOKS =====
  -- XP scales with bet size and risk (multiplier).
  -- base = ceil(bet/10), risk factor = 1 + log10(max(mult,1))/2 (so 10x = 1.5x XP, 100x = 2x)
  _risk := 1 + (ln(GREATEST(COALESCE(_multiplier,1),1)) / ln(10)) / 2;
  _xp := GREATEST(1, CEIL((_bet_amount::numeric / 10.0) * _risk))::BIGINT;
  -- cap absurd XP from huge bets to keep curve sane
  _xp := LEAST(_xp, 10000);

  PERFORM public.award_xp(_uid, _xp, 'bet', jsonb_build_object('game', _game, 'bet', _bet_amount, 'mult', _multiplier, 'won', _won));

  -- Mission progress
  PERFORM public.bump_mission(_uid, 'bet_total', _bet_amount);
  PERFORM public.bump_mission(_uid, 'play_games', 1);
  IF _won THEN
    PERFORM public.bump_mission(_uid, 'win_bets', 1);
  END IF;
  IF _multiplier >= 10 THEN
    PERFORM public.bump_mission(_uid, 'big_multiplier', 1);
  END IF;

  -- Auto-unlock achievements
  IF _won AND _multiplier >= 100 THEN
    PERFORM public.unlock_achievement(_uid, 'big_hit_100x');
  END IF;
  IF _won AND _multiplier >= 500 THEN
    PERFORM public.unlock_achievement(_uid, 'big_hit_500x');
  END IF;
  IF _losestreak >= 5 THEN
    PERFORM public.unlock_achievement(_uid, 'unlucky_5');
  END IF;
  IF _losestreak >= 10 THEN
    PERFORM public.unlock_achievement(_uid, 'unlucky_10');
  END IF;
  IF _winstreak >= 5 THEN
    PERFORM public.unlock_achievement(_uid, 'hot_streak_5');
  END IF;
  IF _bet_amount >= 10000 THEN
    PERFORM public.unlock_achievement(_uid, 'high_roller_bet');
  END IF;

  RETURN QUERY SELECT _bal, _payout, _bid;
END;
$function$;

-- ============================================================
-- SEED ACHIEVEMENTS
-- ============================================================
INSERT INTO public.achievements (code, name, description, icon, reward_coins, reward_xp, category) VALUES
  ('first_win',        'First Blood',         'Win your very first bet',                    '🎯', 200,   100,  'milestone'),
  ('big_hit_10x',      'Lucky Strike',        'Hit a 10x multiplier or higher',             '⚡',  500,   250,  'wins'),
  ('big_hit_100x',     'Jackpot!',            'Hit a 100x multiplier or higher',            '💎',  5000,  2000, 'wins'),
  ('big_hit_500x',     'Legendary Pull',      'Hit a 500x multiplier or higher',            '🌟',  25000, 10000,'wins'),
  ('upgrade_low',      'Against The Odds',    'Win a 10% or lower upgrade',                 '🎲',  1500,  750,  'upgrade'),
  ('upgrade_master',   'Upgrade Master',      'Win 25 upgrades total',                      '🚀',  3000,  1500, 'upgrade'),
  ('case_opener_10',   'Case Opener',         'Open 10 cases',                              '📦',  300,   150,  'cases'),
  ('case_opener_100',  'Case Hoarder',        'Open 100 cases',                             '📦',  3000,  1500, 'cases'),
  ('case_opener_1000', 'Case Tycoon',         'Open 1000 cases',                            '📦',  30000, 10000,'cases'),
  ('high_roller_bet',  'High Roller',         'Place a single bet of 10,000 coins',         '💰',  1000,  500,  'general'),
  ('unlucky_5',        'Cold Hands',          'Lose 5 bets in a row (oof)',                 '🥶',  200,   100,  'fun'),
  ('unlucky_10',       'Cursed',              'Lose 10 bets in a row (it''s rigged)',       '💀',  500,   250,  'fun'),
  ('hot_streak_5',     'On Fire',             'Win 5 bets in a row',                        '🔥',  500,   250,  'wins'),
  ('streak_7',         'Daily Devotee',       'Login 7 days in a row',                      '📅',  1000,  500,  'streak'),
  ('streak_30',        'Iron Discipline',     'Login 30 days in a row',                     '🗓️', 10000, 5000, 'streak'),
  ('level_10',         'Hustler',             'Reach level 10',                             '⭐',  2000,  0,    'level'),
  ('level_25',         'Veteran',             'Reach level 25',                             '⭐',  10000, 0,    'level'),
  ('level_50',         'High Roller',         'Reach level 50',                             '⭐',  50000, 0,    'level'),
  ('level_100',        'Mizrahi Legend',      'Reach level 100',                            '👑',  500000,0,    'level')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  reward_coins = EXCLUDED.reward_coins,
  reward_xp = EXCLUDED.reward_xp,
  category = EXCLUDED.category;

-- ============================================================
-- AUTO LEVEL ACHIEVEMENTS (trigger on profile level change)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_level_achievements()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.level >= 10 AND OLD.level < 10 THEN PERFORM public.unlock_achievement(NEW.id, 'level_10'); END IF;
  IF NEW.level >= 25 AND OLD.level < 25 THEN PERFORM public.unlock_achievement(NEW.id, 'level_25'); END IF;
  IF NEW.level >= 50 AND OLD.level < 50 THEN PERFORM public.unlock_achievement(NEW.id, 'level_50'); END IF;
  IF NEW.level >= 100 AND OLD.level < 100 THEN PERFORM public.unlock_achievement(NEW.id, 'level_100'); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_level_achievements ON public.profiles;
CREATE TRIGGER profiles_level_achievements
  AFTER UPDATE OF level ON public.profiles
  FOR EACH ROW
  WHEN (NEW.level > OLD.level)
  EXECUTE FUNCTION public.trg_level_achievements();
