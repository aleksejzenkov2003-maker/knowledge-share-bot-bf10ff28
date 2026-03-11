import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Bot, Pencil, Trash2, FolderOpen, Cpu } from "lucide-react";

interface Department {
  id: string;
  name: string;
}

interface SystemPrompt {
  id: string;
  name: string;
  department_id: string | null;
}

interface DocumentFolder {
  id: string;
  name: string;
  slug: string;
}

interface AIProvider {
  id: string;
  name: string;
  provider_type: string;
  default_model: string | null;
  is_active: boolean;
}

interface ChatRole {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  mention_trigger: string | null;
  department_ids: string[];
  system_prompt_id: string | null;
  folder_ids: string[];
  model_config: unknown;
  is_project_mode: boolean;
  is_active: boolean;
  allow_web_search: boolean;
  strict_rag_mode: boolean;
  created_at: string;
  system_prompt?: { name: string } | null;
}

const providerModels: Record<string, { value: string; label: string }[]> = {
  perplexity: [
    { value: 'sonar', label: 'Sonar (быстрый)' },
    { value: 'sonar-pro', label: 'Sonar Pro (точный, 2x цитат)' },
    { value: 'sonar-reasoning', label: 'Sonar Reasoning (рассуждения)' },
    { value: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro (DeepSeek R1)' },
    { value: 'sonar-deep-research', label: 'Sonar Deep Research (глубокий анализ)' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'o1', label: 'O1 (рассуждения)' },
    { value: 'o1-mini', label: 'O1 Mini' },
    { value: 'o3-mini', label: 'O3 Mini (новый)' },
  ],
  anthropic: [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (топ)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (новейший)' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (быстрый)' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
  lovable: [
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { value: 'openai/gpt-5', label: 'GPT-5' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'openai/gpt-5.2', label: 'GPT-5.2 (новейший)' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  gigachat: [
    { value: 'GigaChat-Max', label: 'GigaChat Max' },
    { value: 'GigaChat-Pro', label: 'GigaChat Pro' },
    { value: 'GigaChat-Plus', label: 'GigaChat Plus' },
  ],
};

export default function ChatRoles() {
  const [roles, setRoles] = useState<ChatRole[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<ChatRole | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    mention_trigger: "",
    department_ids: [] as string[],
    system_prompt_id: "",
    folder_ids: [] as string[],
    provider_id: "",
    model: "",
    is_project_mode: false,
    is_active: true,
    allow_web_search: true,
    strict_rag_mode: false,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rolesRes, deptsRes, promptsRes, foldersRes, providersRes] = await Promise.all([
        supabase
          .from("chat_roles")
          .select("*, system_prompt:system_prompts(name)")
          .order("name"),
        supabase.from("departments").select("id, name").order("name"),
        supabase.from("system_prompts").select("id, name, department_id").order("name"),
        supabase.from("document_folders").select("id, name, slug").order("name"),
        supabase.from("safe_ai_providers").select("id, name, provider_type, default_model, is_active").eq("is_active", true).order("name"),
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (deptsRes.error) throw deptsRes.error;
      if (promptsRes.error) throw promptsRes.error;
      if (foldersRes.error) throw foldersRes.error;
      if (providersRes.error) throw providersRes.error;

      setRoles(rolesRes.data || []);
      setDepartments(deptsRes.data || []);
      setPrompts(promptsRes.data || []);
      setFolders(foldersRes.data || []);
      setProviders((providersRes.data || []).map(p => ({
        id: p.id!,
        name: p.name!,
        provider_type: p.provider_type!,
        default_model: p.default_model,
        is_active: p.is_active!,
      })));
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
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
      slug: editingRole ? prev.slug : generateSlug(name),
    }));
  };

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    setFormData((prev) => ({
      ...prev,
      provider_id: providerId,
      model: provider?.default_model || "",
    }));
  };

  const getSelectedProviderType = () => {
    const provider = providers.find(p => p.id === formData.provider_id);
    return provider?.provider_type || "";
  };

  const getAvailableModels = () => {
    const providerType = getSelectedProviderType();
    return providerModels[providerType] || [];
  };

  const resetForm = () => {
    setFormData({
      name: "",
      slug: "",
      description: "",
      mention_trigger: "",
      department_ids: [],
      system_prompt_id: "",
      folder_ids: [],
      provider_id: "",
      model: "",
      is_project_mode: false,
      is_active: true,
      allow_web_search: true,
      strict_rag_mode: false,
    });
    setEditingRole(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const modelConfig = formData.provider_id 
      ? { provider_id: formData.provider_id, model: formData.model || undefined }
      : null;

    const payload = {
      name: formData.name,
      slug: formData.slug,
      description: formData.description || null,
      mention_trigger: formData.mention_trigger || null,
      department_ids: formData.department_ids.length > 0 ? formData.department_ids : [],
      system_prompt_id: formData.system_prompt_id || null,
      folder_ids: formData.folder_ids,
      model_config: modelConfig,
      is_project_mode: formData.is_project_mode,
      is_active: formData.is_active,
      allow_web_search: formData.allow_web_search,
      strict_rag_mode: formData.strict_rag_mode,
    };

    try {
      if (editingRole) {
        const { error } = await supabase
          .from("chat_roles")
          .update(payload)
          .eq("id", editingRole.id);
        if (error) throw error;
        toast.success("Роль обновлена");
      } else {
        const { error } = await supabase.from("chat_roles").insert(payload);
        if (error) throw error;
        toast.success("Роль создана");
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error("Error saving role:", error);
      toast.error(error.message || "Ошибка сохранения");
    }
  };

  const handleEdit = (role: ChatRole) => {
    setEditingRole(role);
    const modelConfig = role.model_config as { provider_id?: string; model?: string } | null;
    setFormData({
      name: role.name,
      slug: role.slug,
      description: role.description || "",
      mention_trigger: role.mention_trigger || "",
      department_ids: role.department_ids || [],
      system_prompt_id: role.system_prompt_id || "",
      folder_ids: role.folder_ids || [],
      provider_id: modelConfig?.provider_id || "",
      model: modelConfig?.model || "",
      is_project_mode: role.is_project_mode,
      is_active: role.is_active,
      allow_web_search: (role as any).allow_web_search !== false,
      strict_rag_mode: (role as any).strict_rag_mode === true,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (role: ChatRole) => {
    if (!confirm(`Удалить роль "${role.name}"?`)) return;

    try {
      const { error } = await supabase.from("chat_roles").delete().eq("id", role.id);
      if (error) throw error;
      toast.success("Роль удалена");
      fetchData();
    } catch (error: any) {
      console.error("Error deleting role:", error);
      toast.error(error.message || "Ошибка удаления");
    }
  };

  const toggleFolderSelection = (folderId: string) => {
    setFormData((prev) => ({
      ...prev,
      folder_ids: prev.folder_ids.includes(folderId)
        ? prev.folder_ids.filter((id) => id !== folderId)
        : [...prev.folder_ids, folderId],
    }));
  };

  const toggleDepartmentSelection = (departmentId: string) => {
    setFormData((prev) => ({
      ...prev,
      department_ids: prev.department_ids.includes(departmentId)
        ? prev.department_ids.filter((id) => id !== departmentId)
        : [...prev.department_ids, departmentId],
    }));
  };

  const getDepartmentNames = (departmentIds: string[]) => {
    if (!departmentIds || departmentIds.length === 0) return "Все отделы";
    return departmentIds
      .map((id) => departments.find((d) => d.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  };

  const getFolderNames = (folderIds: string[]) => {
    return folderIds
      .map((id) => folders.find((f) => f.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  };

  const getProviderName = (modelConfig: unknown) => {
    const config = modelConfig as { provider_id?: string; model?: string } | null;
    if (!config?.provider_id) return null;
    const provider = providers.find(p => p.id === config.provider_id);
    return provider?.name;
  };

  const getModelLabel = (modelConfig: unknown) => {
    const config = modelConfig as { provider_id?: string; model?: string } | null;
    if (!config?.model) return null;
    return config.model;
  };

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
          <h1 className="text-3xl font-bold">Роли чатов</h1>
          <p className="text-muted-foreground">
            Настройка AI-ассистентов с привязкой к папкам документов
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Создать роль
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingRole ? "Редактировать роль" : "Новая роль"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Название</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Помощник по патентам"
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
                  placeholder="patent-helper"
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
                  placeholder="Описание роли..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mention_trigger">@Упоминание (для чата отдела)</Label>
                <Input
                  id="mention_trigger"
                  value={formData.mention_trigger}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, mention_trigger: e.target.value }))
                  }
                  placeholder="@юрист"
                />
                <p className="text-xs text-muted-foreground">
                  Триггер для вызова агента в чате отдела. Если не указан, используется @slug
                </p>
              </div>

              <div className="space-y-2">
                <Label>Отделы (мультивыбор)</Label>
                <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                  {departments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Отделы не созданы
                    </p>
                  ) : (
                    departments.map((dept) => (
                      <div key={dept.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`dept-${dept.id}`}
                          checked={formData.department_ids.includes(dept.id)}
                          onCheckedChange={() => toggleDepartmentSelection(dept.id)}
                        />
                        <label
                          htmlFor={`dept-${dept.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {dept.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formData.department_ids.length === 0 ? "Доступна всем отделам" : `Выбрано: ${formData.department_ids.length}`}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="system_prompt_id">Системный промпт</Label>
              <Select
                  value={formData.system_prompt_id || "_none"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, system_prompt_id: value === "_none" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите промпт" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Без промпта</SelectItem>
                    {prompts.map((prompt) => (
                      <SelectItem key={prompt.id} value={prompt.id}>
                        {prompt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* AI Provider Selection */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  AI Провайдер
                </Label>
                <Select
                  value={formData.provider_id || "_default"}
                  onValueChange={(value) => handleProviderChange(value === "_default" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="По умолчанию" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_default">По умолчанию (системный)</SelectItem>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.provider_id && getAvailableModels().length > 0 && (
                <div className="space-y-2">
                  <Label>Модель</Label>
                  <Select
                    value={formData.model || "_default"}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, model: value === "_default" ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="По умолчанию провайдера" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_default">По умолчанию провайдера</SelectItem>
                      {getAvailableModels().map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Папки для поиска (RAG)</Label>
                <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                  {folders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Папки не созданы
                    </p>
                  ) : (
                    folders.map((folder) => (
                      <div key={folder.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`folder-${folder.id}`}
                          checked={formData.folder_ids.includes(folder.id)}
                          onCheckedChange={() => toggleFolderSelection(folder.id)}
                        />
                        <label
                          htmlFor={`folder-${folder.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {folder.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Выбрано папок: {formData.folder_ids.length}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="is_project_mode">Проектный режим</Label>
                <Switch
                  id="is_project_mode"
                  checked={formData.is_project_mode}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_project_mode: checked }))
                  }
                />
              </div>

              {/* Web Search Control */}
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-sm font-medium">Настройки источников</Label>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allow_web_search" className="text-sm">Веб-поиск</Label>
                    <p className="text-xs text-muted-foreground">
                      Разрешить дополнять ответы из интернета
                    </p>
                  </div>
                  <Switch
                    id="allow_web_search"
                    checked={formData.allow_web_search}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, allow_web_search: checked }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="strict_rag_mode" className="text-sm">Строгий RAG</Label>
                    <p className="text-xs text-muted-foreground">
                      Отвечать только на основе документов
                    </p>
                  </div>
                  <Switch
                    id="strict_rag_mode"
                    checked={formData.strict_rag_mode}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, strict_rag_mode: checked }))
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Активна</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_active: checked }))
                  }
                />
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
                  {editingRole ? "Сохранить" : "Создать"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Список ролей</CardTitle>
          <CardDescription>
            Роли определяют поведение AI-ассистента и источники данных
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Роли не созданы
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Провайдер / Модель</TableHead>
                  <TableHead>Отдел</TableHead>
                  <TableHead>Папки</TableHead>
                  <TableHead>Режим</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-24">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div>{role.name}</div>
                          {role.system_prompt?.name && (
                            <div className="text-xs text-muted-foreground">
                              {role.system_prompt.name}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getProviderName(role.model_config) ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit">
                            <Cpu className="h-3 w-3 mr-1" />
                            {getProviderName(role.model_config)}
                          </Badge>
                          {getModelLabel(role.model_config) && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {getModelLabel(role.model_config)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">По умолчанию</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={role.department_ids?.length > 0 ? "" : "text-muted-foreground"}>
                        {getDepartmentNames(role.department_ids || [])}
                      </span>
                    </TableCell>
                    <TableCell>
                      {role.folder_ids?.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate max-w-32">
                            {getFolderNames(role.folder_ids)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.is_project_mode ? "default" : "outline"}>
                        {role.is_project_mode ? "Проект" : "Чат"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.is_active ? "default" : "secondary"}>
                        {role.is_active ? "Активна" : "Неактивна"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(role)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(role)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
