import React, { useState, useEffect, useMemo } from 'react';
import type { WorkflowTemplateStep, WorkflowGraphEdge } from '@/types/workflow';
import type { EdgeMapping, EdgeCondition, EdgeConditionOperator } from '@/types/workflow-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Trash2, Plus, Save, ArrowRight, Info } from 'lucide-react';
import { isPassthroughEdge, DEFAULT_PASSTHROUGH_MAPPING } from '@/lib/workflowAutoFix';

function schemaKeys(schema: Record<string, unknown>): string[] {
  const p = schema?.properties;
  if (p && typeof p === 'object') return Object.keys(p as Record<string, unknown>);
  return ['content', 'result'];
}

type WhenMode = 'always' | 'if_truthy' | 'custom';

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
  const [passAll, setPassAll] = useState(isPassthroughEdge(edge.mapping));
  const [dirty, setDirty] = useState(false);

  // Determine "when" mode from existing conditions
  const initialWhen: WhenMode = useMemo(() => {
    const c = edge.conditions || [];
    if (c.length === 0) return 'always';
    if (
      c.length === 1 &&
      (c[0].operator === 'truthy' || c[0].operator === 'not_empty') &&
      (c[0].field === '' || c[0].field === '$' || c[0].field === 'content')
    ) {
      return 'if_truthy';
    }
    return 'custom';
  }, [edge.conditions]);
  const [when, setWhen] = useState<WhenMode>(initialWhen);

  useEffect(() => {
    setMapping(edge.mapping || []);
    setConditions(edge.conditions || []);
    setPassAll(isPassthroughEdge(edge.mapping));
    setWhen(initialWhen);
    setDirty(false);
  }, [edge.id, edge.mapping, edge.conditions, initialWhen]);

  const sourceKeys = useMemo(
    () => schemaKeys((sourceStep?.output_schema as Record<string, unknown>) || {}),
    [sourceStep]
  );
  const targetKeys = useMemo(
    () => schemaKeys((targetStep?.input_schema as Record<string, unknown>) || {}),
    [targetStep]
  );

  const handleSave = () => {
    let nextMapping = mapping;
    if (passAll) {
      nextMapping = DEFAULT_PASSTHROUGH_MAPPING;
    }
    let nextConditions: EdgeCondition[] = [];
    if (when === 'if_truthy') {
      nextConditions = [{ field: 'content', operator: 'not_empty' }];
    } else if (when === 'custom') {
      nextConditions = conditions;
    }
    onUpdate(edge.id, { mapping: nextMapping, conditions: nextConditions });
    setDirty(false);
  };

  const addMapping = () => {
    setMapping((m) => [
      ...m,
      { sourcePath: sourceKeys[0] || '', targetPath: targetKeys[0] || '', transform: 'passthrough' },
    ]);
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
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="font-medium truncate">{sourceStep?.name || '?'}</span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{targetStep?.name || '?'}</span>
        </div>

        <div className="rounded-md border bg-muted/30 p-2.5 mb-3 flex gap-2 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>
            По умолчанию весь подтверждённый результат предыдущего шага автоматически попадает в следующий.
            Вмешиваться нужно только если хотите фильтровать данные или ставить условия.
          </p>
        </div>

        {/* Передавать всё */}
        <div className="rounded-md border p-3 mb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Передавать всё</Label>
              <p className="text-[10px] text-muted-foreground">
                Весь результат предыдущего шага без преобразований
              </p>
            </div>
            <Switch
              checked={passAll}
              onCheckedChange={(v) => {
                setPassAll(v);
                if (v) setMapping(DEFAULT_PASSTHROUGH_MAPPING);
                setDirty(true);
              }}
            />
          </div>
        </div>

        {/* Когда переходить */}
        <div className="rounded-md border p-3 mb-3 space-y-2">
          <Label className="text-xs font-medium">Когда переходить</Label>
          <Select
            value={when}
            onValueChange={(v) => {
              setWhen(v as WhenMode);
              setDirty(true);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Всегда</SelectItem>
              <SelectItem value="if_truthy">Если предыдущий шаг дал результат</SelectItem>
              <SelectItem value="custom">По условию (свои правила)</SelectItem>
            </SelectContent>
          </Select>

          {when === 'custom' && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Все правила должны выполняться
                </span>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addCondition}>
                  <Plus className="h-3 w-3 mr-1" />
                  Правило
                </Button>
              </div>
              {conditions.map((row, i) => (
                <div key={i} className="flex gap-1 items-center border rounded p-2">
                  <Input
                    className="h-7 text-xs flex-1"
                    placeholder="поле"
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
                    <SelectTrigger className="h-7 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exists">Есть</SelectItem>
                      <SelectItem value="not_exists">Нет</SelectItem>
                      <SelectItem value="not_empty">Заполнено</SelectItem>
                      <SelectItem value="empty">Пусто</SelectItem>
                      <SelectItem value="eq">=</SelectItem>
                      <SelectItem value="neq">≠</SelectItem>
                      <SelectItem value="contains">Содержит</SelectItem>
                      <SelectItem value="gt">&gt;</SelectItem>
                      <SelectItem value="lt">&lt;</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-7 text-xs w-20"
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
          )}
        </div>

        {/* Эксперт: ручной маппинг */}
        {!passAll && (
          <Accordion type="single" collapsible defaultValue="expert">
            <AccordionItem value="expert" className="border-none">
              <AccordionTrigger className="text-xs py-2 hover:no-underline">
                Эксперт: маппинг полей
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    Точечно перенаправить поля результата
                  </p>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addMapping}>
                    <Plus className="h-3 w-3 mr-1" />
                    Строка
                  </Button>
                </div>
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
                          {sourceKeys.filter(Boolean).map((k) => (
                            <SelectItem key={k} value={k}>
                              {k}
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
                          {targetKeys.filter(Boolean).map((k) => (
                            <SelectItem key={k} value={k}>
                              {k}
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
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <Separator className="my-3" />
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
