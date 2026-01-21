import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

interface AttachmentInput {
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

interface ChatRequest {
  message: string;
  role_id?: string;
  department_id?: string;
  model?: string;
  provider_id?: string;
  conversation_id?: string;
  message_history?: { role: string; content: string; agent_name?: string }[];
  attachments?: AttachmentInput[];
  is_department_chat?: boolean;
}

interface ProviderConfig {
  provider_type: string;
  api_key: string;
  default_model: string;
  base_url?: string;
}

interface RankedChunk {
  id: string;
  content: string;
  document_name: string;
  section_title?: string;
  article_number?: string;
  relevance_score: number;
  relevance_reason: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { message, role_id, department_id, model, provider_id, message_history, attachments, is_department_chat }: ChatRequest = await req.json();

    if (!message && (!attachments || attachments.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'message or attachments required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let systemPrompt = 'You are a helpful AI assistant.';
    let folderIds: string[] = [];
    let deptId = department_id;
    let selectedModel = model;
    let selectedProviderId = provider_id;
    let isProjectMode = false;

    // Get role config if role_id provided
    if (role_id) {
      const { data: role } = await supabase
        .from('chat_roles')
        .select('*, system_prompt:system_prompts(prompt_text)')
        .eq('id', role_id)
        .single();

      if (role) {
        deptId = role.department_id;
        folderIds = role.folder_ids || [];
        isProjectMode = role.is_project_mode || false;
        if (role.system_prompt?.prompt_text) {
          systemPrompt = role.system_prompt.prompt_text;
        }
        const modelConfig = role.model_config as { provider_id?: string; model?: string } | null;
        if (modelConfig) {
          if (!selectedProviderId && modelConfig.provider_id) {
            selectedProviderId = modelConfig.provider_id;
          }
          if (!selectedModel && modelConfig.model) {
            selectedModel = modelConfig.model;
          }
        }
      }
    }

    // Get provider configuration
    let providerConfig: ProviderConfig | null = null;
    
    // Helper function to get effective API key (fallback to env if not in provider)
    const getEffectiveApiKey = (providerType: string, providerApiKey: string | null): string => {
      if (providerApiKey) return providerApiKey;
      
      switch (providerType) {
        case 'perplexity':
          return PERPLEXITY_API_KEY || '';
        case 'anthropic':
          return ANTHROPIC_API_KEY || '';
        case 'lovable':
          return LOVABLE_API_KEY || '';
        default:
          return '';
      }
    };
    
    if (selectedProviderId) {
      const { data: provider } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('id', selectedProviderId)
        .eq('is_active', true)
        .single();
      
      if (provider) {
        const effectiveApiKey = getEffectiveApiKey(provider.provider_type, provider.api_key);
        providerConfig = {
          provider_type: provider.provider_type,
          api_key: effectiveApiKey,
          default_model: provider.default_model || '',
          base_url: provider.base_url || undefined,
        };
      }
    }
    
    if (!providerConfig) {
      const { data: defaultProvider } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('is_default', true)
        .eq('is_active', true)
        .single();
      
      if (defaultProvider) {
        const effectiveApiKey = getEffectiveApiKey(defaultProvider.provider_type, defaultProvider.api_key);
        providerConfig = {
          provider_type: defaultProvider.provider_type,
          api_key: effectiveApiKey,
          default_model: defaultProvider.default_model || '',
          base_url: defaultProvider.base_url || undefined,
        };
        selectedProviderId = defaultProvider.id;
      }
    }

    // Fallback to env-configured providers if no provider in DB
    if (!providerConfig) {
      if (ANTHROPIC_API_KEY) {
        providerConfig = {
          provider_type: 'anthropic',
          api_key: ANTHROPIC_API_KEY,
          default_model: 'claude-sonnet-4-20250514',
        };
      } else if (PERPLEXITY_API_KEY) {
        providerConfig = {
          provider_type: 'perplexity',
          api_key: PERPLEXITY_API_KEY,
          default_model: 'sonar-pro',
        };
      } else if (LOVABLE_API_KEY) {
        providerConfig = {
          provider_type: 'lovable',
          api_key: LOVABLE_API_KEY,
          default_model: 'google/gemini-2.5-flash',
        };
      }
    }

    if (!providerConfig || !providerConfig.api_key) {
      throw new Error('No AI provider configured or API key missing');
    }

    const finalModel = selectedModel || providerConfig.default_model;

    // =====================================================
    // "SMART LIBRARIAN" RAG - Hybrid Search with Claude Re-ranking
    // =====================================================
    let ragContext: string[] = [];
    let rankedChunks: RankedChunk[] = [];
    let usedSmartSearch = false;
    const FTS_CANDIDATES = 50; // Get more candidates for re-ranking
    const TOP_K_FINAL = 10;    // Final chunks after re-ranking
    
    // Collect trademark images from relevant documents
    interface TrademarkImage {
      documentId: string;
      documentName: string;
      base64: string;
      mediaType: string;
    }
    const trademarkImages: TrademarkImage[] = [];

    if (folderIds.length > 0) {
      console.log(`RAG: Starting Smart Librarian search for folders: ${folderIds.join(', ')}`);
      
      // STEP 1: Full-Text Search (PostgreSQL) - Get candidates
      try {
        const { data: ftsResults, error: ftsError } = await supabase.rpc('smart_fts_search', {
          query_text: message,
          p_folder_ids: folderIds,
          match_count: FTS_CANDIDATES,
        });

        if (ftsError) {
          console.error('FTS search error:', ftsError);
        }

        if (ftsResults && ftsResults.length > 0) {
          console.log(`RAG: FTS found ${ftsResults.length} candidates`);
          
          // STEP 2: Re-ranking with Claude Sonnet 4.5
          if (ANTHROPIC_API_KEY && ftsResults.length > TOP_K_FINAL) {
            try {
              const chunksForRerank = ftsResults.map((chunk: {
                id: string;
                content: string;
                document_name: string;
                section_title?: string;
                article_number?: string;
                fts_rank?: number;
              }) => ({
                id: chunk.id,
                content: chunk.content,
                document_name: chunk.document_name,
                section_title: chunk.section_title,
                article_number: chunk.article_number,
                fts_rank: chunk.fts_rank,
              }));

              // Call rerank-chunks edge function
              const rerankResponse = await fetch(`${supabaseUrl}/functions/v1/rerank-chunks`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  query: message,
                  chunks: chunksForRerank,
                  top_k: TOP_K_FINAL,
                }),
              });

              if (rerankResponse.ok) {
                const rerankData = await rerankResponse.json();
                if (rerankData.ranked_chunks && rerankData.ranked_chunks.length > 0) {
                  rankedChunks = rerankData.ranked_chunks;
                  usedSmartSearch = true;
                  console.log(`RAG: Claude re-ranked to ${rankedChunks.length} top chunks`);
                }
              } else {
                console.error('Rerank failed:', await rerankResponse.text());
              }
            } catch (rerankError) {
              console.error('Rerank error:', rerankError);
            }
          }

          // Fallback: Use FTS results directly if re-ranking failed
          if (rankedChunks.length === 0) {
            rankedChunks = ftsResults.slice(0, TOP_K_FINAL).map((chunk: {
              id: string;
              content: string;
              document_name: string;
              section_title?: string;
              article_number?: string;
              fts_rank: number;
            }) => ({
              id: chunk.id,
              content: chunk.content,
              document_name: chunk.document_name,
              section_title: chunk.section_title,
              article_number: chunk.article_number,
              relevance_score: chunk.fts_rank * 10, // Normalize FTS rank
              relevance_reason: 'FTS match',
            }));
            console.log(`RAG: Using FTS results directly (${rankedChunks.length} chunks)`);
          }
        }
      } catch (ftsErr) {
        console.error('FTS search failed:', ftsErr);
      }

      // STEP 3: Fallback to keyword search if FTS returned nothing
      if (rankedChunks.length === 0) {
        console.log('RAG: FTS returned no results, trying keyword fallback');
        
        const keywords = message.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        
        if (keywords.length > 0) {
          const { data: keywordResults } = await supabase.rpc('keyword_search', {
            keywords: keywords,
            p_folder_ids: folderIds,
            match_count: TOP_K_FINAL,
          });

          if (keywordResults && keywordResults.length > 0) {
            rankedChunks = keywordResults.map((chunk: {
              id: string;
              content: string;
              document_name: string;
              section_title?: string;
              article_number?: string;
              keyword_matches: number;
            }) => ({
              id: chunk.id,
              content: chunk.content,
              document_name: chunk.document_name,
              section_title: chunk.section_title,
              article_number: chunk.article_number,
              relevance_score: chunk.keyword_matches,
              relevance_reason: `${chunk.keyword_matches} keyword matches`,
            }));
            console.log(`RAG: Keyword search found ${rankedChunks.length} chunks`);
          }
        }
      }

      // Build RAG context with citations
      if (rankedChunks.length > 0) {
        ragContext = rankedChunks.map((chunk, idx) => {
          let citation = `[${idx + 1}] ${chunk.document_name}`;
          if (chunk.section_title) citation += ` | ${chunk.section_title}`;
          if (chunk.article_number) citation += ` | Статья ${chunk.article_number}`;
          citation += ` (релевантность: ${chunk.relevance_score.toFixed(1)})`;
          return `${citation}\n${chunk.content}`;
        });

        // STEP 4: Fetch trademark images from relevant documents
        const documentIds = [...new Set(rankedChunks.map(c => c.id))];
        
        // Get document IDs from chunks (need to query document_chunks to get document_id)
        const { data: chunkDocs } = await supabase
          .from('document_chunks')
          .select('document_id')
          .in('id', rankedChunks.map(c => c.id));
        
        if (chunkDocs && chunkDocs.length > 0) {
          const uniqueDocIds = [...new Set(chunkDocs.map(c => c.document_id))];
          
          const { data: docsWithTrademarks } = await supabase
            .from('documents')
            .select('id, name, has_trademark, trademark_image_path')
            .in('id', uniqueDocIds)
            .eq('has_trademark', true);
          
          if (docsWithTrademarks && docsWithTrademarks.length > 0) {
            console.log(`RAG: Found ${docsWithTrademarks.length} documents with trademarks`);
            
            for (const doc of docsWithTrademarks) {
              if (doc.trademark_image_path) {
                try {
                  const { data: imageData, error: imgError } = await supabase.storage
                    .from('rag-documents')
                    .download(doc.trademark_image_path);
                  
                  if (!imgError && imageData) {
                    const buffer = await imageData.arrayBuffer();
                    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                    
                    // Determine media type from path
                    const ext = doc.trademark_image_path.split('.').pop()?.toLowerCase();
                    let mediaType = 'image/png';
                    if (ext === 'jpg' || ext === 'jpeg') mediaType = 'image/jpeg';
                    else if (ext === 'webp') mediaType = 'image/webp';
                    else if (ext === 'gif') mediaType = 'image/gif';
                    
                    trademarkImages.push({
                      documentId: doc.id,
                      documentName: doc.name,
                      base64,
                      mediaType,
                    });
                    console.log(`RAG: Loaded trademark image for "${doc.name}"`);
                  }
                } catch (err) {
                  console.error(`Error loading trademark for ${doc.name}:`, err);
                }
              }
            }
          }
        }
      }
    }

    console.log(`RAG: Final context has ${ragContext.length} chunks, smart search: ${usedSmartSearch}`);

    // Build messages with context
    let finalPrompt = message || '';
    if (ragContext.length > 0) {
      finalPrompt = `КОНТЕКСТ ИЗ ДОКУМЕНТОВ:\n${ragContext.join('\n\n---\n\n')}\n\n---\n\nВОПРОС ПОЛЬЗОВАТЕЛЯ: ${message || 'Проанализируй прикрепленные файлы'}`;
    }

    // Load attachments and build multimodal content for Anthropic
    type MultimodalContentPart = 
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };
    
    const attachmentParts: MultimodalContentPart[] = [];
    
    if (attachments && attachments.length > 0) {
      console.log(`Processing ${attachments.length} attachments`);
      
      for (const attachment of attachments) {
        try {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('chat-attachments')
            .download(attachment.file_path);
            
          if (downloadError) {
            console.error(`Error downloading ${attachment.file_name}:`, downloadError);
            continue;
          }
          
          const buffer = await fileData.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          
          if (attachment.file_type.startsWith('image/')) {
            attachmentParts.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: attachment.file_type,
                data: base64,
              },
            });
            console.log(`Added image: ${attachment.file_name}`);
          } else if (attachment.file_type === 'application/pdf') {
            attachmentParts.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            });
            console.log(`Added PDF: ${attachment.file_name}`);
          }
        } catch (err) {
          console.error(`Error processing attachment ${attachment.file_name}:`, err);
        }
      }
    }

    const hasAttachments = attachmentParts.length > 0;
    const hasTrademarkImages = trademarkImages.length > 0;

    // Build messages array - handle multimodal for Anthropic
    type SimpleMessage = { role: string; content: string };
    type AnthropicMessage = { role: string; content: string | MultimodalContentPart[] };
    
    let simpleMessages: SimpleMessage[];
    
    // Use message history for project mode OR department chat
    if ((isProjectMode || is_department_chat) && message_history && message_history.length > 0) {
      // Build messages from history
      simpleMessages = message_history.map((msg) => {
        // For department chat, prefix assistant messages with agent name for context
        let content = msg.content;
        if (is_department_chat && msg.role === 'assistant' && (msg as { agent_name?: string }).agent_name) {
          content = `[${(msg as { agent_name?: string }).agent_name}]: ${content}`;
        }
        return { role: msg.role, content };
      });
      
      // CRITICAL: Always ensure current user message is at the end
      // The message_history may not include the current message being sent
      const lastMessage = simpleMessages[simpleMessages.length - 1];
      if (lastMessage?.role !== 'user' || lastMessage?.content !== message) {
        // Add current user message with RAG context
        const userContent = ragContext.length > 0
          ? `КОНТЕКСТ ИЗ ДОКУМЕНТОВ:\n${ragContext.join('\n\n---\n\n')}\n\n---\n\nВОПРОС ПОЛЬЗОВАТЕЛЯ: ${message}`
          : message;
        simpleMessages.push({ role: 'user', content: userContent });
      } else if (ragContext.length > 0) {
        // Last message is the current user message, add RAG context to it
        simpleMessages[simpleMessages.length - 1] = {
          role: 'user',
          content: `КОНТЕКСТ ИЗ ДОКУМЕНТОВ:\n${ragContext.join('\n\n---\n\n')}\n\n---\n\nВОПРОС ПОЛЬЗОВАТЕЛЯ: ${lastMessage.content}`
        };
      }
    } else {
      simpleMessages = [{ role: 'user', content: finalPrompt }];
    }

    // Build Anthropic-specific messages with multimodal content (attachments + trademark images)
    let anthropicMessages: AnthropicMessage[];
    
    // Prepare trademark image parts
    const trademarkParts: MultimodalContentPart[] = trademarkImages.map(tm => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: tm.mediaType,
        data: tm.base64,
      },
    }));
    
    const hasMultimodalContent = hasAttachments || hasTrademarkImages;
    
    if (hasMultimodalContent) {
      anthropicMessages = simpleMessages.map((msg, idx) => {
        if (idx === simpleMessages.length - 1 && msg.role === 'user') {
          const content: MultimodalContentPart[] = [];
          
          // Add trademark images first (context about the documents)
          if (hasTrademarkImages) {
            content.push({ type: 'text', text: `ИЗОБРАЖЕНИЯ ТОВАРНЫХ ЗНАКОВ из релевантных документов (${trademarkImages.map(t => t.documentName).join(', ')}):` });
            content.push(...trademarkParts);
          }
          
          // Add user attachments
          if (hasAttachments) {
            content.push(...attachmentParts);
          }
          
          // Add the text message
          content.push({ type: 'text', text: msg.content || 'Проанализируй прикрепленные файлы' });
          
          return { role: 'user', content };
        }
        return msg;
      });
    } else {
      anthropicMessages = simpleMessages;
    }

    // Update system prompt to include citation instructions
    let enhancedSystemPrompt = ragContext.length > 0 
      ? `${systemPrompt}\n\nВАЖНО: При ответе на вопрос используй информацию из предоставленного контекста. Указывай источники в формате [1], [2] и т.д., ссылаясь на номера фрагментов из контекста. Если информации в контексте недостаточно, честно об этом скажи.`
      : systemPrompt;
    
    if (hasTrademarkImages) {
      enhancedSystemPrompt += `\n\nК этому запросу приложены изображения товарных знаков из релевантных документов (${trademarkImages.map(t => t.documentName).join(', ')}). Учитывай визуальные характеристики товарных знаков при анализе. Если спрашивают о товарном знаке - опиши его внешний вид, цвета, шрифты, графические элементы.`;
    }
    
    if (hasAttachments) {
      enhancedSystemPrompt += '\n\nПользователь прикрепил файлы к сообщению. Проанализируй их содержимое и ответь на вопрос пользователя, учитывая информацию из файлов.';
    }

    console.log(`Streaming from ${providerConfig.provider_type} with model: ${finalModel}, attachments: ${hasAttachments}, trademarks: ${hasTrademarkImages}`);

    // Create streaming response based on provider
    let streamResponse: Response;
    
    switch (providerConfig.provider_type) {
      case 'anthropic':
        streamResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': providerConfig.api_key || ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'pdfs-2024-09-25',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            max_tokens: 4096,
            system: enhancedSystemPrompt,
            messages: anthropicMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
            stream: true,
          }),
        });
        break;

      case 'openai':
        streamResponse = await fetch(`${providerConfig.base_url || 'https://api.openai.com/v1'}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${providerConfig.api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            messages: [{ role: 'system', content: enhancedSystemPrompt }, ...simpleMessages],
            stream: true,
          }),
        });
        break;

      case 'lovable':
        streamResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY || providerConfig.api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            messages: [{ role: 'system', content: enhancedSystemPrompt }, ...simpleMessages],
            stream: true,
          }),
        });
        break;

      case 'perplexity':
      default:
        // Note: sonar-deep-research may take longer and work differently
        const isDeepResearch = finalModel.includes('deep-research');
        console.log(`Perplexity request: model=${finalModel}, isDeepResearch=${isDeepResearch}`);
        
        streamResponse = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${providerConfig.api_key || PERPLEXITY_API_KEY || ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            messages: [{ role: 'system', content: enhancedSystemPrompt }, ...simpleMessages],
            stream: !isDeepResearch, // Deep research doesn't support streaming well
          }),
        });
        
        console.log(`Perplexity response status: ${streamResponse.status}`);
        break;
    }

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      console.error('Provider stream error:', streamResponse.status, errorText);
      throw new Error(`Provider error: ${streamResponse.status}`);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullContent = '';

    // Check if this is a non-streaming response (e.g., Perplexity deep-research)
    const contentType = streamResponse.headers.get('content-type') || '';
    const isNonStreaming = contentType.includes('application/json') || 
      (providerConfig.provider_type === 'perplexity' && finalModel.includes('deep-research'));
    
    if (isNonStreaming) {
      // Handle non-streaming JSON response
      console.log('Handling non-streaming response');
      const jsonResponse = await streamResponse.json();
      fullContent = jsonResponse.choices?.[0]?.message?.content || '';
      
      const responseTimeMs = Date.now() - startTime;
      const citations = rankedChunks.map((chunk, idx) => ({
        index: idx + 1,
        document: chunk.document_name,
        section: chunk.section_title,
        article: chunk.article_number,
        relevance: chunk.relevance_score,
      }));
      
      // Create a simple stream that sends the full content at once
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: fullContent })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: responseTimeMs,
            rag_context: ragContext.length > 0 ? ragContext : undefined,
            citations: citations.length > 0 ? citations : undefined,
            smart_search: usedSmartSearch,
          })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      
      // Log chat
      await supabase.from('chat_logs').insert({
        user_id: userId,
        department_id: deptId,
        provider_id: selectedProviderId || null,
        prompt: message,
        response: fullContent,
        response_time_ms: responseTimeMs,
        metadata: { 
          model: finalModel,
          provider_type: providerConfig.provider_type,
          role_id,
          rag_chunks: ragContext.length,
          smart_search: usedSmartSearch,
          streaming: false,
        },
      });
      
      return new Response(stream, { headers: corsHeaders });
    }

    // Streaming response handling
    const reader = streamResponse.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (!line.trim() || line.startsWith(':')) continue;
              
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  let content = '';

                  // Handle different provider formats
                  if (providerConfig!.provider_type === 'anthropic') {
                    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                      content = parsed.delta.text;
                    }
                  } else {
                    // OpenAI/Perplexity/Lovable format
                    content = parsed.choices?.[0]?.delta?.content || 
                              parsed.choices?.[0]?.message?.content || '';
                  }

                  if (content) {
                    fullContent += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`));
                  }
                } catch {
                  // Ignore parsing errors
                }
              }
            }
          }

          // Send metadata at the end with citations
          const responseTimeMs = Date.now() - startTime;
          const citations = rankedChunks.map((chunk, idx) => ({
            index: idx + 1,
            document: chunk.document_name,
            section: chunk.section_title,
            article: chunk.article_number,
            relevance: chunk.relevance_score,
          }));

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: responseTimeMs,
            rag_context: ragContext.length > 0 ? ragContext : undefined,
            citations: citations.length > 0 ? citations : undefined,
            smart_search: usedSmartSearch,
          })}\n\n`));

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

          // Log chat
          await supabase.from('chat_logs').insert({
            user_id: userId,
            department_id: deptId,
            provider_id: selectedProviderId || null,
            prompt: message,
            response: fullContent,
            response_time_ms: responseTimeMs,
            metadata: { 
              model: finalModel,
              provider_type: providerConfig!.provider_type,
              role_id,
              rag_chunks: ragContext.length,
              smart_search: usedSmartSearch,
              streaming: true,
            },
          });
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, { headers: corsHeaders });

  } catch (error) {
    console.error('Chat stream error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
