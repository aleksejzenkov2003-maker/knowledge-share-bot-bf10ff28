INSERT INTO storage.buckets (id, name, public)
VALUES ('node-artifacts', 'node-artifacts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload node-artifacts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'node-artifacts');

CREATE POLICY "Authenticated users can read node-artifacts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'node-artifacts');