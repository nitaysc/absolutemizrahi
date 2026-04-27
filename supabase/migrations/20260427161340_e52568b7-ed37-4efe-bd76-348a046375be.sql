
CREATE OR REPLACE FUNCTION public._roll_case_item(_case_id uuid)
RETURNS TABLE(item_id uuid, name text, image text, value bigint, rarity text, weight numeric)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE total numeric; r numeric; cum numeric := 0; rec RECORD;
BEGIN
  SELECT COALESCE(SUM(ci.weight),0) INTO total FROM public.case_items ci WHERE ci.case_id = _case_id;
  IF total <= 0 THEN RAISE EXCEPTION 'Case has no items'; END IF;
  r := random() * total;
  FOR rec IN SELECT ci.* FROM public.case_items ci WHERE ci.case_id = _case_id ORDER BY ci.id LOOP
    cum := cum + rec.weight;
    IF r <= cum THEN
      item_id := rec.id; name := rec.name; image := rec.image;
      value := rec.value; rarity := rec.rarity; weight := rec.weight;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
  item_id := rec.id; name := rec.name; image := rec.image;
  value := rec.value; rarity := rec.rarity; weight := rec.weight;
  RETURN NEXT;
END $$;
