CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Sort by submitted_at DESC NULLS LAST is the default UI ordering
CREATE INDEX IF NOT EXISTS fips_applications_submitted_at_idx
  ON public.fips_applications (submitted_at DESC NULLS LAST);

-- Trigram indexes for fast ILIKE %q% on the searchable columns
CREATE INDEX IF NOT EXISTS fips_applications_application_number_trgm
  ON public.fips_applications USING gin (application_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS fips_applications_registration_number_trgm
  ON public.fips_applications USING gin (registration_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS fips_applications_title_trgm
  ON public.fips_applications USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS fips_applications_applicant_name_trgm
  ON public.fips_applications USING gin (applicant_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS fips_applications_file_name_trgm
  ON public.fips_applications USING gin (file_name gin_trgm_ops);