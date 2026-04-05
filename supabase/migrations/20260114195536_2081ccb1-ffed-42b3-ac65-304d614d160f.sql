-- Enable pg_vector extension for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create enums
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'employee');
CREATE TYPE public.user_status AS ENUM ('active', 'trial', 'limited', 'blocked');

-- 1. Base tables

-- Departments table
CREATE TABLE public.departments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AI Providers table
CREATE TABLE public.ai_providers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL DEFAULT 'perplexity',
    api_key TEXT, -- Will be accessed only via edge functions
    base_url TEXT,
    default_model TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Chat logs table
CREATE TABLE public.chat_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
    prompt TEXT,
    response TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Membership tables

-- Profiles table
CREATE TABLE public.profiles (
    id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    full_name TEXT,
    email TEXT,
    avatar_url TEXT,
    status user_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table (separate for security)
CREATE TABLE public.user_roles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'employee',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Documents table
CREATE TABLE public.documents (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    storage_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    chunk_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Document chunks table with vector embeddings
CREATE TABLE public.document_chunks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536),
    chunk_index INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- System prompts table
CREATE TABLE public.system_prompts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Helper functions

-- Get user role
CREATE OR REPLACE FUNCTION public.get_user_role(uid UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.user_roles WHERE user_id = uid LIMIT 1;
$$;

-- Check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'admin'
    );
$$;

-- Check if user has specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    );
$$;

-- Get user department
CREATE OR REPLACE FUNCTION public.get_user_department(uid UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT department_id FROM public.profiles WHERE id = uid;
$$;

-- 4. Views

-- Safe AI providers view (masks API keys)
CREATE OR REPLACE VIEW public.safe_ai_providers AS
SELECT 
    id,
    name,
    provider_type,
    CASE WHEN api_key IS NOT NULL THEN '***' || RIGHT(api_key, 4) ELSE NULL END AS api_key_masked,
    base_url,
    default_model,
    is_default,
    is_active,
    config,
    created_at,
    updated_at
FROM public.ai_providers;

-- 5. Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- Departments policies
CREATE POLICY "Everyone can view departments"
ON public.departments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage departments"
ON public.departments FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Profiles policies
CREATE POLICY "Users can view own profile or admins/moderators can view all"
ON public.profiles FOR SELECT
TO authenticated
USING (
    auth.uid() = id 
    OR public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Users can update own profile or admins can update all"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    public.is_admin() 
    OR (auth.uid() = id AND status != 'blocked')
)
WITH CHECK (
    public.is_admin() 
    OR (auth.uid() = id AND status != 'blocked')
);

CREATE POLICY "Admins can insert profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() OR auth.uid() = id);

CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_admin());

-- User roles policies
CREATE POLICY "Users can view own role or admins/moderators can view all"
ON public.user_roles FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() 
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Only admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- AI Providers policies (admin only)
CREATE POLICY "Only admins can view ai_providers"
ON public.ai_providers FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Only admins can manage ai_providers"
ON public.ai_providers FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Documents policies
CREATE POLICY "Users can view documents in their department or admins can view all"
ON public.documents FOR SELECT
TO authenticated
USING (
    public.is_admin() 
    OR public.has_role(auth.uid(), 'moderator')
    OR department_id = public.get_user_department(auth.uid())
);

CREATE POLICY "Only admins can manage documents"
ON public.documents FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Document chunks policies
CREATE POLICY "Users can view chunks for accessible documents"
ON public.document_chunks FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.documents d 
        WHERE d.id = document_id 
        AND (
            public.is_admin() 
            OR public.has_role(auth.uid(), 'moderator')
            OR d.department_id = public.get_user_department(auth.uid())
        )
    )
);

CREATE POLICY "Only admins can manage chunks"
ON public.document_chunks FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- System prompts policies
CREATE POLICY "Users can view prompts for their department"
ON public.system_prompts FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR public.has_role(auth.uid(), 'moderator')
    OR department_id = public.get_user_department(auth.uid())
);

CREATE POLICY "Only admins can manage prompts"
ON public.system_prompts FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Chat logs policies
CREATE POLICY "Admins and moderators can view all logs"
ON public.chat_logs FOR SELECT
TO authenticated
USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Users can insert own logs"
ON public.chat_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 7. Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_departments_updated_at
    BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_providers_updated_at
    BEFORE UPDATE ON public.ai_providers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_prompts_updated_at
    BEFORE UPDATE ON public.system_prompts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
        NEW.email
    );
    -- First user becomes admin
    IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    ELSE
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Create indexes for performance
CREATE INDEX idx_profiles_department ON public.profiles(department_id);
CREATE INDEX idx_documents_department ON public.documents(department_id);
CREATE INDEX idx_document_chunks_document ON public.document_chunks(document_id);
CREATE INDEX idx_chat_logs_user ON public.chat_logs(user_id);
CREATE INDEX idx_chat_logs_department ON public.chat_logs(department_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

-- 10. Insert default departments
INSERT INTO public.departments (name, slug, description) VALUES
    ('Патенты', 'patents', 'Отдел патентов'),
    ('Юридический', 'legal', 'Юридический отдел'),
    ('Товарные знаки', 'trademarks', 'Отдел товарных знаков');

-- 11. Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('rag-documents', 'rag-documents', false);

-- Storage policies for documents bucket
CREATE POLICY "Admins can manage all files"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'rag-documents' AND public.is_admin())
WITH CHECK (bucket_id = 'rag-documents' AND public.is_admin());

CREATE POLICY "Users can view files in their department"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'rag-documents' 
    AND EXISTS (
        SELECT 1 FROM public.documents d 
        WHERE d.storage_path = name 
        AND (
            public.is_admin()
            OR public.has_role(auth.uid(), 'moderator')
            OR d.department_id = public.get_user_department(auth.uid())
        )
    )
);