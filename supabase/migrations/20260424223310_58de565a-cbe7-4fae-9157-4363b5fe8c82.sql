ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_bet_amount_check;
ALTER TABLE public.bets ADD CONSTRAINT bets_bet_amount_check CHECK (bet_amount >= 0);