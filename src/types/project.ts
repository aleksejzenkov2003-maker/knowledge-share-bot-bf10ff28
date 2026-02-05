 // ============================================
 // Типы для Проектного режима чата
 // ============================================
 
 import { ChatRole } from '@/types/chat';
import type { Json } from '@/integrations/supabase/types';
 
 // Статус проекта
 export type ProjectStatus = 'active' | 'archived' | 'completed';
 
 // Роль участника в проекте
 export type ProjectMemberRole = 'owner' | 'admin' | 'member' | 'viewer';
 
 // Тип записи памяти
 export type ProjectMemoryType = 'fact' | 'decision' | 'requirement' | 'todo';
 
 // Проект
 export interface Project {
   id: string;
   name: string;
   description: string | null;
   created_by: string | null;
   department_id: string | null;
   status: ProjectStatus;
  settings: Json;
   created_at: string;
   updated_at: string;
 }
 
 // Участник проекта
 export interface ProjectMember {
   id: string;
   project_id: string;
   user_id: string | null;
   agent_id: string | null;
   role: ProjectMemberRole;
   invited_by: string | null;
   joined_at: string;
   // Связанные данные
   profile?: {
     id: string;
     full_name: string | null;
     email: string | null;
     avatar_url: string | null;
   };
  agent?: {
    id: string;
    name: string;
    slug: string;
    mention_trigger: string | null;
    description: string | null;
  };
 }
 
 // Чат проекта
 export interface ProjectChat {
   id: string;
   project_id: string;
   title: string;
   is_active: boolean;
   is_pinned: boolean;
   created_at: string;
   updated_at: string;
 }
 
 // Вложение в сообщении проекта
 export interface ProjectChatAttachment {
   file_path: string;
   file_name: string;
   file_type: string;
   file_size: number;
 }
 
 // Сообщение проектного чата
 export interface ProjectChatMessage {
   id: string;
   chat_id: string;
   user_id: string;
   agent_id: string | null;
   message_role: 'user' | 'assistant';
   content: string;
   reply_to_message_id: string | null;
   metadata: {
     user_name?: string;
     agent_name?: string;
     attachments?: ProjectChatAttachment[];
     rag_context?: unknown;
     citations?: unknown;
     response_time_ms?: number;
     stop_reason?: string;
     [key: string]: unknown;
   };
   created_at: string;
 }
 
 // Контекст-пакет
 export interface ContextPack {
   id: string;
   name: string;
   description: string | null;
   folder_ids: string[];
   is_global: boolean;
   department_id: string | null;
   created_by: string | null;
   created_at: string;
   updated_at: string;
 }
 
 // Связь проект-контекст
 export interface ProjectContextPack {
   id: string;
   project_id: string;
   context_pack_id: string;
   is_enabled: boolean;
   priority: number;
   // Связанные данные
   context_pack?: ContextPack;
 }
 
 // Запись памяти проекта
 export interface ProjectMemory {
   id: string;
   project_id: string;
   memory_type: ProjectMemoryType;
   content: string;
   source_message_id: string | null;
   created_by: string | null;
   is_active: boolean;
   created_at: string;
   expires_at: string | null;
   // Связанные данные
   creator?: {
     full_name: string | null;
     email: string | null;
   };
 }
 
 // Документ проекта
 export interface ProjectDocument {
   id: string;
   project_id: string;
   document_id: string | null;
   file_path: string | null;
   file_name: string;
   file_size: number | null;
   file_type: string | null;
   added_by: string | null;
   created_at: string;
 }
 
 // Для создания проекта
 export interface CreateProjectInput {
   name: string;
   description?: string;
   department_id?: string;
 }
 
 // Для добавления участника
 export interface AddMemberInput {
   project_id: string;
   user_id?: string;
   agent_id?: string;
   role?: ProjectMemberRole;
 }