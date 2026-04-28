export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_providers: {
        Row: {
          api_key: string | null
          base_url: string | null
          config: Json | null
          created_at: string
          default_model: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          provider_type: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          config?: Json | null
          created_at?: string
          default_model?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          provider_type?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          config?: Json | null
          created_at?: string
          default_model?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          provider_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      audio_session_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          message_role: string
          metadata: Json | null
          role_id: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_role: string
          metadata?: Json | null
          role_id?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_role?: string
          metadata?: Json | null
          role_id?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_session_messages_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "chat_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_session_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "audio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_sessions: {
        Row: {
          audio_file_name: string | null
          audio_file_path: string | null
          created_at: string
          id: string
          status: string
          title: string
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_file_name?: string | null
          audio_file_path?: string | null
          created_at?: string
          id?: string
          status?: string
          title?: string
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_file_name?: string | null
          audio_file_path?: string | null
          created_at?: string
          id?: string
          status?: string
          title?: string
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bitrix_sessions: {
        Row: {
          bitrix_user_id: string
          created_at: string | null
          department_id: string
          expires_at: string
          id: string
          jwt_token_hash: string
          last_activity_at: string | null
          portal_domain: string
          user_id: string
        }
        Insert: {
          bitrix_user_id: string
          created_at?: string | null
          department_id: string
          expires_at: string
          id?: string
          jwt_token_hash: string
          last_activity_at?: string | null
          portal_domain: string
          user_id: string
        }
        Update: {
          bitrix_user_id?: string
          created_at?: string | null
          department_id?: string
          expires_at?: string
          id?: string
          jwt_token_hash?: string
          last_activity_at?: string | null
          portal_domain?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bitrix_sessions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bitrix_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_knowledge_base: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          source_message_id: string | null
          tags: string[] | null
          usage_count: number | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          source_message_id?: string | null
          tags?: string[] | null
          usage_count?: number | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          source_message_id?: string | null
          tags?: string[] | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_knowledge_base_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_knowledge_base_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_logs: {
        Row: {
          completion_tokens: number | null
          created_at: string
          department_id: string | null
          id: string
          metadata: Json | null
          prompt: string | null
          prompt_tokens: number | null
          provider_id: string | null
          response: string | null
          response_time_ms: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string
          department_id?: string | null
          id?: string
          metadata?: Json | null
          prompt?: string | null
          prompt_tokens?: number | null
          provider_id?: string | null
          response?: string | null
          response_time_ms?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string
          department_id?: string | null
          id?: string
          metadata?: Json | null
          prompt?: string | null
          prompt_tokens?: number | null
          provider_id?: string | null
          response?: string | null
          response_time_ms?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_logs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_logs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_logs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "safe_ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_roles: {
        Row: {
          allow_web_search: boolean | null
          created_at: string
          department_ids: string[] | null
          description: string | null
          external_apis: Json | null
          folder_ids: string[] | null
          id: string
          is_active: boolean
          is_project_mode: boolean
          mention_trigger: string | null
          model_config: Json | null
          name: string
          slug: string
          strict_rag_mode: boolean | null
          system_prompt_id: string | null
          updated_at: string
        }
        Insert: {
          allow_web_search?: boolean | null
          created_at?: string
          department_ids?: string[] | null
          description?: string | null
          external_apis?: Json | null
          folder_ids?: string[] | null
          id?: string
          is_active?: boolean
          is_project_mode?: boolean
          mention_trigger?: string | null
          model_config?: Json | null
          name: string
          slug: string
          strict_rag_mode?: boolean | null
          system_prompt_id?: string | null
          updated_at?: string
        }
        Update: {
          allow_web_search?: boolean | null
          created_at?: string
          department_ids?: string[] | null
          description?: string | null
          external_apis?: Json | null
          folder_ids?: string[] | null
          id?: string
          is_active?: boolean
          is_project_mode?: boolean
          mention_trigger?: string | null
          model_config?: Json | null
          name?: string
          slug?: string
          strict_rag_mode?: boolean | null
          system_prompt_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_roles_system_prompt_id_fkey"
            columns: ["system_prompt_id"]
            isOneToOne: false
            referencedRelation: "system_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      context_packs: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          folder_ids: string[] | null
          id: string
          is_global: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          folder_ids?: string[] | null
          id?: string
          is_global?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          folder_ids?: string[] | null
          id?: string
          is_global?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_packs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_packs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_pinned: boolean | null
          role_id: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_pinned?: boolean | null
          role_id?: string | null
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_pinned?: boolean | null
          role_id?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "chat_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      department_api_keys: {
        Row: {
          api_key: string
          created_at: string | null
          department_id: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string
          portal_domain: string | null
          request_count: number | null
          updated_at: string | null
        }
        Insert: {
          api_key?: string
          created_at?: string | null
          department_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          portal_domain?: string | null
          request_count?: number | null
          updated_at?: string | null
        }
        Update: {
          api_key?: string
          created_at?: string | null
          department_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          portal_domain?: string | null
          request_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_api_keys_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      department_chat_messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string | null
          id: string
          message_role: string
          metadata: Json | null
          reply_to_message_id: string | null
          role_id: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string | null
          id?: string
          message_role: string
          metadata?: Json | null
          reply_to_message_id?: string | null
          role_id?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string | null
          id?: string
          message_role?: string
          metadata?: Json | null
          reply_to_message_id?: string | null
          role_id?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "department_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "department_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_chat_messages_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "chat_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      department_chats: {
        Row: {
          created_at: string | null
          department_id: string
          id: string
          is_active: boolean | null
          is_pinned: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department_id: string
          id?: string
          is_active?: boolean | null
          is_pinned?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string
          id?: string
          is_active?: boolean | null
          is_pinned?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_chats_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          article_number: string | null
          chunk_index: number
          chunk_type: string | null
          content: string
          content_tsv: unknown
          created_at: string
          document_id: string
          embedding: string | null
          has_masked_pii: boolean | null
          id: string
          metadata: Json | null
          page_end: number | null
          page_start: number | null
          section_title: string | null
        }
        Insert: {
          article_number?: string | null
          chunk_index: number
          chunk_type?: string | null
          content: string
          content_tsv?: unknown
          created_at?: string
          document_id: string
          embedding?: string | null
          has_masked_pii?: boolean | null
          id?: string
          metadata?: Json | null
          page_end?: number | null
          page_start?: number | null
          section_title?: string | null
        }
        Update: {
          article_number?: string | null
          chunk_index?: number
          chunk_type?: string | null
          content?: string
          content_tsv?: unknown
          created_at?: string
          document_id?: string
          embedding?: string | null
          has_masked_pii?: boolean | null
          id?: string
          metadata?: Json | null
          page_end?: number | null
          page_start?: number | null
          section_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          created_at: string
          department_id: string | null
          description: string | null
          folder_type: string
          id: string
          name: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          description?: string | null
          folder_type?: string
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          description?: string | null
          folder_type?: string
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          chunk_count: number | null
          contains_pii: boolean | null
          created_at: string
          created_by: string | null
          department_id: string | null
          document_type: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          folder_id: string | null
          has_trademark: boolean | null
          id: string
          name: string
          parent_document_id: string | null
          part_number: number | null
          pii_processed: boolean | null
          status: string
          storage_path: string | null
          total_parts: number | null
          trademark_image_path: string | null
          updated_at: string
        }
        Insert: {
          chunk_count?: number | null
          contains_pii?: boolean | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          document_type?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          folder_id?: string | null
          has_trademark?: boolean | null
          id?: string
          name: string
          parent_document_id?: string | null
          part_number?: number | null
          pii_processed?: boolean | null
          status?: string
          storage_path?: string | null
          total_parts?: number | null
          trademark_image_path?: string | null
          updated_at?: string
        }
        Update: {
          chunk_count?: number | null
          contains_pii?: boolean | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          document_type?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          folder_id?: string | null
          has_trademark?: boolean | null
          id?: string
          name?: string
          parent_document_id?: string | null
          part_number?: number | null
          pii_processed?: boolean | null
          status?: string
          storage_path?: string | null
          total_parts?: number | null
          trademark_image_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      golden_responses: {
        Row: {
          answer: string
          category: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          effectiveness_rating: number | null
          id: string
          is_active: boolean | null
          notes: string | null
          question: string
          role_id: string | null
          search_vector: unknown
          source_conversation_id: string | null
          source_message_id: string | null
          tags: string[] | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          effectiveness_rating?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          question: string
          role_id?: string | null
          search_vector?: unknown
          source_conversation_id?: string | null
          source_message_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          effectiveness_rating?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          question?: string
          role_id?: string | null
          search_vector?: unknown
          source_conversation_id?: string | null
          source_message_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golden_responses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golden_responses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golden_responses_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "chat_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          message_id: string | null
          user_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          message_id?: string | null
          user_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          message_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          reply_to_message_id: string | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          reply_to_message_id?: string | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          reply_to_message_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          mapping_id: string | null
          pii_type: string
          source_id: string
          source_type: string
          token: string
          user_email: string | null
          user_id: string
          user_ip: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          mapping_id?: string | null
          pii_type: string
          source_id: string
          source_type: string
          token: string
          user_email?: string | null
          user_id: string
          user_ip?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          mapping_id?: string | null
          pii_type?: string
          source_id?: string
          source_type?: string
          token?: string
          user_email?: string | null
          user_id?: string
          user_ip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pii_audit_log_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "pii_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_mappings: {
        Row: {
          created_at: string | null
          created_by: string | null
          encrypted_value: string
          encryption_iv: string
          expires_at: string | null
          id: string
          pii_type: string
          session_id: string | null
          source_id: string
          source_type: string
          token: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          encrypted_value: string
          encryption_iv: string
          expires_at?: string | null
          id?: string
          pii_type: string
          session_id?: string | null
          source_id: string
          source_type: string
          token: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          encrypted_value?: string
          encryption_iv?: string
          expires_at?: string | null
          id?: string
          pii_type?: string
          session_id?: string | null
          source_id?: string
          source_type?: string
          token?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bitrix_user_id: string | null
          created_at: string
          department_id: string | null
          email: string | null
          full_name: string | null
          id: string
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bitrix_user_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bitrix_user_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      project_chat_messages: {
        Row: {
          agent_id: string | null
          chat_id: string
          content: string
          created_at: string
          id: string
          message_role: string
          metadata: Json | null
          reply_to_message_id: string | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          chat_id: string
          content: string
          created_at?: string
          id?: string
          message_role: string
          metadata?: Json | null
          reply_to_message_id?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          message_role?: string
          metadata?: Json | null
          reply_to_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_chat_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "chat_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "project_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "project_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_chats: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          is_pinned: boolean | null
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_pinned?: boolean | null
          project_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_pinned?: boolean | null
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_chats_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_context_packs: {
        Row: {
          context_pack_id: string
          id: string
          is_enabled: boolean | null
          priority: number | null
          project_id: string
        }
        Insert: {
          context_pack_id: string
          id?: string
          is_enabled?: boolean | null
          priority?: number | null
          project_id: string
        }
        Update: {
          context_pack_id?: string
          id?: string
          is_enabled?: boolean | null
          priority?: number | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_context_packs_context_pack_id_fkey"
            columns: ["context_pack_id"]
            isOneToOne: false
            referencedRelation: "context_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_context_packs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          added_by: string | null
          created_at: string
          document_id: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          project_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          document_id?: string | null
          file_name: string
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          project_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          document_id?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          agent_id: string | null
          id: string
          invited_by: string | null
          joined_at: string
          project_id: string
          role: Database["public"]["Enums"]["project_member_role"]
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "chat_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memory: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          memory_type: Database["public"]["Enums"]["project_memory_type"]
          project_id: string
          source_message_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          memory_type: Database["public"]["Enums"]["project_memory_type"]
          project_id: string
          source_message_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          memory_type?: Database["public"]["Enums"]["project_memory_type"]
          project_id?: string
          source_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_memory_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memory_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "project_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      project_step_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          message_role: string
          metadata: Json | null
          step_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_role: string
          metadata?: Json | null
          step_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_role?: string
          metadata?: Json | null
          step_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_step_messages_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "project_workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_step_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_workflow_steps: {
        Row: {
          agent_id: string | null
          approved_output: Json | null
          attempt: number
          completed_at: string | null
          error_message: string | null
          human_readable_output: Json | null
          id: string
          input_data: Json | null
          output_data: Json | null
          raw_output: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_step_status"]
          step_order: number
          template_step_id: string | null
          user_edited_output: Json | null
          user_edits: Json | null
          workflow_id: string
        }
        Insert: {
          agent_id?: string | null
          approved_output?: Json | null
          attempt?: number
          completed_at?: string | null
          error_message?: string | null
          human_readable_output?: Json | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          raw_output?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_step_status"]
          step_order: number
          template_step_id?: string | null
          user_edited_output?: Json | null
          user_edits?: Json | null
          workflow_id: string
        }
        Update: {
          agent_id?: string | null
          approved_output?: Json | null
          attempt?: number
          completed_at?: string | null
          error_message?: string | null
          human_readable_output?: Json | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          raw_output?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_step_status"]
          step_order?: number
          template_step_id?: string | null
          user_edited_output?: Json | null
          user_edits?: Json | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_workflow_steps_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "chat_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_workflow_steps_template_step_id_fkey"
            columns: ["template_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_template_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "project_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      project_workflows: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          status: Database["public"]["Enums"]["workflow_status"]
          template_id: string
          template_version_snapshot: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          status?: Database["public"]["Enums"]["workflow_status"]
          template_id: string
          template_version_snapshot?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["workflow_status"]
          template_id?: string
          template_version_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_workflows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_workflows_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          folder_id: string | null
          id: string
          name: string
          settings: Json | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          name: string
          settings?: Json | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          settings?: Json | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      reputation_reports: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          inn: string | null
          name: string | null
          ogrn: string | null
          query: string | null
          report_data: Json
          selected_sections: string[] | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type?: string
          id?: string
          inn?: string | null
          name?: string | null
          ogrn?: string | null
          query?: string | null
          report_data?: Json
          selected_sections?: string[] | null
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          inn?: string | null
          name?: string | null
          ogrn?: string | null
          query?: string | null
          report_data?: Json
          selected_sections?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      script_definitions: {
        Row: {
          created_at: string
          default_retries: number
          default_timeout_sec: number
          description: string | null
          entrypoint: string
          id: string
          input_schema: Json
          name: string
          output_schema: Json
          runtime: string
          script_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_retries?: number
          default_timeout_sec?: number
          description?: string | null
          entrypoint: string
          id?: string
          input_schema?: Json
          name: string
          output_schema?: Json
          runtime?: string
          script_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_retries?: number
          default_timeout_sec?: number
          description?: string | null
          entrypoint?: string
          id?: string
          input_schema?: Json
          name?: string
          output_schema?: Json
          runtime?: string
          script_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_prompts: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          is_active: boolean
          name: string
          prompt_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          prompt_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          prompt_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_prompts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      trademark_searches: {
        Row: {
          created_at: string | null
          id: string
          query: string | null
          results_count: number | null
          search_params: Json | null
          search_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          query?: string | null
          results_count?: number | null
          search_params?: Json | null
          search_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          query?: string | null
          results_count?: number | null
          search_params?: Json | null
          search_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fips_applications: {
        Row: {
          applicant_address: string | null
          applicant_inn: string | null
          applicant_name: string | null
          applicant_ogrn: string | null
          application_number: string | null
          created_at: string
          file_name: string | null
          file_path: string | null
          id: string
          parsed_data: Json
          registration_number: string | null
          section_code: string | null
          source_url: string | null
          status: string | null
          submitted_at: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          applicant_address?: string | null
          applicant_inn?: string | null
          applicant_name?: string | null
          applicant_ogrn?: string | null
          application_number?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          parsed_data?: Json
          registration_number?: string | null
          section_code?: string | null
          source_url?: string | null
          status?: string | null
          submitted_at?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          applicant_address?: string | null
          applicant_inn?: string | null
          applicant_name?: string | null
          applicant_ogrn?: string | null
          application_number?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          parsed_data?: Json
          registration_number?: string | null
          section_code?: string | null
          source_url?: string | null
          status?: string | null
          submitted_at?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      trademarks: {
        Row: {
          actual: boolean | null
          change_color_specification_history: string | null
          change_correspondence_address_history: string | null
          change_description_element_history: string | null
          change_description_image_history: string | null
          change_disclaimer_history: string | null
          change_legal_related_registrations_history: string | null
          change_note_history: string | null
          change_right_holder_address_history: string | null
          change_right_holder_name_history: string | null
          changing: boolean | null
          changing_specification: string | null
          collective: boolean | null
          collective_users: string | null
          color: boolean | null
          color_specification: string | null
          color_trademark_specification: string | null
          correspondence_address: string | null
          created_at: string
          created_by: string | null
          description_element: string | null
          description_image: string | null
          extraction_from_charter: string | null
          fips_updated: boolean
          foreign_right_holder_name: string | null
          holographic: boolean | null
          holographic_specification: string | null
          id: string
          kind_specification: string | null
          legally_related_registrations: string | null
          light: boolean | null
          light_specification: string | null
          metadata: Json | null
          note: string | null
          olfactory: boolean | null
          olfactory_specification: string | null
          phonetics_specification: string | null
          place_name_specification: string | null
          positional: boolean | null
          positional_specification: string | null
          publication_url: string | null
          registration_date: string | null
          registration_number: string | null
          right_holder_address: string | null
          right_holder_country_code: string | null
          right_holder_inn: string | null
          right_holder_name: string | null
          right_holder_ogrn: string | null
          sound: boolean | null
          sound_specification: string | null
          threedimensional: boolean | null
          threedimensional_specification: string | null
          translation: string | null
          transliteration: string | null
          unprotected_elements: string | null
          updated_at: string
          well_known_trademark_date: string | null
        }
        Insert: {
          actual?: boolean | null
          change_color_specification_history?: string | null
          change_correspondence_address_history?: string | null
          change_description_element_history?: string | null
          change_description_image_history?: string | null
          change_disclaimer_history?: string | null
          change_legal_related_registrations_history?: string | null
          change_note_history?: string | null
          change_right_holder_address_history?: string | null
          change_right_holder_name_history?: string | null
          changing?: boolean | null
          changing_specification?: string | null
          collective?: boolean | null
          collective_users?: string | null
          color?: boolean | null
          color_specification?: string | null
          color_trademark_specification?: string | null
          correspondence_address?: string | null
          created_at?: string
          created_by?: string | null
          description_element?: string | null
          description_image?: string | null
          extraction_from_charter?: string | null
          fips_updated?: boolean
          foreign_right_holder_name?: string | null
          holographic?: boolean | null
          holographic_specification?: string | null
          id?: string
          kind_specification?: string | null
          legally_related_registrations?: string | null
          light?: boolean | null
          light_specification?: string | null
          metadata?: Json | null
          note?: string | null
          olfactory?: boolean | null
          olfactory_specification?: string | null
          phonetics_specification?: string | null
          place_name_specification?: string | null
          positional?: boolean | null
          positional_specification?: string | null
          publication_url?: string | null
          registration_date?: string | null
          registration_number?: string | null
          right_holder_address?: string | null
          right_holder_country_code?: string | null
          right_holder_inn?: string | null
          right_holder_name?: string | null
          right_holder_ogrn?: string | null
          sound?: boolean | null
          sound_specification?: string | null
          threedimensional?: boolean | null
          threedimensional_specification?: string | null
          translation?: string | null
          transliteration?: string | null
          unprotected_elements?: string | null
          updated_at?: string
          well_known_trademark_date?: string | null
        }
        Update: {
          actual?: boolean | null
          change_color_specification_history?: string | null
          change_correspondence_address_history?: string | null
          change_description_element_history?: string | null
          change_description_image_history?: string | null
          change_disclaimer_history?: string | null
          change_legal_related_registrations_history?: string | null
          change_note_history?: string | null
          change_right_holder_address_history?: string | null
          change_right_holder_name_history?: string | null
          changing?: boolean | null
          changing_specification?: string | null
          collective?: boolean | null
          collective_users?: string | null
          color?: boolean | null
          color_specification?: string | null
          color_trademark_specification?: string | null
          correspondence_address?: string | null
          created_at?: string
          created_by?: string | null
          description_element?: string | null
          description_image?: string | null
          extraction_from_charter?: string | null
          fips_updated?: boolean
          foreign_right_holder_name?: string | null
          holographic?: boolean | null
          holographic_specification?: string | null
          id?: string
          kind_specification?: string | null
          legally_related_registrations?: string | null
          light?: boolean | null
          light_specification?: string | null
          metadata?: Json | null
          note?: string | null
          olfactory?: boolean | null
          olfactory_specification?: string | null
          phonetics_specification?: string | null
          place_name_specification?: string | null
          positional?: boolean | null
          positional_specification?: string | null
          publication_url?: string | null
          registration_date?: string | null
          registration_number?: string | null
          right_holder_address?: string | null
          right_holder_country_code?: string | null
          right_holder_inn?: string | null
          right_holder_name?: string | null
          right_holder_ogrn?: string | null
          sound?: boolean | null
          sound_specification?: string | null
          threedimensional?: boolean | null
          threedimensional_specification?: string | null
          translation?: string | null
          transliteration?: string | null
          unprotected_elements?: string | null
          updated_at?: string
          well_known_trademark_date?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_artifacts: {
        Row: {
          artifact_type: string
          bucket: string
          created_at: string
          id: string
          metadata: Json | null
          mime: string | null
          path: string
          project_id: string
          project_workflow_step_id: string | null
          workflow_run_id: string | null
        }
        Insert: {
          artifact_type?: string
          bucket: string
          created_at?: string
          id?: string
          metadata?: Json | null
          mime?: string | null
          path: string
          project_id: string
          project_workflow_step_id?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          artifact_type?: string
          bucket?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          mime?: string | null
          path?: string
          project_id?: string
          project_workflow_step_id?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_artifacts_project_workflow_step_id_fkey"
            columns: ["project_workflow_step_id"]
            isOneToOne: false
            referencedRelation: "project_workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_artifacts_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "project_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_event_logs: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          payload: Json
          project_id: string
          project_workflow_step_id: string | null
          workflow_run_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          payload?: Json
          project_id: string
          project_workflow_step_id?: string | null
          workflow_run_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
          project_workflow_step_id?: string | null
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_event_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_event_logs_project_workflow_step_id_fkey"
            columns: ["project_workflow_step_id"]
            isOneToOne: false
            referencedRelation: "project_workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_event_logs_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "project_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_edges: {
        Row: {
          conditions: Json
          created_at: string
          id: string
          mapping: Json
          source_handle: string | null
          source_node_id: string
          target_handle: string | null
          target_node_id: string
          template_id: string
        }
        Insert: {
          conditions?: Json
          created_at?: string
          id?: string
          mapping?: Json
          source_handle?: string | null
          source_node_id: string
          target_handle?: string | null
          target_node_id: string
          template_id: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          id?: string
          mapping?: Json
          source_handle?: string | null
          source_node_id?: string
          target_handle?: string | null
          target_node_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_template_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_template_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_edges_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_steps: {
        Row: {
          agent_id: string | null
          auto_run: boolean
          created_at: string
          description: string | null
          form_config: Json
          id: string
          input_schema: Json | null
          is_user_editable: boolean
          model: string | null
          name: string
          node_key: string | null
          node_type: string
          output_mode: string
          output_schema: Json | null
          position_x: number
          position_y: number
          prompt_override: string | null
          quality_check_agent_id: string | null
          require_approval: boolean
          result_assembly_mode: string | null
          result_template_id: string | null
          script_config: Json | null
          stage_group: string | null
          stage_order: number | null
          step_order: number
          temperature: number | null
          template_id: string
          tools: Json
        }
        Insert: {
          agent_id?: string | null
          auto_run?: boolean
          created_at?: string
          description?: string | null
          form_config?: Json
          id?: string
          input_schema?: Json | null
          is_user_editable?: boolean
          model?: string | null
          name: string
          node_key?: string | null
          node_type?: string
          output_mode?: string
          output_schema?: Json | null
          position_x?: number
          position_y?: number
          prompt_override?: string | null
          quality_check_agent_id?: string | null
          require_approval?: boolean
          result_assembly_mode?: string | null
          result_template_id?: string | null
          script_config?: Json | null
          stage_group?: string | null
          stage_order?: number | null
          step_order: number
          temperature?: number | null
          template_id: string
          tools?: Json
        }
        Update: {
          agent_id?: string | null
          auto_run?: boolean
          created_at?: string
          description?: string | null
          form_config?: Json
          id?: string
          input_schema?: Json | null
          is_user_editable?: boolean
          model?: string | null
          name?: string
          node_key?: string | null
          node_type?: string
          output_mode?: string
          output_schema?: Json | null
          position_x?: number
          position_y?: number
          prompt_override?: string | null
          quality_check_agent_id?: string | null
          require_approval?: boolean
          result_assembly_mode?: string | null
          result_template_id?: string | null
          script_config?: Json | null
          stage_group?: string | null
          stage_order?: number | null
          step_order?: number
          temperature?: number | null
          template_id?: string
          tools?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_steps_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "chat_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_steps_quality_check_agent_id_fkey"
            columns: ["quality_check_agent_id"]
            isOneToOne: false
            referencedRelation: "chat_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_preset: boolean
          name: string
          schema: Json
          template_status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_preset?: boolean
          name: string
          schema?: Json
          template_status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_preset?: boolean
          name?: string
          schema?: Json
          template_status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      safe_ai_providers: {
        Row: {
          api_key_masked: string | null
          base_url: string | null
          config: Json | null
          created_at: string | null
          default_model: string | null
          id: string | null
          is_active: boolean | null
          is_default: boolean | null
          name: string | null
          provider_type: string | null
          updated_at: string | null
        }
        Insert: {
          api_key_masked?: never
          base_url?: string | null
          config?: Json | null
          created_at?: string | null
          default_model?: string | null
          id?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string | null
          provider_type?: string | null
          updated_at?: string | null
        }
        Update: {
          api_key_masked?: never
          base_url?: string | null
          config?: Json | null
          created_at?: string | null
          default_model?: string | null
          id?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string | null
          provider_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_expired_bitrix_sessions: { Args: never; Returns: number }
      cleanup_expired_pii_mappings: { Args: never; Returns: number }
      clone_workflow_template: {
        Args: {
          new_name: string
          new_owner: string
          source_template_id: string
        }
        Returns: string
      }
      get_project_member_role: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: Database["public"]["Enums"]["project_member_role"]
      }
      get_user_department: { Args: { uid: string }; Returns: string }
      get_user_role: {
        Args: { uid: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_golden_usage: { Args: { p_ids: string[] }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_project_member: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      keyword_search: {
        Args: {
          keywords: string[]
          match_count?: number
          p_folder_ids?: string[]
        }
        Returns: {
          article_number: string
          chunk_index: number
          chunk_type: string
          content: string
          document_id: string
          document_name: string
          id: string
          keyword_matches: number
          original_document_name: string
          parent_document_id: string
          part_number: number
          section_title: string
          total_parts: number
        }[]
      }
      match_document_chunks: {
        Args: {
          folder_ids?: string[]
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
      search_golden_responses: {
        Args: { match_count?: number; p_role_id?: string; query_text: string }
        Returns: {
          answer: string
          category: string
          id: string
          question: string
          similarity: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      smart_fts_search: {
        Args: {
          match_count?: number
          p_folder_ids?: string[]
          query_text: string
        }
        Returns: {
          article_number: string
          chunk_index: number
          chunk_type: string
          content: string
          document_id: string
          document_name: string
          fts_rank: number
          id: string
          original_document_name: string
          parent_document_id: string
          part_number: number
          section_title: string
          total_parts: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "employee"
      project_member_role: "owner" | "admin" | "member" | "viewer"
      project_memory_type: "fact" | "decision" | "requirement" | "todo"
      project_status: "active" | "archived" | "completed"
      user_status: "active" | "trial" | "limited" | "blocked"
      workflow_status: "draft" | "running" | "paused" | "completed"
      workflow_step_status:
        | "pending"
        | "running"
        | "completed"
        | "error"
        | "skipped"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "employee"],
      project_member_role: ["owner", "admin", "member", "viewer"],
      project_memory_type: ["fact", "decision", "requirement", "todo"],
      project_status: ["active", "archived", "completed"],
      user_status: ["active", "trial", "limited", "blocked"],
      workflow_status: ["draft", "running", "paused", "completed"],
      workflow_step_status: [
        "pending",
        "running",
        "completed",
        "error",
        "skipped",
      ],
    },
  },
} as const
