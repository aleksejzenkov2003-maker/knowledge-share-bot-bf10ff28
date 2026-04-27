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

  // Sync dbMessages → localMessages when not streaming, so we can fall back
  // to localMessages if dbMessages refetch lags after a long Perplexity stream.
  useEffect(() => {
    if (dbMessages && !isLoading) {
      setLocalMessages(dbMessages);
    }
  }, [dbMessages, isLoading]);

  // Prefer localMessages while loading; otherwise use the freshest of the two
  // (whichever has more messages — protects against stale dbMessages right
  // after a long-running stream completes).
  const messages = isLoading
    ? localMessages
    : ((dbMessages?.length ?? 0) >= localMessages.length
        ? (dbMessages || localMessages)
        : localMessages);

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
      interrupted?: boolean;
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

    // Hoisted so the catch block can use them for friendly error messages
    let isDeepResearch = false;
    let isPerplexityModel = false;

    try {
      // ВСЕГДА передаём историю сообщений для поддержания контекста
      // Включаем attachments из каждого сообщения для персистентного контекста документов
      const NOISE_MARKERS = [
        'Глубокое исследование недоступно',
        'Превышено время CPU',
        '[Генерация остановлена]',
        'Выполняется глубокое исследование',
      ];
      const isNoise = (c: string) => NOISE_MARKERS.some(m => c.includes(m));
      const fullHistory = [...messages, userMessage]
        .filter(m => m.content && !isNoise(m.content))
        .map(m => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments?.filter(a => a.status === 'uploaded' && a.file_path).map(a => ({
            file_path: a.file_path!,
            file_name: a.file_name,
            file_type: a.file_type,
            file_size: a.file_size,
          })) || [],
        }));

      let { data: sessionData } = await supabase.auth.getSession();
      let token = sessionData.session?.access_token;

      // Check if selected role uses deep-research model or any sonar (Perplexity) model
      const effectiveRoleId = overrideRoleId || selectedRoleId;
      isDeepResearch = false;
      isPerplexityModel = false;
      if (effectiveRoleId) {
        const { data: roleConfig } = await supabase
          .from('chat_roles')
          .select('model_config')
          .eq('id', effectiveRoleId)
          .single();
        const mc = roleConfig?.model_config as { model?: string } | null;
        isDeepResearch = mc?.model?.includes('deep-research') === true;
        isPerplexityModel = mc?.model?.includes('sonar') === true;
      }

      // Proactive token refresh for long-running requests (Perplexity / deep-research)
      // or when current token is close to expiry (< 10 min). This guarantees the JWT
      // survives the entire request + post-stream save operations.
      const expiresAt = sessionData.session?.expires_at ?? 0;
      const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
      if (isPerplexityModel || isDeepResearch || secondsLeft < 600) {
        try {
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed.session?.access_token) {
            token = refreshed.session.access_token;
            sessionData = { session: refreshed.session };
          }
        } catch (e) {
          console.warn('[useOptimizedChat] Token refresh failed, continuing with existing token', e);
        }
      }

      // For deep-research, send a compact history: last 4 turns max,
      // assistant entries trimmed to 1500 chars, no big prior reports.
      const messageHistory = isDeepResearch
        ? fullHistory.slice(-4).map(m => ({
            ...m,
            content: m.role === 'assistant' && m.content.length > 1500
              ? m.content.slice(0, 1500) + '…'
              : m.content,
          }))
        : fullHistory;

      const endpoint = isDeepResearch ? 'deep-research' : 'chat-stream';
      // Deep research can take up to 5 min; sonar-pro models up to 150s
      const clientTimeout = isDeepResearch ? 360000 : (isPerplexityModel ? 150000 : undefined);

      abortControllerRef.current = new AbortController();
      if (clientTimeout) {
        setTimeout(() => abortControllerRef.current?.abort(), clientTimeout);
      }

      // Show extended loading indicator for deep research
      if (isDeepResearch) {
        setLocalMessages(prev => prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, content: '🔍 _Выполняется глубокое исследование. Это может занять до 5 минут..._' }
            : m
        ));
      }
      
      const requestBody = JSON.stringify({
        message: trimmedInput,
        role_id: effectiveRoleId || undefined,
        conversation_id: conversationId,
        message_history: messageHistory,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments.map((ua, i) => ({
          ...ua,
          contains_pii: attachments[i]?.containsPii || false,
        })) : undefined,
      });

      const doFetch = (authToken: string | undefined) => fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: requestBody,
          signal: abortControllerRef.current!.signal,
        }
      );

      let response = await doFetch(token);

      // One-time retry on 401: refresh session and retry
      if (response.status === 401) {
        console.warn('[useOptimizedChat] Got 401, refreshing session and retrying once');
        try {
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed.session?.access_token) {
            token = refreshed.session.access_token;
            response = await doFetch(token);
          }
        } catch (e) {
          console.error('[useOptimizedChat] Refresh-on-401 failed', e);
        }
      }

      if (!response.ok) {
        // Try to read explicit error code from edge function
        let errBody: any = null;
        try { errBody = await response.json(); } catch { /* ignore */ }
        const errCode = errBody?.error || errBody?.code;
        if (response.status === 401 || errCode === 'TOKEN_EXPIRED') {
          throw new Error('Сессия истекла. Перезагрузите страницу и попробуйте снова.');
        }
        throw new Error(`HTTP ${response.status}${errCode ? `: ${errCode}` : ''}`);
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
        reputation_results?: any[];
        reputation_company_data?: any;
        fallback_used?: string | null;
        model?: string;
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
                    reputation_results: parsed.reputation_results,
                    reputation_company_data: parsed.reputation_company_data,
                    fallback_used: parsed.fallback_used,
                    model: parsed.model,
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
                    reputation_results: parsed.reputation_results,
                    reputation_company_data: parsed.reputation_company_data,
                    fallback_used: parsed.fallback_used,
                    model: parsed.model,
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

      const finalContent = streamingContentRef.current?.trim()
        ? streamingContentRef.current
        : (metadata.stop_reason
            ? "Исследование завершилось без текста ответа. Попробуйте сузить запрос или повторить ещё раз."
            : "⚠️ Превышено время CPU у функции исследования. Попробуйте сузить запрос или повторить позже.");
      
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
              reputationResults: metadata.reputation_results,
              reputationCompanyData: metadata.reputation_company_data,
              fallbackUsed: metadata.fallback_used,
              actualModel: metadata.model,
            }
          : m
      ));

      // Refresh session before post-stream DB writes — the stream may have run
      // 100s+ for Perplexity, so the original token can be near-expiry now.
      try {
        await supabase.auth.getSession(); // triggers internal refresh if needed
      } catch { /* non-fatal */ }

      await saveMessage(conversationId, "assistant", finalContent, {
        ...metadata,
        interrupted: !streamingContentRef.current?.trim(),
        role_id: selectedRoleId || undefined,
      });

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      // Wait for queries to refetch before clearing isLoading,
      // otherwise the component switches to stale dbMessages showing empty content
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(conversationId) });

    } catch (error: any) {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }

      const partialContent = streamingContentRef.current;
      const hasPartial = !!partialContent && partialContent.trim().length > 0;
      const errMsg = String(error?.message || error?.name || '');
      const isNetwork = /Load failed|Failed to fetch|NetworkError|TypeError/i.test(errMsg);

      // Handle abort - save partial content
      if (error.name === 'AbortError') {
        console.log('Request aborted, saving partial content');

        if (hasPartial) {
          const stoppedContent = partialContent + "\n\n_[Генерация остановлена]_";
          setLocalMessages(prev => prev.map(m =>
            m.id === assistantMessageId ? { ...m, content: stoppedContent, isStreaming: false } : m
          ));
          try {
            await saveMessage(conversationId, "assistant", stoppedContent, { role_id: selectedRoleId || undefined });
            await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(conversationId) });
          } catch (e) {
            console.error('Failed to save partial content on abort', e);
          }
        }
        return;
      }

      console.error("Error sending message:", error);

      // Save partial content even on non-abort errors (rescue Perplexity/deep-research answer
      // when the stream completed but the post-save failed due to network blip / token expiry)
      if (hasPartial) {
        try {
          // Try to refresh token before save (errors here often == token expired mid-flight)
          await supabase.auth.refreshSession().catch(() => {});
          await saveMessage(conversationId, "assistant", partialContent, { role_id: selectedRoleId || undefined });
          await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
          queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(conversationId) });

          setLocalMessages(prev => prev.map(m =>
            m.id === assistantMessageId ? { ...m, content: partialContent, isStreaming: false } : m
          ));

          toast.warning("Ответ получен, но соединение прервалось при сохранении. Сообщение сохранено.");
          return;
        } catch (e) {
          console.error('Rescue-save failed', e);
        }
      }

      const friendlyMsg = isNetwork
        ? (isPerplexityModel || isDeepResearch
            ? "Сервер Perplexity не ответил вовремя. Попробуйте ещё раз или сократите запрос."
            : "Соединение прервано. Проверьте интернет и попробуйте снова.")
        : (errMsg || "Не удалось получить ответ");

      toast.error(friendlyMsg);

      setLocalMessages(prev => prev.map(m =>
        m.id === assistantMessageId
          ? { ...m, content: `Ошибка: ${friendlyMsg}`, isStreaming: false }
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

  // Повтор сообщения пользователя (удаляет все после него и повторно отправляет)
  const retryMessage = useCallback(async (messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    const userMessage = messages[messageIndex];
    if (userMessage.role !== 'user') return;
    
    // Удаляем все сообщения после user message
    const messagesToKeep = messages.slice(0, messageIndex);
    setLocalMessages(messagesToKeep);
    
    const isProjectMode = selectedRoleId ? roles.find(r => r.id === selectedRoleId)?.is_project_mode || false : false;
    sendMessage(userMessage.content, isProjectMode, selectedRoleId || undefined);
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
    retryMessage,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    toggleAttachmentPii,
  };
}
