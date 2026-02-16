
-- ============================================================
-- 1. Hybrid FTS: AND first, then OR fallback if < 10 results
-- ============================================================
CREATE OR REPLACE FUNCTION public.smart_fts_search(
  query_text text, 
  p_folder_ids uuid[] DEFAULT NULL::uuid[], 
  match_count integer DEFAULT 50
)
RETURNS TABLE(
  id uuid, document_id uuid, content text, chunk_index integer, 
  section_title text, article_number text, chunk_type text, 
  document_name text, fts_rank real, parent_document_id uuid, 
  original_document_name text, part_number integer, total_parts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  and_query tsquery;
  or_query tsquery;
  and_count integer;
  or_query_text text;
BEGIN
  -- Build AND query (websearch_to_tsquery uses AND by default)
  BEGIN
    and_query := websearch_to_tsquery('russian', query_text);
  EXCEPTION WHEN OTHERS THEN
    and_query := plainto_tsquery('russian', query_text);
  END;
  
  -- Count AND results first
  SELECT COUNT(*) INTO and_count
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 
    (p_folder_ids IS NULL OR d.folder_id = ANY(p_folder_ids))
    AND dc.content_tsv @@ and_query;
  
  -- If AND found enough results, use them
  IF and_count >= 10 THEN
    RETURN QUERY
    SELECT 
      dc.id, dc.document_id, dc.content, dc.chunk_index,
      dc.section_title, dc.article_number, dc.chunk_type,
      d.name as document_name,
      ts_rank_cd(dc.content_tsv, and_query, 32) as fts_rank,
      d.parent_document_id,
      COALESCE(parent_doc.name, d.name) as original_document_name,
      d.part_number, d.total_parts
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    LEFT JOIN documents parent_doc ON parent_doc.id = d.parent_document_id
    WHERE 
      (p_folder_ids IS NULL OR d.folder_id = ANY(p_folder_ids))
      AND dc.content_tsv @@ and_query
    ORDER BY 
      CASE WHEN dc.article_number IS NOT NULL 
           AND query_text ~* ('статья\s*' || dc.article_number || '\b|ст\.?\s*' || dc.article_number || '\b')
           THEN 0 ELSE 1 END,
      ts_rank_cd(dc.content_tsv, and_query, 32) DESC
    LIMIT match_count;
  ELSE
    -- Build OR query: replace & with | in the tsquery text representation
    or_query_text := replace(and_query::text, ' & ', ' | ');
    BEGIN
      or_query := or_query_text::tsquery;
    EXCEPTION WHEN OTHERS THEN
      or_query := plainto_tsquery('russian', query_text);
    END;
    
    -- Return combined: AND results (full rank) + OR results (half rank), deduplicated
    RETURN QUERY
    WITH and_results AS (
      SELECT 
        dc.id, dc.document_id, dc.content, dc.chunk_index,
        dc.section_title, dc.article_number, dc.chunk_type,
        d.name as document_name,
        ts_rank_cd(dc.content_tsv, and_query, 32) as fts_rank,
        d.parent_document_id,
        COALESCE(parent_doc.name, d.name) as original_document_name,
        d.part_number, d.total_parts
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      LEFT JOIN documents parent_doc ON parent_doc.id = d.parent_document_id
      WHERE 
        (p_folder_ids IS NULL OR d.folder_id = ANY(p_folder_ids))
        AND dc.content_tsv @@ and_query
    ),
    or_results AS (
      SELECT 
        dc.id, dc.document_id, dc.content, dc.chunk_index,
        dc.section_title, dc.article_number, dc.chunk_type,
        d.name as document_name,
        ts_rank_cd(dc.content_tsv, or_query, 32) * 0.5 as fts_rank,
        d.parent_document_id,
        COALESCE(parent_doc.name, d.name) as original_document_name,
        d.part_number, d.total_parts
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      LEFT JOIN documents parent_doc ON parent_doc.id = d.parent_document_id
      WHERE 
        (p_folder_ids IS NULL OR d.folder_id = ANY(p_folder_ids))
        AND dc.content_tsv @@ or_query
        AND dc.id NOT IN (SELECT ar.id FROM and_results ar)
    ),
    combined AS (
      SELECT * FROM and_results
      UNION ALL
      SELECT * FROM or_results
    )
    SELECT * FROM combined
    ORDER BY 
      CASE WHEN combined.article_number IS NOT NULL 
           AND query_text ~* ('статья\s*' || combined.article_number || '\b|ст\.?\s*' || combined.article_number || '\b')
           THEN 0 ELSE 1 END,
      combined.fts_rank DESC
    LIMIT match_count;
  END IF;
END;
$function$;

-- ============================================================
-- 2. Improved keyword_search: numeric patterns match "Класс: N"
-- ============================================================
CREATE OR REPLACE FUNCTION public.keyword_search(
  keywords text[], 
  p_folder_ids uuid[] DEFAULT NULL::uuid[], 
  match_count integer DEFAULT 50
)
RETURNS TABLE(
  id uuid, document_id uuid, content text, chunk_index integer,
  section_title text, article_number text, chunk_type text,
  document_name text, keyword_matches integer, parent_document_id uuid,
  original_document_name text, part_number integer, total_parts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id, dc.document_id, dc.content, dc.chunk_index,
    dc.section_title, dc.article_number, dc.chunk_type,
    d.name as document_name,
    (
      SELECT COUNT(*)::INT
      FROM unnest(keywords) AS kw
      WHERE 
        dc.content ILIKE '%' || kw || '%'
        -- For numeric keywords, also match "Класс: N" pattern
        OR (kw ~ '^\d+$' AND (
          dc.content ILIKE '%Класс: ' || kw || '%'
          OR dc.content ILIKE '%Класс ' || kw || '%'
          OR dc.content ILIKE '%Class: ' || kw || '%'
          OR dc.content ILIKE '%Class ' || kw || '%'
          OR dc.content ILIKE '%№ ' || kw || '%'
          OR dc.content ILIKE '%No: ' || kw || '%'
        ))
    ) as keyword_matches,
    d.parent_document_id,
    COALESCE(parent_doc.name, d.name) as original_document_name,
    d.part_number, d.total_parts
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  LEFT JOIN documents parent_doc ON parent_doc.id = d.parent_document_id
  WHERE 
    (p_folder_ids IS NULL OR d.folder_id = ANY(p_folder_ids))
    AND EXISTS (
      SELECT 1 FROM unnest(keywords) AS kw
      WHERE 
        dc.content ILIKE '%' || kw || '%'
        OR (kw ~ '^\d+$' AND (
          dc.content ILIKE '%Класс: ' || kw || '%'
          OR dc.content ILIKE '%Класс ' || kw || '%'
          OR dc.content ILIKE '%Class: ' || kw || '%'
          OR dc.content ILIKE '%Class ' || kw || '%'
          OR dc.content ILIKE '%№ ' || kw || '%'
          OR dc.content ILIKE '%No: ' || kw || '%'
        ))
    )
  ORDER BY keyword_matches DESC
  LIMIT match_count;
END;
$function$;
