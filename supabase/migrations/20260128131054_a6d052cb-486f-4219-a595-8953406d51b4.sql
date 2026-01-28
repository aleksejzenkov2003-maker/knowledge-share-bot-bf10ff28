-- Add role-based web search control fields to chat_roles
ALTER TABLE public.chat_roles 
ADD COLUMN IF NOT EXISTS allow_web_search boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS strict_rag_mode boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.chat_roles.allow_web_search IS 'If false, web search via Perplexity is disabled for this role';
COMMENT ON COLUMN public.chat_roles.strict_rag_mode IS 'If true, the role only responds based on RAG documents, no general knowledge';