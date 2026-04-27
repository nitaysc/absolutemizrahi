
-- Public RPC to fetch recent bet timestamps for a set of users so streaks can
-- be computed client-side. SECURITY DEFINER bypasses the bets RLS, but we
-- only expose user_id + created_at (no amounts, no game details).
CREATE OR REPLACE FUNCTION public.get_user_bet_days(_user_ids uuid[], _limit_per_user int DEFAULT 200)
RETURNS TABLE(user_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.user_id, b.created_at
  FROM (
    SELECT user_id, created_at,
           row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM public.bets
    WHERE user_id = ANY(_user_ids)
      AND created_at > now() - interval '120 days'
  ) b
  WHERE b.rn <= _limit_per_user;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_bet_days(uuid[], int) TO anon, authenticated;
