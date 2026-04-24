
CREATE OR REPLACE FUNCTION public.get_player_profile(_username text)
RETURNS TABLE(
  id uuid,
  username text,
  avatar text,
  coins bigint,
  total_won bigint,
  total_wagered bigint,
  created_at timestamptz,
  friendship_status text,
  recent_bets jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _viewer uuid := auth.uid(); _p public.profiles%ROWTYPE; _f public.friendships%ROWTYPE; _status text := 'none'; _bets jsonb;
BEGIN
  SELECT * INTO _p FROM public.profiles p
    WHERE lower(p.username) = lower(trim(_username)) LIMIT 1;
  IF _p.id IS NULL THEN RETURN; END IF;

  IF _viewer IS NOT NULL AND _viewer = _p.id THEN
    _status := 'self';
  ELSIF _viewer IS NOT NULL THEN
    SELECT * INTO _f FROM public.friendships f
      WHERE (f.requester = _viewer AND f.addressee = _p.id)
         OR (f.requester = _p.id AND f.addressee = _viewer)
      LIMIT 1;
    IF _f.id IS NOT NULL THEN
      IF _f.status = 'accepted' THEN _status := 'accepted';
      ELSIF _f.requester = _viewer THEN _status := 'pending_out';
      ELSE _status := 'pending_in';
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb) INTO _bets
  FROM (
    SELECT b.id, b.game, b.bet_amount, b.payout, b.multiplier, b.won, b.created_at
    FROM public.bets b
    WHERE b.user_id = _p.id
    ORDER BY b.created_at DESC
    LIMIT 20
  ) b;

  RETURN QUERY SELECT
    _p.id, _p.username, _p.avatar,
    _p.coins, _p.total_won, _p.total_wagered, _p.created_at,
    _status, _bets;
END $$;
