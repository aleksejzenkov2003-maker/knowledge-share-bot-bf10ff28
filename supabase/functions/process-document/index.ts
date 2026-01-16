import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  document_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { document_id }: ProcessRequest = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: 'document_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing document: ${document_id}`);

    // Get document info
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single();

    if (docError || !doc) {
      console.error('Document not found:', docError);
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', document_id);

    try {
      // Download file from storage
      if (!doc.storage_path) {
        throw new Error('No storage path for document');
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from('rag-documents')
        .download(doc.storage_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      console.log(`Downloaded file: ${doc.storage_path}, size: ${fileData.size}`);

      // Extract text based on file type
      let text = '';
      const fileType = doc.file_type || '';

      if (fileType.includes('text') || doc.file_name?.endsWith('.txt') || doc.file_name?.endsWith('.md')) {
        text = await fileData.text();
      } else if (fileType.includes('pdf')) {
        // For PDF, try to extract raw text first
        const arrayBuffer = await fileData.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const rawText = decoder.decode(bytes);
        
        // Try to extract readable text from PDF structure
        const textMatches = rawText.match(/\((.*?)\)/g);
        if (textMatches) {
          text = textMatches
            .map(m => m.slice(1, -1))
            .filter(t => t.length > 2 && /[a-zA-Zа-яА-Я]/.test(t))
            .join(' ');
        }
        
        if (text.length < 100) {
          text = `[PDF Document: ${doc.file_name}] - Please upload a text version of this document for better results.`;
        }
      } else {
        try {
          text = await fileData.text();
        } catch {
          text = `[Document: ${doc.file_name}] - Binary content, requires specific parser.`;
        }
      }

      // Sanitize text to remove problematic Unicode sequences
      text = sanitizeText(text);
      console.log(`Extracted text length: ${text.length}`);

      // Chunk the text with larger chunks for faster processing
      const chunks = chunkText(text, 2000, 200);
      console.log(`Created ${chunks.length} chunks`);

      // Delete existing chunks
      await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', document_id);

      // Insert chunks in batches with simple embeddings
      if (chunks.length > 0) {
        const BATCH_SIZE = 100;
        let totalInserted = 0;
        
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          const batch = chunks.slice(i, i + BATCH_SIZE);
          const chunkRecords = batch.map((content, index) => ({
            document_id,
            content,
            chunk_index: i + index,
            embedding: `[${createSimpleEmbedding(content).join(',')}]`,
            metadata: {
              file_name: doc.file_name,
              folder_id: doc.folder_id,
            },
          }));

          const { error: insertError } = await supabase
            .from('document_chunks')
            .insert(chunkRecords);

          if (insertError) {
            console.error(`Failed to insert batch ${i}:`, insertError.message);
          } else {
            totalInserted += batch.length;
          }
        }

        console.log(`Inserted ${totalInserted} chunks with embeddings`);
      }

      // Update document status to ready IMMEDIATELY
      await supabase
        .from('documents')
        .update({ 
          status: 'ready',
          chunk_count: chunks.length,
        })
        .eq('id', document_id);

      console.log(`Document processed successfully: ${chunks.length} chunks`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          chunks_count: chunks.length,
          text_length: text.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (processError) {
      console.error('Processing error:', processError);

      await supabase
        .from('documents')
        .update({ status: 'error' })
        .eq('id', document_id);

      throw processError;
    }

  } catch (error) {
    console.error('Process document error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Simple embedding based on text hash - fast and deterministic
function createSimpleEmbedding(text: string): number[] {
  const embedding = new Array(1536).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  // Create a hash-based embedding
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const index = (charCode * (i + 1) * (j + 1)) % 1536;
      embedding[index] += 0.1 / (1 + Math.sqrt(i));
    }
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = Math.round(embedding[i] / magnitude * 1000000) / 1000000;
    }
  }
  
  return embedding;
}

// Sanitize text to remove problematic Unicode escape sequences
function sanitizeText(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0) continue;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    if (code === 127) continue;
    if (code === 0xFFFE || code === 0xFFFF) continue;
    if (code >= 0xD800 && code <= 0xDFFF) {
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          result += text[i] + text[i + 1];
          i++;
          continue;
        }
      }
      continue;
    }
    result += text[i];
  }
  
  result = result
    .replace(/\\/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return result;
}

// Text chunking function with overlap
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) return [];

  // Simple chunking by character count with overlap
  let start = 0;
  while (start < cleanText.length) {
    let end = Math.min(start + chunkSize, cleanText.length);
    
    // Try to break at word boundary
    if (end < cleanText.length) {
      const lastSpace = cleanText.lastIndexOf(' ', end);
      if (lastSpace > start + chunkSize / 2) {
        end = lastSpace;
      }
    }
    
    const chunk = cleanText.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    
    start = end - overlap;
    if (start <= 0 || end >= cleanText.length) {
      start = end;
    }
  }
  
  return chunks;
}
