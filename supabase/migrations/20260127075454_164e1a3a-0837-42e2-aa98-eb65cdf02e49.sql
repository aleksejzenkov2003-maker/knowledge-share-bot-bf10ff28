-- Drop the incorrect storage RLS policy
DROP POLICY IF EXISTS "Users can view files in their department" ON storage.objects;

-- Create correct RLS policy for document access
CREATE POLICY "Users can view accessible documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'rag-documents' AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.storage_path = storage.objects.name
    AND (
      public.is_admin() 
      OR public.has_role(auth.uid(), 'moderator'::app_role)
      OR d.department_id IS NULL
      OR d.department_id = public.get_user_department(auth.uid())
    )
  )
);