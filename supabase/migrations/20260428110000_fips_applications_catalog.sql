create table if not exists public.fips_applications (
  id uuid primary key default gen_random_uuid(),
  application_number text,
  registration_number text,
  title text,
  applicant_name text,
  applicant_inn text,
  applicant_ogrn text,
  applicant_address text,
  file_name text,
  file_path text,
  source_url text,
  year int,
  section_code text,
  status text default 'active',
  submitted_at timestamptz,
  thumbnail_url text,
  parsed_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fips_applications_year on public.fips_applications (year);
create index if not exists idx_fips_applications_status on public.fips_applications (status);
create index if not exists idx_fips_applications_submitted_at on public.fips_applications (submitted_at desc);
create index if not exists idx_fips_applications_application_number on public.fips_applications (application_number);
create index if not exists idx_fips_applications_registration_number on public.fips_applications (registration_number);
create unique index if not exists uq_fips_applications_file_path on public.fips_applications (file_path);
create index if not exists idx_fips_applications_search_title on public.fips_applications using gin (to_tsvector('simple', coalesce(title, '')));
create index if not exists idx_fips_applications_search_applicant on public.fips_applications using gin (to_tsvector('simple', coalesce(applicant_name, '')));

alter table public.fips_applications enable row level security;

create policy "Authenticated users can read fips applications"
on public.fips_applications
for select
to authenticated
using (true);

create policy "Admins can insert fips applications"
on public.fips_applications
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can update fips applications"
on public.fips_applications
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can delete fips applications"
on public.fips_applications
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'::app_role));

create or replace function public.update_fips_applications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fips_applications_updated_at on public.fips_applications;
create trigger trg_fips_applications_updated_at
before update on public.fips_applications
for each row
execute function public.update_fips_applications_updated_at();
