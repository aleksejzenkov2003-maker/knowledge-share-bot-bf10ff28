import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DepartmentChat, DepartmentChatMessage, AgentMention } from "@/types/departmentChat";

export function useDepartmentChat(userId: string | undefined, departmentId: string | undefined) {
  const [chat, setChat] = useState<DepartmentChat | null>(null);
  const [messages, setMessages] = useState<DepartmentChatMessage[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentMention[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
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

  // Send message with optional agent mention
  const sendMessage = useCallback(async (text: string) => {
    if (!chat?.id || !userId || !text.trim()) return;

    const { agentId, cleanText } = parseMention(text);

    if (!agentId) {
      toast.error('Укажите агента через @упоминание, например: @юрист ваш вопрос');
      return;
    }

    const agent = availableAgents.find(a => a.id === agentId);
    const userName = await getUserName(userId);

    // Add user message to UI immediately
    const userMessage: DepartmentChatMessage = {
      id: crypto.randomUUID(),
      chat_id: chat.id,
      user_id: userId,
      role_id: null,
      message_role: 'user',
      content: text,
      metadata: { user_name: userName },
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);

    // Save user message to DB
    const { data: savedUserMsg, error: userMsgError } = await supabase
      .from('department_chat_messages')
      .insert({
        chat_id: chat.id,
        user_id: userId,
        role_id: null,
        message_role: 'user',
        content: text,
        metadata: { user_name: userName }
      })
      .select()
      .single();

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

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            message: cleanText,
            role_id: agentId,
            message_history: historyForContext,
            is_department_chat: true
          }),
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setMessages(prev => prev.map(m =>
                  m.id === assistantMessage.id
                    ? { ...m, content: fullContent }
                    : m
                ));
              }
              if (parsed.metadata) {
                metadata = parsed.metadata;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Save assistant message to DB
      await supabase
        .from('department_chat_messages')
        .insert({
          chat_id: chat.id,
          user_id: userId,
          role_id: agentId,
          message_role: 'assistant',
          content: fullContent,
          metadata: {
            ...metadata,
            agent_name: agent?.name
          }
        });

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
  }, [chat?.id, userId, parseMention, availableAgents, messages, getUserName]);

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
    loadMessages
  };
}
