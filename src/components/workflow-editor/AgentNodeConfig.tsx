import React, { useMemo } from 'react';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SchemaEditor } from './SchemaEditor';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TOOL_OPTIONS = ['rag_docs', 'web_search', 'classifier', 'deep_research'] as const;
const MODEL_OPTIONS = ['gpt-4o', 'gpt-4o-mini', 'gpt-5.4', 'claude-4-sonnet'] as const;

type OutputPreset = 'text' | 'markdown' | 'structured' | 'custom';

const PRESET_SCHEMAS: Record<Exclude<OutputPreset, 'custom'>, Record<string, unknown>> = {
  text: {
    type: 'object',
    properties: { content: { type: 'string', description: 'Текстовый ответ агента' } },
  },
  markdown: {
    type: 'object',
    properties: {
      markdown: { type: 'string', description: 'Документ в формате Markdown' },
      title: { type: 'string', description: 'Заголовок документа (опционально)' },
    },
  },
  structured: {
    type: 'object',
    properties: {},
  },
};

function detectPreset(schema: Record<string, unknown>): OutputPreset {
  const props = (schema as { properties?: Record<string, unknown> })?.properties;
  if (!props || typeof props !== 'object') return 'text';
  const keys = Object.keys(props).sort().join(',');
  if (keys === 'content') return 'text';
  if (keys === 'markdown,title' || keys === 'title,markdown') return 'markdown';
  if (Object.keys(props).length === 0) return 'text';
  return 'custom';
}

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
  const currentPreset = useMemo(() => detectPreset(outputSchema), [outputSchema]);

  const toggleTool = (t: string) => {
    const next = new Set(toolSet);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange({ tools: [...next] });
  };

  const applyPreset = (p: OutputPreset) => {
    if (p === 'custom') {
      // Switch to structured editor; keep current schema if present, else seed empty object
      onChange({ output_schema: outputSchema && Object.keys(outputSchema).length > 0 ? outputSchema : PRESET_SCHEMAS.structured });
      return;
    }
    onChange({ output_schema: PRESET_SCHEMAS[p] });
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
        <Label className="text-xs">Формат результата</Label>
        <Select value={currentPreset} onValueChange={(v) => applyPreset(v as OutputPreset)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Текстовый ответ</SelectItem>
            <SelectItem value="markdown">Документ Markdown</SelectItem>
            <SelectItem value="custom">Структурированные данные…</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          Влияет на схему выхода. Для большинства шагов подходит «Текстовый ответ».
        </p>
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

      <Accordion type="single" collapsible>
        <AccordionItem value="advanced" className="border-none">
          <AccordionTrigger className="text-xs py-2 hover:no-underline">
            Дополнительно (продвинутые поля)
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pt-1">
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
