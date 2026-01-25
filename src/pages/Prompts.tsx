import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MessageSquare, Plus, Pencil, Trash2, Building2, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface SystemPrompt {
  id: string;
  name: string;
  prompt_text: string;
  department_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface Department {
  id: string;
  name: string;
}

const Prompts = () => {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: '',
    prompt_text: '',
    department_id: '',
    is_active: true,
  });
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const fetchData = async () => {
    try {
      const [promptsRes, deptsRes] = await Promise.all([
        supabase.from('system_prompts').select('*').order('created_at', { ascending: false }),
        supabase.from('departments').select('id, name'),
      ]);

      if (promptsRes.data) setPrompts(promptsRes.data);
      if (deptsRes.data) setDepartments(deptsRes.data);
    } catch (error) {
      console.error('Error fetching prompts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openCreateDialog = () => {
    setEditingPrompt(null);
    setFormData({ name: '', prompt_text: '', department_id: '', is_active: true });
    setIsDialogOpen(true);
  };

  const openEditDialog = (prompt: SystemPrompt) => {
    setEditingPrompt(prompt);
    setFormData({
      name: prompt.name,
      prompt_text: prompt.prompt_text,
      department_id: prompt.department_id || '',
      is_active: prompt.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prompt_text.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Заполните название и текст промпта',
        variant: 'destructive',
      });
      return;
    }

    const payload = {
      name: formData.name,
      prompt_text: formData.prompt_text,
      department_id: formData.department_id || null,
      is_active: formData.is_active,
    };

    let error;
    if (editingPrompt) {
      ({ error } = await supabase
        .from('system_prompts')
        .update(payload)
        .eq('id', editingPrompt.id));
    } else {
      ({ error } = await supabase.from('system_prompts').insert(payload));
    }

    if (error) {
      toast({
        title: 'Ошибка',
        description: editingPrompt ? 'Не удалось обновить промпт' : 'Не удалось создать промпт',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Успешно',
        description: editingPrompt ? 'Промпт обновлён' : 'Промпт создан',
      });
      setIsDialogOpen(false);
      fetchData();
    }
  };

  const deletePrompt = async (id: string) => {
    const { error } = await supabase.from('system_prompts').delete().eq('id', id);

    if (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить промпт',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Успешно',
        description: 'Промпт удалён',
      });
      fetchData();
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from('system_prompts')
      .update({ is_active: !isActive })
      .eq('id', id);

    if (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось обновить статус',
        variant: 'destructive',
      });
    } else {
      fetchData();
    }
  };

  const getDepartmentName = (departmentId: string | null) => {
    if (!departmentId) return 'Общий';
    const dept = departments.find(d => d.id === departmentId);
    return dept?.name || 'Общий';
  };

  const getPromptPreview = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Системные промпты</h1>
          <p className="text-muted-foreground">
            Настройка системных инструкций для AI по отделам
          </p>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Добавить промпт
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingPrompt ? 'Редактировать промпт' : 'Новый системный промпт'}
                </DialogTitle>
                <DialogDescription>
                  Системный промпт определяет поведение AI для конкретного отдела
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Название</Label>
                    <Input
                      id="name"
                      placeholder="Например: Эксперт по патентам"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Отдел (пространство)</Label>
                    <Select
                      value={formData.department_id || "all"}
                      onValueChange={(value) => setFormData({ ...formData, department_id: value === "all" ? "" : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите отдел" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Общий (все отделы)</SelectItem>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prompt">Текст системного промпта</Label>
                  <Textarea
                    id="prompt"
                    placeholder="Ты - эксперт по патентному праву. Отвечай на вопросы о патентах, изобретениях и интеллектуальной собственности..."
                    value={formData.prompt_text}
                    onChange={(e) => setFormData({ ...formData, prompt_text: e.target.value })}
                    rows={16}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Активен</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Отмена
                </Button>
                <Button onClick={handleSubmit}>
                  {editingPrompt ? 'Сохранить' : 'Создать'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-3">
        {prompts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Промпты не найдены. Добавьте первый системный промпт.
            </CardContent>
          </Card>
        ) : (
          prompts.map((prompt) => {
            const isExpanded = expandedIds.has(prompt.id);
            return (
              <Collapsible key={prompt.id} open={isExpanded} onOpenChange={() => toggleExpanded(prompt.id)}>
                <Card className={cn(
                  "transition-all",
                  !prompt.is_active && "opacity-60"
                )}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{prompt.name}</span>
                            {!prompt.is_active && (
                              <Badge variant="secondary" className="text-xs">Неактивен</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span>{getDepartmentName(prompt.department_id)}</span>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="truncate">{getPromptPreview(prompt.prompt_text, 60)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isAdmin && (
                          <>
                            <Switch
                              checked={prompt.is_active}
                              onCheckedChange={() => toggleActive(prompt.id, prompt.is_active)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(prompt);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                deletePrompt(prompt.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <div className="rounded-lg border bg-muted/30 p-4 max-h-64 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                          {prompt.prompt_text}
                        </pre>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Prompts;
