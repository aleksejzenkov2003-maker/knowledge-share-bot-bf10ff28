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
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

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
        // Use Lovable AI to extract text from PDF
        if (LOVABLE_API_KEY) {
          const arrayBuffer = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          
          // Convert to base64 in chunks to avoid call stack issues
          let base64 = '';
          const chunkSize = 32768;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            base64 += String.fromCharCode.apply(null, Array.from(chunk));
          }
          base64 = btoa(base64);
          
          console.log('Extracting text from PDF using AI...');
          
          // Use AI to extract and OCR the PDF content
          const extractResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Extract ALL text content from this PDF document. Output ONLY the extracted text, preserving the structure and formatting as much as possible. Do not add any commentary or explanations - just the document text.`
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:application/pdf;base64,${base64}`
                      }
                    }
                  ]
                }
              ],
              max_tokens: 16000,
            }),
          });

          if (extractResponse.ok) {
            const extractData = await extractResponse.json();
            text = extractData.choices?.[0]?.message?.content || '';
            console.log(`AI extracted ${text.length} characters from PDF`);
          } else {
            const errorText = await extractResponse.text();
            console.error('PDF extraction error:', errorText);
            text = `[PDF Document: ${doc.file_name}] - Failed to extract text.`;
          }
        } else {
          text = `[PDF Document: ${doc.file_name}] - API key required for PDF extraction.`;
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

      // Chunk the text
      const chunks = chunkText(text, 1000, 200);
      console.log(`Created ${chunks.length} chunks`);

      // Delete existing chunks
      await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', document_id);

      // Insert new chunks (without embeddings first)
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

        const { data: insertedChunks, error: insertError } = await supabase
          .from('document_chunks')
          .insert(chunkRecords)
          .select('id, content');

        if (insertError) {
          throw new Error(`Failed to insert chunks: ${insertError.message}`);
        }

        console.log(`Inserted ${insertedChunks?.length || 0} chunks`);

        // Generate embeddings for each chunk using Lovable AI
        if (LOVABLE_API_KEY && insertedChunks && insertedChunks.length > 0) {
          console.log('Generating embeddings...');
          let embeddingsGenerated = 0;
          
          for (const chunk of insertedChunks) {
            try {
              const embedding = await generateEmbedding(chunk.content, LOVABLE_API_KEY);
              
              if (embedding && embedding.length === 1536) {
                const { error: updateError } = await supabase
                  .from('document_chunks')
                  .update({ embedding: `[${embedding.join(',')}]` })
                  .eq('id', chunk.id);
                
                if (!updateError) {
                  embeddingsGenerated++;
                } else {
                  console.error(`Failed to update embedding for chunk ${chunk.id}:`, updateError);
                }
              }
            } catch (embError) {
              console.error(`Error generating embedding for chunk ${chunk.id}:`, embError);
            }
          }
          
          console.log(`Generated ${embeddingsGenerated}/${insertedChunks.length} embeddings`);
        } else {
          console.log('LOVABLE_API_KEY not configured, skipping embeddings');
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

// Generate embedding using Lovable AI
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        {
          role: 'system',
          content: `You are a text embedding generator. Analyze the given text and generate a semantic embedding.
Output ONLY a JSON array of exactly 1536 floating point numbers between -1 and 1.
These numbers should represent the semantic meaning of the text.
Output ONLY the JSON array, nothing else.`
        },
        {
          role: 'user',
          content: `Generate embedding for: "${text.substring(0, 500)}"`
        }
      ],
      temperature: 0,
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lovable AI error:', response.status, errorText);
    // Return fallback embedding
    return createSimpleEmbedding(text);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  try {
    const jsonMatch = content.match(/\[[\d\s,.\-e]+\]/);
    if (jsonMatch) {
      const embedding = JSON.parse(jsonMatch[0]);
      if (Array.isArray(embedding) && embedding.length > 0) {
        while (embedding.length < 1536) {
          embedding.push(0);
        }
        return embedding.slice(0, 1536);
      }
    }
  } catch (parseError) {
    console.error('Failed to parse embedding:', parseError);
  }
  
  return createSimpleEmbedding(text);
}

// Fallback simple embedding based on text hash
function createSimpleEmbedding(text: string): number[] {
  const embedding = new Array(1536).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const index = (charCode * (i + 1) * (j + 1)) % 1536;
      embedding[index] += 0.1 / (1 + Math.sqrt(i));
    }
  }
  
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
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

  const sentences = cleanText.split(/(?<=[.!?])\s+/);
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const cleanSentence = sanitizeText(sentence);
    if (!cleanSentence) continue;
    
    if ((currentChunk + ' ' + cleanSentence).length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      
      const words = currentChunk.split(' ');
      const overlapWords = Math.ceil(overlap / 5);
      currentChunk = words.slice(-overlapWords).join(' ') + ' ' + cleanSentence;
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + cleanSentence : cleanSentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}
