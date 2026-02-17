export interface ChatRole {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  is_active: boolean;
  is_project_mode: boolean;
  mention_trigger?: string | null;
  folder_ids?: string[];
  allow_web_search?: boolean;
  strict_rag_mode?: boolean;
  external_apis?: {
    reputation?: {
      enabled?: boolean;
      auto_search?: boolean;
    };
  };
}

export interface Conversation {
  id: string;
  user_id: string;
  role_id: string | null;
  title: string;
  is_active: boolean;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  index: number;
  document: string;
  section?: string;
  article?: string;
  relevance: number;
  // Extended metadata for document navigation
  chunk_id?: string;
  document_id?: string;
  page_start?: number;
  page_end?: number;  // NEW: End page for multi-page chunks
  chunk_index?: number;
  content_preview?: string;
  full_chunk_content?: string; // Full text of the chunk for Text Viewer
  storage_path?: string;
  search_keywords?: string[]; // Keywords from original query for PDF search
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
  addToKnowledgeBase?: boolean; // Whether to save this attachment to knowledge base
  containsPii?: boolean; // Whether this document contains personal data (PII)
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
  replyToMessageId?: string | null;
  stopReason?: string | null; // 'max_tokens' if response was truncated, 'end_turn' for normal completion
  interrupted?: boolean; // True if response was interrupted due to error/disconnect
  hasMaskedPii?: boolean; // True if message contains masked PII tokens
  piiTokensCount?: number; // Number of PII tokens in the message
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
    has_masked_pii?: boolean;
    pii_tokens_count?: number;
    perplexity_citations?: string[];
    web_search_citations?: string[];
    web_search_used?: boolean;
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
