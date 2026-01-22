import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DepartmentChat, DepartmentChatMessage, AgentMention, DepartmentChatAttachment } from "@/types/departmentChat";
import { Attachment } from "@/types/chat";
import type { Json } from "@/integrations/supabase/types";

export function useDepartmentChat(userId: string | undefined, departmentId: string | undefined) {
  const [chat, setChat] = useState<DepartmentChat | null>(null);
  const [messages, setMessages] = useState<DepartmentChatMessage[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentMention[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch the department chat
  const fetchDepartmentChat = useCallback(async () => {
    if (!departmentId) return;

    try {
      const { data, error } = await supabase
        .from('department_chats')
        .select('*')
        .eq('department_id', departmentId)
        .eq('is_active', true)
        .single();

      if (error) {
        // Create chat if doesn't exist
        if (error.code === 'PGRST116') {
          const { data: newChat, error: createError } = await supabase
            .from('department_chats')
            .insert({ department_id: departmentId, title: 'Чат отдела' })
            .select()
            .single();

          if (createError) throw createError;
          setChat(newChat);
          return;
        }
        throw error;
      }

      setChat(data);
    } catch (error) {
      console.error('Error fetching department chat:', error);
    }
  }, [departmentId]);

  // Fetch available agents for this department
  const fetchAvailableAgents = useCallback(async () => {
    if (!departmentId) return;

    try {
      const { data, error } = await supabase
        .from('chat_roles')
        .select('id, name, mention_trigger, slug')
        .eq('is_active', true);

      if (error) throw error;

      // Filter agents that are available for this department
      const agents = (data || []).filter(role => {
        // If no department_ids, available to all
        return true; // We'll filter by department on the server side via RLS
      }).map(role => ({
        id: role.id,
        name: role.name,
        mention_trigger: role.mention_trigger || `@${role.slug}`,
        slug: role.slug
      }));

      setAvailableAgents(agents);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  }, [departmentId]);

  // Load messages for the chat
  const loadMessages = useCallback(async () => {
    if (!chat?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('department_chat_messages')
        .select('*')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      // Cast to proper type
      const typedMessages: DepartmentChatMessage[] = (data || []).map(m => ({
        ...m,
        message_role: m.message_role as 'user' | 'assistant',
        metadata: m.metadata as DepartmentChatMessage['metadata']
      }));

      setMessages(typedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [chat?.id]);

  // Parse @mention from message
  const parseMention = useCallback((text: string): { agentId: string | null; cleanText: string } => {
    // Match @trigger or @slug at the start of message
    const mentionRegex = /^@(\S+)\s*/;
    const match = text.match(mentionRegex);

    if (!match) {
      return { agentId: null, cleanText: text };
    }

    const trigger = match[1].toLowerCase();
    const agent = availableAgents.find(a => 
      a.slug.toLowerCase() === trigger ||
      (a.mention_trigger && a.mention_trigger.replace('@', '').toLowerCase() === trigger)
    );

    if (agent) {
      return { 
        agentId: agent.id, 
        cleanText: text.replace(mentionRegex, '').trim() 
      };
    }

    return { agentId: null, cleanText: text };
  }, [availableAgents]);

  // Get user name from profiles
  const getUserName = useCallback(async (userId: string): Promise<string> => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', userId)
        .single();

      return data?.full_name || data?.email || 'Пользователь';
    } catch {
      return 'Пользователь';
    }
  }, []);

  // Handle file attachments
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

    // Upload each file
    for (const attachment of newAttachments) {
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
    }
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
    attachments.forEach(a => {
      if (a.preview_url) URL.revokeObjectURL(a.preview_url);
    });
    setAttachments([]);
  }, [attachments]);

  // Send message with optional agent mention
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

    setMessages(prev => [...prev, userMessage]);
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
        metadata: userMsgMetadata as unknown as Json
      }]);

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
      toast.error('Ошибка сохранения сообщения');
      return;
    }

    // Create streaming assistant message
    const assistantMessage: DepartmentChatMessage = {
      id: crypto.randomUUID(),
      chat_id: chat.id,
      user_id: userId,
      role_id: agentId,
      message_role: 'assistant',
      content: '',
      metadata: { agent_name: agent?.name },
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsGenerating(true);

    // Prepare message history for context (last 20 messages)
    const historyForContext = messages.slice(-20).map(m => ({
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

      // Add attachments to request if present
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
      let fullContent = '';
      let metadata: any = {};
      let buffer = ''; // Buffer for incomplete SSE chunks

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]' || !data) continue;

            try {
              const parsed = JSON.parse(data);
              // Handle content chunks
              if (parsed.type === 'content' && parsed.content) {
                fullContent += parsed.content;
                setMessages(prev => prev.map(m =>
                  m.id === assistantMessage.id
                    ? { ...m, content: fullContent }
                    : m
                ));
              }
              // Handle metadata (citations, rag_context, etc.)
              if (parsed.type === 'metadata') {
                metadata = {
                  response_time_ms: parsed.response_time_ms,
                  rag_context: parsed.rag_context,
                  citations: parsed.citations,
                  perplexity_citations: parsed.perplexity_citations,
                  smart_search: parsed.smart_search,
                };
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
      
      // Process any remaining data in buffer
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content' && parsed.content) {
              fullContent += parsed.content;
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
          content: fullContent,
          metadata: assistantMsgMetadata as unknown as Json
        }]);

      // Update the message in state with final content
      setMessages(prev => prev.map(m =>
        m.id === assistantMessage.id
          ? { ...m, content: fullContent, metadata: { ...m.metadata, ...metadata } }
          : m
      ));

    } catch (error: any) {
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
  }, [chat?.id, userId, parseMention, availableAgents, messages, getUserName, clearAttachments]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (departmentId) {
      fetchDepartmentChat();
      fetchAvailableAgents();
    }
  }, [departmentId, fetchDepartmentChat, fetchAvailableAgents]);

  // Load messages when chat is available
  useEffect(() => {
    if (chat?.id) {
      loadMessages();
    }
  }, [chat?.id, loadMessages]);

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
