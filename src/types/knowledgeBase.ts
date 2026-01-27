export interface KnowledgeBaseDocument {
  id: string;
  department_id?: string;
  conversation_id?: string;
  source_message_id?: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  description?: string;
  tags?: string[];
  usage_count: number;
  created_at: string;
  created_by?: string;
}
