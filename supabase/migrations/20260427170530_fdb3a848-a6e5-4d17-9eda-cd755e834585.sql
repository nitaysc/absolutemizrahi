
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS cover_image text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('case-assets', 'case-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Case assets public read" ON storage.objects;
CREATE POLICY "Case assets public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'case-assets');

DROP POLICY IF EXISTS "Case assets auth upload" ON storage.objects;
CREATE POLICY "Case assets auth upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Case assets owner update" ON storage.objects;
CREATE POLICY "Case assets owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'case-assets'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
);

DROP POLICY IF EXISTS "Case assets owner delete" ON storage.objects;
CREATE POLICY "Case assets owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-assets'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
);
