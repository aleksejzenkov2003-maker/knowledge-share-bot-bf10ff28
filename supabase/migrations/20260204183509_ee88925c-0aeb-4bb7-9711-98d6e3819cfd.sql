-- ===========================================
-- PII Protection Module (152-ФЗ) - Phase 1
-- ===========================================

-- Таблица маппингов токенов ПДн
CREATE TABLE public.pii_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Контекст источника
  source_type TEXT NOT NULL CHECK (source_type IN ('chat_message', 'document_chunk', 'attachment', 'document')),
  source_id UUID NOT NULL,
  session_id UUID,
  
  -- Токен и зашифрованное значение
  token TEXT NOT NULL,
  pii_type TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  
  -- Метаданные
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '90 days',
  
  -- Уникальность токена в рамках источника
  UNIQUE(source_id, token)
);

-- Индексы для pii_mappings
CREATE INDEX idx_pii_mappings_session ON pii_mappings(session_id);
CREATE INDEX idx_pii_mappings_source ON pii_mappings(source_type, source_id);
CREATE INDEX idx_pii_mappings_expires ON pii_mappings(expires_at);

-- RLS для pii_mappings - только сервисная роль
ALTER TABLE pii_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access only" ON pii_mappings
  FOR ALL USING (false);

-- Таблица аудита доступа к ПДн
CREATE TABLE public.pii_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Кто запросил
  user_id UUID NOT NULL,
  user_email TEXT,
  user_ip TEXT,
  
  -- Что запросил
  mapping_id UUID REFERENCES pii_mappings(id) ON DELETE SET NULL,
  token TEXT NOT NULL,
  pii_type TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('view', 'export', 'copy')),
  
  -- Контекст
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  
  -- Время
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы для аудита
CREATE INDEX idx_pii_audit_user ON pii_audit_log(user_id);
CREATE INDEX idx_pii_audit_date ON pii_audit_log(created_at DESC);
CREATE INDEX idx_pii_audit_source ON pii_audit_log(source_type, source_id);

-- RLS для аудита - только админы могут читать
ALTER TABLE pii_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit" ON pii_audit_log
  FOR SELECT USING (is_admin());

-- Расширение таблицы documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS contains_pii BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pii_processed BOOLEAN DEFAULT false;

-- Расширение таблицы document_chunks
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS has_masked_pii BOOLEAN DEFAULT false;

-- Функция для очистки просроченных маппингов (вызывается по расписанию)
CREATE OR REPLACE FUNCTION public.cleanup_expired_pii_mappings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.pii_mappings 
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;