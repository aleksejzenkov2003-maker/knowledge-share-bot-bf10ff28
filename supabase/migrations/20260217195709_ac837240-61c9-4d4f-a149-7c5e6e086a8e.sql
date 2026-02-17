
-- Table for storing reputation search reports
CREATE TABLE public.reputation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'company',
  query TEXT,
  name TEXT,
  inn TEXT,
  ogrn TEXT,
  report_data JSONB NOT NULL DEFAULT '{}',
  selected_sections TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reputation_reports ENABLE ROW LEVEL SECURITY;

-- Users can view their own reports
CREATE POLICY "Users can view own reports"
ON public.reputation_reports
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all reports
CREATE POLICY "Admins can view all reports"
ON public.reputation_reports
FOR SELECT
USING (is_admin());

-- Users can create own reports
CREATE POLICY "Users can create own reports"
ON public.reputation_reports
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete own reports
CREATE POLICY "Users can delete own reports"
ON public.reputation_reports
FOR DELETE
USING (auth.uid() = user_id);

-- Admins can manage all reports
CREATE POLICY "Admins can manage all reports"
ON public.reputation_reports
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());
