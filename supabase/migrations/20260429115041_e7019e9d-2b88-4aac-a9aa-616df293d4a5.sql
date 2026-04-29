-- Fix missing _distribute_battle_payout function referenced by start_case_battle.
-- Create as a thin alias to the existing _settle_battle_to_inventory.
CREATE OR REPLACE FUNCTION public._distribute_battle_payout(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._settle_battle_to_inventory(_battle_id);
END;
$function$;