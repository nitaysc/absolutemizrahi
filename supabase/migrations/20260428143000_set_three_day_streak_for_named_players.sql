-- Grant a 3-day daily streak to selected players.
UPDATE public.profiles
SET
  streak_days = 3,
  last_streak_claim = CURRENT_DATE,
  updated_at = now()
WHERE lower(username) IN (
  lower('Fx nitay'),
  lower('The Big Mizrahi'),
  lower('Roomba')
);
