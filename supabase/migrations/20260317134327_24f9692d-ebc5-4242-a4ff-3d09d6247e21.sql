
CREATE TABLE public.trademark_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  query text,
  search_type text DEFAULT 'quick',
  search_params jsonb DEFAULT '{}',
  results_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.trademark_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own searches"
  ON public.trademark_searches FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own searches"
  ON public.trademark_searches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own searches"
  ON public.trademark_searches FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all searches"
  ON public.trademark_searches FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE INDEX idx_trademark_searches_user_id ON public.trademark_searches(user_id);
CREATE INDEX idx_trademark_searches_created_at ON public.trademark_searches(created_at DESC);
