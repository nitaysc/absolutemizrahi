ALTER TABLE public.battle_cases
  DROP CONSTRAINT IF EXISTS battle_cases_case_id_fkey;

ALTER TABLE public.battle_cases
  ADD CONSTRAINT battle_cases_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;