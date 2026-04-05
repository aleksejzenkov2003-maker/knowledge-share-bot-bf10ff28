import React, { useState, useEffect } from 'react';
import { WorkflowTemplateStep } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { X, Trash2, Bot, FileInput, FileOutput, Save, Code } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
  slug: string;
  mention_trigger: string | null;
  description: string | null;
  is_active: boolean;
}

interface WorkflowNodeConfigPanelProps {
  step: WorkflowTemplateStep;
  agents: Agent[];
  onUpdate: (stepId: string, updates: Record<string, any>) => void;
  onDelete: (stepId: string) => void;
  onClose: () => void;
}

export const WorkflowNodeConfigPanel: React.FC<WorkflowNodeConfigPanelProps> = ({
  step,
  agents,
  onUpdate,
  onDelete,
  onClose,
}) => {
  const [name, setName] = useState(step.name);
  const [description, setDescription] = useState(step.description || '');
  const [agentId, setAgentId] = useState(step.agent_id || '');
  const [promptOverride, setPromptOverride] = useState(step.prompt_override || '');
  const [nodeType, setNodeType] = useState(step.node_type || 'agent');
  const [isUserEditable, setIsUserEditable] = useState(step.is_user_editable);
  const [autoRun, setAutoRun] = useState(step.auto_run);
  const [inputSchemaStr, setInputSchemaStr] = useState(JSON.stringify(step.input_schema || {}, null, 2));
  const [outputSchemaStr, setOutputSchemaStr] = useState(JSON.stringify(step.output_schema || {}, null, 2));
  const [scriptConfigStr, setScriptConfigStr] = useState(JSON.stringify(step.script_config || {}, null, 2));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setName(step.name);
    setDescription(step.description || '');
    setAgentId(step.agent_id || '');
    setPromptOverride(step.prompt_override || '');
    setNodeType(step.node_type || 'agent');
    setIsUserEditable(step.is_user_editable);
    setAutoRun(step.auto_run);
    setInputSchemaStr(JSON.stringify(step.input_schema || {}, null, 2));
    setOutputSchemaStr(JSON.stringify(step.output_schema || {}, null, 2));
    setScriptConfigStr(JSON.stringify(step.script_config || {}, null, 2));
    setDirty(false);
  }, [step]);

  const markDirty = () => setDirty(true);

  const handleSave = () => {
    let inputSchema = {};
    let outputSchema = {};
    let scriptConfig = {};
    try { inputSchema = JSON.parse(inputSchemaStr); } catch { /* keep empty */ }
    try { outputSchema = JSON.parse(outputSchemaStr); } catch { /* keep empty */ }
    try { scriptConfig = JSON.parse(scriptConfigStr); } catch { /* keep empty */ }

    onUpdate(step.id, {
      name,
      description: description || null,
      agent_id: agentId || null,
      prompt_override: promptOverride || null,
      node_type: nodeType,
      is_user_editable: isUserEditable,
      auto_run: autoRun,
      input_schema: inputSchema,
      output_schema: outputSchema,
      script_config: scriptConfig,
    });
    setDirty(false);
  };

  const nodeTypeIcon = {
    input: <FileInput className="h-4 w-4 text-emerald-600" />,
    agent: <Bot className="h-4 w-4 text-primary" />,
    script: <Code className="h-4 w-4 text-violet-600" />,
    output: <FileOutput className="h-4 w-4 text-amber-600" />,
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          {nodeTypeIcon[nodeType as keyof typeof nodeTypeIcon] || nodeTypeIcon.agent}
          <span className="text-sm font-semibold truncate">{name}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {/* Node Type */}
          <div className="space-y-1.5">
            <Label className="text-xs">Тип ноды</Label>
            <Select value={nodeType} onValueChange={(v) => { setNodeType(v); markDirty(); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="input">📥 Ввод данных</SelectItem>
                <SelectItem value="agent">🤖 AI Агент</SelectItem>
                <SelectItem value="script">⚙️ Скрипт</SelectItem>
                <SelectItem value="output">📤 Итог</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Название</Label>
            <Input
              value={name}
              onChange={e => { setName(e.target.value); markDirty(); }}
              className="h-8 text-xs"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Описание</Label>
            <Textarea
              value={description}
              onChange={e => { setDescription(e.target.value); markDirty(); }}
              className="text-xs min-h-[60px]"
              rows={2}
            />
          </div>

          <Separator />

          {/* Agent */}
          {nodeType === 'agent' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Агент</Label>
                <Select value={agentId} onValueChange={(v) => { setAgentId(v); markDirty(); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Выберите агента" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-1.5">
                          <Bot className="h-3 w-3" />
                          <span>{a.name}</span>
                          {a.mention_trigger && (
                            <span className="text-muted-foreground">@{a.mention_trigger}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Prompt override */}
              <div className="space-y-1.5">
                <Label className="text-xs">Промпт шага (override)</Label>
                <Textarea
                  value={promptOverride}
                  onChange={e => { setPromptOverride(e.target.value); markDirty(); }}
                  className="text-xs min-h-[100px] font-mono"
                  rows={5}
                  placeholder="Дополнительный промпт поверх системного промпта агента..."
                />
              </div>
            </>
          )}

          {/* Script config */}
          {nodeType === 'script' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Конфигурация скрипта (JSON)</Label>
              <Textarea
                value={scriptConfigStr}
                onChange={e => { setScriptConfigStr(e.target.value); markDirty(); }}
                className="text-xs min-h-[100px] font-mono"
                rows={5}
                placeholder='{"function_name": "process-document", "params": {}}'
              />
              <p className="text-[10px] text-muted-foreground">
                Доступные функции: process-document, fips-parse, reputation-api, reputation-web-search, sbis-api
              </p>
            </div>
          )}

          {/* Prompt override for output nodes too */}
          {nodeType === 'output' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Промпт сборки итога</Label>
              <Textarea
                value={promptOverride}
                onChange={e => { setPromptOverride(e.target.value); markDirty(); }}
                className="text-xs min-h-[100px] font-mono"
                rows={5}
                placeholder="Инструкции для сборки финального документа..."
              />
            </div>
          )}

          <Separator />

          {/* Toggles */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">Редактируемый пользователем</Label>
            <Switch checked={isUserEditable} onCheckedChange={(v) => { setIsUserEditable(v); markDirty(); }} />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">Авто-запуск</Label>
            <Switch checked={autoRun} onCheckedChange={(v) => { setAutoRun(v); markDirty(); }} />
          </div>

          <Separator />

          {/* Input Schema */}
          <div className="space-y-1.5">
            <Label className="text-xs">Input Schema (JSON)</Label>
            <Textarea
              value={inputSchemaStr}
              onChange={e => { setInputSchemaStr(e.target.value); markDirty(); }}
              className="text-xs min-h-[60px] font-mono"
              rows={3}
            />
          </div>

          {/* Output Schema */}
          <div className="space-y-1.5">
            <Label className="text-xs">Output Schema (JSON)</Label>
            <Textarea
              value={outputSchemaStr}
              onChange={e => { setOutputSchemaStr(e.target.value); markDirty(); }}
              className="text-xs min-h-[60px] font-mono"
              rows={3}
            />
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t flex items-center justify-between">
        <Button variant="destructive" size="sm" onClick={() => onDelete(step.id)}>
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Удалить
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!dirty}>
          <Save className="h-3.5 w-3.5 mr-1" />
          Сохранить
        </Button>
      </div>
    </div>
  );
};
