 import { useState, useCallback, useRef, useEffect } from "react";
 import { useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "sonner";
 import { 
   Project,
   ProjectChat, 
   ProjectChatMessage, 
   ProjectMember,
   ProjectMemory,
   ProjectMemoryType,
   ProjectChatAttachment,
 } from "@/types/project";
 import { Attachment } from "@/types/chat";
 import type { Json } from "@/integrations/supabase/types";
 import {
   useProjectQuery,
   useProjectChatsQuery,
   useProjectMessagesQuery,
   useProjectMembersQuery,
   useProjectContextPacksQuery,
   useProjectMemoryQuery,
   useContextPacksQuery,
   useCreateProjectChat,
   useUpdateProjectChat,
   useDeleteProjectChat,
   useToggleContextPack,
   useAddProjectMemory,
   useRemoveProjectMemory,
   projectQueryKeys,
 } from "@/hooks/queries/useProjectQueries";
 
 const STREAM_UPDATE_INTERVAL = 50;
 
 export function useProjectChat(projectId: string | null, userId: string | undefined) {
   const queryClient = useQueryClient();
   
   const [activeChatId, setActiveChatId] = useState<string | null>(null);
   const [localMessages, setLocalMessages] = useState<ProjectChatMessage[]>([]);
   const [isGenerating, setIsGenerating] = useState(false);
   const [attachments, setAttachments] = useState<Attachment[]>([]);
   const [replyToMessage, setReplyToMessage] = useState<ProjectChatMessage | null>(null);
   
   const streamingContentRef = useRef<string>("");
   const updateIntervalRef = useRef<number | null>(null);
   const abortControllerRef = useRef<AbortController | null>(null);
 
   // Queries
   const { data: project } = useProjectQuery(projectId);
   const { data: projectChats = [], isLoading: isLoadingChats } = useProjectChatsQuery(projectId);
   const { data: members = [] } = useProjectMembersQuery(projectId);
   const { data: dbMessages, isLoading: isLoadingMessages } = useProjectMessagesQuery(activeChatId);
   const { data: contextPacks = [] } = useContextPacksQuery();
   const { data: projectContextPacks = [] } = useProjectContextPacksQuery(projectId);
   const { data: projectMemory = [] } = useProjectMemoryQuery(projectId);
 
   // Mutations
   const createChatMutation = useCreateProjectChat(projectId || '');
   const updateChatMutation = useUpdateProjectChat(projectId || '');
   const deleteChatMutation = useDeleteProjectChat(projectId || '');
   const toggleContextPackMutation = useToggleContextPack(projectId || '');
   const addMemoryMutation = useAddProjectMemory(projectId || '');
   const removeMemoryMutation = useRemoveProjectMemory(projectId || '');
 
   // Split members into users and agents
   const userMembers = members.filter(m => m.user_id !== null);
   const agentMembers = members.filter(m => m.agent_id !== null);
 
   // Auto-select first chat
   useEffect(() => {
     if (!projectId || isLoadingChats) return;
     
     if (projectChats.length > 0 && !activeChatId) {
       setActiveChatId(projectChats[0].id);
     }
   }, [projectChats, projectId, isLoadingChats, activeChatId]);
 
   // Get active chat
   const activeChat = projectChats.find(c => c.id === activeChatId) || null;
 
   // Sync messages
   const messages = isGenerating ? localMessages : (dbMessages || localMessages);
 
   useEffect(() => {
     if (dbMessages && !isGenerating) {
       setLocalMessages(dbMessages);
     }
   }, [dbMessages, isGenerating]);
 
   // Chat management
   const createNewChat = useCallback(async () => {
     if (!projectId) return;
     const chat = await createChatMutation.mutateAsync('Новый чат');
     setActiveChatId(chat.id);
     setLocalMessages([]);
   }, [projectId, createChatMutation]);
 
   const selectChat = useCallback((chatId: string) => {
     setActiveChatId(chatId);
     setLocalMessages([]);
   }, []);
 
   const renameChat = useCallback((chatId: string, newTitle: string) => {
     updateChatMutation.mutate({ id: chatId, title: newTitle });
   }, [updateChatMutation]);
 
   const deleteChat = useCallback((chatId: string) => {
     deleteChatMutation.mutate(chatId, {
       onSuccess: () => {
         if (activeChatId === chatId) {
           const remaining = projectChats.filter(c => c.id !== chatId);
           setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
         }
       }
     });
   }, [deleteChatMutation, activeChatId, projectChats]);
 
   const pinChat = useCallback((chatId: string, isPinned: boolean) => {
     updateChatMutation.mutate({ id: chatId, is_pinned: isPinned });
   }, [updateChatMutation]);
 
   // Parse @mention
   const parseMention = useCallback((text: string): { agentId: string | null; cleanText: string } => {
     if (!text.startsWith('@')) {
       return { agentId: null, cleanText: text };
     }
 
     const textLower = text.toLowerCase();
 
     for (const member of agentMembers) {
       const agent = member.agent;
       if (!agent) continue;
       
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
           return { agentId: member.agent_id!, cleanText };
         }
       }
     }
 
     return { agentId: null, cleanText: text };
   }, [agentMembers]);
 
   // File handling
   const handleAttach = useCallback(async (files: File[]) => {
     if (!userId || !projectId) return;
 
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
 
     for (const attachment of newAttachments) {
       try {
         setAttachments(prev => prev.map(a => 
           a.id === attachment.id ? { ...a, status: 'uploading' as const } : a
         ));
 
         const file = attachment.file!;
         const fileExt = file.name.split('.').pop();
         const fileName = `${projectId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
 
         const { error: uploadError } = await supabase.storage
           .from('project-documents')
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
   }, [userId, projectId]);
 
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
 
   // Send message
   const sendMessage = useCallback(async (text: string, messageAttachments?: Attachment[], replyTo?: ProjectChatMessage | null) => {
     if (!activeChatId || !userId || !projectId) return;
     
     const hasAttachments = messageAttachments && messageAttachments.length > 0;
     if (!text.trim() && !hasAttachments) return;
 
     const { agentId, cleanText } = parseMention(text);
 
     if (!agentId) {
       toast.error('Укажите агента через @упоминание');
       return;
     }
 
     const agent = agentMembers.find(m => m.agent_id === agentId)?.agent;
     const userName = await getUserName(userId);
 
     const attachmentsMetadata: ProjectChatAttachment[] = hasAttachments
       ? messageAttachments.filter(a => a.status === 'uploaded' && a.file_path).map(a => ({
           file_path: a.file_path!,
           file_name: a.file_name,
           file_type: a.file_type,
           file_size: a.file_size
         }))
       : [];
 
     // Create user message
     const userMessage: ProjectChatMessage = {
       id: crypto.randomUUID(),
       chat_id: activeChatId,
       user_id: userId,
       agent_id: null,
       message_role: 'user',
       content: text,
       reply_to_message_id: replyTo?.id || null,
       metadata: { 
         user_name: userName,
         attachments: attachmentsMetadata.length > 0 ? attachmentsMetadata : undefined
       },
       created_at: new Date().toISOString()
     };
 
     setLocalMessages(prev => [...prev, userMessage]);
     clearAttachments();
 
     // Save to DB
     const { error: userMsgError } = await supabase
       .from('project_chat_messages')
       .insert([{
         chat_id: activeChatId,
         user_id: userId,
         agent_id: null,
         message_role: 'user',
         content: text,
         reply_to_message_id: replyTo?.id || null,
         metadata: { 
           user_name: userName,
           attachments: attachmentsMetadata.length > 0 ? attachmentsMetadata : undefined
         } as unknown as Json,
       }]);
 
     if (userMsgError) {
       console.error('Error saving user message:', userMsgError);
       toast.error('Ошибка сохранения сообщения');
       return;
     }
 
     // Update chat timestamp
     await supabase
       .from('project_chats')
       .update({ updated_at: new Date().toISOString() })
       .eq('id', activeChatId);
 
     // Create assistant message placeholder
     const assistantMessageId = crypto.randomUUID();
     const assistantMessage: ProjectChatMessage = {
       id: assistantMessageId,
       chat_id: activeChatId,
       user_id: userId,
       agent_id: agentId,
       message_role: 'assistant',
       content: '',
       reply_to_message_id: null,
       metadata: { agent_name: agent?.name },
       created_at: new Date().toISOString()
     };
 
     setLocalMessages(prev => [...prev, assistantMessage]);
     setIsGenerating(true);
     streamingContentRef.current = "";
 
     // Get enabled context packs folder IDs
     const enabledPacks = projectContextPacks.filter(p => p.is_enabled);
     const contextFolderIds = enabledPacks.flatMap(p => p.context_pack?.folder_ids || []);
 
     // Build message history
     const historyForContext = localMessages.slice(-20).map(m => ({
       role: m.message_role,
       content: m.content,
       agent_name: m.metadata?.agent_name,
       attachments: m.metadata?.attachments || [],
     }));
 
     try {
       abortControllerRef.current = new AbortController();
       const { data: { session } } = await supabase.auth.getSession();
 
       const requestBody: Record<string, unknown> = {
         message: cleanText,
         role_id: agentId,
         message_history: historyForContext,
         project_id: projectId,
       };
 
       if (contextFolderIds.length > 0) {
         requestBody.context_folder_ids = contextFolderIds;
       }
 
       if (projectMemory.length > 0) {
         requestBody.project_memory = projectMemory.map(m => ({
           type: m.memory_type,
           content: m.content,
         }));
       }
 
       if (attachmentsMetadata.length > 0) {
         requestBody.attachments = attachmentsMetadata;
       }
 
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
       let metadata: Record<string, unknown> = {};
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
                   stop_reason: parsed.stop_reason,
                 };
               }
             } catch {
               // Skip malformed JSON
             }
           }
         }
       }
 
       // Cleanup and save
       if (updateIntervalRef.current) {
         clearInterval(updateIntervalRef.current);
         updateIntervalRef.current = null;
       }
 
       const finalContent = streamingContentRef.current;
       setLocalMessages(prev => prev.map(m =>
         m.id === assistantMessageId
           ? { ...m, content: finalContent, metadata: { ...m.metadata, ...metadata } }
           : m
       ));
 
       // Save assistant message
       await supabase
         .from('project_chat_messages')
         .insert([{
           chat_id: activeChatId,
           user_id: userId,
           agent_id: agentId,
           message_role: 'assistant',
           content: finalContent,
           metadata: { agent_name: agent?.name, ...metadata } as unknown as Json,
         }]);
 
       queryClient.invalidateQueries({ queryKey: projectQueryKeys.messages(activeChatId) });
 
     } catch (error) {
       if ((error as Error).name !== 'AbortError') {
         console.error('Error sending message:', error);
         toast.error('Ошибка отправки сообщения');
       }
     } finally {
       if (updateIntervalRef.current) {
         clearInterval(updateIntervalRef.current);
         updateIntervalRef.current = null;
       }
       setIsGenerating(false);
       abortControllerRef.current = null;
     }
   }, [activeChatId, userId, projectId, parseMention, agentMembers, getUserName, clearAttachments, projectContextPacks, projectMemory, localMessages, queryClient]);
 
   // Stop generation
   const stopGeneration = useCallback(() => {
     if (abortControllerRef.current) {
       abortControllerRef.current.abort();
     }
   }, []);
 
   // Context pack toggle
   const toggleContextPack = useCallback((packId: string, enabled: boolean) => {
     toggleContextPackMutation.mutate({ contextPackId: packId, isEnabled: enabled });
   }, [toggleContextPackMutation]);
 
   // Memory management
   const addToMemory = useCallback((content: string, messageId?: string, memoryType: ProjectMemoryType = 'fact') => {
     addMemoryMutation.mutate({ memoryType, content, sourceMessageId: messageId });
   }, [addMemoryMutation]);
 
   const removeFromMemory = useCallback((memoryId: string) => {
     removeMemoryMutation.mutate(memoryId);
   }, [removeMemoryMutation]);
 
   return {
     // Project
     project,
     
     // Chats
     projectChats,
     activeChat,
     activeChatId,
     selectChat,
     createNewChat,
     renameChat,
     deleteChat,
     pinChat,
     
     // Messages
     messages,
     isLoading: isLoadingChats || isLoadingMessages,
     isGenerating,
     sendMessage,
     stopGeneration,
     
     // Reply
     replyToMessage,
     setReplyToMessage,
     
     // Attachments
     attachments,
     handleAttach,
     removeAttachment,
     
     // Members
     userMembers,
     agentMembers,
     
     // Context
     contextPacks,
     projectContextPacks,
     toggleContextPack,
     
     // Memory
     projectMemory,
     addToMemory,
     removeFromMemory,
   };
 }