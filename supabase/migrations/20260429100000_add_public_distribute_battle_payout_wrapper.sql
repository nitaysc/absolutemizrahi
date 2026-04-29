-- Backward-compatibility wrapper for legacy RPC calls that reference
-- public_distribute_battle_payout(uuid) instead of _distribute_battle_payout(uuid).
CREATE OR REPLACE FUNCTION public.public_distribute_battle_payout(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._distribute_battle_payout(_battle_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_distribute_battle_payout(uuid) TO authenticated;
