 import React, { useState } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { useProjectsQuery, useCreateProject } from '@/hooks/queries/useProjectQueries';
 import { Button } from '@/components/ui/button';
 import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
 import { Input } from '@/components/ui/input';
 import { Textarea } from '@/components/ui/textarea';
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogDescription,
   DialogFooter,
 } from '@/components/ui/dialog';
 import { Label } from '@/components/ui/label';
 import { 
   Loader2, 
   Plus, 
   FolderKanban, 
   Calendar, 
   Users,
   Archive,
   CheckCircle,
   Clock
 } from 'lucide-react';
 import { formatDistanceToNow } from 'date-fns';
 import { ru } from 'date-fns/locale';
 import { Project, ProjectStatus } from '@/types/project';
 
 const statusConfig: Record<ProjectStatus, { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'outline' }> = {
   active: { label: 'Активный', icon: Clock, variant: 'default' },
   archived: { label: 'Архив', icon: Archive, variant: 'secondary' },
   completed: { label: 'Завершён', icon: CheckCircle, variant: 'outline' },
 };
 
 const Projects: React.FC = () => {
   const navigate = useNavigate();
   const { data: projects = [], isLoading } = useProjectsQuery();
   const createProjectMutation = useCreateProject();
   
   const [createDialogOpen, setCreateDialogOpen] = useState(false);
   const [newProjectName, setNewProjectName] = useState('');
   const [newProjectDescription, setNewProjectDescription] = useState('');
 
   const handleCreateProject = async () => {
     if (!newProjectName.trim()) return;
     
     const project = await createProjectMutation.mutateAsync({
       name: newProjectName.trim(),
       description: newProjectDescription.trim() || undefined,
     });
     
     setCreateDialogOpen(false);
     setNewProjectName('');
     setNewProjectDescription('');
     
     // Navigate to the new project
     navigate(`/projects/${project.id}`);
   };
 
   const handleProjectClick = (project: Project) => {
     navigate(`/projects/${project.id}`);
   };
 
   if (isLoading) {
     return (
       <div className="flex items-center justify-center h-full">
         <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
       </div>
     );
   }
 
   return (
     <div className="container py-6 max-w-6xl">
       {/* Header */}
       <div className="flex items-center justify-between mb-6">
         <div>
           <h1 className="text-2xl font-bold flex items-center gap-2">
             <FolderKanban className="h-6 w-6" />
             Проекты
           </h1>
           <p className="text-muted-foreground text-sm mt-1">
             Командная работа с AI-агентами, контекстом и памятью проекта
           </p>
         </div>
         <Button onClick={() => setCreateDialogOpen(true)}>
           <Plus className="h-4 w-4 mr-2" />
           Новый проект
         </Button>
       </div>
 
       {/* Projects Grid */}
       {projects.length === 0 ? (
         <Card className="text-center py-12">
           <CardContent>
             <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
               <FolderKanban className="h-8 w-8 text-primary" />
             </div>
             <h3 className="text-lg font-semibold mb-2">Нет проектов</h3>
             <p className="text-muted-foreground text-sm mb-4 max-w-md mx-auto">
               Создайте первый проект для командной работы с AI-агентами. 
               Добавляйте участников, настраивайте контекст и ведите память проекта.
             </p>
             <Button onClick={() => setCreateDialogOpen(true)}>
               <Plus className="h-4 w-4 mr-2" />
               Создать проект
             </Button>
           </CardContent>
         </Card>
       ) : (
         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
           {projects.map((project) => {
             const status = statusConfig[project.status];
             const StatusIcon = status.icon;
             
             return (
               <Card 
                 key={project.id} 
                 className="cursor-pointer hover:border-primary/50 transition-colors"
                 onClick={() => handleProjectClick(project)}
               >
                 <CardHeader className="pb-3">
                   <div className="flex items-start justify-between">
                     <CardTitle className="text-base line-clamp-1">{project.name}</CardTitle>
                     <Badge variant={status.variant} className="shrink-0 ml-2">
                       <StatusIcon className="h-3 w-3 mr-1" />
                       {status.label}
                     </Badge>
                   </div>
                   {project.description && (
                     <CardDescription className="line-clamp-2 text-xs">
                       {project.description}
                     </CardDescription>
                   )}
                 </CardHeader>
                 <CardContent className="pt-0">
                   <div className="flex items-center gap-4 text-xs text-muted-foreground">
                     <span className="flex items-center gap-1">
                       <Calendar className="h-3 w-3" />
                       {formatDistanceToNow(new Date(project.updated_at), { 
                         addSuffix: true,
                         locale: ru 
                       })}
                     </span>
                   </div>
                 </CardContent>
               </Card>
             );
           })}
         </div>
       )}
 
       {/* Create Project Dialog */}
       <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Новый проект</DialogTitle>
             <DialogDescription>
               Создайте проект для командной работы с AI-агентами
             </DialogDescription>
           </DialogHeader>
           
           <div className="space-y-4 py-4">
             <div className="space-y-2">
               <Label htmlFor="name">Название проекта</Label>
               <Input
                 id="name"
                 placeholder="Например: Разработка API v2"
                 value={newProjectName}
                 onChange={(e) => setNewProjectName(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleCreateProject();
                   }
                 }}
               />
             </div>
             <div className="space-y-2">
               <Label htmlFor="description">Описание (опционально)</Label>
               <Textarea
                 id="description"
                 placeholder="Краткое описание проекта..."
                 value={newProjectDescription}
                 onChange={(e) => setNewProjectDescription(e.target.value)}
                 rows={3}
               />
             </div>
           </div>
           
           <DialogFooter>
             <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
               Отмена
             </Button>
             <Button 
               onClick={handleCreateProject}
               disabled={!newProjectName.trim() || createProjectMutation.isPending}
             >
               {createProjectMutation.isPending && (
                 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
               )}
               Создать
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </div>
   );
 };
 
 export default Projects;