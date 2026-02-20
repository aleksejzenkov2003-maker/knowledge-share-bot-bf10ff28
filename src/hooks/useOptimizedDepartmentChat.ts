import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DepartmentChat, DepartmentChatMessage, AgentMention, DepartmentChatAttachment } from "@/types/departmentChat";
import { Attachment } from "@/types/chat";
import { KnowledgeBaseDocument } from "@/types/knowledgeBase";
import type { Json } from "@/integrations/supabase/types";
import {
  useDepartmentChatsQuery,
  useDepartmentMessagesQuery,
  useDepartmentAgentsQuery,
  useDepartmentChatAgentsQuery,
  useCreateDepartmentChat,
  useUpdateDepartmentChat,
  useDeleteDepartmentChat,
  usePinDepartmentChat,
  departmentChatQueryKeys,
} from "@/hooks/queries/useDepartmentChatQueries";

// Throttle interval for streaming updates (ms)
const STREAM_UPDATE_INTERVAL = 50;

export function useOptimizedDepartmentChat(userId: string | undefined, departmentId: string | undefined) {
  const queryClient = useQueryClient();
  
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<DepartmentChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedKnowledgeDocs, setSelectedKnowledgeDocs] = useState<KnowledgeBaseDocument[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<DepartmentChatMessage | null>(null);
  
  // Streaming optimization refs
  const streamingContentRef = useRef<string>("");
  const updateIntervalRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Ref-based mutex to prevent double sends
  const sendingRef = useRef(false);

  // React Query hooks
  const { data: departmentChats = [], isLoading: isLoadingChats } = useDepartmentChatsQuery(departmentId);
  const { data: availableAgents = [] } = useDepartmentAgentsQuery(departmentId);
  
  // Get chat IDs for agents query
  const chatIds = departmentChats.map(c => c.id);
  const { data: chatAgentsMap = new Map() } = useDepartmentChatAgentsQuery(chatIds);
  
  // Messages for active chat
  const { data: dbMessages, isLoading: isLoadingMessages } = useDepartmentMessagesQuery(activeChatId);

  // Mutations
  const createChatMutation = useCreateDepartmentChat(departmentId);
  const updateChatMutation = useUpdateDepartmentChat(departmentId);
  const deleteChatMutation = useDeleteDepartmentChat(departmentId);
  const pinChatMutation = usePinDepartmentChat(departmentId);

  // Auto-select the most recent chat or create one
  useEffect(() => {
    if (!departmentId || isLoadingChats) return;
    
    if (departmentChats.length > 0 && !activeChatId) {
      // Select the most recent chat
      setActiveChatId(departmentChats[0].id);
    } else if (departmentChats.length === 0 && !isLoadingChats && departmentId) {
      // Create first chat for department
      createChatMutation.mutate({ title: 'Чат отдела' }, {
        onSuccess: (newChat) => {
          setActiveChatId(newChat.id);
        }
      });
    }
  }, [departmentChats, departmentId, isLoadingChats, activeChatId]);

  // Get active chat object
  const chat = departmentChats.find(c => c.id === activeChatId) || null;

  // Sync messages when not generating
  const messages = isGenerating ? localMessages : (dbMessages || localMessages);

  // Sync local messages when dbMessages change
  useEffect(() => {
    if (dbMessages && !isGenerating) {
      setLocalMessages(dbMessages);
    }
  }, [dbMessages, isGenerating]);

  // Chat management functions
  const createNewChat = useCallback(async () => {
    if (!departmentId) return;
    
    createChatMutation.mutate({ title: 'Новый чат' }, {
      onSuccess: (newChat) => {
        setActiveChatId(newChat.id);
        setLocalMessages([]);
      }
    });
  }, [departmentId, createChatMutation]);

  const selectChat = useCallback((chatOrId: DepartmentChat | string) => {
    const id = typeof chatOrId === 'string' ? chatOrId : chatOrId.id;
    setActiveChatId(id);
    setLocalMessages([]);
  }, []);

  const renameChat = useCallback((id: string, newTitle: string) => {
    updateChatMutation.mutate({ id, title: newTitle });
  }, [updateChatMutation]);

  const deleteChat = useCallback((id: string) => {
    deleteChatMutation.mutate(id, {
      onSuccess: () => {
        if (activeChatId === id) {
          // Select another chat or create new
          const remaining = departmentChats.filter(c => c.id !== id);
          if (remaining.length > 0) {
            setActiveChatId(remaining[0].id);
          } else {
            setActiveChatId(null);
          }
        }
      }
    });
  }, [deleteChatMutation, activeChatId, departmentChats]);

  const pinChat = useCallback((id: string, isPinned: boolean) => {
    pinChatMutation.mutate({ id, isPinned });
  }, [pinChatMutation]);

  // Parse @mention from message
  const parseMention = useCallback((text: string): { agentId: string | null; cleanText: string } => {
    if (!text.startsWith('@')) {
      return { agentId: null, cleanText: text };
    }

    const textLower = text.toLowerCase();

    // Sort agents by trigger length (longest first)
    const sortedAgents = [...availableAgents].sort((a, b) => {
      const aLen = (a.mention_trigger || `@${a.slug}`).length;
      const bLen = (b.mention_trigger || `@${b.slug}`).length;
      return bLen - aLen;
    });

    for (const agent of sortedAgents) {
      const triggers = [
        agent.mention_trigger?.toLowerCase().trim(),
        `@${agent.slug}`.toLowerCase(),
        `@${agent.name.toLowerCase().trim()}`
      ].filter((t): t is string => Boolean(t));

      for (const trigger of triggers) {
        const normalizedTrigger = trigger.startsWith('@') ? trigger : `@${trigger}`;
        
        if (textLower.startsWith(normalizedTrigger) && 
            (textLower.length === normalizedTrigger.length || textLower[normalizedTrigger.length] === ' ')) {
          const cleanText = text.slice(normalizedTrigger.length).trim();
          return { agentId: agent.id, cleanText };
        }
      }
    }

    return { agentId: null, cleanText: text };
  }, [availableAgents]);

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
      status: 'pending' as const,
      addToKnowledgeBase: true // Default to adding to knowledge base
    }));

    setAttachments(prev => [...prev, ...newAttachments]);

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
            ? { ...a, status: 'uploaded' as const, file_path: fileName, addToKnowledgeBase: a.addToKnowledgeBase ?? true } 
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

  const toggleAttachmentKnowledgeBase = useCallback((id: string, value: boolean) => {
    setAttachments(prev => prev.map(a => 
      a.id === id ? { ...a, addToKnowledgeBase: value } : a
    ));
  }, []);

  const toggleAttachmentPii = useCallback((id: string, value: boolean) => {
    setAttachments(prev => prev.map(a => 
      a.id === id ? { ...a, containsPii: value } : a
    ));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments(prev => {
      prev.forEach(a => {
        if (a.preview_url) URL.revokeObjectURL(a.preview_url);
      });
      return [];
    });
  }, []);

  // Get user name
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
  const sendMessage = useCallback(async (text: string, messageAttachments?: Attachment[], knowledgeDocs?: KnowledgeBaseDocument[], replyTo?: DepartmentChatMessage | null) => {
    if (!activeChatId || !userId) return;
    
    const hasAttachments = messageAttachments && messageAttachments.length > 0;
    const hasKnowledgeDocs = knowledgeDocs && knowledgeDocs.length > 0;
    if (!text.trim() && !hasAttachments && !hasKnowledgeDocs) return;
    if (isGenerating) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    const { agentId, cleanText } = parseMention(text);

    const agent = agentId ? availableAgents.find(a => a.id === agentId) : null;
    const userName = await getUserName(userId);

    // Combine new attachments + knowledge base docs
    const attachmentsMetadata: DepartmentChatAttachment[] = [
      ...(hasAttachments
        ? messageAttachments.filter(a => a.status === 'uploaded' && a.file_path).map(a => ({
            file_path: a.file_path!,
            file_name: a.file_name,
            file_type: a.file_type,
            file_size: a.file_size
          }))
        : []),
      ...(hasKnowledgeDocs
        ? knowledgeDocs.map(d => ({
            file_path: d.file_path,
            file_name: d.file_name,
            file_type: d.file_type,
            file_size: d.file_size
          }))
        : [])
    ];

    const userMessage: DepartmentChatMessage = {
      id: crypto.randomUUID(),
      chat_id: activeChatId,
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

    const userMsgMetadata = { 
      user_name: userName,
      attachments: attachmentsMetadata.length > 0 ? attachmentsMetadata : undefined
    };
    const { data: insertedMsg, error: userMsgError } = await supabase
      .from('department_chat_messages')
      .insert([{
        chat_id: activeChatId,
        user_id: userId,
        role_id: null,
        message_role: 'user',
        content: text,
        source: 'web' as const,
        metadata: userMsgMetadata as unknown as Json,
        reply_to_message_id: replyTo?.id || null
      }])
      .select('id')
      .single();

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
      toast.error('Ошибка сохранения сообщения');
      return;
    }

    // Save NEW attachments (not from knowledge base) to the knowledge base for future reuse
    // Only save attachments where user explicitly opted in (addToKnowledgeBase === true)
    if (hasAttachments && departmentId && insertedMsg) {
      const newAttachmentsToSave = messageAttachments.filter(
        a => a.status === 'uploaded' && a.file_path && a.addToKnowledgeBase !== false
      );
      for (const att of newAttachmentsToSave) {
        const { error: kbError } = await supabase.from('chat_knowledge_base').upsert({
          department_id: departmentId,
          source_message_id: insertedMsg.id,
          file_path: att.file_path!,
          file_name: att.file_name,
          file_type: att.file_type,
          file_size: att.file_size,
          created_by: userId,
        }, { 
          onConflict: 'file_path',
          ignoreDuplicates: true 
        });
        if (kbError) {
          console.error('Error saving to knowledge base:', kbError);
        }
      }
    }

    // Update chat's updated_at
    await supabase
      .from('department_chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', activeChatId);

    // Auto-title on first message (for ALL messages, regardless of agent mention)
    if (localMessages.length === 0) {
      const titleText = cleanText || text;
      const title = titleText.slice(0, 50) + (titleText.length > 50 ? '...' : '');
      await supabase
        .from('department_chats')
        .update({ title })
        .eq('id', activeChatId);
    }

    // If no agent mentioned, just save the user message (no AI call)
    if (!agentId) {
      queryClient.invalidateQueries({ queryKey: departmentChatQueryKeys.messages(activeChatId) });
      queryClient.invalidateQueries({ queryKey: departmentChatQueryKeys.chats(departmentId!) });
      sendingRef.current = false;
      return;
    }

    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: DepartmentChatMessage = {
      id: assistantMessageId,
      chat_id: activeChatId,
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

    // Формируем историю сообщений с attachments для персистентного контекста документов
    const historyForContext = localMessages.slice(-20).map(m => ({
      role: m.message_role,
      content: m.content,
      agent_name: m.metadata?.agent_name,
      attachments: m.metadata?.attachments?.map(a => ({
        file_path: a.file_path,
        file_name: a.file_name,
        file_type: a.file_type,
        file_size: a.file_size,
      })) || [],
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
        // Find original attachment objects to get containsPii flag
        const currentAttachments = messageAttachments || [];
        requestBody.attachments = attachmentsMetadata.map(a => {
          const original = currentAttachments.find(att => att.file_path === a.file_path);
          return {
            file_path: a.file_path,
            file_name: a.file_name,
            file_type: a.file_type,
            file_size: a.file_size,
            contains_pii: original?.containsPii || false,
          };
        });
      }

      // Add reply-to context if present
      if (replyTo) {
        requestBody.reply_to = {
          content: replyTo.content,
          author_name: replyTo.message_role === 'assistant' 
            ? replyTo.metadata?.agent_name 
            : replyTo.metadata?.user_name,
          message_role: replyTo.message_role
        };
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
                  web_search_citations: parsed.web_search_citations,
                  web_search_used: parsed.web_search_used,
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
                web_search_citations: parsed.web_search_citations,
                web_search_used: parsed.web_search_used,
                smart_search: parsed.smart_search,
              };
            }
          } catch {
            // Ignore
          }
        }
      }

      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }

      const finalContent = streamingContentRef.current;

      const assistantMsgMetadata = {
        ...metadata,
        agent_name: agent?.name
      };
      await supabase
        .from('department_chat_messages')
        .insert([{
          chat_id: activeChatId,
          user_id: userId,
          role_id: agentId,
          message_role: 'assistant',
          content: finalContent,
          source: 'web' as const,
          metadata: assistantMsgMetadata as unknown as Json
        }]);

      setLocalMessages(prev => prev.map(m =>
        m.id === assistantMessageId
          ? { ...m, content: finalContent, metadata: { ...m.metadata, ...metadata } }
          : m
      ));

      queryClient.invalidateQueries({ queryKey: departmentChatQueryKeys.messages(activeChatId) });
      queryClient.invalidateQueries({ queryKey: departmentChatQueryKeys.chats(departmentId!) });

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
      sendingRef.current = false;
    }
  }, [activeChatId, userId, parseMention, availableAgents, localMessages, getUserName, clearAttachments, queryClient, departmentId]);

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

  // Regenerate response - sends a new message with different agent, keeping history
  const regenerateResponse = useCallback(async (messageId: string, roleId?: string) => {
    try {
      const messageIndex = localMessages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) {
        toast.error('Сообщение не найдено');
        return;
      }
      
      const targetMessage = localMessages[messageIndex];
      
      if (targetMessage.message_role !== 'assistant') {
        toast.error('Можно обновить только ответ ассистента');
        return;
      }

      // Find the original user message that triggered this response
      const prevUserMessage = localMessages.slice(0, messageIndex).reverse()
        .find(m => m.message_role === 'user');
      
      if (!prevUserMessage) {
        toast.error('Не найден исходный вопрос');
        return;
      }
      
      // Extract the clean content without the old mention
      let originalContent = prevUserMessage.content;
      const mentionMatch = originalContent.match(/^@[^\s]+\s*/);
      if (mentionMatch) {
        originalContent = originalContent.slice(mentionMatch[0].length);
      }
      
      // Also try to extract content after multi-word mentions like "@ТЗ консультант"
      for (const agent of availableAgents) {
        const triggers = [
          agent.mention_trigger,
          `@${agent.slug}`,
          `@${agent.name}`
        ].filter(Boolean);
        
        for (const trigger of triggers) {
          const normalizedTrigger = trigger!.startsWith('@') ? trigger! : `@${trigger}`;
          if (originalContent.toLowerCase().startsWith(normalizedTrigger.toLowerCase())) {
            originalContent = originalContent.slice(normalizedTrigger.length).trim();
            break;
          }
        }
      }

      const originalAttachments = prevUserMessage.metadata?.attachments;
      
      // Get the agent to use
      const agentToUse = roleId || targetMessage.role_id;
      const agent = availableAgents.find(a => a.id === agentToUse);
      
      if (!agent) {
        toast.error('Агент не найден');
        return;
      }

      const trigger = agent.mention_trigger || agent.slug;
      const mentionPrefix = trigger.startsWith('@') ? `${trigger} ` : `@${trigger} `;
      toast.info(`Запрос к ${agent.name}...`);
      
      // Prepare attachments for resending (if any)
      const attachmentsForResend = originalAttachments?.map(a => ({
        id: crypto.randomUUID(),
        file_path: a.file_path,
        file_name: a.file_name,
        file_type: a.file_type,
        file_size: a.file_size,
        status: 'uploaded' as const
      }));
      
      // Send as a NEW message, keeping the old response in history
      await sendMessage(mentionPrefix + originalContent, attachmentsForResend);
      
    } catch (error) {
      console.error('Regenerate error:', error);
      toast.error('Не удалось отправить запрос');
    }
  }, [localMessages, availableAgents, sendMessage]);

  // Retry user message (delete everything after it and resend)
  const retryMessage = useCallback(async (messageId: string) => {
    const messageIndex = localMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    const userMessage = localMessages[messageIndex];
    if (userMessage.message_role !== 'user') return;
    
    // Keep only messages before this one
    const messagesToKeep = localMessages.slice(0, messageIndex);
    setLocalMessages(messagesToKeep);
    
    // Resend the same message
    await sendMessage(userMessage.content);
  }, [localMessages, sendMessage]);

  const isLoading = isLoadingChats || isLoadingMessages;

  // Build messagesWithReplies map for efficient lookup
  const messagesMap = useMemo(() => {
    const map = new Map<string, DepartmentChatMessage>();
    messages.forEach(m => map.set(m.id, m));
    return map;
  }, [messages]);

  return {
    // Current chat
    chat,
    messages,
    messagesMap,
    availableAgents,
    isLoading,
    isGenerating,
    
    // Message operations
    sendMessage,
    stopGeneration,
    regenerateResponse,
    retryMessage,
    
    // Attachment operations
    attachments,
    handleAttach,
    removeAttachment,
    toggleAttachmentKnowledgeBase,
    toggleAttachmentPii,
    
    // Knowledge base
    selectedKnowledgeDocs,
    setSelectedKnowledgeDocs,
    
    // Reply-to
    replyToMessage,
    setReplyToMessage,
    
    // Multi-chat support
    departmentChats,
    activeChatId,
    chatAgentsMap,
    createNewChat,
    selectChat,
    renameChat,
    deleteChat,
    pinChat,
  };
}
