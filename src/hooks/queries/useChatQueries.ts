import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChatRole, Conversation, Message, DBMessage } from "@/types/chat";

// Query keys for cache management
export const chatQueryKeys = {
  roles: (userId: string, departmentId: string | null) => ['chat-roles', userId, departmentId] as const,
  conversations: (userId: string) => ['conversations', userId] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  userProfile: (userId: string) => ['user-profile', userId] as const,
};

// Fetch roles with department filtering
async function fetchRolesData(userId: string, departmentId: string | null): Promise<ChatRole[]> {
  // First check if user is admin/moderator
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  const isAdmin = roleData?.role === "admin" || roleData?.role === "moderator";

  const { data, error } = await supabase
    .from("chat_roles")
    .select("id, name, description, slug, is_active, is_project_mode, department_ids")
    .eq("is_active", true)
    .eq("is_project_mode", false)
    .order("name");

  if (error) throw error;

  // Filter roles based on department
  let filteredRoles = data || [];
  if (!isAdmin && departmentId) {
    filteredRoles = filteredRoles.filter((role: { department_ids?: string[] }) => {
      if (!role.department_ids || role.department_ids.length === 0) return true;
      return role.department_ids.includes(departmentId);
    });
  }

  return filteredRoles;
}

// Fetch conversations
async function fetchConversationsData(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

// Fetch messages for a conversation
async function fetchMessagesData(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((msg) => ({
    id: msg.id,
    conversation_id: msg.conversation_id,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    timestamp: new Date(msg.created_at),
    responseTime: (msg.metadata as DBMessage['metadata'])?.response_time_ms,
    ragContext: (msg.metadata as DBMessage['metadata'])?.rag_context,
    citations: (msg.metadata as DBMessage['metadata'])?.citations,
    smartSearch: (msg.metadata as DBMessage['metadata'])?.smart_search,
    webSearchCitations: (msg.metadata as any)?.web_search_citations,
    webSearchUsed: (msg.metadata as any)?.web_search_used,
    roleId: (msg.metadata as any)?.role_id,
    reputationResults: (msg.metadata as any)?.reputation_results,
    reputationCompanyData: (msg.metadata as any)?.reputation_company_data,
    attachments: (msg.metadata as DBMessage['metadata'])?.attachments?.map((a, idx) => ({
      id: `${msg.id}-${idx}`,
      file_path: a.file_path,
      file_name: a.file_name,
      file_type: a.file_type,
      file_size: a.file_size,
      status: 'uploaded' as const,
    })),
  }));
}

// Fetch all role IDs used in messages for each conversation
async function fetchConversationRolesMap(conversationIds: string[]): Promise<Map<string, string[]>> {
  if (conversationIds.length === 0) return new Map();
  
  const { data, error } = await supabase
    .from("messages")
    .select("conversation_id, metadata")
    .in("conversation_id", conversationIds)
    .eq("role", "assistant");

  if (error) {
    console.error("Error fetching conversation roles:", error);
    return new Map();
  }

  const rolesMap = new Map<string, Set<string>>();
  
  (data || []).forEach((msg) => {
    const roleId = (msg.metadata as any)?.role_id;
    if (roleId) {
      if (!rolesMap.has(msg.conversation_id)) {
        rolesMap.set(msg.conversation_id, new Set());
      }
      rolesMap.get(msg.conversation_id)!.add(roleId);
    }
  });

  // Convert Sets to Arrays
  const result = new Map<string, string[]>();
  rolesMap.forEach((roleSet, convId) => {
    result.set(convId, Array.from(roleSet));
  });
  
  return result;
}

// Fetch user profile
async function fetchUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email, department_id')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

// React Query hooks
export function useRolesQuery(userId: string | undefined, departmentId: string | null) {
  return useQuery({
    queryKey: chatQueryKeys.roles(userId || '', departmentId),
    queryFn: () => fetchRolesData(userId!, departmentId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes - roles rarely change
    gcTime: 10 * 60 * 1000,
  });
}

export function useConversationsQuery(userId: string | undefined) {
  return useQuery({
    queryKey: chatQueryKeys.conversations(userId || ''),
    queryFn: () => fetchConversationsData(userId!),
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Hook to get roles used in each conversation
export function useConversationRolesQuery(conversationIds: string[]) {
  return useQuery({
    queryKey: ['conversation-roles', conversationIds],
    queryFn: () => fetchConversationRolesMap(conversationIds),
    enabled: conversationIds.length > 0,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useMessagesQuery(conversationId: string | null) {
  return useQuery({
    queryKey: chatQueryKeys.messages(conversationId || ''),
    queryFn: () => fetchMessagesData(conversationId!),
    enabled: !!conversationId,
    staleTime: 0, // Always fresh for active conversation
  });
}

export function useUserProfileQuery(userId: string | undefined) {
  return useQuery({
    queryKey: chatQueryKeys.userProfile(userId || ''),
    queryFn: () => fetchUserProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Mutation hooks
export function useCreateConversation(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, title = "Новый диалог" }: { roleId?: string; title?: string }) => {
      if (!userId) throw new Error("No user");

      const { data, error } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          role_id: roleId || null,
          title,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<Conversation[]>(
        chatQueryKeys.conversations(userId!),
        (old) => [data, ...(old || [])]
      );
    },
  });
}

export function useUpdateConversation(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from("conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      return { id, title };
    },
    onSuccess: ({ id, title }) => {
      queryClient.setQueryData<Conversation[]>(
        chatQueryKeys.conversations(userId!),
        (old) => old?.map((c) => c.id === id ? { ...c, title, updated_at: new Date().toISOString() } : c)
      );
    },
  });
}

export function useDeleteConversation(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from("conversations")
        .update({ is_active: false })
        .eq("id", conversationId);

      if (error) throw error;
      return conversationId;
    },
    onSuccess: (conversationId) => {
      queryClient.setQueryData<Conversation[]>(
        chatQueryKeys.conversations(userId!),
        (old) => old?.filter((c) => c.id !== conversationId)
      );
      // Invalidate messages for this conversation
      queryClient.removeQueries({
        queryKey: chatQueryKeys.messages(conversationId),
      });
    },
  });
}

export function usePinConversation(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) => {
      const { error } = await supabase
        .from("conversations")
        .update({ is_pinned: isPinned })
        .eq("id", id);

      if (error) throw error;
      return { id, isPinned };
    },
    onSuccess: ({ id, isPinned }) => {
      queryClient.setQueryData<Conversation[]>(
        chatQueryKeys.conversations(userId!),
        (old) => old?.map((c) => c.id === id ? { ...c, is_pinned: isPinned } : c)
      );
    },
  });
}
