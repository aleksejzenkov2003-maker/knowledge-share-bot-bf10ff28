import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Message, Conversation, ChatRole, DBMessage, Attachment } from "@/types/chat";

// Sanitize filename for storage (remove special chars, transliterate)
// Placed outside hook to avoid changing hook count
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

export function useChat(userId: string | undefined) {
  const [roles, setRoles] = useState<ChatRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchRoles = useCallback(async () => {
    try {
      // First get user's department
      let userDepartmentId: string | null = null;
      let isAdmin = false;
      
      if (userId) {
        const [profileRes, roleRes] = await Promise.all([
          supabase.from("profiles").select("department_id").eq("id", userId).single(),
          supabase.from("user_roles").select("role").eq("user_id", userId).single(),
        ]);
        
        userDepartmentId = profileRes.data?.department_id || null;
        isAdmin = roleRes.data?.role === "admin" || roleRes.data?.role === "moderator";
      }

      // Fetch all active roles
      const { data, error } = await supabase
        .from("chat_roles")
        .select("id, name, description, slug, is_active, is_project_mode, department_ids")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      // Filter roles based on user's department (admins see all)
      let filteredRoles = data || [];
      if (!isAdmin && userDepartmentId) {
        filteredRoles = filteredRoles.filter((role: { department_ids?: string[] }) => {
          // If no departments specified, available to all
          if (!role.department_ids || role.department_ids.length === 0) return true;
          // If user's department is in the list
          return role.department_ids.includes(userDepartmentId!);
        });
      }

      setRoles(filteredRoles);
      if (filteredRoles.length > 0) {
        setSelectedRoleId(filteredRoles[0].id);
      }
    } catch (error) {
      console.error("Error fetching roles:", error);
      toast.error("Ошибка загрузки ролей");
    } finally {
      setRolesLoading(false);
    }
  }, [userId]);

  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  }, [userId]);

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const loadedMessages: Message[] = (data || []).map((msg) => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        role: msg.role as "user" | "assistant",
        content: msg.content,
        timestamp: new Date(msg.created_at),
        responseTime: (msg.metadata as DBMessage['metadata'])?.response_time_ms,
        ragContext: (msg.metadata as DBMessage['metadata'])?.rag_context,
        citations: (msg.metadata as DBMessage['metadata'])?.citations,
        smartSearch: (msg.metadata as DBMessage['metadata'])?.smart_search,
        attachments: (msg.metadata as DBMessage['metadata'])?.attachments?.map((a, idx) => ({
          id: `${msg.id}-${idx}`,
          file_path: a.file_path,
          file_name: a.file_name,
          file_type: a.file_type,
          file_size: a.file_size,
          status: 'uploaded' as const,
        })),
      }));

      setMessages(loadedMessages);

      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation?.role_id) {
        setSelectedRoleId(conversation.role_id);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
      toast.error("Ошибка загрузки сообщений");
    }
  }, [conversations]);

  const createNewConversation = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          role_id: selectedRoleId || null,
          title: "Новый диалог",
        })
        .select()
        .single();

      if (error) throw error;
      
      setConversations(prev => [data, ...prev]);
      return data.id;
    } catch (error) {
      console.error("Error creating conversation:", error);
      toast.error("Ошибка создания диалога");
      return null;
    }
  }, [userId, selectedRoleId]);

  const updateConversationTitle = useCallback(async (conversationId: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    
    try {
      await supabase
        .from("conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      
      setConversations(prev => 
        prev.map(c => c.id === conversationId ? { ...c, title, updated_at: new Date().toISOString() } : c)
      );
    } catch (error) {
      console.error("Error updating conversation title:", error);
    }
  }, []);

  const saveMessage = useCallback(async (
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    metadata?: { 
      response_time_ms?: number; 
      rag_context?: string[]; 
      semantic_search?: boolean;
      attachments?: { file_path: string; file_name: string; file_type: string; file_size: number }[];
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

  const clearAttachments = useCallback(() => {
    setAttachments(prev => {
      prev.forEach(a => {
        if (a.preview_url) URL.revokeObjectURL(a.preview_url);
      });
      return [];
    });
  }, []);

  const uploadAttachment = useCallback(async (
    attachment: Attachment, 
    conversationId: string
  ): Promise<string | null> => {
    if (!attachment.file || !userId) return null;
    
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
      
      return filePath;
    } catch (error) {
      console.error('Error uploading file:', error);
      setAttachments(prev => prev.map(a => 
        a.id === attachment.id ? { ...a, status: 'error' as const } : a
      ));
      toast.error(`Ошибка загрузки ${attachment.file_name}`);
      return null;
    }
  }, [userId]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      await supabase
        .from("conversations")
        .update({ is_active: false })
        .eq("id", conversationId);
      
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
      
      toast.success("Диалог удален");
    } catch (error) {
      console.error("Error deleting conversation:", error);
      toast.error("Ошибка удаления диалога");
    }
  }, [activeConversationId]);

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    try {
      await supabase
        .from("conversations")
        .update({ title })
        .eq("id", conversationId);
      
      setConversations(prev => 
        prev.map(c => c.id === conversationId ? { ...c, title } : c)
      );
    } catch (error) {
      console.error("Error renaming conversation:", error);
      toast.error("Ошибка переименования");
    }
  }, []);

  const sendMessage = useCallback(async (
    inputValue: string,
    isProjectMode: boolean
  ) => {
    const trimmedInput = inputValue.trim();
    const hasAttachments = attachments.length > 0;
    
    if (!trimmedInput && !hasAttachments) return;
    if (isLoading) return;

    let conversationId = activeConversationId;
    
    if (!conversationId) {
      conversationId = await createNewConversation();
      if (!conversationId) return;
      setActiveConversationId(conversationId);
    }

    // Upload attachments first
    const uploadedAttachments: { file_path: string; file_name: string; file_type: string; file_size: number }[] = [];
    
    for (const attachment of attachments) {
      const filePath = await uploadAttachment(attachment, conversationId);
      if (filePath) {
        uploadedAttachments.push({
          file_path: filePath,
          file_name: attachment.file_name,
          file_type: attachment.file_type,
          file_size: attachment.file_size,
        });
      }
    }

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

    // Track if this is the first message (before adding userMessage)
    const isFirstMessage = messages.length === 0;
    
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    await saveMessage(conversationId, "user", trimmedInput, {
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
    });

    if (isFirstMessage) {
      await updateConversationTitle(conversationId, trimmedInput);
    }

    // Create streaming assistant message placeholder
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantMessageId,
      conversation_id: conversationId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      let messageHistory: { role: string; content: string }[] | undefined;
      
      if (isProjectMode) {
        messageHistory = [...messages, userMessage].map(m => ({
          role: m.role,
          content: m.content,
        }));
      }

      // Get auth token
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      // Use streaming endpoint
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
            role_id: selectedRoleId || undefined,
            conversation_id: conversationId,
            message_history: messageHistory,
            attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
          }),
          signal: abortControllerRef.current.signal,
        }
      );
      if (!response.ok) {
        // Fallback to non-streaming if stream endpoint fails
        const fallbackResponse = await supabase.functions.invoke("chat", {
          body: {
            message: trimmedInput,
            role_id: selectedRoleId || undefined,
            conversation_id: conversationId,
            message_history: messageHistory,
          },
        });

        if (fallbackResponse.error) {
          throw new Error(fallbackResponse.error.message);
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: fallbackResponse.data.content || "Нет ответа",
                  isStreaming: false,
                  responseTime: fallbackResponse.data.response_time_ms,
                  ragContext: fallbackResponse.data.rag_context,
                  semanticSearch: fallbackResponse.data.semantic_search,
                }
              : m
          )
        );

        await saveMessage(conversationId, "assistant", fallbackResponse.data.content || "Нет ответа", {
          response_time_ms: fallbackResponse.data.response_time_ms,
          rag_context: fallbackResponse.data.rag_context,
          semantic_search: fallbackResponse.data.semantic_search,
        });
      } else {
        // Handle SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let metadata: { response_time_ms?: number; rag_context?: string[]; citations?: { index: number; document: string; section?: string; article?: string; relevance: number }[]; smart_search?: boolean } = {};

        if (reader) {
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
                  
                  if (parsed.type === 'content') {
                    fullContent += parsed.content;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, content: fullContent }
                          : m
                      )
                    );
                  } else if (parsed.type === 'metadata') {
                    metadata = {
                      response_time_ms: parsed.response_time_ms,
                      rag_context: parsed.rag_context,
                      citations: parsed.citations,
                      smart_search: parsed.smart_search,
                    };
                  }
                } catch {
                  // Ignore parsing errors
                }
              }
            }
          }
        }

        // Finalize message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: fullContent || "Нет ответа",
                  isStreaming: false,
                  responseTime: metadata.response_time_ms,
                  ragContext: metadata.rag_context,
                  citations: metadata.citations,
                  smartSearch: metadata.smart_search,
                }
              : m
          )
        );

        await saveMessage(conversationId, "assistant", fullContent || "Нет ответа", metadata);
      }

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request aborted');
        return;
      }
      
      console.error("Error sending message:", error);
      toast.error(error.message || "Ошибка отправки сообщения");
      
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: `Ошибка: ${error.message || "Не удалось получить ответ"}`,
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [
    activeConversationId,
    attachments,
    createNewConversation,
    isLoading,
    messages.length,
    saveMessage,
    selectedRoleId,
    updateConversationTitle,
    uploadAttachment,
  ]);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
  }, []);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setActiveConversationId(conversation.id);
    if (conversation.role_id) {
      setSelectedRoleId(conversation.role_id);
    }
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

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
    stopGeneration,
    // Attachment management
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
  };
}
