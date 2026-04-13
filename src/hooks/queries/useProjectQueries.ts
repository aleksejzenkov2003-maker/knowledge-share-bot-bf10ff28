 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { 
   Project, 
   ProjectMember, 
   ProjectChat, 
   ProjectChatMessage,
   ContextPack,
   ProjectContextPack,
   ProjectMemory,
   ProjectFolder,
   CreateProjectInput,
   AddMemberInput,
  ProjectMemoryType,
  ProjectStatus
 } from '@/types/project';
import type { Json } from '@/integrations/supabase/types';
 import { toast } from 'sonner';
 
 // ============================================
 // Query Keys
 // ============================================
export const projectQueryKeys = {
  all: ['projects'] as const,
  list: () => [...projectQueryKeys.all, 'list'] as const,
  detail: (id: string) => [...projectQueryKeys.all, 'detail', id] as const,
  members: (projectId: string) => [...projectQueryKeys.all, 'members', projectId] as const,
  chats: (projectId: string) => [...projectQueryKeys.all, 'chats', projectId] as const,
  messages: (chatId: string) => [...projectQueryKeys.all, 'messages', chatId] as const,
  contextPacks: () => ['contextPacks'] as const,
  projectContextPacks: (projectId: string) => [...projectQueryKeys.all, 'contextPacks', projectId] as const,
  memory: (projectId: string) => [...projectQueryKeys.all, 'memory', projectId] as const,
  folders: () => ['projectFolders'] as const,
};
 
 // ============================================
 // Queries
 // ============================================
 
 // Список проектов пользователя
 export function useProjectsQuery() {
   return useQuery({
     queryKey: projectQueryKeys.list(),
     queryFn: async () => {
       const { data, error } = await supabase
         .from('projects')
         .select('*')
         .order('updated_at', { ascending: false });
       
       if (error) throw error;
       return data as Project[];
     },
   });
 }
 
 // Детали проекта
 export function useProjectQuery(projectId: string | null) {
   return useQuery({
     queryKey: projectQueryKeys.detail(projectId || ''),
     queryFn: async () => {
       if (!projectId) return null;
       const { data, error } = await supabase
         .from('projects')
         .select('*')
         .eq('id', projectId)
         .single();
       
       if (error) throw error;
       return data as Project;
     },
     enabled: !!projectId,
   });
 }
 
 // Участники проекта
 export function useProjectMembersQuery(projectId: string | null) {
   return useQuery({
     queryKey: projectQueryKeys.members(projectId || ''),
     queryFn: async () => {
       if (!projectId) return [];
       const { data, error } = await supabase
         .from('project_members')
         .select(`
           *,
           profile:profiles!project_members_user_id_fkey(id, full_name, email, avatar_url),
           agent:chat_roles!project_members_agent_id_fkey(id, name, slug, mention_trigger, description)
         `)
         .eq('project_id', projectId)
         .order('joined_at', { ascending: true });
       
       if (error) throw error;
       return data as ProjectMember[];
     },
     enabled: !!projectId,
   });
 }
 
 // Чаты проекта
 export function useProjectChatsQuery(projectId: string | null) {
   return useQuery({
     queryKey: projectQueryKeys.chats(projectId || ''),
     queryFn: async () => {
       if (!projectId) return [];
       const { data, error } = await supabase
         .from('project_chats')
         .select('*')
         .eq('project_id', projectId)
         .order('is_pinned', { ascending: false })
         .order('updated_at', { ascending: false });
       
       if (error) throw error;
       return data as ProjectChat[];
     },
     enabled: !!projectId,
   });
 }
 
 // Сообщения чата
 export function useProjectMessagesQuery(chatId: string | null) {
   return useQuery({
     queryKey: projectQueryKeys.messages(chatId || ''),
     queryFn: async () => {
       if (!chatId) return [];
       const { data, error } = await supabase
         .from('project_chat_messages')
         .select('*')
         .eq('chat_id', chatId)
         .order('created_at', { ascending: true });
       
       if (error) throw error;
       return data as ProjectChatMessage[];
     },
     enabled: !!chatId,
   });
 }
 
 // Все доступные контекст-пакеты
 export function useContextPacksQuery() {
   return useQuery({
     queryKey: projectQueryKeys.contextPacks(),
     queryFn: async () => {
       const { data, error } = await supabase
         .from('context_packs')
         .select('*')
         .order('name');
       
       if (error) throw error;
       return data as ContextPack[];
     },
   });
 }
 
 // Контекст-пакеты проекта
 export function useProjectContextPacksQuery(projectId: string | null) {
   return useQuery({
     queryKey: projectQueryKeys.projectContextPacks(projectId || ''),
     queryFn: async () => {
       if (!projectId) return [];
       const { data, error } = await supabase
         .from('project_context_packs')
         .select(`
           *,
           context_pack:context_packs(*)
         `)
         .eq('project_id', projectId)
         .order('priority', { ascending: true });
       
       if (error) throw error;
       return data as ProjectContextPack[];
     },
     enabled: !!projectId,
   });
 }
 
 // Память проекта
 export function useProjectMemoryQuery(projectId: string | null) {
   return useQuery({
     queryKey: projectQueryKeys.memory(projectId || ''),
     queryFn: async () => {
       if (!projectId) return [];
       const { data, error } = await supabase
         .from('project_memory')
         .select(`
           *,
           creator:profiles!project_memory_created_by_fkey(full_name, email)
         `)
         .eq('project_id', projectId)
         .eq('is_active', true)
         .order('created_at', { ascending: false });
       
       if (error) throw error;
       return data as ProjectMemory[];
     },
     enabled: !!projectId,
   });
 }
 
 // ============================================
 // Mutations
 // ============================================
 
 // Создать проект
 export function useCreateProject() {
   const queryClient = useQueryClient();
   
   return useMutation({
     mutationFn: async (input: CreateProjectInput) => {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) throw new Error('Not authenticated');
       
       // Создаём проект
       const { data: project, error } = await supabase
         .from('projects')
         .insert({
           name: input.name,
           description: input.description || null,
           department_id: input.department_id || null,
           created_by: user.id,
         })
         .select()
         .single();
       
       if (error) throw error;
       
       // Добавляем создателя как owner
       await supabase
         .from('project_members')
         .insert({
           project_id: project.id,
           user_id: user.id,
           role: 'owner',
           invited_by: user.id,
         });
       
       // Создаём первый чат
       await supabase
         .from('project_chats')
         .insert({
           project_id: project.id,
           title: 'Основной',
         });
       
       return project as Project;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
       toast.success('Проект создан');
     },
     onError: (error) => {
       console.error('Error creating project:', error);
       toast.error('Ошибка создания проекта');
     },
   });
 }
 
 // Обновить проект
 export function useUpdateProject() {
   const queryClient = useQueryClient();
   
   return useMutation({
    mutationFn: async ({ id, name, description, status }: { 
      id: string; 
      name?: string; 
      description?: string | null; 
      status?: ProjectStatus;
    }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;
      
       const { data, error } = await supabase
         .from('projects')
         .update(updates)
         .eq('id', id)
         .select()
         .single();
       
       if (error) throw error;
       return data as Project;
     },
     onSuccess: (project) => {
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.detail(project.id) });
     },
   });
 }
 
 // Добавить участника
 export function useAddProjectMember(projectId: string) {
   const queryClient = useQueryClient();
   
   return useMutation({
     mutationFn: async (input: AddMemberInput) => {
       const { data: { user } } = await supabase.auth.getUser();
       
       const { data, error } = await supabase
         .from('project_members')
         .insert({
           project_id: input.project_id,
           user_id: input.user_id || null,
           agent_id: input.agent_id || null,
           role: input.role || 'member',
           invited_by: user?.id,
         })
         .select()
         .single();
       
       if (error) throw error;
       return data as ProjectMember;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.members(projectId) });
       toast.success('Участник добавлен');
     },
     onError: (error: Error) => {
       if (error.message.includes('unique')) {
         toast.error('Участник уже в проекте');
       } else {
         toast.error('Ошибка добавления участника');
       }
     },
   });
 }
 
 // Удалить участника
 export function useRemoveProjectMember(projectId: string) {
   const queryClient = useQueryClient();
   
   return useMutation({
     mutationFn: async (memberId: string) => {
       const { error } = await supabase
         .from('project_members')
         .delete()
         .eq('id', memberId);
       
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.members(projectId) });
       toast.success('Участник удалён');
     },
   });
 }
 
 // Создать чат в проекте
 export function useCreateProjectChat(projectId: string) {
   const queryClient = useQueryClient();
   
   return useMutation({
     mutationFn: async (title: string) => {
       const { data, error } = await supabase
         .from('project_chats')
         .insert({
           project_id: projectId,
           title,
         })
         .select()
         .single();
       
       if (error) throw error;
       return data as ProjectChat;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.chats(projectId) });
     },
   });
 }
 
 // Обновить чат
 export function useUpdateProjectChat(projectId: string) {
   const queryClient = useQueryClient();
   
   return useMutation({
     mutationFn: async ({ id, ...updates }: Partial<ProjectChat> & { id: string }) => {
       const { data, error } = await supabase
         .from('project_chats')
         .update(updates)
         .eq('id', id)
         .select()
         .single();
       
       if (error) throw error;
       return data as ProjectChat;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.chats(projectId) });
     },
   });
 }
 
 // Удалить чат
 export function useDeleteProjectChat(projectId: string) {
   const queryClient = useQueryClient();
   
   return useMutation({
     mutationFn: async (chatId: string) => {
       const { error } = await supabase
         .from('project_chats')
         .delete()
         .eq('id', chatId);
       
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.chats(projectId) });
     },
   });
 }
 
 // Переключить контекст-пакет
 export function useToggleContextPack(projectId: string) {
   const queryClient = useQueryClient();
   
   return useMutation({
     mutationFn: async ({ contextPackId, isEnabled }: { contextPackId: string; isEnabled: boolean }) => {
       // Проверяем, есть ли уже связь
       const { data: existing } = await supabase
         .from('project_context_packs')
         .select('id')
         .eq('project_id', projectId)
         .eq('context_pack_id', contextPackId)
         .single();
       
       if (existing) {
         // Обновляем
         const { error } = await supabase
           .from('project_context_packs')
           .update({ is_enabled: isEnabled })
           .eq('id', existing.id);
         if (error) throw error;
       } else {
         // Создаём
         const { error } = await supabase
           .from('project_context_packs')
           .insert({
             project_id: projectId,
             context_pack_id: contextPackId,
             is_enabled: isEnabled,
           });
         if (error) throw error;
       }
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.projectContextPacks(projectId) });
     },
   });
 }
 
 // Добавить в память проекта
 export function useAddProjectMemory(projectId: string) {
   const queryClient = useQueryClient();
   
   return useMutation({
     mutationFn: async ({ 
       memoryType, 
       content, 
       sourceMessageId 
     }: { 
       memoryType: ProjectMemoryType; 
       content: string; 
       sourceMessageId?: string;
     }) => {
       const { data: { user } } = await supabase.auth.getUser();
       
       const { data, error } = await supabase
         .from('project_memory')
         .insert({
           project_id: projectId,
           memory_type: memoryType,
           content,
           source_message_id: sourceMessageId || null,
           created_by: user?.id,
         })
         .select()
         .single();
       
       if (error) throw error;
       return data as ProjectMemory;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.memory(projectId) });
       toast.success('Добавлено в память проекта');
     },
   });
 }
 
 // Удалить из памяти
 export function useRemoveProjectMemory(projectId: string) {
   const queryClient = useQueryClient();
   
   return useMutation({
     mutationFn: async (memoryId: string) => {
       const { error } = await supabase
         .from('project_memory')
         .update({ is_active: false })
         .eq('id', memoryId);
       
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.memory(projectId) });
     },
  });
}

// ============================================
// Project Folders
// ============================================

export function useProjectFoldersQuery() {
  return useQuery({
    queryKey: projectQueryKeys.folders(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_folders')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as ProjectFolder[];
    },
  });
}

export function useCreateProjectFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('project_folders')
        .insert({ name, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data as ProjectFolder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.folders() });
      toast.success('Папка создана');
    },
    onError: () => toast.error('Ошибка создания папки'),
  });
}

export function useRenameProjectFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('project_folders')
        .update({ name })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.folders() });
    },
  });
}

export function useDeleteProjectFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('project_folders')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.folders() });
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
      toast.success('Папка удалена');
    },
  });
}

// Rename project
export function useRenameProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('projects')
        .update({ name })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
      toast.success('Проект переименован');
    },
  });
}

// Move project to folder
export function useMoveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string | null }) => {
      const { error } = await supabase
        .from('projects')
        .update({ folder_id: folderId })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
      toast.success('Проект перемещён');
    },
  });
}

// Delete project
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
      toast.success('Проект удалён');
    },
    onError: () => toast.error('Ошибка удаления проекта'),
  });
}