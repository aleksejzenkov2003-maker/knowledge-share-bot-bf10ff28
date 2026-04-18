import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  GitBranch,
  Plus,
  Pencil,
  Trash2,
  LibraryBig,
  Sparkles,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { WorkflowTemplate } from '@/types/workflow';
import { workflowQueryKeys } from '@/hooks/useProjectWorkflow';
import { AIArchitectDialog } from '@/components/workflow-editor/AIArchitectDialog';

const WorkflowTemplatesPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'mine' | 'gallery'>('mine');
  const [aiOpen, setAiOpen] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: workflowQueryKeys.templates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as WorkflowTemplate[];
    },
  });

  const WorkflowTemplateEditor = React.lazy(() => import('./WorkflowTemplateEditor'));

  const mine = React.useMemo(
    () => templates.filter((t) => !t.is_preset),
    [templates],
  );
  const presets = React.useMemo(
    () => templates.filter((t) => t.is_preset),
    [templates],
  );

  const handleCreate = async () => {
    if (!newName.trim() || !user?.id) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('workflow_templates')
        .insert({
          name: newName.trim(),
          created_by: user.id,
          template_status: 'draft',
          version: 1,
          schema: {},
        } as never)
        .select()
        .single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templates });
      setNewName('');
      setEditTemplateId(data.id);
      toast.success('Шаблон создан');
    } catch {
      toast.error('Ошибка создания шаблона');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('workflow_templates').delete().eq('id', id);
    if (error) { toast.error('Ошибка удаления'); return; }
    queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templates });
    if (editTemplateId === id) setEditTemplateId(null);
    toast.success('Шаблон удалён');
  };

  const handleUsePreset = async (preset: WorkflowTemplate) => {
    setCloningId(preset.id);
    try {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: string | null; error: Error | null }>
      )('clone_workflow_template', {
        source_template_id: preset.id,
        new_name: `${preset.name.replace(/\s*\(скелет\)\s*$/i, '')} — моя копия`,
        new_owner: user?.id ?? null,
      });
      if (error) throw error;
      const newId = data as unknown as string;
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templates });
      toast.success('Шаблон скопирован — открываю редактор');
      setEditTemplateId(newId);
    } catch (err) {
      console.error('clone_workflow_template failed', err);
      toast.error('Не удалось скопировать шаблон');
    } finally {
      setCloningId(null);
    }
  };

  if (editTemplateId) {
    return (
      <React.Suspense
        fallback={
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        }
      >
        <WorkflowTemplateEditor
          templateId={editTemplateId}
          onBack={() => setEditTemplateId(null)}
          onOpenGallery={() => {
            setEditTemplateId(null);
            setActiveTab('gallery');
          }}
          onOpenAIArchitect={() => {
            setEditTemplateId(null);
            setAiOpen(true);
          }}
        />
      </React.Suspense>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" />
            Workflow шаблоны
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Создавайте процессы с нуля, берите скелет из галереи или опишите задачу словами
          </p>
        </div>
        <Button
          onClick={() => setAiOpen(true)}
          className="gap-1.5 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white"
          data-tour="workflow-ai-architect"
        >
          <Sparkles className="h-4 w-4" />
          Создать с ИИ
        </Button>
      </div>

      <AIArchitectDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onTemplateCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templates });
          setEditTemplateId(id);
        }}
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'mine' | 'gallery')}
      >
        <TabsList>
          <TabsTrigger value="mine" className="gap-1.5" data-tour="workflow-tab-mine">
            <GitBranch className="h-3.5 w-3.5" />
            Мои шаблоны
            {mine.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {mine.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="gallery" className="gap-1.5" data-tour="workflow-tab-gallery">
            <LibraryBig className="h-3.5 w-3.5" />
            Готовые шаблоны
            {presets.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {presets.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── MINE ─────────────────────────────── */}
        <TabsContent value="mine" className="space-y-4 mt-4">
          <Card className="p-4" data-tour="workflow-templates-create">
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Название нового шаблона..."
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Создать
              </Button>
              <Button
                variant="outline"
                onClick={() => setActiveTab('gallery')}
                className="gap-1.5"
              >
                <LibraryBig className="h-4 w-4" />
                Выбрать из галереи
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Подсказка: дайте шаблону понятное название. Если не знаете с чего начать —
              возьмите готовый скелет из галереи и допишите под свою задачу.
            </p>
          </Card>

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : mine.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-3">
              <GitBranch className="h-12 w-12 mx-auto opacity-30" />
              <p>У вас пока нет своих шаблонов.</p>
              <Button
                variant="outline"
                onClick={() => setActiveTab('gallery')}
                className="gap-1.5"
              >
                <LibraryBig className="h-4 w-4" />
                Посмотреть галерею
              </Button>
            </div>
          ) : (
            <div className="grid gap-3" data-tour="workflow-templates-list">
              {mine.map((t) => (
                <Card
                  key={t.id}
                  className="p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <GitBranch className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{t.name}</div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      )}
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge
                          variant={t.is_active ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {t.is_active ? 'Активен' : 'Неактивен'}
                        </Badge>
                        {t.template_status && (
                          <Badge variant="outline" className="text-[10px]">
                            {t.template_status === 'published'
                              ? 'опубликован'
                              : t.template_status === 'archived'
                                ? 'архив'
                                : 'черновик'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditTemplateId(t.id)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Редактор
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(t.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── GALLERY ──────────────────────────── */}
        <TabsContent value="gallery" className="space-y-4 mt-4">
          <Card className="p-4 bg-muted/30 border-dashed">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-violet-500 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-sm">Как пользоваться галереей</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Готовые шаблоны — это скелеты процессов. Нажмите{' '}
                  <span className="font-medium">«Использовать»</span> — мы сделаем вашу копию,
                  где можно поменять агентов, промпты и связи. Оригинал галереи остаётся без
                  изменений.
                </p>
              </div>
            </div>
          </Card>

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : presets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <LibraryBig className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>В галерее пока нет готовых шаблонов.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {presets.map((t) => (
                <Card
                  key={t.id}
                  className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                      <LibraryBig className="h-5 w-5 text-violet-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium">{t.name}</div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                          {t.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      готовый шаблон
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => handleUsePreset(t)}
                      disabled={cloningId === t.id}
                      className="gap-1.5"
                    >
                      {cloningId === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Использовать
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WorkflowTemplatesPage;
