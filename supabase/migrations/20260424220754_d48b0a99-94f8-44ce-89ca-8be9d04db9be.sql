CREATE OR REPLACE FUNCTION public.redeem_code(_code text)
 RETURNS TABLE(new_balance bigint, awarded bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _norm TEXT := lower(trim(_code));
  _amount BIGINT;
  _bal BIGINT;
  _legacy_codes TEXT[] := ARRAY['barmitzva','cooked','mizrahi','ez','kipa','para','bakbok','bomb'];
  _nba_codes TEXT[] := ARRAY[
    'lebronjames','stephencurry','kevindurant','giannisantetokounmpo','lukadoncic',
    'nikolajokic','jaysontatum','joelembiid','kawhileonard','devinbooker',
    'jamorant','jimmybutler','damianlillard','anthonyedwards','tyresehaliburton',
    'shaigilgeousalexander','franzwagner','paolobanchero','alperensengun','mikalbridges',
    'jrueholiday','domantassabonis','oganunoby','jarrettallen','desmondbane',
    'joshgiddey','deniavdija','bogdanbogdanovic','clintcapela','malikmonk'
  ];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Normalize: strip spaces, hyphens, dots, accents
  _norm := lower(translate(_code, ' -.''`', ''));
  _norm := translate(_norm, 'áàâäãåčçďéèêëěíìîïľĺňñóòôöõőřšťúùûüůűýÿžć',
                            'aaaaaaccdeeeeeiiiillnnoooooorstuuuuuuyyzc');
  _norm := regexp_replace(_norm, '[^a-z0-9]', '', 'g');

  IF _norm = ANY(_legacy_codes) THEN
    _amount := 5000;
  ELSIF _norm = ANY(_nba_codes) THEN
    _amount := 750;
  ELSE
    RAISE EXCEPTION 'Invalid code';
  END IF;

  BEGIN
    INSERT INTO public.redeemed_codes (user_id, code, amount)
    VALUES (_uid, _norm, _amount);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Code already redeemed';
  END;

  UPDATE public.profiles
  SET coins = coins + _amount, updated_at = now()
  WHERE id = _uid
  RETURNING coins INTO _bal;

  RETURN QUERY SELECT _bal, _amount;
END;
$function$;