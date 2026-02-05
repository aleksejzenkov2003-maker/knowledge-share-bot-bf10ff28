-- ============================================
-- ПРОЕКТНЫЙ РЕЖИМ ЧАТА - Фаза 1
-- ============================================

-- Создаём enum для статуса проекта
CREATE TYPE public.project_status AS ENUM ('active', 'archived', 'completed');

-- Создаём enum для роли участника проекта
CREATE TYPE public.project_member_role AS ENUM ('owner', 'admin', 'member', 'viewer');

-- Создаём enum для типа памяти проекта
CREATE TYPE public.project_memory_type AS ENUM ('fact', 'decision', 'requirement', 'todo');

-- ============================================
-- ТАБЛИЦА: projects (Проекты)
-- ============================================
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  status project_status NOT NULL DEFAULT 'active',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы
CREATE INDEX idx_projects_created_by ON public.projects(created_by);
CREATE INDEX idx_projects_department_id ON public.projects(department_id);
CREATE INDEX idx_projects_status ON public.projects(status);

-- Триггер обновления updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ТАБЛИЦА: project_members (Участники проекта)
-- ============================================
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.chat_roles(id) ON DELETE CASCADE,
  role project_member_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Либо user_id, либо agent_id должен быть заполнен
  CONSTRAINT check_member_type CHECK (
    (user_id IS NOT NULL AND agent_id IS NULL) OR 
    (user_id IS NULL AND agent_id IS NOT NULL)
  ),
  -- Уникальность участника в проекте
  CONSTRAINT unique_project_user UNIQUE (project_id, user_id),
  CONSTRAINT unique_project_agent UNIQUE (project_id, agent_id)
);

-- Индексы
CREATE INDEX idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX idx_project_members_user_id ON public.project_members(user_id);
CREATE INDEX idx_project_members_agent_id ON public.project_members(agent_id);

-- ============================================
-- ТАБЛИЦА: project_chats (Чаты проекта)
-- ============================================
CREATE TABLE public.project_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Новый чат',
  is_active BOOLEAN DEFAULT true,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы
CREATE INDEX idx_project_chats_project_id ON public.project_chats(project_id);

-- Триггер обновления updated_at
CREATE TRIGGER update_project_chats_updated_at
  BEFORE UPDATE ON public.project_chats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ТАБЛИЦА: project_chat_messages (Сообщения проектного чата)
-- ============================================
CREATE TABLE public.project_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.project_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.chat_roles(id) ON DELETE SET NULL,
  message_role TEXT NOT NULL CHECK (message_role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  reply_to_message_id UUID REFERENCES public.project_chat_messages(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы
CREATE INDEX idx_project_chat_messages_chat_id ON public.project_chat_messages(chat_id);
CREATE INDEX idx_project_chat_messages_user_id ON public.project_chat_messages(user_id);
CREATE INDEX idx_project_chat_messages_created_at ON public.project_chat_messages(created_at DESC);

-- ============================================
-- ТАБЛИЦА: context_packs (Контекст-пакеты)
-- ============================================
CREATE TABLE public.context_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  folder_ids UUID[] DEFAULT '{}'::uuid[],
  is_global BOOLEAN DEFAULT false,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы
CREATE INDEX idx_context_packs_is_global ON public.context_packs(is_global);
CREATE INDEX idx_context_packs_department_id ON public.context_packs(department_id);

-- Триггер обновления updated_at
CREATE TRIGGER update_context_packs_updated_at
  BEFORE UPDATE ON public.context_packs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ТАБЛИЦА: project_context_packs (Связь проект-контекст)
-- ============================================
CREATE TABLE public.project_context_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  context_pack_id UUID NOT NULL REFERENCES public.context_packs(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  
  CONSTRAINT unique_project_context_pack UNIQUE (project_id, context_pack_id)
);

-- Индексы
CREATE INDEX idx_project_context_packs_project_id ON public.project_context_packs(project_id);

-- ============================================
-- ТАБЛИЦА: project_memory (Память проекта)
-- ============================================
CREATE TABLE public.project_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  memory_type project_memory_type NOT NULL,
  content TEXT NOT NULL,
  source_message_id UUID REFERENCES public.project_chat_messages(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Индексы
CREATE INDEX idx_project_memory_project_id ON public.project_memory(project_id);
CREATE INDEX idx_project_memory_type ON public.project_memory(memory_type);
CREATE INDEX idx_project_memory_active ON public.project_memory(is_active);

-- ============================================
-- ТАБЛИЦА: project_documents (Документы проекта)
-- ============================================
CREATE TABLE public.project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  file_path TEXT,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы
CREATE INDEX idx_project_documents_project_id ON public.project_documents(project_id);
CREATE INDEX idx_project_documents_document_id ON public.project_documents(document_id);

-- ============================================
-- ФУНКЦИЯ: is_project_member (Security Definer)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
    AND user_id = p_user_id
  );
$$;

-- ============================================
-- ФУНКЦИЯ: get_project_member_role
-- ============================================
CREATE OR REPLACE FUNCTION public.get_project_member_role(p_project_id UUID, p_user_id UUID)
RETURNS project_member_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.project_members
  WHERE project_id = p_project_id
  AND user_id = p_user_id
  LIMIT 1;
$$;

-- ============================================
-- RLS: Включаем для всех таблиц
-- ============================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.context_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_context_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS ПОЛИТИКИ: projects
-- ============================================

-- Админы могут всё
CREATE POLICY "Admins can manage projects"
ON public.projects FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Участники могут видеть свои проекты
CREATE POLICY "Members can view their projects"
ON public.projects FOR SELECT
USING (
  is_project_member(id, auth.uid())
);

-- Любой аутентифицированный может создать проект
CREATE POLICY "Authenticated can create projects"
ON public.projects FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- Владельцы и админы проекта могут обновлять
CREATE POLICY "Project owners can update"
ON public.projects FOR UPDATE
USING (
  get_project_member_role(id, auth.uid()) IN ('owner', 'admin')
);

-- ============================================
-- RLS ПОЛИТИКИ: project_members
-- ============================================

-- Админы могут всё
CREATE POLICY "Admins can manage project members"
ON public.project_members FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Участники проекта могут видеть других участников
CREATE POLICY "Members can view project members"
ON public.project_members FOR SELECT
USING (
  is_project_member(project_id, auth.uid())
);

-- Владельцы и админы проекта могут добавлять участников
CREATE POLICY "Project admins can add members"
ON public.project_members FOR INSERT
WITH CHECK (
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin')
);

-- Владельцы и админы проекта могут удалять участников
CREATE POLICY "Project admins can remove members"
ON public.project_members FOR DELETE
USING (
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin')
);

-- ============================================
-- RLS ПОЛИТИКИ: project_chats
-- ============================================

-- Админы могут всё
CREATE POLICY "Admins can manage project chats"
ON public.project_chats FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Участники проекта могут видеть чаты
CREATE POLICY "Members can view project chats"
ON public.project_chats FOR SELECT
USING (
  is_project_member(project_id, auth.uid())
);

-- Участники могут создавать чаты (не viewer)
CREATE POLICY "Members can create project chats"
ON public.project_chats FOR INSERT
WITH CHECK (
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin', 'member')
);

-- Участники могут обновлять чаты
CREATE POLICY "Members can update project chats"
ON public.project_chats FOR UPDATE
USING (
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin', 'member')
);

-- ============================================
-- RLS ПОЛИТИКИ: project_chat_messages
-- ============================================

-- Админы могут всё
CREATE POLICY "Admins can manage project messages"
ON public.project_chat_messages FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Участники проекта могут видеть сообщения
CREATE POLICY "Members can view project messages"
ON public.project_chat_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM project_chats pc
    WHERE pc.id = project_chat_messages.chat_id
    AND is_project_member(pc.project_id, auth.uid())
  )
);

-- Участники могут писать сообщения
CREATE POLICY "Members can send project messages"
ON public.project_chat_messages FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM project_chats pc
    WHERE pc.id = project_chat_messages.chat_id
    AND get_project_member_role(pc.project_id, auth.uid()) IN ('owner', 'admin', 'member')
  )
);

-- ============================================
-- RLS ПОЛИТИКИ: context_packs
-- ============================================

-- Админы могут всё
CREATE POLICY "Admins can manage context packs"
ON public.context_packs FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Все могут видеть глобальные и свои пакеты
CREATE POLICY "Users can view accessible context packs"
ON public.context_packs FOR SELECT
USING (
  is_global = true OR
  department_id = get_user_department(auth.uid()) OR
  created_by = auth.uid()
);

-- ============================================
-- RLS ПОЛИТИКИ: project_context_packs
-- ============================================

-- Админы могут всё
CREATE POLICY "Admins can manage project context packs"
ON public.project_context_packs FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Участники проекта могут видеть настройки контекста
CREATE POLICY "Members can view project context packs"
ON public.project_context_packs FOR SELECT
USING (
  is_project_member(project_id, auth.uid())
);

-- Владельцы/админы могут управлять контекстом
CREATE POLICY "Project admins can manage context packs"
ON public.project_context_packs FOR INSERT
WITH CHECK (
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin')
);

CREATE POLICY "Project admins can update context packs"
ON public.project_context_packs FOR UPDATE
USING (
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin')
);

CREATE POLICY "Project admins can delete context packs"
ON public.project_context_packs FOR DELETE
USING (
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin')
);

-- ============================================
-- RLS ПОЛИТИКИ: project_memory
-- ============================================

-- Админы могут всё
CREATE POLICY "Admins can manage project memory"
ON public.project_memory FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Участники проекта могут видеть память
CREATE POLICY "Members can view project memory"
ON public.project_memory FOR SELECT
USING (
  is_project_member(project_id, auth.uid())
);

-- Участники могут добавлять записи в память
CREATE POLICY "Members can add to project memory"
ON public.project_memory FOR INSERT
WITH CHECK (
  created_by = auth.uid() AND
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin', 'member')
);

-- Владельцы/админы могут обновлять память
CREATE POLICY "Project admins can update memory"
ON public.project_memory FOR UPDATE
USING (
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin')
);

-- ============================================
-- RLS ПОЛИТИКИ: project_documents
-- ============================================

-- Админы могут всё
CREATE POLICY "Admins can manage project documents"
ON public.project_documents FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Участники проекта могут видеть документы
CREATE POLICY "Members can view project documents"
ON public.project_documents FOR SELECT
USING (
  is_project_member(project_id, auth.uid())
);

-- Участники могут добавлять документы
CREATE POLICY "Members can add project documents"
ON public.project_documents FOR INSERT
WITH CHECK (
  added_by = auth.uid() AND
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin', 'member')
);

-- Владельцы/админы могут удалять документы
CREATE POLICY "Project admins can delete documents"
ON public.project_documents FOR DELETE
USING (
  get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin')
);

-- ============================================
-- STORAGE: Бакет для документов проекта
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS для storage
CREATE POLICY "Project members can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-documents' AND
  is_project_member((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "Project members can view documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-documents' AND
  is_project_member((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "Project members can delete documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-documents' AND
  get_project_member_role((storage.foldername(name))[1]::uuid, auth.uid()) IN ('owner', 'admin')
);