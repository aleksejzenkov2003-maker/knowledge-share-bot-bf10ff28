import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useProjectsQuery,
  useCreateProject,
  useProjectFoldersQuery,
  useCreateProjectFolder,
  useRenameProjectFolder,
  useDeleteProjectFolder,
  useRenameProject,
  useMoveProject,
  useDeleteProject,
} from '@/hooks/queries/useProjectQueries';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Plus,
  FolderKanban,
  Calendar,
  Archive,
  CheckCircle,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderOpen,
  FolderPlus,
  FolderInput,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Project, ProjectStatus, ProjectFolder } from '@/types/project';
import { cn } from '@/lib/utils';

const statusConfig: Record<ProjectStatus, { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'Активный', icon: Clock, variant: 'default' },
  archived: { label: 'Архив', icon: Archive, variant: 'secondary' },
  completed: { label: 'Завершён', icon: CheckCircle, variant: 'outline' },
};

const Projects: React.FC = () => {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjectsQuery();
  const { data: folders = [] } = useProjectFoldersQuery();
  const createProjectMutation = useCreateProject();
  const createFolderMutation = useCreateProjectFolder();
  const renameFolderMutation = useRenameProjectFolder();
  const deleteFolderMutation = useDeleteProjectFolder();
  const renameProjectMutation = useRenameProject();
  const moveProjectMutation = useMoveProject();
  const deleteProjectMutation = useDeleteProject();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  // Folder creation
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Rename
  const [renameTarget, setRenameTarget] = useState<{ type: 'project' | 'folder'; id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'project' | 'folder'; id: string; name: string } | null>(null);

  // Expanded folders
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Group projects
  const { rootProjects, folderProjects } = useMemo(() => {
    const root: Project[] = [];
    const byFolder: Record<string, Project[]> = {};
    for (const p of projects) {
      if (p.folder_id) {
        if (!byFolder[p.folder_id]) byFolder[p.folder_id] = [];
        byFolder[p.folder_id].push(p);
      } else {
        root.push(p);
      }
    }
    return { rootProjects: root, folderProjects: byFolder };
  }, [projects]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const project = await createProjectMutation.mutateAsync({
      name: newProjectName.trim(),
      description: newProjectDescription.trim() || undefined,
    });
    setCreateDialogOpen(false);
    setNewProjectName('');
    setNewProjectDescription('');
    navigate(`/projects/${project.id}`);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolderMutation.mutateAsync(newFolderName.trim());
    setFolderDialogOpen(false);
    setNewFolderName('');
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    if (renameTarget.type === 'project') {
      await renameProjectMutation.mutateAsync({ id: renameTarget.id, name: renameValue.trim() });
    } else {
      await renameFolderMutation.mutateAsync({ id: renameTarget.id, name: renameValue.trim() });
    }
    setRenameTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'project') {
      await deleteProjectMutation.mutateAsync(deleteTarget.id);
    } else {
      await deleteFolderMutation.mutateAsync(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const renderProjectCard = (project: Project) => {
    const status = statusConfig[project.status];
    const StatusIcon = status.icon;

    return (
      <Card
        key={project.id}
        className="cursor-pointer hover:border-primary/50 transition-colors group relative"
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base line-clamp-1">{project.name}</CardTitle>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <Badge variant={status.variant} className="text-xs">
                <StatusIcon className="h-3 w-3 mr-1" />
                {status.label}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onClick={() => { setRenameTarget({ type: 'project', id: project.id, name: project.name }); setRenameValue(project.name); }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Переименовать
                  </DropdownMenuItem>
                  {folders.length > 0 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <FolderInput className="h-4 w-4 mr-2" />
                        Переместить в папку
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {project.folder_id && (
                          <DropdownMenuItem onClick={() => moveProjectMutation.mutate({ id: project.id, folderId: null })}>
                            <FolderOpen className="h-4 w-4 mr-2" />
                            Без папки
                          </DropdownMenuItem>
                        )}
                        {folders
                          .filter((f) => f.id !== project.folder_id)
                          .map((f) => (
                            <DropdownMenuItem key={f.id} onClick={() => moveProjectMutation.mutate({ id: project.id, folderId: f.id })}>
                              <FolderOpen className="h-4 w-4 mr-2" />
                              {f.name}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleteTarget({ type: 'project', id: project.id, name: project.name })}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {project.description && (
            <CardDescription className="line-clamp-2 text-xs">{project.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true, locale: ru })}
            </span>
          </div>
        </CardContent>
      </Card>
    );
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setFolderDialogOpen(true)}>
            <FolderPlus className="h-4 w-4 mr-2" />
            Папка
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Новый проект
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {projects.length === 0 && folders.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <FolderKanban className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Нет проектов</h3>
            <p className="text-muted-foreground text-sm mb-4 max-w-md mx-auto">
              Создайте первый проект для командной работы с AI-агентами.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Создать проект
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Folders */}
          {folders.map((folder) => {
            const folderProjectsList = folderProjects[folder.id] || [];
            const isExpanded = expandedFolders.has(folder.id);

            return (
              <div key={folder.id}>
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer group"
                  onClick={() => toggleFolder(folder.id)}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{folder.name}</span>
                  <Badge variant="outline" className="text-xs ml-1">{folderProjectsList.length}</Badge>
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); setRenameTarget({ type: 'folder', id: folder.id, name: folder.name }); setRenameValue(folder.name); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name }); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 pl-9 mt-2 mb-3">
                    {folderProjectsList.length === 0 ? (
                      <p className="text-xs text-muted-foreground col-span-full py-2">Папка пуста</p>
                    ) : (
                      folderProjectsList.map(renderProjectCard)
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Root projects */}
          {rootProjects.length > 0 && (
            <>
              {folders.length > 0 && (
                <div className="text-xs text-muted-foreground px-3 pt-2">Без папки</div>
              )}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {rootProjects.map(renderProjectCard)}
              </div>
            </>
          )}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый проект</DialogTitle>
            <DialogDescription>Создайте проект для командной работы с AI-агентами</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название проекта</Label>
              <Input
                id="name"
                placeholder="Например: Разработка API v2"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreateProject(); } }}
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
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim() || createProjectMutation.isPending}>
              {createProjectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая папка</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="folder-name">Название</Label>
            <Input
              id="folder-name"
              placeholder="Название папки..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || createFolderMutation.isPending}>
              {createFolderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать {renameTarget?.type === 'project' ? 'проект' : 'папку'}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Отмена</Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Удалить {deleteTarget?.type === 'project' ? 'проект' : 'папку'} «{deleteTarget?.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'project'
                ? 'Проект и все его данные будут удалены безвозвратно.'
                : 'Папка будет удалена. Проекты из неё станут без папки.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Projects;
