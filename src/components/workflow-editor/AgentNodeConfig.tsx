import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SchemaEditor } from './SchemaEditor';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TOOL_OPTIONS = ['rag_docs', 'web_search', 'classifier', 'deep_research'] as const;
const MODEL_OPTIONS = ['gpt-4o', 'gpt-4o-mini', 'gpt-5.4', 'claude-4-sonnet'] as const;

interface AgentNodeConfigProps {
  stepId: string;
  promptOverride: string;
  model: string | null;
  temperature: number | null;
  tools: string[];
  requireApproval: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  onChange: (patch: {
    prompt_override?: string | null;
    model?: string | null;
    temperature?: number | null;
    tools?: unknown[];
    require_approval?: boolean;
    input_schema?: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
  }) => void;
}

export const AgentNodeConfig: React.FC<AgentNodeConfigProps> = ({
  stepId,
  promptOverride,
  model,
  temperature,
  tools,
  requireApproval,
  inputSchema,
  outputSchema,
  onChange,
}) => {
  const toolSet = new Set(tools);

  const toggleTool = (t: string) => {
    const next = new Set(toolSet);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange({ tools: [...next] });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Системный промпт / роль</Label>
        <Textarea
          value={promptOverride}
          onChange={(e) => onChange({ prompt_override: e.target.value || null })}
          className="text-xs min-h-[100px] font-mono"
          placeholder="Инструкции для модели на этом шаге..."
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Модель</Label>
          <Select
            value={model || 'gpt-4o'}
            onValueChange={(v) => onChange({ model: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Temperature</Label>
          <Input
            type="number"
            step={0.1}
            min={0}
            max={2}
            className="h-8 text-xs"
            value={temperature ?? 0.2}
            onChange={(e) => onChange({ temperature: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Инструменты</Label>
        <div className="flex flex-wrap gap-1">
          {TOOL_OPTIONS.map((t) => (
            <Badge
              key={t}
              variant={toolSet.has(t) ? 'default' : 'outline'}
              className={cn('cursor-pointer text-[10px]', toolSet.has(t) && '')}
              onClick={() => toggleTool(t)}
            >
              {t}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Требовать подтверждение</Label>
        <Switch checked={requireApproval} onCheckedChange={(v) => onChange({ require_approval: v })} />
      </div>

      <SchemaEditor
        resetKey={stepId}
        label="Input schema"
        value={inputSchema}
        onChange={(s) => onChange({ input_schema: s })}
      />
      <SchemaEditor
        resetKey={stepId}
        label="Output schema"
        value={outputSchema}
        onChange={(s) => onChange({ output_schema: s })}
      />
    </div>
  );
};
