import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectChat } from '@/hooks/useProjectChat';
import { useAddProjectMember, useRemoveProjectMember } from '@/hooks/queries/useProjectQueries';
import { AddMemberDialog } from '@/components/project/AddMemberDialog';
import { WorkflowPanel } from '@/components/workflow/WorkflowPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  MoreHorizontal,
  ArrowLeft,
  Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ProjectChatPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);

  const {
    project,
    isLoading,
    userMembers,
    agentMembers,
  } = useProjectChat(projectId || null, user?.id);

  const addMemberMutation = useAddProjectMember(projectId || '');

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

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-background">
        <div className="flex items-center gap-3">
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
            <h1 className="font-medium text-sm">{project.name}</h1>
            {project.description && (
              <p className="text-xs text-muted-foreground">{project.description}</p>
            )}
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

      {/* Workflow content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <WorkflowPanel projectId={projectId!} userId={user?.id} />
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
