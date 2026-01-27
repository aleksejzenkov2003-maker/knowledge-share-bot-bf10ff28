import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DepartmentChat, DepartmentChatMessage, AgentMention, DepartmentChatAttachment } from "@/types/departmentChat";
import { Attachment } from "@/types/chat";
import type { Json } from "@/integrations/supabase/types";

// Throttle interval for streaming updates (ms)
const STREAM_UPDATE_INTERVAL = 50;

// Query keys
const departmentChatKeys = {
  chat: (departmentId: string) => ['department-chat', departmentId] as const,
  messages: (chatId: string) => ['department-messages', chatId] as const,
  agents: (departmentId: string) => ['department-agents', departmentId] as const,
};

// Fetch department chat
async function fetchDepartmentChatData(departmentId: string): Promise<DepartmentChat | null> {
  const { data, error } = await supabase
    .from('department_chats')
    .select('*')
    .eq('department_id', departmentId)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Create chat if doesn't exist
      const { data: newChat, error: createError } = await supabase
        .from('department_chats')
        .insert({ department_id: departmentId, title: 'Чат отдела' })
        .select()
        .single();

      if (createError) throw createError;
      return newChat;
    }
    throw error;
  }

  return data;
}

// Fetch available agents - gets ALL active agents with mention_trigger
// RLS policy handles access control (admins see all, users see their department)
async function fetchAgentsData(departmentId: string): Promise<AgentMention[]> {
  const { data, error } = await supabase
    .from('chat_roles')
    .select('id, name, mention_trigger, slug')
    .eq('is_active', true)
    .not('mention_trigger', 'is', null); // Only agents with mention triggers

  if (error) {
    console.error('Error fetching agents:', error);
    throw error;
  }

  console.log('Fetched agents for department chat:', data?.length, data);

  return (data || []).map(role => ({
    id: role.id,
    name: role.name,
    mention_trigger: role.mention_trigger || `@${role.slug}`,
    slug: role.slug
  }));
}

// Fetch messages
async function fetchMessagesData(chatId: string): Promise<DepartmentChatMessage[]> {
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

export function useOptimizedDepartmentChat(userId: string | undefined, departmentId: string | undefined) {
  const queryClient = useQueryClient();
  
  const [localMessages, setLocalMessages] = useState<DepartmentChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  
  // Streaming optimization refs
  const streamingContentRef = useRef<string>("");
  const updateIntervalRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // React Query hooks - load in parallel
  const { data: chat } = useQuery({
    queryKey: departmentChatKeys.chat(departmentId || ''),
    queryFn: () => fetchDepartmentChatData(departmentId!),
    enabled: !!departmentId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: availableAgents = [] } = useQuery({
    queryKey: departmentChatKeys.agents(departmentId || ''),
    queryFn: () => fetchAgentsData(departmentId!),
    enabled: !!departmentId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: dbMessages, isLoading } = useQuery({
    queryKey: departmentChatKeys.messages(chat?.id || ''),
    queryFn: () => fetchMessagesData(chat!.id),
    enabled: !!chat?.id,
    staleTime: 30 * 1000,
  });

  // Sync messages when not generating
  const messages = isGenerating ? localMessages : (dbMessages || localMessages);

  // Sync local messages when dbMessages change
  useEffect(() => {
    if (dbMessages && !isGenerating) {
      setLocalMessages(dbMessages);
    }
  }, [dbMessages, isGenerating]);

  // Parse @mention from message - supports multiple formats
  const parseMention = useCallback((text: string): { agentId: string | null; cleanText: string } => {
    // Match @trigger at the start of message (handles multi-word triggers like "ТЗ консультант")
    const mentionRegex = /^@([^\n]+?)(?:\s+|$)/;
    const match = text.match(mentionRegex);

    if (!match) {
      return { agentId: null, cleanText: text };
    }

    const trigger = match[1].trim().toLowerCase();
    
    // Try to find agent by various matching strategies
    const agent = availableAgents.find(a => {
      const slugLower = a.slug.toLowerCase();
      const mentionLower = a.mention_trigger?.replace('@', '').toLowerCase().trim();
      const nameLower = a.name.toLowerCase().trim();
      
      // Match by: exact mention_trigger, slug, or name
      return (
        slugLower === trigger ||
        mentionLower === trigger ||
        nameLower === trigger ||
        // Partial match for multi-word names
        trigger.startsWith(slugLower) ||
        (mentionLower && trigger.startsWith(mentionLower)) ||
        trigger.startsWith(nameLower)
      );
    });

    if (agent) {
      // Remove the full matched trigger from text
      const cleanText = text.replace(/^@[^\n]+?\s*/, '').trim();
      return { agentId: agent.id, cleanText };
    }

    return { agentId: null, cleanText: text };
  }, [availableAgents]);

  // Handle file attachments - parallel upload
  const handleAttach = useCallback(async (files: File[]) => {
    if (!userId) return;

    const newAttachments: Attachment[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      status: 'pending' as const
    }));

    setAttachments(prev => [...prev, ...newAttachments]);

    // Upload all files in parallel
    const uploadPromises = newAttachments.map(async (attachment) => {
      try {
        setAttachments(prev => prev.map(a => 
          a.id === attachment.id ? { ...a, status: 'uploading' as const } : a
        ));

        const file = attachment.file!;
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        setAttachments(prev => prev.map(a => 
          a.id === attachment.id 
            ? { ...a, status: 'uploaded' as const, file_path: fileName } 
            : a
        ));
      } catch (error) {
        console.error('Error uploading file:', error);
        setAttachments(prev => prev.map(a => 
          a.id === attachment.id ? { ...a, status: 'error' as const } : a
        ));
        toast.error(`Ошибка загрузки: ${attachment.file_name}`);
      }
    });

    await Promise.all(uploadPromises);
  }, [userId]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id);
      if (attachment?.preview_url) {
        URL.revokeObjectURL(attachment.preview_url);
      }
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments(prev => {
      prev.forEach(a => {
        if (a.preview_url) URL.revokeObjectURL(a.preview_url);
      });
      return [];
    });
  }, []);

  // Get cached user profile
  const getUserName = useCallback(async (uid: string): Promise<string> => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', uid)
        .single();

      return data?.full_name || data?.email || 'Пользователь';
    } catch {
      return 'Пользователь';
    }
  }, []);

  // Send message with streaming
  const sendMessage = useCallback(async (text: string, messageAttachments?: Attachment[]) => {
    if (!chat?.id || !userId) return;
    
    const hasAttachments = messageAttachments && messageAttachments.length > 0;
    if (!text.trim() && !hasAttachments) return;

    const { agentId, cleanText } = parseMention(text);

    if (!agentId) {
      toast.error('Укажите агента через @упоминание, например: @юрист ваш вопрос');
      return;
    }

    const agent = availableAgents.find(a => a.id === agentId);
    const userName = await getUserName(userId);

    // Prepare attachments metadata
    const attachmentsMetadata: DepartmentChatAttachment[] = hasAttachments
      ? messageAttachments.filter(a => a.status === 'uploaded' && a.file_path).map(a => ({
          file_path: a.file_path!,
          file_name: a.file_name,
          file_type: a.file_type,
          file_size: a.file_size
        }))
      : [];

    // Add user message to UI immediately
    const userMessage: DepartmentChatMessage = {
      id: crypto.randomUUID(),
      chat_id: chat.id,
      user_id: userId,
      role_id: null,
      message_role: 'user',
      content: text,
      metadata: { 
        user_name: userName,
        attachments: attachmentsMetadata.length > 0 ? attachmentsMetadata : undefined
      },
      created_at: new Date().toISOString()
    };

    setLocalMessages(prev => [...prev, userMessage]);
    clearAttachments();

    // Save user message to DB
    const userMsgMetadata = { 
      user_name: userName,
      attachments: attachmentsMetadata.length > 0 ? attachmentsMetadata : undefined
    };
    const { error: userMsgError } = await supabase
      .from('department_chat_messages')
      .insert([{
        chat_id: chat.id,
        user_id: userId,
        role_id: null,
        message_role: 'user',
        content: text,
        source: 'web' as const,
        metadata: userMsgMetadata as unknown as Json
      }]);

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
      toast.error('Ошибка сохранения сообщения');
      return;
    }

    // Create streaming assistant message
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: DepartmentChatMessage = {
      id: assistantMessageId,
      chat_id: chat.id,
      user_id: userId,
      role_id: agentId,
      message_role: 'assistant',
      content: '',
      metadata: { agent_name: agent?.name },
      created_at: new Date().toISOString()
    };

    setLocalMessages(prev => [...prev, assistantMessage]);
    setIsGenerating(true);
    streamingContentRef.current = "";

    // Prepare message history for context (last 20 messages)
    const historyForContext = localMessages.slice(-20).map(m => ({
      role: m.message_role,
      content: m.content,
      agent_name: m.metadata?.agent_name
    }));

    try {
      abortControllerRef.current = new AbortController();

      const { data: { session } } = await supabase.auth.getSession();

      const requestBody: any = {
        message: cleanText,
        role_id: agentId,
        message_history: historyForContext,
        is_department_chat: true
      };

      if (attachmentsMetadata.length > 0) {
        requestBody.attachments = attachmentsMetadata.map(a => ({
          file_path: a.file_path,
          file_name: a.file_name,
          file_type: a.file_type,
          file_size: a.file_size
        }));
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let metadata: any = {};
      let buffer = '';

      // Set up throttled UI updates
      updateIntervalRef.current = window.setInterval(() => {
        setLocalMessages(prev => prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, content: streamingContentRef.current }
            : m
        ));
      }, STREAM_UPDATE_INTERVAL);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]' || !data) continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content' && parsed.content) {
                streamingContentRef.current += parsed.content;
              }
              if (parsed.type === 'metadata') {
                metadata = {
                  response_time_ms: parsed.response_time_ms,
                  rag_context: parsed.rag_context,
                  citations: parsed.citations,
                  perplexity_citations: parsed.perplexity_citations,
                  smart_search: parsed.smart_search,
                  stop_reason: parsed.stop_reason,
                };
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
      
      // Process remaining buffer
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content' && parsed.content) {
              streamingContentRef.current += parsed.content;
            } else if (parsed.type === 'metadata') {
              metadata = {
                response_time_ms: parsed.response_time_ms,
                rag_context: parsed.rag_context,
                citations: parsed.citations,
                perplexity_citations: parsed.perplexity_citations,
                smart_search: parsed.smart_search,
              };
            }
          } catch {
            // Ignore
          }
        }
      }

      // Clear interval
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }

      const finalContent = streamingContentRef.current;

      // Save assistant message to DB
      const assistantMsgMetadata = {
        ...metadata,
        agent_name: agent?.name
      };
      await supabase
        .from('department_chat_messages')
        .insert([{
          chat_id: chat.id,
          user_id: userId,
          role_id: agentId,
          message_role: 'assistant',
          content: finalContent,
          source: 'web' as const,
          metadata: assistantMsgMetadata as unknown as Json
        }]);

      // Update the message in state with final content
      setLocalMessages(prev => prev.map(m =>
        m.id === assistantMessageId
          ? { ...m, content: finalContent, metadata: { ...m.metadata, ...metadata } }
          : m
      ));

      // Invalidate query to sync
      queryClient.invalidateQueries({ queryKey: departmentChatKeys.messages(chat.id) });

    } catch (error: any) {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      
      if (error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Error sending message:', error);
        toast.error('Ошибка при получении ответа');
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [chat?.id, userId, parseMention, availableAgents, localMessages, getUserName, clearAttachments, queryClient]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  // Backward compatibility - no-op since we use React Query
  const loadMessages = useCallback(() => {}, []);

  return {
    chat,
    messages,
    availableAgents,
    isLoading,
    isGenerating,
    sendMessage,
    stopGeneration,
    loadMessages,
    attachments,
    handleAttach,
    removeAttachment
  };
}
