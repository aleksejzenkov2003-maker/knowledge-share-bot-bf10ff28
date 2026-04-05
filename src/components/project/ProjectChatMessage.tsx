 import React from 'react';
 import { ProjectChatMessage as MessageType, ProjectMember } from '@/types/project';
 import { MarkdownWithCitations } from '@/components/chat/MarkdownWithCitations';
import { Citation } from '@/types/chat';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { Avatar, AvatarFallback } from '@/components/ui/avatar';
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from '@/components/ui/dropdown-menu';
 import { 
   User, 
   Bot, 
   Copy, 
   MoreHorizontal,
   Reply,
   Brain,
   RefreshCw,
 } from 'lucide-react';
 import { formatDistanceToNow } from 'date-fns';
 import { ru } from 'date-fns/locale';
 import { cn } from '@/lib/utils';
 import { toast } from 'sonner';
 
 interface ProjectChatMessageProps {
   message: MessageType;
   currentUserId?: string;
   agentMembers: ProjectMember[];
   onReply?: (message: MessageType) => void;
   onAddToMemory?: (content: string, messageId: string) => void;
   onRegenerate?: (message: MessageType) => void;
   replyToMessage?: MessageType;
 }
 
 export const ProjectChatMessage: React.FC<ProjectChatMessageProps> = ({
   message,
   currentUserId,
   agentMembers,
   onReply,
   onAddToMemory,
   onRegenerate,
   replyToMessage,
 }) => {
   const isUser = message.message_role === 'user';
   const isOwnMessage = message.user_id === currentUserId;
   
   const agent = message.agent_id 
     ? agentMembers.find(m => m.agent_id === message.agent_id)?.agent
     : null;
 
   const handleCopy = async () => {
     try {
       await navigator.clipboard.writeText(message.content);
       toast.success('Скопировано');
     } catch {
       toast.error('Ошибка копирования');
     }
   };
 
   const userName = message.metadata?.user_name || 'Пользователь';
   const agentName = message.metadata?.agent_name || agent?.name || 'Агент';
   const agentTrigger = agent?.mention_trigger || agent?.slug;
 
   return (
     <div className={cn(
       "group flex gap-3",
       isUser ? "flex-row-reverse" : "flex-row"
     )}>
       {/* Avatar */}
       <Avatar className="h-8 w-8 shrink-0">
         <AvatarFallback className={cn(
           isUser ? "bg-primary/10" : "bg-secondary"
         )}>
           {isUser ? (
             <User className="h-4 w-4 text-primary" />
           ) : (
             <Bot className="h-4 w-4" />
           )}
         </AvatarFallback>
       </Avatar>
 
       {/* Content */}
       <div className={cn(
         "flex-1 max-w-[85%] space-y-1",
         isUser ? "items-end" : "items-start"
       )}>
         {/* Header */}
         <div className={cn(
           "flex items-center gap-2 text-xs text-muted-foreground",
           isUser ? "flex-row-reverse" : "flex-row"
         )}>
           <span className="font-medium text-foreground">
             {isUser ? userName : agentName}
           </span>
           {!isUser && agentTrigger && (
             <Badge variant="secondary" className="text-[10px]">
               @{agentTrigger}
             </Badge>
           )}
           <span>
             {formatDistanceToNow(new Date(message.created_at), { 
               addSuffix: true,
               locale: ru 
             })}
           </span>
         </div>
 
         {/* Reply preview */}
         {replyToMessage && (
           <div className={cn(
             "text-xs text-muted-foreground border-l-2 border-muted pl-2 py-0.5 mb-1",
             isUser ? "text-right border-r-2 border-l-0 pr-2 pl-0" : ""
           )}>
             <span className="font-medium">
               {replyToMessage.message_role === 'user' 
                 ? replyToMessage.metadata?.user_name 
                 : replyToMessage.metadata?.agent_name}:
             </span>{' '}
             <span className="line-clamp-1">{replyToMessage.content}</span>
           </div>
         )}
 
         {/* Message bubble */}
         <div className={cn(
           "rounded-lg px-3 py-2",
           isUser 
             ? "bg-primary text-primary-foreground" 
             : "bg-muted"
         )}>
           {isUser ? (
             <p className="whitespace-pre-wrap text-sm">{message.content}</p>
           ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownWithCitations
                  content={message.content}
                 citations={message.metadata?.citations as Citation[] | undefined}
                 perplexityCitations={(message.metadata as any)?.perplexity_citations || (message.metadata as any)?.web_search_citations}
                />
             </div>
           )}
 
           {/* Attachments preview */}
           {message.metadata?.attachments && message.metadata.attachments.length > 0 && (
             <div className="mt-2 flex flex-wrap gap-1">
               {message.metadata.attachments.map((att, idx) => (
                 <Badge key={idx} variant="outline" className="text-[10px]">
                   📎 {att.file_name}
                 </Badge>
               ))}
             </div>
           )}
         </div>
 
         {/* Actions */}
         <div className={cn(
           "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
           isUser ? "flex-row-reverse" : "flex-row"
         )}>
           <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
             <Copy className="h-3 w-3" />
           </Button>
           
           {onReply && (
             <Button 
               variant="ghost" 
               size="icon" 
               className="h-6 w-6"
               onClick={() => onReply(message)}
             >
               <Reply className="h-3 w-3" />
             </Button>
           )}
           
           {!isUser && onAddToMemory && (
             <Button 
               variant="ghost" 
               size="icon" 
               className="h-6 w-6"
               onClick={() => onAddToMemory(message.content, message.id)}
               title="Добавить в память проекта"
             >
               <Brain className="h-3 w-3" />
             </Button>
           )}
 
           {!isUser && onRegenerate && (
             <Button 
               variant="ghost" 
               size="icon" 
               className="h-6 w-6"
               onClick={() => onRegenerate(message)}
               title="Сгенерировать заново"
             >
               <RefreshCw className="h-3 w-3" />
             </Button>
           )}
         </div>
       </div>
     </div>
   );
 };