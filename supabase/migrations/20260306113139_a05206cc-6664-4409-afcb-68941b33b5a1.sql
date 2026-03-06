
CREATE TABLE public.trademarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text,
  registration_date date,
  well_known_trademark_date date,
  legally_related_registrations text,
  right_holder_name text,
  foreign_right_holder_name text,
  right_holder_address text,
  right_holder_country_code text,
  right_holder_ogrn text,
  right_holder_inn text,
  correspondence_address text,
  collective boolean DEFAULT false,
  collective_users text,
  extraction_from_charter text,
  color_specification text,
  unprotected_elements text,
  kind_specification text,
  threedimensional boolean DEFAULT false,
  holographic boolean DEFAULT false,
  sound boolean DEFAULT false,
  olfactory boolean DEFAULT false,
  color boolean DEFAULT false,
  light boolean DEFAULT false,
  changing boolean DEFAULT false,
  positional boolean DEFAULT false,
  actual boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trademarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage trademarks" ON public.trademarks
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Authenticated users can view trademarks" ON public.trademarks
  FOR SELECT TO authenticated
  USING (true);

CREATE INDEX idx_trademarks_registration_number ON public.trademarks(registration_number);
CREATE INDEX idx_trademarks_right_holder_inn ON public.trademarks(right_holder_inn);
CREATE INDEX idx_trademarks_actual ON public.trademarks(actual);
