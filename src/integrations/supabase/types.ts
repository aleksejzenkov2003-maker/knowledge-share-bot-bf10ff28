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
          created_at: string
          department_ids: string[] | null
          description: string | null
          folder_ids: string[] | null
          id: string
          is_active: boolean
          is_project_mode: boolean
          mention_trigger: string | null
          model_config: Json | null
          name: string
          slug: string
          system_prompt_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_ids?: string[] | null
          description?: string | null
          folder_ids?: string[] | null
          id?: string
          is_active?: boolean
          is_project_mode?: boolean
          mention_trigger?: string | null
          model_config?: Json | null
          name: string
          slug: string
          system_prompt_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_ids?: string[] | null
          description?: string | null
          folder_ids?: string[] | null
          id?: string
          is_active?: boolean
          is_project_mode?: boolean
          mention_trigger?: string | null
          model_config?: Json | null
          name?: string
          slug?: string
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
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department_id: string
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string
          id?: string
          is_active?: boolean | null
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
          id: string
          metadata: Json | null
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
          id?: string
          metadata?: Json | null
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
          id?: string
          metadata?: Json | null
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
          status: string
          storage_path: string | null
          total_parts: number | null
          trademark_image_path: string | null
          updated_at: string
        }
        Insert: {
          chunk_count?: number | null
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
          status?: string
          storage_path?: string | null
          total_parts?: number | null
          trademark_image_path?: string | null
          updated_at?: string
        }
        Update: {
          chunk_count?: number | null
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
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
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
        ]
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
      is_admin: { Args: never; Returns: boolean }
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
          section_title: string
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
          section_title: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "employee"
      user_status: "active" | "trial" | "limited" | "blocked"
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
      user_status: ["active", "trial", "limited", "blocked"],
    },
  },
} as const
