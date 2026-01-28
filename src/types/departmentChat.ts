export interface DepartmentChat {
  id: string;
  department_id: string;
  title: string;
  is_active: boolean;
  is_pinned: boolean;
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
  reply_to_message_id?: string | null;
  metadata: {
    response_time_ms?: number;
    rag_context?: string[];
    citations?: Array<{
      index: number;
      document: string;
      section?: string;
      article?: string;
      relevance: number;
      chunk_id?: string;
      document_id?: string;
      page_start?: number;
      content_preview?: string;
      storage_path?: string;
      search_keywords?: string[];
    }>;
    perplexity_citations?: string[]; // URLs from Perplexity API
    web_search_citations?: string[]; // URLs from web search (hybrid Claude search)
    web_search_used?: boolean; // Whether web search was triggered for this response
    smart_search?: boolean;
    stop_reason?: string | null; // 'max_tokens' if response was truncated
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
