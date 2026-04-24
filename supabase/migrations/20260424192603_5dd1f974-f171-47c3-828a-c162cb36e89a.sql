-- Seed additional poker tables at different stakes
INSERT INTO public.poker_tables (id, small_blind, big_blind, min_buy_in, max_buy_in, seats)
VALUES
  ('micro',  1,    2,    100,    10000,    6),
  ('low',    5,    10,   500,    50000,    6),
  ('mid',    25,   50,   2500,   250000,   6),
  ('high',   100,  200,  10000,  1000000,  6),
  ('nose',   500,  1000, 50000,  5000000,  6)
ON CONFLICT (id) DO NOTHING;

-- Remove the legacy 'main' table if no one is seated there
DELETE FROM public.poker_tables
WHERE id = 'main' AND NOT EXISTS (SELECT 1 FROM public.poker_seats WHERE table_id = 'main');