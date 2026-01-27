-- Удалить старую политику для documents
DROP POLICY IF EXISTS "Users can view documents in their department or admins can view" ON public.documents;

-- Создать новую политику с поддержкой NULL department
CREATE POLICY "Users can view documents in their department or public"
ON public.documents FOR SELECT
TO authenticated
USING (
    is_admin() 
    OR has_role(auth.uid(), 'moderator'::app_role)
    OR department_id IS NULL
    OR department_id = get_user_department(auth.uid())
);

-- Удалить старую политику для document_chunks
DROP POLICY IF EXISTS "Users can view chunks for accessible documents" ON public.document_chunks;

-- Создать новую политику для document_chunks
CREATE POLICY "Users can view chunks for accessible documents"
ON public.document_chunks FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.documents d 
        WHERE d.id = document_chunks.document_id 
        AND (
            is_admin() 
            OR has_role(auth.uid(), 'moderator'::app_role)
            OR d.department_id IS NULL
            OR d.department_id = get_user_department(auth.uid())
        )
    )
);