-- Create bucket for RAG documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('rag-documents', 'rag-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for rag-documents bucket
CREATE POLICY "Admins can upload rag documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'rag-documents' AND is_admin());

CREATE POLICY "Admins can view rag documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'rag-documents' AND is_admin());

CREATE POLICY "Admins can update rag documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'rag-documents' AND is_admin());

CREATE POLICY "Admins can delete rag documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'rag-documents' AND is_admin());