-- Drop existing functions first to change return type
DROP FUNCTION IF EXISTS public.smart_fts_search(text, uuid[], integer);
DROP FUNCTION IF EXISTS public.keyword_search(text[], uuid[], integer);

-- Create updated smart_fts_search with parent document metadata
CREATE FUNCTION public.smart_fts_search(query_text text, p_folder_ids uuid[] DEFAULT NULL::uuid[], match_count integer DEFAULT 50)
 RETURNS TABLE(
   id uuid, 
   document_id uuid, 
   content text, 
   chunk_index integer, 
   section_title text, 
   article_number text, 
   chunk_type text, 
   document_name text, 
   fts_rank real,
   parent_document_id uuid,
   original_document_name text,
   part_number integer,
   total_parts integer
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  search_query tsquery;
BEGIN
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
    ts_rank_cd(dc.content_tsv, search_query, 32) as fts_rank,
    d.parent_document_id,
    COALESCE(parent_doc.name, d.name) as original_document_name,
    d.part_number,
    d.total_parts
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  LEFT JOIN documents parent_doc ON parent_doc.id = d.parent_document_id
  WHERE 
    (p_folder_ids IS NULL OR d.folder_id = ANY(p_folder_ids))
    AND dc.content_tsv @@ search_query
  ORDER BY 
    CASE WHEN dc.article_number IS NOT NULL 
         AND query_text ~* ('статья\s*' || dc.article_number || '\b|ст\.?\s*' || dc.article_number || '\b')
         THEN 0 ELSE 1 END,
    ts_rank_cd(dc.content_tsv, search_query, 32) DESC
  LIMIT match_count;
END;
$function$;

-- Create updated keyword_search with parent document metadata
CREATE FUNCTION public.keyword_search(keywords text[], p_folder_ids uuid[] DEFAULT NULL::uuid[], match_count integer DEFAULT 50)
 RETURNS TABLE(
   id uuid, 
   document_id uuid, 
   content text, 
   chunk_index integer, 
   section_title text, 
   article_number text, 
   chunk_type text, 
   document_name text, 
   keyword_matches integer,
   parent_document_id uuid,
   original_document_name text,
   part_number integer,
   total_parts integer
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    ) as keyword_matches,
    d.parent_document_id,
    COALESCE(parent_doc.name, d.name) as original_document_name,
    d.part_number,
    d.total_parts
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  LEFT JOIN documents parent_doc ON parent_doc.id = d.parent_document_id
  WHERE 
    (p_folder_ids IS NULL OR d.folder_id = ANY(p_folder_ids))
    AND EXISTS (
      SELECT 1 FROM unnest(keywords) AS kw
      WHERE dc.content ILIKE '%' || kw || '%'
    )
  ORDER BY keyword_matches DESC
  LIMIT match_count;
END;
$function$;