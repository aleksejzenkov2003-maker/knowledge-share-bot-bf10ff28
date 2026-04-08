// ============================================
// Типы для Workflow-движка проектов
// ============================================

import type { WorkflowTemplateSchemaMeta } from './workflow-editor';

// Статус workflow (экземпляр в проекте)
export type WorkflowStatus = 'draft' | 'running' | 'paused' | 'completed';

// Статус шага workflow
export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'skipped'
  | 'waiting_for_user';

/** Жизненный цикл шаблона (редактор / публикация) */
export type WorkflowTemplatePublishStatus = 'draft' | 'published' | 'archived';

// Шаблон workflow
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  is_active: boolean;
  /** Версия опубликованного шаблона */
  version: number;
  /** draft | published | archived */
  template_status: WorkflowTemplatePublishStatus;
  /** entryNodeIds, global settings */
  schema: WorkflowTemplateSchemaMeta & Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Связь между шагами шаблона (исполняемый граф)
export interface WorkflowGraphEdge {
  id: string;
  template_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string | null;
  target_handle?: string | null;
  mapping: import('./workflow-editor').EdgeMapping[];
  conditions: import('./workflow-editor').EdgeCondition[];
  created_at: string;
}

// Шаг шаблона
export interface WorkflowTemplateStep {
  id: string;
  template_id: string;
  step_order: number;
  name: string;
  description: string | null;
  agent_id: string | null;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  is_user_editable: boolean;
  auto_run: boolean;
  created_at: string;
  // Поля визуального редактора
  prompt_override: string | null;
  node_type: string; // 'input' | 'agent' | 'output' | 'script' | 'condition' | 'quality_check'
  position_x: number;
  position_y: number;
  script_config: Record<string, unknown>;
  require_approval: boolean;
  model: string | null;
  temperature: number | null;
  tools: unknown[];
  form_config: Record<string, unknown>;
  output_mode: string;
  /** Стабильный ключ для ссылок в маппингах (например mktu) */
  node_key: string | null;
  result_assembly_mode: string | null;
  result_template_id: string | null;
  // Связанные данные
  agent?: {
    id: string;
    name: string;
    slug: string;
    mention_trigger: string | null;
    description: string | null;
  };
}

// Запущенный workflow в проекте
export interface ProjectWorkflow {
  id: string;
  project_id: string;
  template_id: string;
  status: WorkflowStatus;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  template_version_snapshot: number | null;
  // Связанные данные
  template?: WorkflowTemplate;
}

// Шаг запущенного workflow
export interface ProjectWorkflowStep {
  id: string;
  workflow_id: string;
  template_step_id: string | null;
  step_order: number;
  status: WorkflowStepStatus;
  agent_id: string | null;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  user_edits: Record<string, unknown> | null;
  raw_output: Record<string, unknown> | null;
  user_edited_output: Record<string, unknown> | null;
  approved_output: Record<string, unknown> | null;
  human_readable_output: Record<string, unknown> | null;
  attempt: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  // Связанные данные
  template_step?: WorkflowTemplateStep;
  agent?: {
    id: string;
    name: string;
    slug: string;
    mention_trigger: string | null;
    description: string | null;
  };
}

// Сообщение внутри шага
export interface ProjectStepMessage {
  id: string;
  step_id: string;
  user_id: string;
  message_role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Реестр агентов (шаблоны для редактора) */
export interface AgentDefinitionRow {
  id: string;
  agent_key: string;
  name: string;
  description: string | null;
  default_model: string | null;
  system_prompt: string | null;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  tools: unknown[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Реестр скриптов */
export interface ScriptDefinitionRow {
  id: string;
  script_key: string;
  name: string;
  description: string | null;
  runtime: string;
  entrypoint: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  default_timeout_sec: number;
  default_retries: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowArtifact {
  id: string;
  project_id: string;
  workflow_run_id: string | null;
  project_workflow_step_id: string | null;
  artifact_type: string;
  bucket: string;
  path: string;
  mime: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
