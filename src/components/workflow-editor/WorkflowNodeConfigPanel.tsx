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
import { X, Trash2, Bot, FileInput, FileOutput, Save, Code, GitBranch, ShieldCheck } from 'lucide-react';
import { InputNodeConfig, parseFormConfig, buildFormConfigObject } from './InputNodeConfig';
import { AgentNodeConfig } from './AgentNodeConfig';
import { ScriptNodeConfig } from './ScriptNodeConfig';
import { ResultNodeConfig } from './ResultNodeConfig';
import { ConditionNodeConfig } from './ConditionNodeConfig';
import { QualityCheckNodeConfig } from './QualityCheckNodeConfig';
import { WorkflowTemplateTestSection } from './WorkflowTemplateTestSection';
import type { WorkflowTemplateTestRunApi } from '@/hooks/useWorkflowTemplateTestRun';

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
  onUpdate: (stepId: string, updates: Record<string, unknown>) => void;
  onDelete: (stepId: string) => void;
  onClose: () => void;
  /** Тестовый прогон в редакторе шаблона (n8n-style) */
  templateTestRun?: WorkflowTemplateTestRunApi | null;
}

export const WorkflowNodeConfigPanel: React.FC<WorkflowNodeConfigPanelProps> = ({
  step,
  agents,
  onUpdate,
  onDelete,
  onClose,
  templateTestRun = null,
}) => {
  const [name, setName] = useState(step.name);
  const [description, setDescription] = useState(step.description || '');
  const [agentId, setAgentId] = useState(step.agent_id || '');
  const [promptOverride, setPromptOverride] = useState(step.prompt_override || '');
  const [nodeType, setNodeType] = useState(step.node_type || 'agent');
  const [nodeKey, setNodeKey] = useState(step.node_key || '');
  const [isUserEditable, setIsUserEditable] = useState(step.is_user_editable);
  const [autoRun, setAutoRun] = useState(step.auto_run);
  const [requireApproval, setRequireApproval] = useState(step.require_approval);
  const [model, setModel] = useState(step.model);
  const [temperature, setTemperature] = useState(step.temperature);
  const [tools, setTools] = useState<string[]>(
    Array.isArray(step.tools) ? step.tools.map(String) : []
  );
  const [inputSchema, setInputSchema] = useState<Record<string, unknown>>(step.input_schema || {});
  const [outputSchema, setOutputSchema] = useState<Record<string, unknown>>(step.output_schema || {});
  const [scriptConfig, setScriptConfig] = useState<Record<string, unknown>>(step.script_config || {});
  const [formFields, setFormFields] = useState(() => parseFormConfig(step.form_config || {}));
  const [outputMode, setOutputMode] = useState(step.output_mode || 'structured_json');
  const [resultAssemblyMode, setResultAssemblyMode] = useState(step.result_assembly_mode || 'ai_summary');
  const [resultTemplateId, setResultTemplateId] = useState(step.result_template_id || '');
  const [stageGroup, setStageGroup] = useState(step.stage_group || '');
  const [stageOrder, setStageOrder] = useState(step.stage_order ?? 0);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setName(step.name);
    setDescription(step.description || '');
    setAgentId(step.agent_id || '');
    setPromptOverride(step.prompt_override || '');
    setNodeType(step.node_type || 'agent');
    setNodeKey(step.node_key || '');
    setIsUserEditable(step.is_user_editable);
    setAutoRun(step.auto_run);
    setRequireApproval(step.require_approval);
    setModel(step.model);
    setTemperature(step.temperature);
    setTools(Array.isArray(step.tools) ? step.tools.map(String) : []);
    setInputSchema(step.input_schema || {});
    setOutputSchema(step.output_schema || {});
    setScriptConfig(step.script_config || {});
    setFormFields(parseFormConfig(step.form_config || {}));
    setOutputMode(step.output_mode || 'structured_json');
    setResultAssemblyMode(step.result_assembly_mode || 'ai_summary');
    setResultTemplateId(step.result_template_id || '');
    setStageGroup(step.stage_group || '');
    setStageOrder(step.stage_order ?? 0);
    setDirty(false);
  }, [step]);

  const markDirty = () => setDirty(true);

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      name,
      description: description || null,
      agent_id: agentId || null,
      prompt_override: promptOverride || null,
      node_type: nodeType,
      node_key: nodeKey.trim() || null,
      is_user_editable: isUserEditable,
      auto_run: autoRun,
      require_approval: requireApproval,
      model: model || null,
      temperature: temperature ?? null,
      tools,
      input_schema: inputSchema,
      output_schema: outputSchema,
      script_config: scriptConfig,
      form_config: buildFormConfigObject(formFields),
      output_mode: outputMode,
      result_assembly_mode: resultAssemblyMode || null,
      result_template_id: resultTemplateId.trim() || null,
      stage_group: stageGroup.trim() || null,
      stage_order: stageOrder,
    };
    onUpdate(step.id, payload);
    setDirty(false);
  };

  const nodeTypeIcon = {
    input: <FileInput className="h-4 w-4 text-emerald-600" />,
    agent: <Bot className="h-4 w-4 text-primary" />,
    script: <Code className="h-4 w-4 text-violet-600" />,
    output: <FileOutput className="h-4 w-4 text-amber-600" />,
    condition: <GitBranch className="h-4 w-4 text-sky-600" />,
    quality_check: <ShieldCheck className="h-4 w-4 text-rose-600" />,
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full max-w-[100vw] sm:w-96">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          {nodeTypeIcon[nodeType as keyof typeof nodeTypeIcon] || nodeTypeIcon.agent}
          <span className="text-sm font-semibold truncate">{name}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Тип ноды</Label>
            <Select
              value={nodeType}
              onValueChange={(v) => {
                setNodeType(v);
                markDirty();
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="input">Ввод данных</SelectItem>
                <SelectItem value="agent">AI Агент</SelectItem>
                <SelectItem value="condition">Условие (IF / ELSE)</SelectItem>
                <SelectItem value="quality_check">Проверка результата</SelectItem>
                <SelectItem value="script">Скрипт</SelectItem>
                <SelectItem value="output">Итог</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">node_key (для маппинга)</Label>
            <Input
              value={nodeKey}
              onChange={(e) => {
                setNodeKey(e.target.value);
                markDirty();
              }}
              className="h-8 text-xs font-mono"
              placeholder="mktu, protectability..."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Название</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                markDirty();
              }}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Описание</Label>
            <Textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                markDirty();
              }}
              className="text-xs min-h-[60px]"
              rows={2}
            />
          </div>

          <Separator />

          {nodeType === 'input' && (
            <InputNodeConfig
              formFields={formFields}
              outputMode={outputMode}
              onChangeFields={(f) => {
                setFormFields(f);
                markDirty();
              }}
              onChangeOutputMode={(m) => {
                setOutputMode(m);
                markDirty();
              }}
            />
          )}

          {nodeType === 'agent' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Агент (роль)</Label>
                <Select
                  value={agentId}
                  onValueChange={(v) => {
                    setAgentId(v);
                    markDirty();
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Выберите агента" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <AgentNodeConfig
                stepId={step.id}
                promptOverride={promptOverride}
                model={model}
                temperature={temperature}
                tools={tools}
                requireApproval={requireApproval}
                inputSchema={inputSchema}
                outputSchema={outputSchema}
                onChange={(patch) => {
                  if (patch.prompt_override !== undefined) setPromptOverride(patch.prompt_override || '');
                  if (patch.model !== undefined) setModel(patch.model);
                  if (patch.temperature !== undefined) setTemperature(patch.temperature);
                  if (patch.tools !== undefined) setTools(patch.tools.map(String));
                  if (patch.require_approval !== undefined) setRequireApproval(patch.require_approval);
                  if (patch.input_schema !== undefined) setInputSchema(patch.input_schema);
                  if (patch.output_schema !== undefined) setOutputSchema(patch.output_schema);
                  markDirty();
                }}
              />
            </>
          )}

          {nodeType === 'script' && (
            <ScriptNodeConfig
              scriptStepId={step.id}
              scriptConfig={scriptConfig}
              onChangeScriptConfig={(c) => {
                setScriptConfig(c);
                markDirty();
              }}
            />
          )}

          {nodeType === 'condition' && (
            <ConditionNodeConfig
              scriptConfig={scriptConfig}
              onChange={(c) => {
                setScriptConfig(c);
                markDirty();
              }}
            />
          )}

          {nodeType === 'quality_check' && (
            <QualityCheckNodeConfig
              scriptConfig={scriptConfig}
              onChange={(c) => {
                setScriptConfig(c);
                markDirty();
              }}
            />
          )}

          {nodeType === 'output' && (
            <ResultNodeConfig
              stepId={step.id}
              promptOverride={promptOverride}
              assemblyMode={resultAssemblyMode}
              resultTemplateId={resultTemplateId}
              outputSchema={outputSchema}
              onChange={(patch) => {
                if (patch.prompt_override !== undefined) setPromptOverride(patch.prompt_override || '');
                if (patch.result_assembly_mode !== undefined) setResultAssemblyMode(patch.result_assembly_mode || 'ai_summary');
                if (patch.result_template_id !== undefined) setResultTemplateId(patch.result_template_id || '');
                if (patch.output_schema !== undefined) setOutputSchema(patch.output_schema);
                markDirty();
              }}
            />
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <Label className="text-xs">Редактируемый пользователем</Label>
            <Switch
              checked={isUserEditable}
              onCheckedChange={(v) => {
                setIsUserEditable(v);
                markDirty();
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">Авто-запуск</Label>
            <Switch
              checked={autoRun}
              onCheckedChange={(v) => {
                setAutoRun(v);
                markDirty();
              }}
            />
          </div>

          {nodeType !== 'agent' &&
            nodeType !== 'output' &&
            nodeType !== 'condition' &&
            nodeType !== 'quality_check' && (
            <div className="flex items-center justify-between">
              <Label className="text-xs">Подтверждение перед передачей</Label>
              <Switch
                checked={requireApproval}
                onCheckedChange={(v) => {
                  setRequireApproval(v);
                  markDirty();
                }}
              />
            </div>
          )}

          {(nodeType === 'condition' || nodeType === 'quality_check') && (
            <p className="text-[10px] text-muted-foreground">
              По умолчанию шаг подтверждается автоматически и передаёт данные по выбранной ветке. Включите «Подтверждение»
              ниже только если нужна ручная пауза.
            </p>
          )}

          {(nodeType === 'condition' || nodeType === 'quality_check') && (
            <div className="flex items-center justify-between">
              <Label className="text-xs">Ручное подтверждение</Label>
              <Switch
                checked={requireApproval}
                onCheckedChange={(v) => {
                  setRequireApproval(v);
                  markDirty();
                }}
              />
            </div>
          )}
        </div>

        {templateTestRun && (
          <>
            <Separator />
            <WorkflowTemplateTestSection step={step} testRun={templateTestRun} />
          </>
        )}
      </ScrollArea>

      <div className="p-3 border-t flex items-center justify-between gap-2">
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
