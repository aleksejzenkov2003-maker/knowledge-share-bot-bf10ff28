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

export interface Citation {
  index: number;
  document: string;
  section?: string;
  article?: string;
  relevance: number;
}

export interface Attachment {
  id: string;
  file?: File;
  file_path?: string;
  file_name: string;
  file_type: string;
  file_size: number;
  preview_url?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
}

export interface Message {
  id: string;
  conversation_id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  responseTime?: number;
  ragContext?: string[];
  citations?: Citation[];
  smartSearch?: boolean;
  isStreaming?: boolean;
  attachments?: Attachment[];
  webSearchCitations?: string[];
  webSearchUsed?: boolean;
  roleId?: string;
}

export interface DBMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  metadata: {
    response_time_ms?: number;
    rag_context?: string[];
    citations?: Citation[];
    smart_search?: boolean;
    attachments?: { file_path: string; file_name: string; file_type: string; file_size: number }[];
  } | null;
  created_at: string;
}

export interface ChatResponse {
  content: string;
  citations?: Citation[];
  model?: string;
  provider_type?: string;
  response_time_ms?: number;
  rag_context?: string[];
  smart_search?: boolean;
}
