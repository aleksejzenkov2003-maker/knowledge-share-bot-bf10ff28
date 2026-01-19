export interface ChatRole {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  is_active: boolean;
  is_project_mode: boolean;
}

export interface Conversation {
  id: string;
  user_id: string;
  role_id: string | null;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  responseTime?: number;
  ragContext?: string[];
  semanticSearch?: boolean;
  isStreaming?: boolean;
}

export interface DBMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  metadata: {
    response_time_ms?: number;
    rag_context?: string[];
    semantic_search?: boolean;
  } | null;
  created_at: string;
}

export interface ChatResponse {
  content: string;
  citations?: string[];
  model?: string;
  provider_type?: string;
  response_time_ms?: number;
  rag_context?: string[];
  semantic_search?: boolean;
}
