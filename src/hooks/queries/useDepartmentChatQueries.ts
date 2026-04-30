import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DepartmentChat, DepartmentChatMessage, AgentMention } from "@/types/departmentChat";

// Query keys for cache management
export const departmentChatQueryKeys = {
  chats: (departmentId: string) => ['department-chats', departmentId] as const,
  messages: (chatId: string) => ['department-chat-messages', chatId] as const,
  agents: (departmentId: string) => ['department-agents', departmentId] as const,
  chatAgents: (chatIds: string[]) => ['department-chat-agents', chatIds] as const,
};

// Fetch all department chats
async function fetchDepartmentChats(departmentId: string): Promise<DepartmentChat[]> {
  const { data, error } = await supabase
    .from('department_chats')
    .select('*')
    .eq('department_id', departmentId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(chat => ({
    ...chat,
    is_pinned: chat.is_pinned ?? false,
  }));
}

// Fetch messages for a specific chat
async function fetchDepartmentMessages(chatId: string): Promise<DepartmentChatMessage[]> {
  const { data, error } = await supabase
    .from('department_chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) throw error;

  return (data || []).map(m => ({
    ...m,
    message_role: m.message_role as 'user' | 'assistant',
    metadata: m.metadata as DepartmentChatMessage['metadata']
  }));
}

// Fetch available agents
async function fetchAgentsData(): Promise<AgentMention[]> {
  const { data, error } = await supabase
    .from('chat_roles')
    .select('id, name, mention_trigger, slug')
    .eq('is_active', true)
    .eq('is_project_mode', false);

  if (error) throw error;

  return (data || []).map(role => ({
    id: role.id,
    name: role.name,
    mention_trigger: role.mention_trigger || `@${role.slug}`,
    slug: role.slug
  }));
}

// Fetch agent IDs used in each chat's messages
async function fetchChatAgentsMap(chatIds: string[]): Promise<Map<string, string[]>> {
  if (chatIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('department_chat_messages')
    .select('chat_id, role_id')
    .in('chat_id', chatIds)
    .eq('message_role', 'assistant')
    .not('role_id', 'is', null);

  if (error) {
    console.error('Error fetching chat agents:', error);
    return new Map();
  }

  const agentsMap = new Map<string, Set<string>>();
  
  (data || []).forEach((msg) => {
    if (msg.role_id) {
      if (!agentsMap.has(msg.chat_id)) {
        agentsMap.set(msg.chat_id, new Set());
      }
      agentsMap.get(msg.chat_id)!.add(msg.role_id);
    }
  });

  // Convert Sets to Arrays
  const result = new Map<string, string[]>();
  agentsMap.forEach((agentSet, chatId) => {
    result.set(chatId, Array.from(agentSet));
  });

  return result;
}

// React Query hooks
export function useDepartmentChatsQuery(departmentId: string | undefined) {
  return useQuery({
    queryKey: departmentChatQueryKeys.chats(departmentId || ''),
    queryFn: () => fetchDepartmentChats(departmentId!),
    enabled: !!departmentId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useDepartmentMessagesQuery(chatId: string | null) {
  return useQuery({
    queryKey: departmentChatQueryKeys.messages(chatId || ''),
    queryFn: () => fetchDepartmentMessages(chatId!),
    enabled: !!chatId,
    staleTime: 0, // Always fresh for active chat
  });
}

export function useDepartmentAgentsQuery(departmentId: string | undefined) {
  return useQuery({
    queryKey: departmentChatQueryKeys.agents(departmentId || ''),
    queryFn: () => fetchAgentsData(),
    enabled: !!departmentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useDepartmentChatAgentsQuery(chatIds: string[]) {
  return useQuery({
    queryKey: departmentChatQueryKeys.chatAgents(chatIds),
    queryFn: () => fetchChatAgentsMap(chatIds),
    enabled: chatIds.length > 0,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Mutation hooks
export function useCreateDepartmentChat(departmentId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title = "Новый чат" }: { title?: string }) => {
      if (!departmentId) throw new Error("No department");

      const { data, error } = await supabase
        .from("department_chats")
        .insert({
          department_id: departmentId,
          title,
        })
        .select()
        .single();

      if (error) throw error;
      return { ...data, is_pinned: data.is_pinned ?? false } as DepartmentChat;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<DepartmentChat[]>(
        departmentChatQueryKeys.chats(departmentId!),
        (old) => [data, ...(old || [])]
      );
    },
  });
}

export function useUpdateDepartmentChat(departmentId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from("department_chats")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      return { id, title };
    },
    onSuccess: ({ id, title }) => {
      queryClient.setQueryData<DepartmentChat[]>(
        departmentChatQueryKeys.chats(departmentId!),
        (old) => old?.map((c) => c.id === id ? { ...c, title, updated_at: new Date().toISOString() } : c)
      );
    },
  });
}

export function useDeleteDepartmentChat(departmentId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chatId: string) => {
      const { error } = await supabase
        .from("department_chats")
        .update({ is_active: false })
        .eq("id", chatId);

      if (error) throw error;
      return chatId;
    },
    onSuccess: (chatId) => {
      queryClient.setQueryData<DepartmentChat[]>(
        departmentChatQueryKeys.chats(departmentId!),
        (old) => old?.filter((c) => c.id !== chatId)
      );
      // Remove messages query for this chat
      queryClient.removeQueries({
        queryKey: departmentChatQueryKeys.messages(chatId),
      });
    },
  });
}

export function usePinDepartmentChat(departmentId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) => {
      const { error } = await supabase
        .from("department_chats")
        .update({ is_pinned: isPinned })
        .eq("id", id);

      if (error) throw error;
      return { id, isPinned };
    },
    onSuccess: ({ id, isPinned }) => {
      queryClient.setQueryData<DepartmentChat[]>(
        departmentChatQueryKeys.chats(departmentId!),
        (old) => old?.map((c) => c.id === id ? { ...c, is_pinned: isPinned } : c)
      );
    },
  });
}
