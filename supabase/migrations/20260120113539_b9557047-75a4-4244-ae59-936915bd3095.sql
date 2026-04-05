-- Фаза 1: Full-Text Search для document_chunks

-- 1. Добавить tsvector колонку для русского языка
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS content_tsv tsvector 
GENERATED ALWAYS AS (to_tsvector('russian', content)) STORED;

-- 2. Создать GIN индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON document_chunks USING GIN(content_tsv);

-- 3. Добавить колонки для структуры документа
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS section_title TEXT,
ADD COLUMN IF NOT EXISTS article_number TEXT,
ADD COLUMN IF NOT EXISTS chunk_type TEXT DEFAULT 'paragraph';

-- 4. Создать функцию умного FTS поиска
CREATE OR REPLACE FUNCTION smart_fts_search(
  query_text TEXT,
  p_folder_ids UUID[] DEFAULT NULL,
  match_count INT DEFAULT 50
)
RETURNS TABLE(
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INT,
  section_title TEXT,
  article_number TEXT,
  chunk_type TEXT,
  document_name TEXT,
  fts_rank REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  search_query tsquery;
BEGIN
  -- Преобразуем текст запроса в tsquery для русского языка
  -- Используем plainto_tsquery для простого текста или websearch для сложных запросов
  BEGIN
    search_query := websearch_to_tsquery('russian', query_text);
  EXCEPTION WHEN OTHERS THEN
    search_query := plainto_tsquery('russian', query_text);
  END;
  
  RETURN QUERY
  SELECT 
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.section_title,
    dc.article_number,
    dc.chunk_type,
    d.name as document_name,
    ts_rank_cd(dc.content_tsv, search_query, 32) as fts_rank
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 
    -- Фильтр по папкам (если указаны)
    (p_folder_ids IS NULL OR d.folder_id = ANY(p_folder_ids))
    -- FTS поиск
    AND dc.content_tsv @@ search_query
  ORDER BY 
    -- Сначала точные совпадения номеров статей
    CASE WHEN dc.article_number IS NOT NULL 
         AND query_text ~* ('статья\s*' || dc.article_number || '\b|ст\.?\s*' || dc.article_number || '\b')
         THEN 0 ELSE 1 END,
    -- Затем по релевантности FTS
    ts_rank_cd(dc.content_tsv, search_query, 32) DESC
  LIMIT match_count;
END;
$$;

-- 5. Создать функцию для поиска по ключевым словам (fallback)
CREATE OR REPLACE FUNCTION keyword_search(
  keywords TEXT[],
  p_folder_ids UUID[] DEFAULT NULL,
  match_count INT DEFAULT 50
)
RETURNS TABLE(
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INT,
  section_title TEXT,
  article_number TEXT,
  chunk_type TEXT,
  document_name TEXT,
  keyword_matches INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.section_title,
    dc.article_number,
    dc.chunk_type,
    d.name as document_name,
    (
      SELECT COUNT(*)::INT
      FROM unnest(keywords) AS kw
      WHERE dc.content ILIKE '%' || kw || '%'
    ) as keyword_matches
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 
    (p_folder_ids IS NULL OR d.folder_id = ANY(p_folder_ids))
    AND EXISTS (
      SELECT 1 FROM unnest(keywords) AS kw
      WHERE dc.content ILIKE '%' || kw || '%'
    )
  ORDER BY keyword_matches DESC
  LIMIT match_count;
END;
$$;