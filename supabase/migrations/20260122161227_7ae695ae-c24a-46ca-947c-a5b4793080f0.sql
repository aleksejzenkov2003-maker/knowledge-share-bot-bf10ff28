-- Индексы для ускорения загрузки сообщений и диалогов

-- Составной индекс для быстрой загрузки сообщений по conversation_id с сортировкой
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON messages(conversation_id, created_at ASC);

-- Индекс для быстрого получения списка диалогов пользователя
CREATE INDEX IF NOT EXISTS idx_conversations_user_active_updated 
ON conversations(user_id, is_active, updated_at DESC);

-- Индекс для активных ролей чата
CREATE INDEX IF NOT EXISTS idx_chat_roles_active 
ON chat_roles(is_active) WHERE is_active = true;

-- Индекс для сообщений отдела
CREATE INDEX IF NOT EXISTS idx_department_messages_chat_created 
ON department_chat_messages(chat_id, created_at ASC);

-- Индекс для чатов отдела
CREATE INDEX IF NOT EXISTS idx_department_chats_department_active 
ON department_chats(department_id, is_active) WHERE is_active = true;