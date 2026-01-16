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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { document_id }: ProcessRequest = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: 'document_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing document: ${document_id}`);

    // Get document
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
        // Plain text files
        text = await fileData.text();
      } else if (fileType.includes('pdf')) {
        // For PDF, we'll just extract what we can (basic approach)
        // In production, you'd use a PDF parsing library
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Try to find text content in PDF (very basic)
        let decoder = new TextDecoder('utf-8', { fatal: false });
        let rawText = decoder.decode(uint8Array);
        
        // Extract text between parentheses (common PDF text encoding)
        const textMatches = rawText.match(/\\((.*?)\\)/g);
        if (textMatches) {
          text = textMatches
            .map(m => m.slice(1, -1))
            .filter(t => t.length > 1 && !/^[\x00-\x1F]+$/.test(t))
            .join(' ');
        }
        
        // If no text found, use placeholder
        if (!text.trim()) {
          text = `[PDF Document: ${doc.file_name}] - Content extraction requires additional processing. ` +
                 `This document has been uploaded and is ready for enhanced PDF processing.`;
        }
      } else {
        // For other file types, try to read as text
        try {
          text = await fileData.text();
        } catch {
          text = `[Document: ${doc.file_name}] - Binary content, requires specific parser.`;
        }
      }

      console.log(`Extracted text length: ${text.length}`);

      // Chunk the text
      const chunks = chunkText(text, 1000, 200);
      console.log(`Created ${chunks.length} chunks`);

      // Delete existing chunks
      await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', document_id);

      // Insert new chunks
      if (chunks.length > 0) {
        const chunkRecords = chunks.map((content, index) => ({
          document_id,
          content,
          chunk_index: index,
          metadata: {
            file_name: doc.file_name,
            folder_id: doc.folder_id,
          },
        }));

        const { error: insertError } = await supabase
          .from('document_chunks')
          .insert(chunkRecords);

        if (insertError) {
          throw new Error(`Failed to insert chunks: ${insertError.message}`);
        }
      }

      // Update document status
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

      // Update status to error
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

// Text chunking function with overlap
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  
  // Clean and normalize text
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) return [];

  // Split by sentences for better context
  const sentences = cleanText.split(/(?<=[.!?])\s+/);
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + ' ' + sentence).length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      
      // Keep overlap from the end of previous chunk
      const words = currentChunk.split(' ');
      const overlapWords = Math.ceil(overlap / 5); // Approximate words for overlap
      currentChunk = words.slice(-overlapWords).join(' ') + ' ' + sentence;
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}
