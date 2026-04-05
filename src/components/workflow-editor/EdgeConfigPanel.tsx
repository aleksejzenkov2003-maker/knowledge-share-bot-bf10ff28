import React, { useState, useEffect, useMemo } from 'react';
import type { WorkflowTemplateStep, WorkflowGraphEdge } from '@/types/workflow';
import type { EdgeMapping, EdgeCondition, EdgeConditionOperator } from '@/types/workflow-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Trash2, Plus, Save } from 'lucide-react';

function schemaKeys(schema: Record<string, unknown>): string[] {
  const p = schema?.properties;
  if (p && typeof p === 'object') return Object.keys(p as Record<string, unknown>);
  return ['content', 'result', ''];
}

interface EdgeConfigPanelProps {
  edge: WorkflowGraphEdge;
  sourceStep: WorkflowTemplateStep | null;
  targetStep: WorkflowTemplateStep | null;
  onUpdate: (edgeId: string, patch: { mapping?: EdgeMapping[]; conditions?: EdgeCondition[] }) => void;
  onDelete: (edgeId: string) => void;
  onClose: () => void;
}

export const EdgeConfigPanel: React.FC<EdgeConfigPanelProps> = ({
  edge,
  sourceStep,
  targetStep,
  onUpdate,
  onDelete,
  onClose,
}) => {
  const [mapping, setMapping] = useState<EdgeMapping[]>(edge.mapping || []);
  const [conditions, setConditions] = useState<EdgeCondition[]>(edge.conditions || []);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setMapping(edge.mapping || []);
    setConditions(edge.conditions || []);
    setDirty(false);
  }, [edge.id, edge.mapping, edge.conditions]);

  const sourceKeys = useMemo(
    () => schemaKeys((sourceStep?.output_schema as Record<string, unknown>) || {}),
    [sourceStep]
  );
  const targetKeys = useMemo(
    () => schemaKeys((targetStep?.input_schema as Record<string, unknown>) || {}),
    [targetStep]
  );

  const previewExpr = useMemo(() => {
    const nk = sourceStep?.node_key || sourceStep?.name?.slice(0, 8) || 'upstream';
    return `{{node.${nk}.approved_output.<field>}}`;
  }, [sourceStep]);

  const handleSave = () => {
    onUpdate(edge.id, { mapping, conditions });
    setDirty(false);
  };

  const addMapping = () => {
    setMapping((m) => [...m, { sourcePath: sourceKeys[0] || '', targetPath: targetKeys[0] || '', transform: 'passthrough' }]);
    setDirty(true);
  };

  const addCondition = () => {
    setConditions((c) => [...c, { field: '', operator: 'exists' as EdgeConditionOperator }]);
    setDirty(true);
  };

  return (
    <div className="w-96 border-l border-border bg-card flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b">
        <span className="text-sm font-semibold">Связь</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3">
        <p className="text-xs text-muted-foreground mb-3">
          {sourceStep?.name || '?'} → {targetStep?.name || '?'}
        </p>

        <div className="rounded-md bg-muted/40 p-2 mb-3">
          <Label className="text-[10px] text-muted-foreground">Шаблон ссылки</Label>
          <code className="text-[10px] block break-all mt-1">{previewExpr}</code>
        </div>

        <Separator className="my-3" />

        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Маппинг полей</Label>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addMapping}>
            <Plus className="h-3 w-3 mr-1" />
            Строка
          </Button>
        </div>
        <div className="space-y-2">
          {mapping.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-1 items-center border rounded p-2">
              <div className="col-span-5">
                <Select
                  value={row.sourcePath || '__empty__'}
                  onValueChange={(v) => {
                    const next = [...mapping];
                    next[i] = { ...row, sourcePath: v === '__empty__' ? '' : v };
                    setMapping(next);
                    setDirty(true);
                  }}
                >
                  <SelectTrigger className="h-7 text-[10px]">
                    <SelectValue placeholder="из" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">(весь объект)</SelectItem>
                    {sourceKeys.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k || '—'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-5">
                <Select
                  value={row.targetPath || '__empty__'}
                  onValueChange={(v) => {
                    const next = [...mapping];
                    next[i] = { ...row, targetPath: v === '__empty__' ? '' : v };
                    setMapping(next);
                    setDirty(true);
                  }}
                >
                  <SelectTrigger className="h-7 text-[10px]">
                    <SelectValue placeholder="в" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">(корень)</SelectItem>
                    {targetKeys.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k || '—'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setMapping(mapping.filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="col-span-12">
                <Select
                  value={row.transform || 'passthrough'}
                  onValueChange={(v) => {
                    const next = [...mapping];
                    next[i] = { ...row, transform: v as EdgeMapping['transform'] };
                    setMapping(next);
                    setDirty(true);
                  }}
                >
                  <SelectTrigger className="h-7 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passthrough">passthrough</SelectItem>
                    <SelectItem value="json_stringify">json_stringify</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>

        <Separator className="my-3" />

        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Условия ребра</Label>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addCondition}>
            <Plus className="h-3 w-3 mr-1" />
            Условие
          </Button>
        </div>
        <div className="space-y-2">
          {conditions.map((row, i) => (
            <div key={i} className="flex gap-1 items-center border rounded p-2">
              <Input
                className="h-7 text-xs flex-1"
                placeholder="field"
                value={row.field}
                onChange={(e) => {
                  const next = [...conditions];
                  next[i] = { ...row, field: e.target.value };
                  setConditions(next);
                  setDirty(true);
                }}
              />
              <Select
                value={row.operator}
                onValueChange={(v) => {
                  const next = [...conditions];
                  next[i] = { ...row, operator: v as EdgeConditionOperator };
                  setConditions(next);
                  setDirty(true);
                }}
              >
                <SelectTrigger className="h-7 text-xs w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eq">eq</SelectItem>
                  <SelectItem value="neq">neq</SelectItem>
                  <SelectItem value="exists">exists</SelectItem>
                  <SelectItem value="truthy">truthy</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-7 text-xs flex-1"
                placeholder="value"
                value={row.value != null ? String(row.value) : ''}
                onChange={(e) => {
                  const next = [...conditions];
                  next[i] = { ...row, value: e.target.value };
                  setConditions(next);
                  setDirty(true);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  setConditions(conditions.filter((_, j) => j !== i));
                  setDirty(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t flex items-center justify-between gap-2">
        <Button variant="destructive" size="sm" onClick={() => onDelete(edge.id)}>
          Удалить связь
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!dirty}>
          <Save className="h-3.5 w-3.5 mr-1" />
          Сохранить
        </Button>
      </div>
    </div>
  );
};
