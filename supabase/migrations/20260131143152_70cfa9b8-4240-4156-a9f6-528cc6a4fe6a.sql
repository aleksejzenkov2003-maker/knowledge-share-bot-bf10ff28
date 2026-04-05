-- Create golden_responses table for storing reference answers
CREATE TABLE public.golden_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relations
  role_id UUID REFERENCES public.chat_roles(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  
  -- Content
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  
  -- Metadata for search
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  search_vector TSVECTOR,
  notes TEXT,
  
  -- Usage and effectiveness
  usage_count INT DEFAULT 0,
  effectiveness_rating FLOAT,
  
  -- Meta
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  
  -- Source (optional link to original message)
  source_message_id UUID,
  source_conversation_id UUID
);

-- Indexes for fast search
CREATE INDEX idx_golden_responses_search ON public.golden_responses USING GIN(search_vector);
CREATE INDEX idx_golden_responses_role ON public.golden_responses(role_id) WHERE is_active = true;
CREATE INDEX idx_golden_responses_tags ON public.golden_responses USING GIN(tags);
CREATE INDEX idx_golden_responses_category ON public.golden_responses(category) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.golden_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage golden responses"
  ON public.golden_responses FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Moderators can view golden responses"
  ON public.golden_responses FOR SELECT
  USING (has_role(auth.uid(), 'moderator'::app_role));

-- Trigger for auto-updating search_vector
CREATE OR REPLACE FUNCTION public.update_golden_search_vector() 
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('russian', COALESCE(NEW.question, '')), 'A') ||
    setweight(to_tsvector('russian', COALESCE(NEW.category, '')), 'B') ||
    setweight(to_tsvector('russian', array_to_string(COALESCE(NEW.tags, '{}'), ' ')), 'B');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER golden_responses_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.golden_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_golden_search_vector();

-- Function to search golden responses by text similarity
CREATE OR REPLACE FUNCTION public.search_golden_responses(
  query_text TEXT,
  p_role_id UUID DEFAULT NULL,
  match_count INT DEFAULT 3
) RETURNS TABLE (
  id UUID,
  question TEXT,
  answer TEXT,
  category TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  search_query tsquery;
BEGIN
  -- Try websearch first, fallback to plainto
  BEGIN
    search_query := websearch_to_tsquery('russian', query_text);
  EXCEPTION WHEN OTHERS THEN
    search_query := plainto_tsquery('russian', query_text);
  END;
  
  RETURN QUERY
  SELECT 
    gr.id,
    gr.question,
    gr.answer,
    gr.category,
    ts_rank_cd(gr.search_vector, search_query)::FLOAT as similarity
  FROM golden_responses gr
  WHERE 
    gr.is_active = true
    AND (p_role_id IS NULL OR gr.role_id = p_role_id)
    AND gr.search_vector @@ search_query
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Function to increment usage count
CREATE OR REPLACE FUNCTION public.increment_golden_usage(p_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE golden_responses
  SET usage_count = usage_count + 1
  WHERE id = ANY(p_ids);
END;
$$;