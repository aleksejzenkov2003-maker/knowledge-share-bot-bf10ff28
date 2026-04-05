// ============================================
// Типы для Workflow-движка проектов
// ============================================

// Статус workflow
export type WorkflowStatus = 'draft' | 'running' | 'paused' | 'completed';

// Статус шага workflow
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'error' | 'skipped';

// Шаблон workflow
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  node_type: string; // 'input' | 'agent' | 'output' | 'script'
  position_x: number;
  position_y: number;
  script_config: Record<string, unknown>;
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
