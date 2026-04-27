CREATE OR REPLACE FUNCTION public.reject_url_in_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.name ~* '^\s*https?://' THEN
    RAISE EXCEPTION 'Name cannot be a URL. Put image URLs in the image field.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_case_items_no_url_name ON public.case_items;
CREATE TRIGGER trg_case_items_no_url_name
BEFORE INSERT OR UPDATE OF name ON public.case_items
FOR EACH ROW EXECUTE FUNCTION public.reject_url_in_name();

DROP TRIGGER IF EXISTS trg_cases_no_url_name ON public.cases;
CREATE TRIGGER trg_cases_no_url_name
BEFORE INSERT OR UPDATE OF name ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.reject_url_in_name();