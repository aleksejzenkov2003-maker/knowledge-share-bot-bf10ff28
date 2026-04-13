/**
 * Types for the visual workflow editor (graph, edges, validation).
 */

export type EdgeMapping = {
  sourcePath: string;
  targetPath: string;
  /** Optional transform hint: passthrough | json_stringify */
  transform?: 'passthrough' | 'json_stringify';
};

export type EdgeConditionOperator =
  | 'eq'
  | 'neq'
  | 'exists'
  | 'not_exists'
  | 'truthy'
  | 'falsy'
  | 'empty'
  | 'not_empty'
  | 'contains'
  | 'not_contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export type EdgeCondition = {
  field: string;
  operator: EdgeConditionOperator;
  value?: unknown;
};

export interface WorkflowTemplateEdge {
  id: string;
  template_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string | null;
  target_handle?: string | null;
  mapping: EdgeMapping[];
  conditions: EdgeCondition[];
  created_at: string;
}

/** Stored in workflow_templates.schema JSONB */
export type WorkflowTemplateSchemaMeta = {
  entryNodeIds?: string[];
  global?: Record<string, unknown>;
};

export type FormFieldType = 'text' | 'textarea' | 'file' | 'select' | 'number';

export interface FormFieldConfig {
  key: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  multiple?: boolean;
}

export interface InputFormConfig {
  fields: FormFieldConfig[];
  editableByUser?: boolean;
  autoStart?: boolean;
}

export type ResultAssemblyMode = 'ai_summary' | 'deterministic' | 'combined';

export type EditorValidationSeverity = 'error' | 'warning';

export interface EditorValidationIssue {
  severity: EditorValidationSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface WorkflowEditorNodeMeta {
  stageGroup?: string | null;
  stageOrder?: number;
  qualityCheckAgentId?: string | null;
}
