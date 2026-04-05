import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Folder, FolderOpen, ChevronRight, ChevronDown } from "lucide-react";
import { FolderActionsMenu } from "@/components/documents/FolderActionsMenu";
import { FolderStatsDisplay } from "@/components/documents/FolderStatsDisplay";
import { BulkDeleteDialog } from "@/components/documents/BulkDeleteDialog";
import { ReprocessDialog, ReprocessMode } from "@/components/documents/ReprocessDialog";
import { useFolderStats } from "@/hooks/useFolderStats";
import { useFolderOperations } from "@/hooks/useFolderOperations";

interface Department {
  id: string;
  name: string;
}

interface DocumentFolder {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  department_id: string | null;
  folder_type: string;
  created_at: string;
  children?: DocumentFolder[];
}

const FOLDER_TYPES = [
  { value: "general", label: "Общее" },
  { value: "laws", label: "Законы и нормативка" },
  { value: "court", label: "Судебные решения" },
  { value: "practice", label: "Собственная практика" },
  { value: "templates", label: "Шаблоны документов" },
];

export default function Folders() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Bulk operations state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reprocessDialogOpen, setReprocessDialogOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<DocumentFolder | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    parent_id: "",
    department_id: "",
    folder_type: "general",
  });

  // Fetch folder stats
  const folderIds = useMemo(() => folders.map(f => f.id), [folders]);
  const { stats: folderStatsMap, loading: statsLoading, refetch: refetchStats } = useFolderStats(folderIds);

  // Folder operations hook
  const {
    clearFolder,
    reprocessFolder,
    isDeleting,
    isReprocessing,
    reprocessProgress,
  } = useFolderOperations(() => {
    fetchData();
    refetchStats();
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [foldersRes, deptsRes] = await Promise.all([
        supabase.from("document_folders").select("*").order("name"),
        supabase.from("departments").select("id, name").order("name"),
      ]);

      if (foldersRes.error) throw foldersRes.error;
      if (deptsRes.error) throw deptsRes.error;

      setFolders(foldersRes.data || []);
      setDepartments(deptsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  };

  const buildTree = (items: DocumentFolder[], parentId: string | null = null): DocumentFolder[] => {
    return items
      .filter((item) => item.parent_id === parentId)
      .map((item) => ({
        ...item,
        children: buildTree(items, item.id),
      }));
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[а-яё]/g, (char) => {
        const map: Record<string, string> = {
          а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
          ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
          н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
          ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "",
          ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
        };
        return map[char] || char;
      })
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: editingFolder ? prev.slug : generateSlug(name),
    }));
  };

  const resetForm = () => {
    setFormData({
      name: "",
      slug: "",
      description: "",
      parent_id: "",
      department_id: "",
      folder_type: "general",
    });
    setEditingFolder(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name: formData.name,
      slug: formData.slug,
      description: formData.description || null,
      parent_id: formData.parent_id || null,
      department_id: formData.department_id || null,
      folder_type: formData.folder_type,
    };

    try {
      if (editingFolder) {
        const { error } = await supabase
          .from("document_folders")
          .update(payload)
          .eq("id", editingFolder.id);
        if (error) throw error;
        toast.success("Папка обновлена");
      } else {
        const { error } = await supabase.from("document_folders").insert(payload);
        if (error) throw error;
        toast.success("Папка создана");
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error("Error saving folder:", error);
      toast.error(error.message || "Ошибка сохранения");
    }
  };

  const handleEdit = (folder: DocumentFolder) => {
    setEditingFolder(folder);
    setFormData({
      name: folder.name,
      slug: folder.slug,
      description: folder.description || "",
      parent_id: folder.parent_id || "",
      department_id: folder.department_id || "",
      folder_type: folder.folder_type,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (folder: DocumentFolder) => {
    if (!confirm(`Удалить папку "${folder.name}" и все вложенные?`)) return;

    try {
      const { error } = await supabase
        .from("document_folders")
        .delete()
        .eq("id", folder.id);
      if (error) throw error;
      toast.success("Папка удалена");
      fetchData();
    } catch (error: any) {
      console.error("Error deleting folder:", error);
      toast.error(error.message || "Ошибка удаления");
    }
  };

  const toggleExpanded = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const getFolderTypeLabel = (type: string) => {
    return FOLDER_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getDepartmentName = (deptId: string | null) => {
    if (!deptId) return null;
    return departments.find((d) => d.id === deptId)?.name;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Folder action handlers
  const handleOpenDocuments = (folder: DocumentFolder) => {
    navigate(`/documents?folder=${folder.id}`);
  };

  const handleClearFolderClick = (folder: DocumentFolder) => {
    setSelectedFolder(folder);
    setDeleteDialogOpen(true);
  };

  const handleReprocessClick = (folder: DocumentFolder) => {
    setSelectedFolder(folder);
    setReprocessDialogOpen(true);
  };

  const handleConfirmClear = async () => {
    if (!selectedFolder) return;
    await clearFolder(selectedFolder.id);
    setDeleteDialogOpen(false);
    setSelectedFolder(null);
  };

  const handleReprocess = async (mode: ReprocessMode) => {
    if (!selectedFolder) return;
    await reprocessFolder(selectedFolder.id, mode);
    setReprocessDialogOpen(false);
    setSelectedFolder(null);
  };

  const renderFolderTree = (items: DocumentFolder[], level = 0) => {
    return items.map((folder) => {
      const isExpanded = expandedFolders.has(folder.id);
      const hasChildren = folder.children && folder.children.length > 0;
      const deptName = getDepartmentName(folder.department_id);
      const stats = folderStatsMap[folder.id];

      return (
        <div key={folder.id}>
          <div
            className="flex items-center gap-2 py-3 px-3 hover:bg-muted/50 rounded-md group"
            style={{ paddingLeft: `${level * 24 + 12}px` }}
          >
            <button
              onClick={() => hasChildren && toggleExpanded(folder.id)}
              className="w-5 h-5 flex items-center justify-center"
            >
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )
              ) : null}
            </button>

            {isExpanded ? (
              <FolderOpen className="h-5 w-5 text-primary" />
            ) : (
              <Folder className="h-5 w-5 text-muted-foreground" />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{folder.name}</span>
                <Badge variant="outline" className="text-xs">
                  {getFolderTypeLabel(folder.folder_type)}
                </Badge>
                {deptName && (
                  <Badge variant="secondary" className="text-xs">
                    {deptName}
                  </Badge>
                )}
              </div>
              <div className="mt-0.5">
                <FolderStatsDisplay stats={stats} loading={statsLoading} compact />
              </div>
            </div>

            <div className="opacity-0 group-hover:opacity-100 flex gap-1">
              <FolderActionsMenu
                folderId={folder.id}
                folderName={folder.name}
                stats={stats}
                onOpenDocuments={() => handleOpenDocuments(folder)}
                onEdit={() => handleEdit(folder)}
                onClearFolder={() => handleClearFolderClick(folder)}
                onReprocessAll={() => handleReprocessClick(folder)}
                onReprocessErrors={() => {
                  setSelectedFolder(folder);
                  setReprocessDialogOpen(true);
                }}
                onDeleteFolder={() => handleDelete(folder)}
              />
            </div>
          </div>

          {hasChildren && isExpanded && renderFolderTree(folder.children!, level + 1)}
        </div>
      );
    });
  };

  const folderTree = buildTree(folders);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Папки документов</h1>
          <p className="text-muted-foreground">
            Управление иерархией папок для RAG-базы
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Создать папку
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingFolder ? "Редактировать папку" : "Новая папка"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Название</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Судебные решения"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, slug: e.target.value }))
                  }
                  placeholder="court-decisions"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Описание папки..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="folder_type">Тип папки</Label>
                <Select
                  value={formData.folder_type}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, folder_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLDER_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_id">Родительская папка</Label>
              <Select
                  value={formData.parent_id || "_root"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, parent_id: value === "_root" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Корневая папка" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_root">Корневая папка</SelectItem>
                    {folders
                      .filter((f) => f.id !== editingFolder?.id)
                      .map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department_id">Отдел</Label>
              <Select
                  value={formData.department_id || "_all"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, department_id: value === "_all" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Все отделы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Все отделы</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button type="submit">
                  {editingFolder ? "Сохранить" : "Создать"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Структура папок</CardTitle>
          <CardDescription>
            Нажмите на стрелку для раскрытия вложенных папок
          </CardDescription>
        </CardHeader>
        <CardContent>
          {folderTree.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Папки не созданы. Нажмите "Создать папку" для начала.
            </div>
          ) : (
            <div className="space-y-1">{renderFolderTree(folderTree)}</div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Delete Dialog */}
      <BulkDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={`Очистить папку "${selectedFolder?.name}"`}
        description="Будут удалены все документы и их чанки из этой папки. Файлы также будут удалены из хранилища. Это действие необратимо."
        documentCount={selectedFolder ? (folderStatsMap[selectedFolder.id]?.documentCount || 0) : 0}
        chunkCount={selectedFolder ? (folderStatsMap[selectedFolder.id]?.chunkCount || 0) : 0}
        totalSize={selectedFolder ? formatFileSize(folderStatsMap[selectedFolder.id]?.totalSize || 0) : "0 B"}
        onConfirm={handleConfirmClear}
        isDeleting={isDeleting}
      />

      {/* Reprocess Dialog */}
      <ReprocessDialog
        open={reprocessDialogOpen}
        onOpenChange={setReprocessDialogOpen}
        folderName={selectedFolder?.name || ""}
        documentCount={selectedFolder ? (folderStatsMap[selectedFolder.id]?.documentCount || 0) : 0}
        errorCount={selectedFolder ? (folderStatsMap[selectedFolder.id]?.errorCount || 0) : 0}
        pendingCount={selectedFolder ? (folderStatsMap[selectedFolder.id]?.pendingCount || 0) : 0}
        onReprocess={handleReprocess}
        isProcessing={isReprocessing}
        progress={reprocessProgress}
      />
    </div>
  );
}
