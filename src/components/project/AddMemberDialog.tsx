 import React, { useState, useEffect } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { ProjectMember } from '@/types/project';
 import { ChatRole } from '@/types/chat';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { Avatar, AvatarFallback } from '@/components/ui/avatar';
 import { Badge } from '@/components/ui/badge';
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogDescription,
 } from '@/components/ui/dialog';
 import { User, Bot, Search, Plus, Check, Loader2 } from 'lucide-react';
 import { cn } from '@/lib/utils';
 
 interface Profile {
   id: string;
   full_name: string | null;
   email: string | null;
 }
 
 interface AddMemberDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   projectId: string;
   existingMembers: ProjectMember[];
   onAddUser: (userId: string) => Promise<void>;
   onAddAgent: (agentId: string) => Promise<void>;
 }
 
 export const AddMemberDialog: React.FC<AddMemberDialogProps> = ({
   open,
   onOpenChange,
   projectId,
   existingMembers,
   onAddUser,
   onAddAgent,
 }) => {
   const [searchQuery, setSearchQuery] = useState('');
   const [users, setUsers] = useState<Profile[]>([]);
   const [agents, setAgents] = useState<ChatRole[]>([]);
   const [loadingUsers, setLoadingUsers] = useState(false);
   const [loadingAgents, setLoadingAgents] = useState(false);
   const [addingId, setAddingId] = useState<string | null>(null);
 
   const existingUserIds = new Set(existingMembers.filter(m => m.user_id).map(m => m.user_id));
   const existingAgentIds = new Set(existingMembers.filter(m => m.agent_id).map(m => m.agent_id));
 
   // Load users
   useEffect(() => {
     if (!open) return;
     
     setLoadingUsers(true);
     supabase
       .from('profiles')
       .select('id, full_name, email')
       .order('full_name')
       .then(({ data, error }) => {
         if (!error && data) {
           setUsers(data);
         }
         setLoadingUsers(false);
       });
   }, [open]);
 
   // Load agents
   useEffect(() => {
     if (!open) return;
     
     setLoadingAgents(true);
     supabase
       .from('chat_roles')
       .select('*')
       .eq('is_active', true)
       .order('name')
       .then(({ data, error }) => {
         if (!error && data) {
           setAgents(data as ChatRole[]);
         }
         setLoadingAgents(false);
       });
   }, [open]);
 
   const filteredUsers = users.filter(u => {
     if (existingUserIds.has(u.id)) return false;
     if (!searchQuery) return true;
     const q = searchQuery.toLowerCase();
     return (u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
   });
 
   const filteredAgents = agents.filter(a => {
     if (existingAgentIds.has(a.id)) return false;
     if (!searchQuery) return true;
     const q = searchQuery.toLowerCase();
     return (a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q));
   });
 
   const handleAddUser = async (userId: string) => {
     setAddingId(userId);
     try {
       await onAddUser(userId);
     } finally {
       setAddingId(null);
     }
   };
 
   const handleAddAgent = async (agentId: string) => {
     setAddingId(agentId);
     try {
       await onAddAgent(agentId);
     } finally {
       setAddingId(null);
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-md">
         <DialogHeader>
           <DialogTitle>Добавить участника</DialogTitle>
           <DialogDescription>
             Добавьте пользователей или AI-агентов в проект
           </DialogDescription>
         </DialogHeader>
 
         <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input
             placeholder="Поиск..."
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="pl-9"
           />
         </div>
 
         <Tabs defaultValue="users" className="mt-2">
           <TabsList className="grid w-full grid-cols-2">
             <TabsTrigger value="users">
               <User className="h-4 w-4 mr-2" />
               Пользователи
             </TabsTrigger>
             <TabsTrigger value="agents">
               <Bot className="h-4 w-4 mr-2" />
               Агенты
             </TabsTrigger>
           </TabsList>
 
           <TabsContent value="users" className="mt-4">
             <ScrollArea className="h-64">
               {loadingUsers ? (
                 <div className="flex items-center justify-center py-8">
                   <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                 </div>
               ) : filteredUsers.length === 0 ? (
                 <p className="text-center text-sm text-muted-foreground py-8">
                   {searchQuery ? 'Пользователи не найдены' : 'Все пользователи уже добавлены'}
                 </p>
               ) : (
                 <div className="space-y-1">
                   {filteredUsers.map(user => (
                     <div
                       key={user.id}
                       className="flex items-center justify-between p-2 rounded-md hover:bg-muted"
                     >
                       <div className="flex items-center gap-3">
                         <Avatar className="h-8 w-8">
                           <AvatarFallback>
                             <User className="h-4 w-4" />
                           </AvatarFallback>
                         </Avatar>
                         <div>
                           <p className="text-sm font-medium">
                             {user.full_name || 'Без имени'}
                           </p>
                           <p className="text-xs text-muted-foreground">{user.email}</p>
                         </div>
                       </div>
                       <Button
                         size="sm"
                         variant="outline"
                         onClick={() => handleAddUser(user.id)}
                         disabled={addingId === user.id}
                       >
                         {addingId === user.id ? (
                           <Loader2 className="h-4 w-4 animate-spin" />
                         ) : (
                           <Plus className="h-4 w-4" />
                         )}
                       </Button>
                     </div>
                   ))}
                 </div>
               )}
             </ScrollArea>
           </TabsContent>
 
           <TabsContent value="agents" className="mt-4">
             <ScrollArea className="h-64">
               {loadingAgents ? (
                 <div className="flex items-center justify-center py-8">
                   <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                 </div>
               ) : filteredAgents.length === 0 ? (
                 <p className="text-center text-sm text-muted-foreground py-8">
                   {searchQuery ? 'Агенты не найдены' : 'Все агенты уже добавлены'}
                 </p>
               ) : (
                 <div className="space-y-1">
                   {filteredAgents.map(agent => (
                     <div
                       key={agent.id}
                       className="flex items-center justify-between p-2 rounded-md hover:bg-muted"
                     >
                       <div className="flex items-center gap-3">
                         <Avatar className="h-8 w-8">
                           <AvatarFallback className="bg-primary/10">
                             <Bot className="h-4 w-4 text-primary" />
                           </AvatarFallback>
                         </Avatar>
                         <div>
                           <p className="text-sm font-medium">{agent.name}</p>
                           <p className="text-xs text-muted-foreground">
                             @{agent.mention_trigger || agent.slug}
                           </p>
                         </div>
                       </div>
                       <Button
                         size="sm"
                         variant="outline"
                         onClick={() => handleAddAgent(agent.id)}
                         disabled={addingId === agent.id}
                       >
                         {addingId === agent.id ? (
                           <Loader2 className="h-4 w-4 animate-spin" />
                         ) : (
                           <Plus className="h-4 w-4" />
                         )}
                       </Button>
                     </div>
                   ))}
                 </div>
               )}
             </ScrollArea>
           </TabsContent>
         </Tabs>
       </DialogContent>
     </Dialog>
   );
 };