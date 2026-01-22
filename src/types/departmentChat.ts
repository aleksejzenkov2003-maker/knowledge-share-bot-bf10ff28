export interface DepartmentChat {
  id: string;
  department_id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentChatAttachment {
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

export interface DepartmentChatMessage {
  id: string;
  chat_id: string;
  user_id: string;
  role_id: string | null;
  message_role: 'user' | 'assistant';
  content: string;
  metadata: {
    response_time_ms?: number;
    rag_context?: string[];
    citations?: Array<{
      index: number;
      document: string;
      section?: string;
      article?: string;
      relevance: number;
    }>;
    perplexity_citations?: string[]; // URLs from Perplexity API
    smart_search?: boolean;
    user_name?: string;
    agent_name?: string;
    attachments?: DepartmentChatAttachment[];
  } | null;
  created_at: string;
}

export interface AgentMention {
  id: string;
  name: string;
  mention_trigger: string | null;
  slug: string;
}
