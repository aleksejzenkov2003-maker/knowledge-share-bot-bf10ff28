CREATE TABLE IF NOT EXISTS public.fips_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_number TEXT,
  registration_number TEXT,
  title TEXT,
  applicant_name TEXT,
  applicant_inn TEXT,
  applicant_ogrn TEXT,
  applicant_address TEXT,
  file_name TEXT,
  file_path TEXT,
  source_url TEXT,
  year INTEGER,
  section_code TEXT,
  status TEXT DEFAULT 'active',
  submitted_at DATE,
  thumbnail_url TEXT,
  parsed_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fips_applications_file_path_uniq
  ON public.fips_applications (file_path)
  WHERE file_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS fips_applications_application_number_idx
  ON public.fips_applications (application_number);

CREATE INDEX IF NOT EXISTS fips_applications_registration_number_idx
  ON public.fips_applications (registration_number);

CREATE INDEX IF NOT EXISTS fips_applications_applicant_inn_idx
  ON public.fips_applications (applicant_inn);

CREATE INDEX IF NOT EXISTS fips_applications_year_section_idx
  ON public.fips_applications (year, section_code);

CREATE INDEX IF NOT EXISTS fips_applications_created_at_idx
  ON public.fips_applications (created_at DESC);

ALTER TABLE public.fips_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view fips_applications" ON public.fips_applications;
CREATE POLICY "Authenticated can view fips_applications"
  ON public.fips_applications
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage fips_applications" ON public.fips_applications;
CREATE POLICY "Admins can manage fips_applications"
  ON public.fips_applications
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP TRIGGER IF EXISTS update_fips_applications_updated_at ON public.fips_applications;
CREATE TRIGGER update_fips_applications_updated_at
  BEFORE UPDATE ON public.fips_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();