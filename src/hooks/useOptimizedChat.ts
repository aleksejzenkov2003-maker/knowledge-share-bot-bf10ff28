import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Message, Conversation, ChatRole, Attachment } from "@/types/chat";
import { 
  useRolesQuery, 
  useConversationsQuery, 
  useMessagesQuery,
  useCreateConversation,
  useUpdateConversation,
  useDeleteConversation,
  usePinConversation,
  chatQueryKeys
} from "./queries/useChatQueries";
import { useQueryClient } from "@tanstack/react-query";

// Sanitize filename for storage
const sanitizeFileName = (name: string): string => {
  const cyrillicToLatin: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
    'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
    'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '',
    'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
  };
  
  let result = name.split('').map(char => cyrillicToLatin[char] || char).join('');
  result = result.replace(/[^a-zA-Z0-9._-]/g, '_');
  result = result.replace(/_+/g, '_');
  result = result.replace(/^_+|_+$/g, '');
  
  return result || 'file';
};

// Throttle interval for streaming updates (ms)
const STREAM_UPDATE_INTERVAL = 50;

export function useOptimizedChat(userId: string | undefined, departmentId: string | null) {
  const queryClient = useQueryClient();
  
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  
  // Streaming optimization refs
  const streamingContentRef = useRef<string>("");
  const updateIntervalRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // React Query hooks
  const { data: roles = [], isLoading: rolesLoading } = useRolesQuery(userId, departmentId);
  const { data: conversations = [], isLoading: conversationsLoading } = useConversationsQuery(userId);
  const { data: dbMessages } = useMessagesQuery(activeConversationId);

  // Mutations
  const createConversationMutation = useCreateConversation(userId);
  const updateConversationMutation = useUpdateConversation(userId);
  const deleteConversationMutation = useDeleteConversation(userId);
  const pinConversationMutation = usePinConversation(userId);

  // Sync dbMessages to localMessages when not streaming
  const messages = isLoading ? localMessages : (dbMessages || localMessages);

  // Set initial role when roles load - use useEffect to avoid render-loop
  useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  // Attachment management
  const addAttachments = useCallback((files: File[]) => {
    const newAttachments: Attachment[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      status: 'pending' as const,
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id);
      if (attachment?.preview_url) {
        URL.revokeObjectURL(attachment.preview_url);
      }
      return prev.filter(a => a.id !== id);
    });
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

  // Upload all attachments in parallel
  const uploadAttachments = useCallback(async (
    attachmentsToUpload: Attachment[], 
    conversationId: string
  ): Promise<{ file_path: string; file_name: string; file_type: string; file_size: number }[]> => {
    if (!userId || attachmentsToUpload.length === 0) return [];

    const uploadPromises = attachmentsToUpload.map(async (attachment) => {
      if (!attachment.file) return null;
      
      const sanitizedName = sanitizeFileName(attachment.file_name);
      const filePath = `${userId}/${conversationId}/${Date.now()}_${sanitizedName}`;
      
      setAttachments(prev => prev.map(a => 
        a.id === attachment.id ? { ...a, status: 'uploading' as const } : a
      ));
      
      try {
        const { error } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, attachment.file);
          
        if (error) throw error;
        
        setAttachments(prev => prev.map(a => 
          a.id === attachment.id ? { ...a, status: 'uploaded' as const, file_path: filePath } : a
        ));
        
        return {
          file_path: filePath,
          file_name: attachment.file_name,
          file_type: attachment.file_type,
          file_size: attachment.file_size,
        };
      } catch (error) {
        console.error('Error uploading file:', error);
        setAttachments(prev => prev.map(a => 
          a.id === attachment.id ? { ...a, status: 'error' as const } : a
        ));
        toast.error(`Ошибка загрузки ${attachment.file_name}`);
        return null;
      }
    });

    const results = await Promise.all(uploadPromises);
    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  }, [userId]);

  const saveMessage = useCallback(async (
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    metadata?: { 
      response_time_ms?: number; 
      rag_context?: string[]; 
      semantic_search?: boolean;
      citations?: { index: number; document: string; section?: string; article?: string; relevance: number }[];
      smart_search?: boolean;
      attachments?: { file_path: string; file_name: string; file_type: string; file_size: number }[];
      role_id?: string;
      web_search_citations?: string[];
      web_search_used?: boolean;
    }
  ) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role,
          content,
          metadata: metadata || {},
        })
        .select()
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error("Error saving message:", error);
      return null;
    }
  }, []);

  // Ref-based mutex to prevent double sends (race condition between Enter and onClick)
  const sendingRef = useRef(false);

  const sendMessage = useCallback(async (
    inputValue: string,
    isProjectMode: boolean,
    overrideRoleId?: string
  ) => {
    const trimmedInput = inputValue.trim();
    const hasAttachments = attachments.length > 0;
    
    if (!trimmedInput && !hasAttachments) return;
    if (isLoading) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    let conversationId = activeConversationId;
    
    // Create new conversation if needed
    if (!conversationId) {
      try {
        const newConv = await createConversationMutation.mutateAsync({ roleId: selectedRoleId || undefined });
        conversationId = newConv.id;
        setActiveConversationId(conversationId);
      } catch (error) {
        toast.error("Ошибка создания диалога");
        return;
      }
    }

    // Upload attachments in parallel
    const uploadedAttachments = await uploadAttachments(attachments, conversationId);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
      attachments: attachments.map(a => ({
        ...a,
        status: 'uploaded' as const,
      })),
    };

    // Track if first message
    const isFirstMessage = messages.length === 0;
    
    // Optimistic update
    setLocalMessages([...messages, userMessage]);
    setIsLoading(true);
    clearAttachments();

    // Save user message
    await saveMessage(conversationId, "user", trimmedInput, {
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
    });

    // Update title if first message
    if (isFirstMessage) {
      const title = trimmedInput.slice(0, 50) + (trimmedInput.length > 50 ? "..." : "");
      updateConversationMutation.mutate({ id: conversationId, title });
    }

    // Create streaming assistant message
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantMessageId,
      conversation_id: conversationId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };
    setLocalMessages(prev => [...prev, assistantMessage]);
    streamingContentRef.current = "";

    try {
      // ВСЕГДА передаём историю сообщений для поддержания контекста
      // Включаем attachments из каждого сообщения для персистентного контекста документов
      const messageHistory = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments?.filter(a => a.status === 'uploaded' && a.file_path).map(a => ({
          file_path: a.file_path!,
          file_name: a.file_name,
          file_type: a.file_type,
          file_size: a.file_size,
        })) || [],
      }));

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      abortControllerRef.current = new AbortController();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: trimmedInput,
            role_id: overrideRoleId || selectedRoleId || undefined,
            conversation_id: conversationId,
            message_history: messageHistory,
            attachments: uploadedAttachments.length > 0 ? uploadedAttachments.map((ua, i) => ({
              ...ua,
              contains_pii: attachments[i]?.containsPii || false,
            })) : undefined,
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let metadata: { 
        response_time_ms?: number; 
        rag_context?: string[]; 
        citations?: { index: number; document: string; section?: string; article?: string; relevance: number }[];
        smart_search?: boolean;
        web_search_citations?: string[];
        web_search_used?: boolean;
        stop_reason?: string;
      } = {};

      if (reader) {
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
                
                if (parsed.type === 'content') {
                  streamingContentRef.current += parsed.content;
                } else if (parsed.type === 'metadata') {
                  metadata = {
                    response_time_ms: parsed.response_time_ms,
                    rag_context: parsed.rag_context,
                    citations: parsed.citations,
                    smart_search: parsed.smart_search,
                    web_search_citations: parsed.perplexity_citations || parsed.web_search_citations,
                    web_search_used: parsed.web_search_used,
                    stop_reason: parsed.stop_reason,
                  };
                }
              } catch {
                // Ignore parsing errors
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
              if (parsed.type === 'content') {
                streamingContentRef.current += parsed.content;
              } else if (parsed.type === 'metadata') {
                  metadata = {
                    response_time_ms: parsed.response_time_ms,
                    rag_context: parsed.rag_context,
                    citations: parsed.citations,
                    smart_search: parsed.smart_search,
                    web_search_citations: parsed.perplexity_citations || parsed.web_search_citations,
                    web_search_used: parsed.web_search_used,
                    stop_reason: parsed.stop_reason,
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
      }

      const finalContent = streamingContentRef.current || "Нет ответа";
      
      // Final message update
      setLocalMessages(prev => prev.map(m =>
        m.id === assistantMessageId
          ? {
              ...m,
              content: finalContent,
              isStreaming: false,
              responseTime: metadata.response_time_ms,
              ragContext: metadata.rag_context,
              citations: metadata.citations,
              smartSearch: metadata.smart_search,
              webSearchCitations: metadata.web_search_citations,
              webSearchUsed: metadata.web_search_used,
              stopReason: metadata.stop_reason,
            }
          : m
      ));

      await saveMessage(conversationId, "assistant", finalContent, {
        ...metadata,
        role_id: selectedRoleId || undefined,
      });

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      // Invalidate queries to sync
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(conversationId) });

    } catch (error: any) {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      
      // Handle abort - save partial content
      if (error.name === 'AbortError') {
        console.log('Request aborted, saving partial content');
        const partialContent = streamingContentRef.current;
        
        if (partialContent && partialContent.trim()) {
          const stoppedContent = partialContent + "\n\n_[Генерация остановлена]_";
          
          // Update local state
          setLocalMessages(prev => prev.map(m =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: stoppedContent,
                  isStreaming: false,
                }
              : m
          ));
          
          // Save to database
          await saveMessage(conversationId, "assistant", stoppedContent, {
            role_id: selectedRoleId || undefined,
          });
          
          // Update conversation timestamp
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversationId);
          
          // Invalidate queries to sync
          queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(conversationId) });
        }
        return;
      }
      
      console.error("Error sending message:", error);
      toast.error(error.message || "Ошибка отправки сообщения");
      
      setLocalMessages(prev => prev.map(m =>
        m.id === assistantMessageId
          ? {
              ...m,
              content: `Ошибка: ${error.message || "Не удалось получить ответ"}`,
              isStreaming: false,
            }
          : m
      ));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      sendingRef.current = false;
    }
  }, [
    activeConversationId,
    attachments,
    createConversationMutation,
    isLoading,
    messages,
    queryClient,
    saveMessage,
    selectedRoleId,
    updateConversationMutation,
    uploadAttachments,
    clearAttachments,
  ]);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setLocalMessages([]);
  }, []);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setActiveConversationId(conversation.id);
    if (conversation.role_id) {
      setSelectedRoleId(conversation.role_id);
    }
  }, []);

  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      await deleteConversationMutation.mutateAsync(conversationId);
      
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setLocalMessages([]);
      }
      
      toast.success("Диалог удален");
    } catch (error) {
      console.error("Error deleting conversation:", error);
      toast.error("Ошибка удаления диалога");
    }
  }, [activeConversationId, deleteConversationMutation]);

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    try {
      updateConversationMutation.mutate({ id: conversationId, title });
    } catch (error) {
      console.error("Error renaming conversation:", error);
      toast.error("Ошибка переименования");
    }
  }, [updateConversationMutation]);

  const pinConversation = useCallback(async (conversationId: string, isPinned: boolean) => {
    try {
      pinConversationMutation.mutate({ id: conversationId, isPinned });
      toast.success(isPinned ? "Чат закреплён" : "Чат откреплён");
    } catch (error) {
      console.error("Error pinning conversation:", error);
      toast.error("Ошибка закрепления");
    }
  }, [pinConversationMutation]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
    
    // Preserve accumulated content instead of clearing it
    const currentContent = streamingContentRef.current;
    if (currentContent) {
      setLocalMessages(prev => prev.map(m =>
        m.isStreaming
          ? { 
              ...m, 
              content: currentContent + "\n\n_[Генерация остановлена]_", 
              isStreaming: false 
            }
          : m
      ));
    }
    
    setIsLoading(false);
  }, []);

  // Редактирование сообщения пользователя (удаляет последующие сообщения и отправляет новое)
  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    // Удаляем текущее сообщение и все последующие
    const messagesToKeep = messages.slice(0, messageIndex);
    setLocalMessages(messagesToKeep);
    
    // Отправляем новое сообщение
    sendMessage(newContent, selectedRoleId ? roles.find(r => r.id === selectedRoleId)?.is_project_mode || false : false, undefined);
  }, [messages, sendMessage, selectedRoleId, roles]);

  // Регенерация ответа ассистента (повторяет последний вопрос, опционально с другой ролью)
  const regenerateResponse = useCallback(async (messageId: string, newRoleId?: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    // Находим предыдущее сообщение пользователя
    let lastUserMessageIndex = messageIndex - 1;
    while (lastUserMessageIndex >= 0 && messages[lastUserMessageIndex].role !== "user") {
      lastUserMessageIndex--;
    }
    
    if (lastUserMessageIndex < 0) return;
    
    const userMessage = messages[lastUserMessageIndex];
    
    // Если указана новая роль, меняем текущую
    const roleIdToUse = newRoleId || selectedRoleId;
    if (newRoleId && newRoleId !== selectedRoleId) {
      setSelectedRoleId(newRoleId);
    }
    
    // Удаляем ответ ассистента
    const messagesToKeep = messages.slice(0, messageIndex);
    setLocalMessages(messagesToKeep);
    
    // Повторно отправляем вопрос с выбранной ролью, передавая roleId напрямую
    const isProjectMode = roleIdToUse ? roles.find(r => r.id === roleIdToUse)?.is_project_mode || false : false;
    sendMessage(userMessage.content, isProjectMode, roleIdToUse || undefined);
  }, [messages, sendMessage, selectedRoleId, roles, setSelectedRoleId]);

  // Needed for backward compatibility - no-op since we use React Query
  const fetchRoles = useCallback(() => {}, []);
  const fetchConversations = useCallback(() => {}, []);
  const loadConversationMessages = useCallback((_id: string) => {}, []);

  return {
    roles,
    selectedRoleId,
    setSelectedRoleId,
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    isLoading,
    rolesLoading,
    conversationsLoading,
    fetchRoles,
    fetchConversations,
    loadConversationMessages,
    sendMessage,
    handleNewChat,
    handleSelectConversation,
    deleteConversation,
    renameConversation,
    pinConversation,
    stopGeneration,
    editMessage,
    regenerateResponse,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    toggleAttachmentPii,
  };
}
