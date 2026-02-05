 import React, { useState } from 'react';
 import { 
   ProjectChat, 
   ProjectMember, 
   ContextPack, 
   ProjectContextPack,
   ProjectMemory,
   ProjectMemoryType
 } from '@/types/project';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Badge } from '@/components/ui/badge';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { Switch } from '@/components/ui/switch';
 import { Separator } from '@/components/ui/separator';
 import {
   Collapsible,
   CollapsibleContent,
   CollapsibleTrigger,
 } from '@/components/ui/collapsible';
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from '@/components/ui/dropdown-menu';
 import {
   MessageSquare,
   Plus,
   MoreHorizontal,
   Pencil,
   Trash2,
   Pin,
   Users,
   Bot,
   BookOpen,
   Brain,
   ChevronDown,
   ChevronRight,
   Lightbulb,
   CheckCircle,
   ListTodo,
   FileText,
 } from 'lucide-react';
 import { cn } from '@/lib/utils';
 
 const memoryTypeConfig: Record<ProjectMemoryType, { icon: React.ElementType; label: string; color: string }> = {
   fact: { icon: Lightbulb, label: 'Факт', color: 'text-blue-500' },
   decision: { icon: CheckCircle, label: 'Решение', color: 'text-green-500' },
   requirement: { icon: FileText, label: 'Требование', color: 'text-purple-500' },
   todo: { icon: ListTodo, label: 'Задача', color: 'text-orange-500' },
 };
 
 interface ProjectSidebarProps {
   projectChats: ProjectChat[];
   activeChatId: string | null;
   onSelectChat: (chatId: string) => void;
   onNewChat: () => void;
   onDeleteChat: (chatId: string) => void;
   onRenameChat: (chatId: string, newTitle: string) => void;
   onPinChat: (chatId: string, isPinned: boolean) => void;
   
   members: ProjectMember[];
   agentMembers: ProjectMember[];
   
   contextPacks: ContextPack[];
   projectContextPacks: ProjectContextPack[];
   onToggleContextPack: (packId: string, enabled: boolean) => void;
   
   projectMemory: ProjectMemory[];
   onRemoveMemory: (memoryId: string) => void;
 }
 
 export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
   projectChats,
   activeChatId,
   onSelectChat,
   onNewChat,
   onDeleteChat,
   onRenameChat,
   onPinChat,
   members,
   agentMembers,
   contextPacks,
   projectContextPacks,
   onToggleContextPack,
   projectMemory,
   onRemoveMemory,
 }) => {
   const [chatsOpen, setChatsOpen] = useState(true);
   const [contextOpen, setContextOpen] = useState(true);
   const [memoryOpen, setMemoryOpen] = useState(true);
   const [teamOpen, setTeamOpen] = useState(false);
   const [editingChatId, setEditingChatId] = useState<string | null>(null);
   const [editingTitle, setEditingTitle] = useState('');
 
   const pinnedChats = projectChats.filter(c => c.is_pinned);
   const unpinnedChats = projectChats.filter(c => !c.is_pinned);
 
   const handleStartEdit = (chat: ProjectChat) => {
     setEditingChatId(chat.id);
     setEditingTitle(chat.title);
   };
 
   const handleSaveEdit = () => {
     if (editingChatId && editingTitle.trim()) {
       onRenameChat(editingChatId, editingTitle.trim());
     }
     setEditingChatId(null);
     setEditingTitle('');
   };
 
   const isPackEnabled = (packId: string) => {
     const projectPack = projectContextPacks.find(p => p.context_pack_id === packId);
     return projectPack?.is_enabled ?? false;
   };
 
   // Group memory by type
   const memoryByType = projectMemory.reduce((acc, m) => {
     if (!acc[m.memory_type]) acc[m.memory_type] = [];
     acc[m.memory_type].push(m);
     return acc;
   }, {} as Record<ProjectMemoryType, ProjectMemory[]>);
 
   const renderChatItem = (chat: ProjectChat) => (
     <div
       key={chat.id}
       className={cn(
         "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm",
         activeChatId === chat.id 
           ? "bg-primary/10 text-primary" 
           : "hover:bg-muted text-muted-foreground hover:text-foreground"
       )}
       onClick={() => onSelectChat(chat.id)}
     >
       <MessageSquare className="h-3.5 w-3.5 shrink-0" />
       
       {editingChatId === chat.id ? (
         <Input
           value={editingTitle}
           onChange={(e) => setEditingTitle(e.target.value)}
           onBlur={handleSaveEdit}
           onKeyDown={(e) => {
             if (e.key === 'Enter') handleSaveEdit();
             if (e.key === 'Escape') setEditingChatId(null);
           }}
           className="h-6 text-xs"
           autoFocus
           onClick={(e) => e.stopPropagation()}
         />
       ) : (
         <span className="truncate flex-1">{chat.title}</span>
       )}
       
       {chat.is_pinned && (
         <Pin className="h-3 w-3 text-muted-foreground" />
       )}
       
       <DropdownMenu>
         <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
           <Button 
             variant="ghost" 
             size="icon" 
             className="h-6 w-6 opacity-0 group-hover:opacity-100"
           >
             <MoreHorizontal className="h-3.5 w-3.5" />
           </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="w-40">
           <DropdownMenuItem onClick={() => handleStartEdit(chat)}>
             <Pencil className="h-3.5 w-3.5 mr-2" />
             Переименовать
           </DropdownMenuItem>
           <DropdownMenuItem onClick={() => onPinChat(chat.id, !chat.is_pinned)}>
             <Pin className="h-3.5 w-3.5 mr-2" />
             {chat.is_pinned ? 'Открепить' : 'Закрепить'}
           </DropdownMenuItem>
           <DropdownMenuItem 
             onClick={() => onDeleteChat(chat.id)}
             className="text-destructive"
           >
             <Trash2 className="h-3.5 w-3.5 mr-2" />
             Удалить
           </DropdownMenuItem>
         </DropdownMenuContent>
       </DropdownMenu>
     </div>
   );
 
   return (
     <div className="h-full flex flex-col bg-muted/30">
       <ScrollArea className="flex-1">
         <div className="p-3 space-y-4">
           {/* Чаты */}
           <Collapsible open={chatsOpen} onOpenChange={setChatsOpen}>
             <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
               <span className="flex items-center gap-1.5">
                 {chatsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                 Чаты
               </span>
               <Button
                 variant="ghost"
                 size="icon"
                 className="h-5 w-5"
                 onClick={(e) => { e.stopPropagation(); onNewChat(); }}
               >
                 <Plus className="h-3 w-3" />
               </Button>
             </CollapsibleTrigger>
             <CollapsibleContent className="mt-2 space-y-0.5">
               {pinnedChats.map(renderChatItem)}
               {pinnedChats.length > 0 && unpinnedChats.length > 0 && (
                 <Separator className="my-1" />
               )}
               {unpinnedChats.map(renderChatItem)}
               {projectChats.length === 0 && (
                 <p className="text-xs text-muted-foreground px-2 py-1">
                   Нет чатов
                 </p>
               )}
             </CollapsibleContent>
           </Collapsible>
 
           {/* Контекст-пакеты */}
           <Collapsible open={contextOpen} onOpenChange={setContextOpen}>
             <CollapsibleTrigger className="flex items-center w-full text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
               {contextOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
               <BookOpen className="h-3 w-3 mx-1.5" />
               Контекст
             </CollapsibleTrigger>
             <CollapsibleContent className="mt-2 space-y-1">
               {contextPacks.length === 0 ? (
                 <p className="text-xs text-muted-foreground px-2 py-1">
                   Нет контекст-пакетов
                 </p>
               ) : (
                 contextPacks.map(pack => (
                   <div
                     key={pack.id}
                     className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted"
                   >
                     <div className="flex-1 min-w-0">
                       <p className="text-sm truncate">{pack.name}</p>
                       {pack.description && (
                         <p className="text-xs text-muted-foreground truncate">
                           {pack.description}
                         </p>
                       )}
                     </div>
                     <Switch
                       checked={isPackEnabled(pack.id)}
                       onCheckedChange={(checked) => onToggleContextPack(pack.id, checked)}
                       className="ml-2"
                     />
                   </div>
                 ))
               )}
             </CollapsibleContent>
           </Collapsible>
 
           {/* Память проекта */}
           <Collapsible open={memoryOpen} onOpenChange={setMemoryOpen}>
             <CollapsibleTrigger className="flex items-center w-full text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
               {memoryOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
               <Brain className="h-3 w-3 mx-1.5" />
               Память ({projectMemory.length})
             </CollapsibleTrigger>
             <CollapsibleContent className="mt-2 space-y-2">
               {Object.entries(memoryByType).map(([type, items]) => {
                 const config = memoryTypeConfig[type as ProjectMemoryType];
                 const Icon = config.icon;
                 return (
                   <div key={type} className="space-y-1">
                     <p className={cn("text-xs font-medium flex items-center gap-1 px-2", config.color)}>
                       <Icon className="h-3 w-3" />
                       {config.label} ({items.length})
                     </p>
                     {items.slice(0, 3).map(m => (
                       <div 
                         key={m.id} 
                         className="group flex items-start gap-2 px-2 py-1 rounded text-xs hover:bg-muted"
                       >
                         <span className="flex-1 line-clamp-2 text-muted-foreground">
                           {m.content}
                         </span>
                         <Button
                           variant="ghost"
                           size="icon"
                           className="h-4 w-4 opacity-0 group-hover:opacity-100 shrink-0"
                           onClick={() => onRemoveMemory(m.id)}
                         >
                           <Trash2 className="h-2.5 w-2.5" />
                         </Button>
                       </div>
                     ))}
                     {items.length > 3 && (
                       <p className="text-xs text-muted-foreground px-2">
                         +{items.length - 3} ещё
                       </p>
                     )}
                   </div>
                 );
               })}
               {projectMemory.length === 0 && (
                 <p className="text-xs text-muted-foreground px-2 py-1">
                   Память пуста
                 </p>
               )}
             </CollapsibleContent>
           </Collapsible>
 
           {/* Команда */}
           <Collapsible open={teamOpen} onOpenChange={setTeamOpen}>
             <CollapsibleTrigger className="flex items-center w-full text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
               {teamOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
               <Users className="h-3 w-3 mx-1.5" />
               Команда ({members.length + agentMembers.length})
             </CollapsibleTrigger>
             <CollapsibleContent className="mt-2 space-y-1">
               {/* Люди */}
               {members.map(m => (
                 <div key={m.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                   <Users className="h-3.5 w-3.5 text-muted-foreground" />
                   <span className="truncate">{m.profile?.full_name || m.profile?.email || 'Участник'}</span>
                   <Badge variant="outline" className="text-[10px] ml-auto">
                     {m.role}
                   </Badge>
                 </div>
               ))}
               {/* Агенты */}
               {agentMembers.map(m => (
                 <div key={m.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                   <Bot className="h-3.5 w-3.5 text-primary" />
                   <span className="truncate">
                     @{m.agent?.mention_trigger || m.agent?.slug || m.agent?.name}
                   </span>
                 </div>
               ))}
             </CollapsibleContent>
           </Collapsible>
         </div>
       </ScrollArea>
     </div>
   );
 };