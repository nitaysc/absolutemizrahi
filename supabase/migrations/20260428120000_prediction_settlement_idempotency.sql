-- Ensure each prediction open ticket can be settled at most once.
-- This prevents duplicate payouts if multiple clients attempt settlement
-- for the same winning ticket at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS bets_prediction_settlement_once_per_open_bet
ON public.bets (user_id, ((details->>'settlement_for')))
WHERE game = 'prediction'
  AND details->>'entry_type' = 'prediction-settlement'
  AND details ? 'settlement_for';
