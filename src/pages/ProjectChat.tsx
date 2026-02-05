 import React, { useEffect, useRef, useState, useCallback } from 'react';
 import { useParams, useNavigate } from 'react-router-dom';
 import { useAuth } from '@/contexts/AuthContext';
 import { useProjectChat } from '@/hooks/useProjectChat';
 import { useAddProjectMember, useRemoveProjectMember } from '@/hooks/queries/useProjectQueries';
 import { ProjectSidebar } from '@/components/project/ProjectSidebar';
 import { ProjectChatMessage } from '@/components/project/ProjectChatMessage';
 import { AddMemberDialog } from '@/components/project/AddMemberDialog';
 import { ChatInputEnhanced } from '@/components/chat/ChatInputEnhanced';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { Input } from '@/components/ui/input';
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from '@/components/ui/dropdown-menu';
 import { 
   Loader2, 
   FolderKanban, 
   Settings,
   UserPlus,
   PanelLeftClose,
   PanelLeft,
   MoreHorizontal,
   ArrowLeft,
   Bot,
 } from 'lucide-react';
 import { cn } from '@/lib/utils';
 import { ProjectChatMessage as MessageType, ProjectMemoryType } from '@/types/project';
 
 const ProjectChatPage: React.FC = () => {
   const { id: projectId } = useParams<{ id: string }>();
   const navigate = useNavigate();
   const { user, isLoading: authLoading } = useAuth();
   
   const [sidebarOpen, setSidebarOpen] = useState(true);
   const [inputValue, setInputValue] = useState('');
   const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
   const messagesEndRef = useRef<HTMLDivElement>(null);
 
   const {
     project,
     projectChats,
     activeChat,
     activeChatId,
     selectChat,
     createNewChat,
     renameChat,
     deleteChat,
     pinChat,
     messages,
     isLoading,
     isGenerating,
     sendMessage,
     stopGeneration,
     replyToMessage,
     setReplyToMessage,
     attachments,
     handleAttach,
     removeAttachment,
     userMembers,
     agentMembers,
     contextPacks,
     projectContextPacks,
     toggleContextPack,
     projectMemory,
     addToMemory,
     removeFromMemory,
   } = useProjectChat(projectId || null, user?.id);
 
   const addMemberMutation = useAddProjectMember(projectId || '');
   const removeMemberMutation = useRemoveProjectMember(projectId || '');
 
   // Auto-scroll
   useEffect(() => {
     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
   }, [messages]);
 
   const handleSend = useCallback(async () => {
     if (!inputValue.trim() && attachments.length === 0) return;
     await sendMessage(inputValue.trim(), attachments, replyToMessage);
     setInputValue('');
     setReplyToMessage(null);
   }, [sendMessage, inputValue, attachments, replyToMessage, setReplyToMessage]);
 
   const handleReply = useCallback((message: MessageType) => {
     setReplyToMessage(message);
   }, [setReplyToMessage]);
 
   const handleAddToMemory = useCallback((content: string, messageId: string) => {
     addToMemory(content, messageId, 'fact');
   }, [addToMemory]);
 
   const handleAddUser = async (userId: string) => {
     await addMemberMutation.mutateAsync({
       project_id: projectId!,
       user_id: userId,
       role: 'member',
     });
   };
 
   const handleAddAgent = async (agentId: string) => {
     await addMemberMutation.mutateAsync({
       project_id: projectId!,
       agent_id: agentId,
       role: 'member',
     });
   };
 
   if (authLoading || isLoading) {
     return (
       <div className="flex items-center justify-center h-full">
         <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
       </div>
     );
   }
 
   if (!project) {
     return (
       <div className="flex flex-col items-center justify-center h-full">
         <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
         <h2 className="text-lg font-semibold mb-2">Проект не найден</h2>
         <Button variant="outline" onClick={() => navigate('/projects')}>
           <ArrowLeft className="h-4 w-4 mr-2" />
           К списку проектов
         </Button>
       </div>
     );
   }
 
   const allMembers = [...userMembers, ...agentMembers];
 
   return (
     <div className="flex h-[calc(100vh-120px)]">
       {/* Sidebar */}
       <div className={cn(
         "border-r border-border transition-all duration-300 flex-shrink-0",
         sidebarOpen ? "w-64" : "w-0 overflow-hidden"
       )}>
         {sidebarOpen && (
           <ProjectSidebar
             projectChats={projectChats}
             activeChatId={activeChatId}
             onSelectChat={selectChat}
             onNewChat={createNewChat}
             onDeleteChat={deleteChat}
             onRenameChat={renameChat}
             onPinChat={pinChat}
             members={userMembers}
             agentMembers={agentMembers}
             contextPacks={contextPacks}
             projectContextPacks={projectContextPacks}
             onToggleContextPack={toggleContextPack}
             projectMemory={projectMemory}
             onRemoveMemory={removeFromMemory}
           />
         )}
       </div>
 
       {/* Main content */}
       <div className="flex-1 flex flex-col min-w-0">
         {/* Header */}
         <div className="flex items-center justify-between p-3 border-b bg-background">
           <div className="flex items-center gap-3">
             <Button
               variant="ghost"
               size="icon"
               onClick={() => setSidebarOpen(!sidebarOpen)}
               className="h-8 w-8"
             >
               {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
             </Button>
             
             <Button
               variant="ghost"
               size="icon"
               onClick={() => navigate('/projects')}
               className="h-8 w-8"
             >
               <ArrowLeft className="h-4 w-4" />
             </Button>
             
             <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
               <FolderKanban className="h-4 w-4 text-primary" />
             </div>
             
             <div>
               <div className="flex items-center gap-2">
                 <h1 className="font-medium text-sm">{project.name}</h1>
                 <Badge variant="outline" className="text-xs">
                   {activeChat?.title || 'Чат'}
                 </Badge>
               </div>
               <p className="text-xs text-muted-foreground">
                 Вызывайте агентов через @упоминание
               </p>
             </div>
           </div>
 
           <div className="flex items-center gap-2">
             {/* Agent badges */}
             <div className="hidden lg:flex items-center gap-1">
               {agentMembers.slice(0, 3).map(m => (
                 <Badge key={m.id} variant="secondary" className="text-xs">
                   <Bot className="h-3 w-3 mr-1" />
                   @{m.agent?.mention_trigger || m.agent?.slug}
                 </Badge>
               ))}
               {agentMembers.length > 3 && (
                 <Badge variant="outline" className="text-xs">
                   +{agentMembers.length - 3}
                 </Badge>
               )}
             </div>
 
             <Button
               variant="outline"
               size="sm"
               onClick={() => setAddMemberDialogOpen(true)}
             >
               <UserPlus className="h-4 w-4 mr-1" />
               Добавить
             </Button>
 
             <DropdownMenu>
               <DropdownMenuTrigger asChild>
                 <Button variant="ghost" size="icon" className="h-8 w-8">
                   <MoreHorizontal className="h-4 w-4" />
                 </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                 <DropdownMenuItem onClick={() => navigate(`/projects/${projectId}/settings`)}>
                   <Settings className="h-4 w-4 mr-2" />
                   Настройки
                 </DropdownMenuItem>
               </DropdownMenuContent>
             </DropdownMenu>
           </div>
         </div>
 
         {/* Messages area */}
         <ScrollArea className="flex-1">
           <div className="max-w-4xl mx-auto py-6 px-4">
             {messages.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                 <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                   <FolderKanban className="h-7 w-7 text-primary" />
                 </div>
                 <h2 className="text-lg font-semibold mb-1">{project.name}</h2>
                 <p className="text-sm text-muted-foreground max-w-sm mb-4">
                   {project.description || 'Начните работу с проектом. Вызывайте агентов через @упоминание.'}
                 </p>
                 <div className="flex flex-wrap gap-2 justify-center">
                   {agentMembers.slice(0, 4).map(m => (
                     <Badge key={m.id} variant="outline" className="text-xs">
                       @{m.agent?.mention_trigger || m.agent?.slug} — {m.agent?.name}
                     </Badge>
                   ))}
                 </div>
               </div>
             ) : (
               <div className="space-y-4">
                 {messages.map(message => {
                   const replyTo = message.reply_to_message_id 
                     ? messages.find(m => m.id === message.reply_to_message_id) 
                     : undefined;
                   return (
                     <ProjectChatMessage
                       key={message.id}
                       message={message}
                       currentUserId={user?.id}
                       agentMembers={agentMembers}
                       onReply={handleReply}
                       onAddToMemory={handleAddToMemory}
                       replyToMessage={replyTo}
                     />
                   );
                 })}
                 {isGenerating && (
                   <div className="flex items-center gap-2 text-sm text-muted-foreground">
                     <Loader2 className="h-4 w-4 animate-spin" />
                     Агент печатает...
                   </div>
                 )}
                 <div ref={messagesEndRef} />
               </div>
             )}
           </div>
         </ScrollArea>
 
         {/* Input */}
         <div className="border-t bg-background py-4">
           <ChatInputEnhanced
             value={inputValue}
             onChange={setInputValue}
             onSend={handleSend}
             isLoading={isGenerating}
             onStop={stopGeneration}
             attachments={attachments}
             onAttach={handleAttach}
             onRemoveAttachment={removeAttachment}
             availableAgents={agentMembers.map(m => ({
               id: m.agent_id!,
               name: m.agent?.name || '',
               slug: m.agent?.slug || '',
               description: m.agent?.description || null,
               is_active: true,
               is_project_mode: false,
               mention_trigger: m.agent?.mention_trigger || null,
             }))}
             replyTo={replyToMessage ? {
               id: replyToMessage.id,
               chat_id: replyToMessage.chat_id,
               user_id: replyToMessage.user_id,
               role_id: replyToMessage.agent_id,
               message_role: replyToMessage.message_role,
               content: replyToMessage.content,
              metadata: {
                user_name: replyToMessage.metadata?.user_name,
                agent_name: replyToMessage.metadata?.agent_name,
              },
               created_at: replyToMessage.created_at,
             } : null}
             onClearReply={() => setReplyToMessage(null)}
             placeholder="@агент ваш вопрос..."
           />
         </div>
       </div>
 
       {/* Add Member Dialog */}
       <AddMemberDialog
         open={addMemberDialogOpen}
         onOpenChange={setAddMemberDialogOpen}
         projectId={projectId || ''}
         existingMembers={allMembers}
         onAddUser={handleAddUser}
         onAddAgent={handleAddAgent}
       />
     </div>
   );
 };
 
 export default ProjectChatPage;