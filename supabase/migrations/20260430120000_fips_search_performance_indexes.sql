create index if not exists idx_fips_applications_submitted_at_desc
on public.fips_applications (submitted_at desc nulls last);

create index if not exists idx_fips_applications_trgm_application_number
on public.fips_applications using gin (application_number gin_trgm_ops);

create index if not exists idx_fips_applications_trgm_registration_number
on public.fips_applications using gin (registration_number gin_trgm_ops);

create index if not exists idx_fips_applications_trgm_title
on public.fips_applications using gin (title gin_trgm_ops);

create index if not exists idx_fips_applications_trgm_applicant_name
on public.fips_applications using gin (applicant_name gin_trgm_ops);

create index if not exists idx_fips_applications_trgm_file_name
on public.fips_applications using gin (file_name gin_trgm_ops);
