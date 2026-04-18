import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, GitBranch, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { WorkflowTemplate } from '@/types/workflow';
import { workflowQueryKeys } from '@/hooks/useProjectWorkflow';

interface WorkflowTemplatesPageProps {
  onEditTemplate?: (id: string) => void;
}

const WorkflowTemplatesPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);

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

  // Lazy-load editor
  const WorkflowTemplateEditor = React.lazy(() => import('./WorkflowTemplateEditor'));

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

  if (editTemplateId) {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
        <WorkflowTemplateEditor
          templateId={editTemplateId}
          onBack={() => setEditTemplateId(null)}
        />
      </React.Suspense>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" />
            Workflow шаблоны
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Создавайте и настраивайте цепочки агентов для проектов
          </p>
        </div>
      </div>

      {/* Create new */}
      <Card className="p-4" data-tour="workflow-templates-create">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Название нового шаблона..."
            className="flex-1"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Создать
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Подсказка: дайте шаблону понятное название (например, «Подготовка КП» или «Досье клиента»).
          Дальше откроется визуальный редактор — там соберёте шаги и связи.
        </p>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Нет шаблонов. Создайте первый.</p>
        </div>
      ) : (
        <div className="grid gap-3" data-tour="workflow-templates-list">
          {templates.map(t => (
            <Card key={t.id} className="p-4 flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <GitBranch className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">{t.name}</div>
                  {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                  <div className="flex gap-1 mt-1 flex-wrap">
                    <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px]">
                      {t.is_active ? 'Активен' : 'Неактивен'}
                    </Badge>
                    {'template_status' in t && (t as WorkflowTemplate).template_status && (
                      <Badge variant="outline" className="text-[10px]">
                        {(t as WorkflowTemplate).template_status}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setEditTemplateId(t.id)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Редактор
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkflowTemplatesPage;
