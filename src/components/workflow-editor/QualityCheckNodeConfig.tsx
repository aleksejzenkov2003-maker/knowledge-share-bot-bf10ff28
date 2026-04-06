import React from 'react';
import type { OrchestrationRule, QualityCheckOrchestration } from '@/lib/workflowOrchestration';
import type { EdgeConditionOperator } from '@/types/workflow-editor';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Trash2, Info } from 'lucide-react';

const OPERATORS: { value: EdgeConditionOperator; label: string }[] = [
  { value: 'not_empty', label: 'Поле не пустое' },
  { value: 'empty', label: 'Поле пустое (ошибка)' },
  { value: 'eq', label: 'Точно равно' },
  { value: 'neq', label: 'Не равно' },
  { value: 'contains', label: 'Содержит текст' },
  { value: 'not_contains', label: 'Не должно содержать' },
  { value: 'truthy', label: 'Должно быть ИСТИНА' },
  { value: 'gt', label: 'Число больше' },
  { value: 'gte', label: 'Число ≥' },
  { value: 'lt', label: 'Число меньше' },
  { value: 'lte', label: 'Число ≤' },
];

function defaultOrch(): QualityCheckOrchestration {
  return {
    kind: 'quality_check',
    combine: 'all',
    rules: [{ field: 'content', operator: 'not_empty', value: undefined }],
  };
}

function ensureOrch(scriptConfig: Record<string, unknown>): QualityCheckOrchestration {
  const o = scriptConfig.orchestration;
  if (o && typeof o === 'object' && (o as QualityCheckOrchestration).kind === 'quality_check') {
    return o as QualityCheckOrchestration;
  }
  return defaultOrch();
}

interface QualityCheckNodeConfigProps {
  scriptConfig: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export const QualityCheckNodeConfig: React.FC<QualityCheckNodeConfigProps> = ({ scriptConfig, onChange }) => {
  const orch = ensureOrch(scriptConfig);

  const setOrch = (next: QualityCheckOrchestration) => {
    onChange({ ...scriptConfig, orchestration: next });
  };

  const updateRule = (i: number, patch: Partial<OrchestrationRule>) => {
    const rules = [...(orch.rules || [])];
    rules[i] = { ...rules[i], ...patch };
    setOrch({ ...orch, rules });
  };

  const addRule = () => {
    setOrch({
      ...orch,
      rules: [...(orch.rules || []), { field: 'content', operator: 'not_empty', value: undefined }],
    });
  };

  const removeRule = (i: number) => {
    const rules = (orch.rules || []).filter((_, j) => j !== i);
    setOrch({ ...orch, rules: rules.length ? rules : defaultOrch().rules });
  };

  const needsValue = (op: EdgeConditionOperator) =>
    ['eq', 'neq', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte'].includes(op);

  return (
    <div className="space-y-3">
      <Alert className="py-2">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Проверка выполняется <strong>автоматически</strong> после получения данных. Если проверка не пройдена — можно
          вести ветку «Не пройдено» к повтору или другому сценарию. Подключите две связи: «Пройдено» и «Не пройдено».
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <Label className="text-xs">Все проверки или любая</Label>
        <Select
          value={orch.combine || 'all'}
          onValueChange={(v) => setOrch({ ...orch, combine: v as 'all' | 'any' })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все проверки обязательны</SelectItem>
            <SelectItem value="any">Достаточно одной успешной</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Требования к данным</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addRule}>
          <Plus className="h-3 w-3 mr-1" />
          Добавить
        </Button>
      </div>

      {(orch.rules || []).map((rule, i) => (
        <div key={i} className="border rounded-md p-2 space-y-2 bg-muted/20">
          <div className="flex gap-1">
            <Input
              className="h-7 text-xs flex-1"
              placeholder="Поле в данных"
              value={rule.field}
              onChange={(e) => updateRule(i, { field: e.target.value })}
            />
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeRule(i)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Select
            value={rule.operator}
            onValueChange={(v) => updateRule(i, { operator: v as EdgeConditionOperator })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needsValue(rule.operator) && (
            <Input
              className="h-7 text-xs"
              placeholder="Ожидаемое значение"
              value={rule.value != null ? String(rule.value) : ''}
              onChange={(e) => updateRule(i, { value: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
};
