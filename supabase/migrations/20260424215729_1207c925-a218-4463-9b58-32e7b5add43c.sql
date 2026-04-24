
-- ============================================================
-- Friends / social system
-- ============================================================

CREATE TABLE IF NOT EXISTS public.friendships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester   uuid NOT NULL,
  addressee   uuid NOT NULL,
  status      text NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted'
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_no_self CHECK (requester <> addressee),
  CONSTRAINT friendships_status_chk CHECK (status IN ('pending','accepted'))
);

-- One row per unordered pair
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_uniq
  ON public.friendships (LEAST(requester, addressee), GREATEST(requester, addressee));

CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships(requester);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships(addressee);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own friendships" ON public.friendships;
CREATE POLICY "View own friendships" ON public.friendships
  FOR SELECT USING (auth.uid() = requester OR auth.uid() = addressee);

-- All mutations go through SECURITY DEFINER RPCs below; no direct INSERT/UPDATE/DELETE policies.

-- ============================================================
-- Search & public profile
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_players(_q text)
RETURNS TABLE(
  id uuid,
  username text,
  avatar text,
  coins bigint,
  total_won bigint,
  total_wagered bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.username, p.avatar, p.coins, p.total_won, p.total_wagered
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND (_q IS NULL OR length(trim(_q)) = 0
         OR p.username ILIKE '%' || trim(_q) || '%')
  ORDER BY p.coins DESC
  LIMIT 30;
$$;

CREATE OR REPLACE FUNCTION public.get_player_profile(_username text)
RETURNS TABLE(
  id uuid,
  username text,
  avatar text,
  coins bigint,
  total_won bigint,
  total_wagered bigint,
  created_at timestamptz,
  friendship_status text,   -- 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'self'
  recent_bets jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _viewer uuid := auth.uid(); _p RECORD; _f RECORD; _status text := 'none'; _bets jsonb;
BEGIN
  SELECT * INTO _p FROM public.profiles WHERE lower(username) = lower(trim(_username)) LIMIT 1;
  IF _p.id IS NULL THEN RETURN; END IF;

  IF _viewer IS NOT NULL AND _viewer = _p.id THEN
    _status := 'self';
  ELSIF _viewer IS NOT NULL THEN
    SELECT * INTO _f FROM public.friendships
      WHERE (requester = _viewer AND addressee = _p.id)
         OR (requester = _p.id AND addressee = _viewer)
      LIMIT 1;
    IF _f.id IS NOT NULL THEN
      IF _f.status = 'accepted' THEN _status := 'accepted';
      ELSIF _f.requester = _viewer THEN _status := 'pending_out';
      ELSE _status := 'pending_in';
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(b ORDER BY b.created_at DESC), '[]'::jsonb) INTO _bets
  FROM (
    SELECT id, game, bet_amount, payout, multiplier, won, created_at
    FROM public.bets
    WHERE user_id = _p.id
    ORDER BY created_at DESC
    LIMIT 20
  ) b;

  RETURN QUERY SELECT
    _p.id, _p.username, _p.avatar,
    _p.coins, _p.total_won, _p.total_wagered, _p.created_at,
    _status, _bets;
END $$;

-- ============================================================
-- Friend request actions
-- ============================================================

CREATE OR REPLACE FUNCTION public.friend_request(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _existing RECORD;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _target IS NULL OR _target = _uid THEN RAISE EXCEPTION 'Invalid target'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target) THEN
    RAISE EXCEPTION 'No such player';
  END IF;

  SELECT * INTO _existing FROM public.friendships
    WHERE (requester = _uid AND addressee = _target)
       OR (requester = _target AND addressee = _uid)
    LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    -- If they already requested us, treat this as accepting
    IF _existing.status = 'pending' AND _existing.addressee = _uid THEN
      UPDATE public.friendships SET status='accepted', updated_at=now() WHERE id=_existing.id;
      RETURN jsonb_build_object('status','accepted');
    END IF;
    RETURN jsonb_build_object('status', _existing.status);
  END IF;

  INSERT INTO public.friendships(requester, addressee, status)
    VALUES (_uid, _target, 'pending');
  RETURN jsonb_build_object('status','pending');
END $$;

CREATE OR REPLACE FUNCTION public.friend_accept(_other uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _f RECORD;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _f FROM public.friendships
    WHERE requester = _other AND addressee = _uid AND status = 'pending'
    FOR UPDATE;
  IF _f.id IS NULL THEN RAISE EXCEPTION 'No pending request'; END IF;
  UPDATE public.friendships SET status='accepted', updated_at=now() WHERE id=_f.id;
  RETURN jsonb_build_object('status','accepted');
END $$;

CREATE OR REPLACE FUNCTION public.friend_decline(_other uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.friendships
    WHERE requester = _other AND addressee = _uid AND status = 'pending';
  RETURN jsonb_build_object('status','declined');
END $$;

CREATE OR REPLACE FUNCTION public.friend_remove(_other uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.friendships
    WHERE (requester = _uid AND addressee = _other)
       OR (requester = _other AND addressee = _uid);
  RETURN jsonb_build_object('status','removed');
END $$;

CREATE OR REPLACE FUNCTION public.list_friends()
RETURNS TABLE(id uuid, username text, avatar text, coins bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.username, p.avatar, p.coins
  FROM public.friendships f
  JOIN public.profiles p ON p.id = CASE WHEN f.requester = auth.uid() THEN f.addressee ELSE f.requester END
  WHERE f.status = 'accepted'
    AND (f.requester = auth.uid() OR f.addressee = auth.uid())
  ORDER BY p.username NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.list_friend_requests()
RETURNS TABLE(id uuid, requester uuid, username text, avatar text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT f.id, f.requester, p.username, p.avatar, f.created_at
  FROM public.friendships f
  JOIN public.profiles p ON p.id = f.requester
  WHERE f.status = 'pending' AND f.addressee = auth.uid()
  ORDER BY f.created_at DESC;
$$;

-- Realtime so request/accept events update both users live
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
