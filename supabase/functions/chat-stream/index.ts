import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getActivePatterns, extractPiiTokens } from "../_shared/pii-patterns.ts";
import { encryptAES256, decryptAES256 } from "../_shared/pii-crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

interface AttachmentInput {
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  contains_pii?: boolean;
}

interface ChatRequest {
  message: string;
  role_id?: string;
  department_id?: string;
  model?: string;
  provider_id?: string;
  conversation_id?: string;
  message_history?: { 
    role: string; 
    content: string; 
    agent_name?: string;
    attachments?: AttachmentInput[];  // Attachments from message history for persistent context
  }[];
  attachments?: AttachmentInput[];
  is_department_chat?: boolean;
  reply_to?: {  // Context for the message being replied to
    content: string;
    author_name?: string;
    message_role: 'user' | 'assistant';
  };
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
  // New fields for document grouping
  parent_document_id?: string;
  original_document_name?: string;
  part_number?: number;
  total_parts?: number;
  // NEW: Page numbers for precise PDF navigation
  page_start?: number;
  page_end?: number;
}

// Helper function to convert ArrayBuffer to base64 without stack overflow
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// ============= GIGACHAT OAUTH TOKEN CACHE =============
let gigachatTokenCache: { token: string; expiresAt: number } | null = null;

async function getGigaChatAccessToken(authKey: string): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (gigachatTokenCache && Date.now() < gigachatTokenCache.expiresAt - 60000) {
    return gigachatTokenCache.token;
  }
  
  console.log('GigaChat: Requesting new OAuth access token...');
  const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'RqUID': crypto.randomUUID(),
      'Authorization': `Basic ${authKey}`,
    },
    body: 'scope=GIGACHAT_API_PERS',
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('GigaChat OAuth error:', response.status, errorText);
    throw new Error(`GigaChat OAuth failed: ${response.status}`);
  }
  
  const data = await response.json();
  gigachatTokenCache = {
    token: data.access_token,
    expiresAt: data.expires_at * 1000, // Convert to milliseconds
  };
  
  console.log('GigaChat: OAuth token obtained successfully');
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const GIGACHAT_API_KEY = Deno.env.get('GIGACHAT_API_KEY');

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

    const reqBody: ChatRequest = await req.json();
    const { role_id, department_id, model, provider_id, message_history, attachments, is_department_chat, reply_to } = reqBody;
    let message = reqBody.message;

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
    let allowWebSearch = true;
    let strictRagMode = false;
    let externalApis: { reputation?: { enabled?: boolean; auto_search?: boolean } } = {};
    
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
        // New: role-based web search controls
        allowWebSearch = role.allow_web_search !== false; // Default true if not set
        strictRagMode = role.strict_rag_mode === true;
        // External APIs configuration
        externalApis = (role as Record<string, unknown>).external_apis as typeof externalApis || {};
        
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
        case 'gemini':
          return GEMINI_API_KEY || '';
        case 'gigachat':
          return GIGACHAT_API_KEY || '';
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
      if (GEMINI_API_KEY) {
        providerConfig = {
          provider_type: 'gemini',
          api_key: GEMINI_API_KEY,
          default_model: 'gemini-2.5-flash',
        };
      } else if (ANTHROPIC_API_KEY) {
        providerConfig = {
          provider_type: 'anthropic',
          api_key: ANTHROPIC_API_KEY,
          default_model: 'claude-sonnet-4-20250514',
        };
      } else if (PERPLEXITY_API_KEY) {
        providerConfig = {
          provider_type: 'perplexity',
          api_key: PERPLEXITY_API_KEY,
          default_model: 'sonar',
        };
      }
    }

    if (!providerConfig || !providerConfig.api_key) {
      throw new Error('No AI provider configured or API key missing');
    }

    let finalModel = selectedModel || providerConfig.default_model;

    // =====================================================
    // "SMART LIBRARIAN" RAG - Hybrid Search with Claude Re-ranking
    // =====================================================
    let ragContext: string[] = [];
    let rankedChunks: RankedChunk[] = [];
    let usedSmartSearch = false;
    const FTS_CANDIDATES = 100; // Get more candidates for re-ranking
    // Reduce RAG context for fast/cheap models to speed up generation
    const isFastModel = /haiku|flash/i.test(finalModel);
    const TOP_K_FINAL = isFastModel ? 10 : 20;
    
    // Collect trademark images from relevant documents
    interface TrademarkImage {
      documentId: string;
      documentName: string;
      base64: string;
      mediaType: string;
    }
    const trademarkImages: TrademarkImage[] = [];

    // Minimum relevance score to include in citations
    const MIN_RELEVANCE_SCORE = 5;
    
    // Stop words to filter out from keyword search (Russian)
    const STOP_WORDS = new Set([
      'этот', 'который', 'какой', 'такой', 'каждый', 'весь', 'всего',
      'если', 'когда', 'чтобы', 'также', 'однако', 'потому', 'поэтому',
      'можно', 'нужно', 'будет', 'было', 'быть', 'есть', 'более', 'менее',
      'очень', 'только', 'уже', 'еще', 'что', 'как', 'для', 'при',
      'через', 'между', 'после', 'перед', 'около', 'вместо', 'кроме',
      'того', 'этого', 'этом', 'него', 'неё', 'них', 'ними', 'своих',
      'свой', 'свою', 'своё', 'наш', 'наша', 'наше', 'ваш', 'ваша',
    ]);
    
    // Function to extract search keywords from original query for PDF navigation
    function extractSearchKeywords(query: string): string[] {
      return query
        .toLowerCase()
        .replace(/[^\wа-яё\s\d]/gi, ' ')
        .split(/\s+/)
        .filter(w => {
          // Include numbers (any length) - they're usually very specific identifiers
          if (/^\d+$/.test(w)) return true;
          // Include words > 3 chars that are not stop words
          return w.length > 3 && !STOP_WORDS.has(w);
        })
        .slice(0, 5); // Max 5 keywords for PDF search
    }
    
    // Function to extract relevant preview containing keywords using sliding window scoring
    function extractRelevantPreview(content: string, query: string, maxLen: number = 300): string {
      // Extract significant keywords: numbers (any length) and words > 4 chars
      const queryWords = query.toLowerCase()
        .replace(/[^\wа-яё\s\d]/gi, ' ')
        .split(/\s+/)
        .filter(w => (w.length > 4 && !STOP_WORDS.has(w)) || /^\d+$/.test(w));
      
      if (queryWords.length === 0) {
        return content.slice(0, maxLen);
      }
      
      const contentLower = content.toLowerCase();
      
      // If content is shorter than maxLen, return it all
      if (content.length <= maxLen) {
        return content;
      }
      
      // Sliding window to find position with most keyword matches
      let bestPos = 0;
      let bestScore = 0;
      const stepSize = 50;
      
      for (let i = 0; i <= content.length - maxLen; i += stepSize) {
        const window = contentLower.slice(i, i + maxLen);
        let score = 0;
        
        for (const word of queryWords) {
          // Give extra weight to numbers (they're usually more specific)
          const weight = /^\d+$/.test(word) ? 3 : 1;
          if (window.includes(word)) {
            score += weight;
          }
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestPos = i;
        }
      }
      
      return content.slice(bestPos, bestPos + maxLen);
    }
    
    if (folderIds.length > 0) {
      console.log(`RAG: Starting Smart Librarian search for folders: ${folderIds.join(', ')}`);
      
      // STEP 0: Query Expansion - expand domain-specific terms with synonyms
      const SYNONYM_MAP: Record<string, string[]> = {
        'мкту': ['класс', 'классификация', 'товары', 'услуги'],
        'ателье': ['одежда', 'пошив', 'швейный'],
        'ресторан': ['питание', 'еда', 'кафе', 'общепит'],
        'салон': ['красота', 'парикмахерская', 'косметология'],
        'магазин': ['торговля', 'продажа', 'розница'],
        'аптека': ['лекарства', 'фармацевтика', 'медикаменты'],
        'автосервис': ['ремонт', 'автомобиль', 'техобслуживание'],
        'клиника': ['медицина', 'здоровье', 'лечение'],
        'фитнес': ['спорт', 'тренажер', 'зал'],
        'отель': ['гостиница', 'проживание', 'размещение'],
      };
      
      // Build expanded query for FTS
      const messageLower = message.toLowerCase();
      const expansionTerms: string[] = [];
      for (const [term, synonyms] of Object.entries(SYNONYM_MAP)) {
        if (messageLower.includes(term)) {
          expansionTerms.push(...synonyms);
        }
      }
      
      // Extract class numbers from query (e.g., "класс 25", "МКТУ 25", "25 класс")
      const classNumberMatch = message.match(/(?:класс|мкту|mktu)\s*(\d{1,2})/i) || message.match(/(\d{1,2})\s*(?:класс|мкту)/i);
      if (classNumberMatch) {
        expansionTerms.push(`класс ${classNumberMatch[1]}`, `Класс: ${classNumberMatch[1]}`);
      }
      
      const expandedQuery = expansionTerms.length > 0 
        ? `${message} ${expansionTerms.join(' ')}` 
        : message;
      
      if (expansionTerms.length > 0) {
        console.log(`RAG: Query expanded with terms: ${expansionTerms.join(', ')}`);
      }
      
      // STEP 1: Full-Text Search (PostgreSQL) - Get candidates
      try {
        const { data: ftsResults, error: ftsError } = await supabase.rpc('smart_fts_search', {
          query_text: expandedQuery,
          p_folder_ids: folderIds,
          match_count: FTS_CANDIDATES,
        });

        if (ftsError) {
          console.error('FTS search error:', ftsError);
        }

        if (ftsResults && ftsResults.length > 0) {
          console.log(`RAG: FTS found ${ftsResults.length} candidates, TOP_K_FINAL=${TOP_K_FINAL}, has ANTHROPIC_KEY=${!!ANTHROPIC_API_KEY}`);
          
          // STEP 2: Re-ranking with Claude Sonnet 4.5
          // Changed: use >= instead of > to trigger rerank more consistently
          if (ANTHROPIC_API_KEY && ftsResults.length >= TOP_K_FINAL) {
            try {
              const chunksForRerank = ftsResults.map((chunk: {
                id: string;
                content: string;
                document_name: string;
                section_title?: string;
                article_number?: string;
                fts_rank?: number;
                parent_document_id?: string;
                original_document_name?: string;
                part_number?: number;
                total_parts?: number;
              }) => ({
                id: chunk.id,
                content: chunk.content,
                document_name: chunk.document_name,
                section_title: chunk.section_title,
                article_number: chunk.article_number,
                fts_rank: chunk.fts_rank,
                parent_document_id: chunk.parent_document_id,
                original_document_name: chunk.original_document_name,
                part_number: chunk.part_number,
                total_parts: chunk.total_parts,
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
                  // Filter by minimum relevance score
                  rankedChunks = rerankData.ranked_chunks.filter(
                    (c: RankedChunk) => c.relevance_score >= MIN_RELEVANCE_SCORE
                  );
                  usedSmartSearch = true;
                  console.log(`RAG: Claude re-ranked to ${rerankData.ranked_chunks.length} chunks, ${rankedChunks.length} above threshold (>=${MIN_RELEVANCE_SCORE})`);
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
              parent_document_id?: string;
              original_document_name?: string;
              part_number?: number;
              total_parts?: number;
            }) => ({
              id: chunk.id,
              content: chunk.content,
              document_name: chunk.document_name,
              section_title: chunk.section_title,
              article_number: chunk.article_number,
              relevance_score: chunk.fts_rank * 10, // Normalize FTS rank
              relevance_reason: 'FTS match',
              parent_document_id: chunk.parent_document_id,
              original_document_name: chunk.original_document_name,
              part_number: chunk.part_number,
              total_parts: chunk.total_parts,
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
        
        // Improved keyword extraction with stop words filtering + expansion terms
        const baseKeywords = message
          .toLowerCase()
          .replace(/[^\wа-яё\s]/gi, ' ')
          .split(/\s+/)
          .filter(w => w.length > 3 && !STOP_WORDS.has(w));
        
        // Add expansion terms as additional keywords
        const keywords = [...new Set([...baseKeywords, ...expansionTerms.map(t => t.toLowerCase())])]
          .slice(0, 15);
        
        console.log(`RAG: Extracted keywords: ${keywords.join(', ')}`);
        
        if (keywords.length > 0) {
          const { data: keywordResults } = await supabase.rpc('keyword_search', {
            keywords: keywords,
            p_folder_ids: folderIds,
            match_count: FTS_CANDIDATES, // Get more candidates for re-ranking
          });

          if (keywordResults && keywordResults.length > 0) {
            rankedChunks = keywordResults.map((chunk: {
              id: string;
              content: string;
              document_name: string;
              section_title?: string;
              article_number?: string;
              keyword_matches: number;
              parent_document_id?: string;
              original_document_name?: string;
              part_number?: number;
              total_parts?: number;
            }) => ({
              id: chunk.id,
              content: chunk.content,
              document_name: chunk.document_name,
              section_title: chunk.section_title,
              article_number: chunk.article_number,
              relevance_score: chunk.keyword_matches,
              relevance_reason: `${chunk.keyword_matches} keyword matches`,
              parent_document_id: chunk.parent_document_id,
              original_document_name: chunk.original_document_name,
              part_number: chunk.part_number,
              total_parts: chunk.total_parts,
            }));
            console.log(`RAG: Keyword search found ${rankedChunks.length} chunks`);
            
            // STEP 3.5: Re-rank keyword results with Claude if we have enough candidates
            if (rankedChunks.length >= TOP_K_FINAL && ANTHROPIC_API_KEY) {
              console.log('RAG: Re-ranking keyword fallback results with Claude');
              try {
                const chunksForRerank = rankedChunks.map(chunk => ({
                  id: chunk.id,
                  content: chunk.content,
                  document_name: chunk.document_name,
                  section_title: chunk.section_title,
                  article_number: chunk.article_number,
                  fts_rank: chunk.relevance_score,
                  parent_document_id: chunk.parent_document_id,
                  original_document_name: chunk.original_document_name,
                  part_number: chunk.part_number,
                  total_parts: chunk.total_parts,
                }));

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
                    // Keep all ranked chunks before filtering for fallback
                    const allRankedChunks = rerankData.ranked_chunks;
                    
                    // Filter by minimum relevance score
                    rankedChunks = allRankedChunks.filter(
                      (c: RankedChunk) => c.relevance_score >= MIN_RELEVANCE_SCORE
                    );
                    
                    // Fallback: if all results are below threshold, use top 3 with warning
                    if (rankedChunks.length === 0 && allRankedChunks.length > 0) {
                      rankedChunks = allRankedChunks.slice(0, 3);
                      console.log('RAG: Using low-confidence fallback (top 3 below threshold)');
                    }
                    
                    usedSmartSearch = true;
                    console.log(`RAG: Re-ranked keyword results to ${rankedChunks.length} chunks (>=${MIN_RELEVANCE_SCORE} threshold)`);
                  }
                } else {
                  console.error('Keyword rerank failed:', await rerankResponse.text());
                }
              } catch (rerankError) {
                console.error('Keyword rerank error:', rerankError);
              }
            }
          }
        }
      }

      // STEP: Deduplicate chunks by content (handles duplicate document uploads)
      {
        const seenContent = new Set<string>();
        const beforeDedup = rankedChunks.length;
        const uniqueChunks: RankedChunk[] = [];
        for (const chunk of rankedChunks) {
          const key = chunk.content.substring(0, 200).trim();
          if (!seenContent.has(key)) {
            seenContent.add(key);
            uniqueChunks.push(chunk);
          }
        }
        rankedChunks.length = 0;
        rankedChunks.push(...uniqueChunks);
        if (beforeDedup !== rankedChunks.length) {
          console.log(`RAG: Deduplicated ${beforeDedup} -> ${rankedChunks.length} chunks`);
        }
      }

      // Build RAG context with citations - group by parent document and sort parts
      if (rankedChunks.length > 0) {
        // Group chunks by parent document (or self if no parent)
        const groupedChunks = new Map<string, RankedChunk[]>();
        for (const chunk of rankedChunks) {
          const groupKey = chunk.parent_document_id || chunk.id;
          if (!groupedChunks.has(groupKey)) {
            groupedChunks.set(groupKey, []);
          }
          groupedChunks.get(groupKey)!.push(chunk);
        }
        
        // Sort chunks within each group by part_number
        for (const chunks of groupedChunks.values()) {
          chunks.sort((a, b) => (a.part_number || 0) - (b.part_number || 0));
        }
        
        // Flatten back to array with proper ordering
        const sortedChunks: RankedChunk[] = [];
        for (const chunks of groupedChunks.values()) {
          sortedChunks.push(...chunks);
        }
        
        ragContext = sortedChunks.map((chunk, idx) => {
          // Use original document name if available (for split documents)
          const displayName = chunk.original_document_name || chunk.document_name;
          let citation = `[${idx + 1}] ${displayName}`;
          
          // Add part info for split documents
          if (chunk.part_number && chunk.total_parts && chunk.total_parts > 1) {
            citation += ` (часть ${chunk.part_number}/${chunk.total_parts})`;
          }
          
          if (chunk.section_title) citation += ` | ${chunk.section_title}`;
          if (chunk.article_number) citation += ` | Статья ${chunk.article_number}`;
          citation += ` (релевантность: ${chunk.relevance_score.toFixed(1)})`;
          return `${citation}\n${chunk.content}`;
        });
        
        // Update rankedChunks to sorted order for citations
        rankedChunks.length = 0;
        rankedChunks.push(...sortedChunks);

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
                    const base64 = arrayBufferToBase64(buffer);
                    
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

    // =====================================================
    // REPUTATION QUERY NORMALIZER (ported from Reputation.tsx)
    // =====================================================
    function normalizeRepQuery(raw: string): string {
      const trimmed = raw.trim();
      // Extract INN (10/12 digits)
      const innMatch = trimmed.match(/\b(\d{10}|\d{12})\b/);
      if (innMatch) return innMatch[1];
      // Extract OGRN (13/15 digits)
      const ogrnMatch = trimmed.match(/\b(\d{13}|\d{15})\b/);
      if (ogrnMatch) return ogrnMatch[1];
      // Remove country suffix like (RU)
      let cleaned = trimmed.replace(/\s*\([A-Z]{2}\)\s*$/i, '');
      // Parse structured address strings with quoted company name
      const quotedMatch = cleaned.match(/"([^"]+)"/);
      if (quotedMatch) {
        const companyName = quotedMatch[1];
        const parts = cleaned.replace(/"[^"]+"/g, '').split(',').map((p: string) => p.trim()).filter(Boolean);
        let city = '';
        let street = '';
        for (const part of parts) {
          if (/^\d{6}$/.test(part)) continue;
          if (/^(д\.|дом\s|лит|помещ|корп|кв|стр|оф)/i.test(part)) continue;
          if (/^(Общество|Акционерное|Закрытое|Публичное|Индивидуальный)/i.test(part)) continue;
          if (/^(ул\.?|улица|пер\.?|переулок|пр-кт\.?|проспект|наб\.?|набережная|бульвар|б-р\.?|шоссе|ш\.?)\s/i.test(part)) {
            const streetName = part
              .replace(/^(ул\.?\s*|улица\s+|пер\.?\s*|переулок\s+|пр-кт\.?\s*|проспект\s+|наб\.?\s*|набережная\s+|бульвар\s+|б-р\.?\s*|шоссе\s+|ш\.?\s*)/i, '')
              .replace(/\s*д\..*$/i, '')
              .trim();
            if (streetName) street = streetName;
            continue;
          }
          if (!city && /^[А-ЯЁA-Z]/.test(part) && part.length > 2 && !/^\d/.test(part)) {
            city = part.replace(/^г\.?\s*/i, '');
          }
        }
        let result = companyName;
        if (city) result += ` ${city}`;
        if (street) result += ` ${street}`;
        return result;
      }
      // Remove postal codes & legal forms
      cleaned = cleaned.replace(/\b\d{6}\b/g, '');
      cleaned = cleaned.replace(/^(Общество с ограниченной ответственностью|Акционерное общество|Закрытое акционерное общество|Публичное акционерное общество|Индивидуальный предприниматель|ООО|ОАО|ЗАО|ПАО|АО|ИП)\s*/i, '');
      const parts = cleaned.split(',').map((p: string) => p.trim()).filter(Boolean);
      if (parts.length > 2) {
        return parts.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();
      }
      return cleaned.replace(/\s+/g, ' ').trim();
    }

    // =====================================================
    // REPUTATION API - Direct calls to api.reputation.ru
    // =====================================================

    // Helper: unwrap {Items: [...]} → flat array
    function unwrapItems(val: any): any[] {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (val.Items && Array.isArray(val.Items)) return val.Items;
      return [];
    }

    // Normalize raw API data to flat structure expected by ReputationCompanyCard
    function normalizeCompanyData(d: any): any {
      if (!d || typeof d !== 'object') return d;
      const n: any = { ...d };

      // Status: may be object {Code, Name} or string
      if (n.Status && typeof n.Status === 'object') {
        n.StatusText = n.Status.Name || n.Status.StatusName || n.Status.Text || String(n.Status.Code || '');
        n.Status = n.StatusText;
      } else if (n.StatusName && !n.StatusText) {
        n.StatusText = n.StatusName;
        n.Status = n.StatusName;
      }

      // Address: unwrap Addresses.Items → first actual address
      if (!n.Address) {
        const addresses = unwrapItems(n.Addresses);
        const actual = addresses.find((a: any) => a.IsActual) || addresses[0];
        if (actual) {
          n.Address = actual.UnsplittedAddress || actual.Address || actual.Value || '';
        }
      }
      if (!n.Address && n.LegalAddress) {
        n.Address = typeof n.LegalAddress === 'object' ? (n.LegalAddress.Address || n.LegalAddress.UnsplittedAddress || n.LegalAddress.Value || JSON.stringify(n.LegalAddress)) : n.LegalAddress;
      }
      if (n.Address && typeof n.Address === 'object') n.Address = n.Address.Address || n.Address.UnsplittedAddress || n.Address.Value || JSON.stringify(n.Address);

      // Managers: unwrap {Items: [{Entity: {Name}, Position: [{PositionName}]}]}
      const rawManagers = unwrapItems(n.Managers);
      if (rawManagers.length > 0 && rawManagers[0].Entity) {
        n.Managers = rawManagers.map((m: any) => ({
          Name: m.Entity?.Name || m.Entity?.Fio || m.Name || '',
          Position: (Array.isArray(m.Position) ? m.Position[0]?.PositionName : m.Position?.PositionName) || m.PositionName || '',
          Inn: m.Entity?.Inn || '',
        }));
        if (!n.DirectorName && n.Managers[0]) {
          n.DirectorName = n.Managers[0].Name;
          n.DirectorTitle = n.Managers[0].Position || 'Руководитель';
        }
      } else if (rawManagers.length > 0) {
        n.Managers = rawManagers.map((m: any) => typeof m === 'object' ? { Name: m.Name || m.Fio || '', Position: m.Position || '' } : { Name: String(m), Position: '' });
      }

      // Head/Director fallback
      if (n.Head && typeof n.Head === 'object' && !n.DirectorName) {
        n.DirectorName = n.Head.Name || n.Head.Fio || n.Head.FullName || '';
        n.DirectorTitle = n.Head.Position || 'Руководитель';
      }
      if (!n.DirectorName && n.Director && typeof n.Director === 'object') {
        n.DirectorName = n.Director.Name || n.Director.Fio || '';
        n.DirectorTitle = n.Director.Position || 'Руководитель';
        n.Director = n.DirectorName;
      }

      // Heads → Managers fallback
      if (n.Heads && Array.isArray(n.Heads) && (!n.Managers || n.Managers.length === 0)) {
        n.Managers = n.Heads.map((h: any) => ({
          Name: h.Name || h.Fio || h.FullName || '',
          Position: h.Position || '',
        }));
      }

      // Shareholders → Founders: unwrap {Items: [{Entity: {Name}, Share: [{Size}]}]}
      const rawShareholders = unwrapItems(n.Shareholders);
      if (rawShareholders.length > 0) {
        n.Founders = rawShareholders.map((s: any) => {
          // Share is an ARRAY [{Size, FaceValue, IsActual}], not a single object
          const shareArr = Array.isArray(s.Share) ? s.Share : (s.Share ? [s.Share] : []);
          const actualShare = shareArr.find((sh: any) => sh.IsActual) || shareArr[0];
          return {
            Name: s.Entity?.Name || s.Entity?.Fio || s.Name || s.FullName || '',
            Share: actualShare?.Size ?? actualShare?.Percent ?? undefined,
            Inn: s.Entity?.Inn || '',
          };
        });
      } else if (n.Founders && Array.isArray(n.Founders)) {
        n.Founders = n.Founders.map((f: any) => typeof f === 'object' ? { Name: f.Name || f.Fio || f.FullName || '', Share: f.Share || f.Percent || undefined } : { Name: String(f) });
      }

      // AuthorizedCapitals → AuthorizedCapital
      const rawCapitals = unwrapItems(n.AuthorizedCapitals);
      if (rawCapitals.length > 0 && !n.AuthorizedCapital) {
        n.AuthorizedCapital = rawCapitals[0].Sum ?? rawCapitals[0].Value ?? rawCapitals[0].Amount ?? '';
      }
      // Capital fallback
      if (!n.AuthorizedCapital && n.Capital && typeof n.Capital === 'object') {
        n.AuthorizedCapital = n.Capital.Value ?? n.Capital.Amount ?? '';
      }

      // EmployeesInfo → EmployeesHistory array + EmployeesCount
      const rawEmployees = unwrapItems(n.EmployeesInfo);
      if (rawEmployees.length > 0) {
        n.EmployeesHistory = rawEmployees.map((e: any) => {
          // Year may be missing; extract from Date field
          let year = e.Year || '';
          if (!year && e.Date) {
            const m = String(e.Date).match(/^(\d{4})/);
            if (m) year = m[1];
          }
          if (!year && e.Period) year = String(e.Period);
          return { Year: year, Count: e.Count ?? e.Number ?? e.Value ?? '' };
        }).sort((a: any, b: any) => String(b.Year).localeCompare(String(a.Year)));
        n.EmployeesCount = n.EmployeesHistory[0]?.Count;
      }

      // RSMP (МСП category)
      const rawRsmp = unwrapItems(n.Rsmp);
      if (rawRsmp.length > 0) {
        n.RsmpCategory = rawRsmp[0].Category || rawRsmp[0].CategoryName || '';
        n.RsmpDate = rawRsmp[0].InclusionDate || rawRsmp[0].Date || '';
      }

      // Taxation
      const rawTax = unwrapItems(n.Taxation);
      if (rawTax.length > 0) {
        const types = rawTax[0].Types || rawTax[0].TaxTypes;
        n.TaxationTypes = Array.isArray(types) ? types.map((t: any) => typeof t === 'object' ? (t.Name || t.Type || '') : String(t)) : [];
        if (!n.TaxationTypes.length && rawTax[0].Name) {
          n.TaxationTypes = [rawTax[0].Name];
        }
      }

      // ContactInfo → Phones/Emails
      const rawContacts = unwrapItems(n.ContactInfo);
      if (rawContacts.length > 0) {
        const phones: string[] = [];
        const emails: string[] = [];
        for (const c of rawContacts) {
          if (c.Type === 'Phone' || c.Type === 'Телефон') phones.push(c.Value || c.Number || '');
          else if (c.Type === 'Email' || c.Type === 'Почта') emails.push(c.Value || c.Address || '');
        }
        if (phones.length > 0 && (!n.Phones || n.Phones.length === 0)) n.Phones = phones;
        if (emails.length > 0 && (!n.Emails || n.Emails.length === 0)) n.Emails = emails;
      }

      // Financial data: FinancialStatements / Finance → FinancialHistory
      const rawFinance = unwrapItems(n.FinancialStatements || n.Finance);
      if (rawFinance.length > 0) {
        n.FinancialHistory = rawFinance.map((f: any) => {
          let year = f.Year || '';
          if (!year && f.Date) { const m = String(f.Date).match(/^(\d{4})/); if (m) year = m[1]; }
          if (!year && f.Period) year = String(f.Period);
          return {
            Year: year,
            Revenue: f.Revenue ?? f.Income ?? f.Proceeds ?? undefined,
            Profit: f.Profit ?? f.NetProfit ?? f.NetIncome ?? undefined,
          };
        }).filter((f: any) => f.Year).sort((a: any, b: any) => String(b.Year).localeCompare(String(a.Year)));
      }

      // ActivityTypes: unwrap Items
      const rawActivities = unwrapItems(n.ActivityTypes);
      if (rawActivities.length > 0 && rawActivities[0].Code) {
        n.ActivityTypes = rawActivities.map((a: any) => ({ Code: a.Code || '', Name: a.Name || a.Description || '' }));
      } else if (n.Activities && Array.isArray(n.Activities) && !Array.isArray(n.ActivityTypes)) {
        n.ActivityTypes = n.Activities.map((a: any) => typeof a === 'object' ? { Code: a.Code || '', Name: a.Name || a.Description || '' } : { Code: '', Name: String(a) });
      }
      if (n.ActivityTypes && !Array.isArray(n.ActivityTypes)) n.ActivityTypes = [];

      // MainOkved → MainActivity
      if (n.MainOkved && typeof n.MainOkved === 'object') {
        n.MainActivityCode = n.MainOkved.Code || '';
        n.MainActivityName = n.MainOkved.Name || '';
      } else if (n.MainOkved && typeof n.MainOkved === 'string') {
        n.MainActivityCode = n.MainOkved;
      }
      if (n.MainActivity && typeof n.MainActivity === 'object') {
        if (!n.MainActivityCode) n.MainActivityCode = n.MainActivity.Code || '';
        if (!n.MainActivityName) n.MainActivityName = n.MainActivity.Name || '';
      }
      // If no main activity, pick first from ActivityTypes
      if (!n.MainActivityCode && Array.isArray(n.ActivityTypes) && n.ActivityTypes.length > 0 && n.ActivityTypes[0].IsMain !== false) {
        n.MainActivityCode = n.ActivityTypes[0].Code || '';
        n.MainActivityName = n.ActivityTypes[0].Name || '';
      }

      // RegistrationDate cleanup
      if (n.RegistrationDate) {
        const rd = String(n.RegistrationDate);
        if (rd.includes('T')) n.RegistrationDate = rd.split('T')[0];
      }

      // Name fallbacks
      if (!n.Name && (n.ShortName || n.FullName)) n.Name = n.ShortName || n.FullName;

      return n;
    }

    let reputationContext = '';
    let reputationSearchResults: any[] = [];
    let reputationCompanyData: any = null;
    const REPUTATION_API_KEY = Deno.env.get('REPUTATION_API_KEY');
    const REPUTATION_API_BASE = 'https://api.reputation.ru/api/v1';
    const REP_TIMEOUT = 25000; // 25s timeout for search/card
    const FIPS_TIMEOUT = 15000; // 15s timeout for FIPS
    
    if (externalApis?.reputation?.enabled && message && REPUTATION_API_KEY) {
      console.log('Reputation: Direct API calls to api.reputation.ru');
      const repHeaders = { 'Authorization': REPUTATION_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };
      
      const selectMatch = message.match(/\[REPUTATION_SELECT:([^:]+):([^\]]+)\]/);
      
      try {
        if (selectMatch) {
          const entityId = selectMatch[1];
          const entityType = selectMatch[2];
          console.log(`Reputation: Fetching card for ${entityId} (${entityType})`);
          
          const repEntityType = entityType === 'entrepreneur' ? 'Entrepreneur' : entityType === 'person' ? 'Person' : 'Company';
          const [cardRes, tmRes] = await Promise.all([
            fetch(`${REPUTATION_API_BASE}/entities/${entityType}?id=${entityId}`, {
              method: 'GET',
              headers: repHeaders,
              signal: AbortSignal.timeout(REP_TIMEOUT),
            }),
            (async () => {
              const results: any[] = [];
              const seenIds = new Set<string>();
              const typesToTry = (repEntityType === 'Person') ? ['Person', 'Entrepreneur'] :
                                 (repEntityType === 'Entrepreneur') ? ['Entrepreneur', 'Person'] : [repEntityType];
              for (const tryType of typesToTry) {
                for (const endpoint of ['patents', 'applications']) {
                  try {
                    const res = await fetch(`${REPUTATION_API_BASE}/fips/${endpoint}?entityId=${encodeURIComponent(entityId)}&entityType=${encodeURIComponent(tryType)}`, { method: 'GET', headers: repHeaders, signal: AbortSignal.timeout(FIPS_TIMEOUT) });
                    if (res.ok) {
                      const data = await res.json();
                      const items = Array.isArray(data) ? data : (data.Items || data.Results || data.items || []);
                      for (const item of items) { const iid = item.Id || item.id || JSON.stringify(item); if (!seenIds.has(iid)) { seenIds.add(iid); results.push({ ...item, _source: endpoint }); } }
                    } else { await res.text(); }
                  } catch (e) { console.error(`FIPS ${endpoint} error:`, e); }
                }
                if (results.length > 0) break;
              }
              return { ok: true, trademarks: results };
            })().catch(e => { console.error('TM fetch error:', e); return null; }),
          ]);
          
          if (cardRes.ok) {
            reputationCompanyData = normalizeCompanyData(await cardRes.json());
            // Merge name from select context if card didn't return it or it's an object
            if (!reputationCompanyData.Name || typeof reputationCompanyData.Name !== 'string') {
              // Try to get quoted name from the select message context
              const nameMatch = message.match(/[«"""]([^«»"""]+)[»"""]/);
              if (nameMatch) {
                reputationCompanyData.Name = nameMatch[1].trim();
                reputationCompanyData._searchResultName = nameMatch[1].trim();
              }
            } else {
              reputationCompanyData._searchResultName = reputationCompanyData.Name;
            }
            reputationContext = JSON.stringify(reputationCompanyData, null, 2);
            console.log(`Reputation: Got card (${reputationContext.length} chars)`);
          } else {
            console.error('Reputation card error:', cardRes.status, await cardRes.text());
          }
          
          if (tmRes && tmRes.trademarks?.length > 0 && reputationCompanyData) {
            reputationCompanyData._trademarks = tmRes.trademarks.slice(0, 20);
            console.log(`Reputation: Got ${tmRes.trademarks.length} trademarks`);
          }
          
          message = message.replace(/\[REPUTATION_SELECT:[^\]]+\]\s*/g, '').trim() || 'Покажи досье на выбранную компанию';
          
        } else {
          // Normalize the search query (strip legal forms, extract INN/OGRN, etc.)
          const normalizedQuery = normalizeRepQuery(message);
          console.log(`Reputation: Searching for "${message}" → normalized: "${normalizedQuery}"`);
          
          // Direct search to api.reputation.ru with timeout
          const searchRes = await fetch(`${REPUTATION_API_BASE}/entities/search`, {
            method: 'POST',
            headers: repHeaders,
            body: JSON.stringify({ QueryText: normalizedQuery, Filter: { EntityTypes: ['Company', 'Entrepreneur', 'Person'] } }),
            signal: AbortSignal.timeout(REP_TIMEOUT),
          });
          
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const results = Array.isArray(searchData) ? searchData : (searchData.Items || searchData.Results || searchData.items || []);
            console.log(`Reputation: Got ${results.length} search results`);
            
            if (results.length > 1) {
              reputationSearchResults = results.slice(0, 10);
              console.log(`Reputation: ${results.length} results, sending for selection`);
            } else if (results.length === 1) {
              const firstResult = results[0];
              const entityType = (firstResult.Type || 'Company').toLowerCase();
              const cardType = entityType === 'entrepreneur' ? 'entrepreneur' : entityType === 'person' ? 'person' : 'company';
              
              // Fetch card + trademarks in parallel with timeouts
              try {
                const [cardRes2, tmData2] = await Promise.all([
                  fetch(`${REPUTATION_API_BASE}/entities/${cardType}?id=${firstResult.Id}`, { method: 'GET', headers: repHeaders, signal: AbortSignal.timeout(REP_TIMEOUT) }),
                  (async () => {
                    const tmResults: any[] = [];
                    const seenIds = new Set<string>();
                    const entType = firstResult.Type || 'Company';
                    const typesToTry2 = (entType === 'Person') ? ['Person', 'Entrepreneur'] : (entType === 'Entrepreneur') ? ['Entrepreneur', 'Person'] : [entType];
                    for (const tryType of typesToTry2) {
                      for (const ep of ['patents', 'applications']) {
                        try {
                          const r = await fetch(`${REPUTATION_API_BASE}/fips/${ep}?entityId=${encodeURIComponent(firstResult.Id)}&entityType=${encodeURIComponent(tryType)}`, { method: 'GET', headers: repHeaders, signal: AbortSignal.timeout(FIPS_TIMEOUT) });
                          if (r.ok) { const d = await r.json(); const items = Array.isArray(d) ? d : (d.Items || d.Results || d.items || []); for (const it of items) { const iid = it.Id || it.id || JSON.stringify(it); if (!seenIds.has(iid)) { seenIds.add(iid); tmResults.push({ ...it, _source: ep }); } } } else { await r.text(); }
                        } catch (e) { console.error(`FIPS ${ep} error:`, e); }
                      }
                      if (tmResults.length > 0) break;
                    }
                    return tmResults;
                  })().catch(e => { console.error('TM error:', e); return []; }),
                ]);
                
      if (cardRes2.ok) {
                  reputationCompanyData = normalizeCompanyData(await cardRes2.json());
                  // Merge contacts and name from search result (card API often doesn't return them)
                  // Always prefer search result Name — card API often returns object instead of string
                  if (firstResult.Name && typeof firstResult.Name === 'string') {
                    reputationCompanyData._searchResultName = firstResult.Name;
                    if (!reputationCompanyData.Name || typeof reputationCompanyData.Name !== 'string') {
                      reputationCompanyData.Name = firstResult.Name;
                    }
                  }
                  if (!reputationCompanyData.ShortName && firstResult.ShortName) reputationCompanyData.ShortName = firstResult.ShortName;
                  if (!reputationCompanyData.Phones?.length && firstResult.Phones?.length) reputationCompanyData.Phones = firstResult.Phones;
                  if (!reputationCompanyData.Emails?.length && firstResult.Emails?.length) reputationCompanyData.Emails = firstResult.Emails;
                  if (!reputationCompanyData.Sites?.length && firstResult.Sites?.length) reputationCompanyData.Sites = firstResult.Sites;
                  if (!reputationCompanyData.Websites?.length && firstResult.Sites?.length) reputationCompanyData.Websites = firstResult.Sites;
                  if (!reputationCompanyData.EmployeesCount && firstResult.EmployeesCount) reputationCompanyData.EmployeesCount = firstResult.EmployeesCount;
                  if (!reputationCompanyData.RsmpCategory && firstResult.RsmpCategory) reputationCompanyData.RsmpCategory = firstResult.RsmpCategory;
                  if (!reputationCompanyData.Link && firstResult.Link) reputationCompanyData.Link = firstResult.Link;
                  if (!reputationCompanyData.Address && firstResult.Address) reputationCompanyData.Address = firstResult.Address;
                  if (!reputationCompanyData.Status && firstResult.Status) reputationCompanyData.Status = firstResult.Status;
                  if (!reputationCompanyData.StatusText && firstResult.StatusText) reputationCompanyData.StatusText = firstResult.StatusText;
                  reputationContext = JSON.stringify(reputationCompanyData, null, 2);
                  if (tmData2.length > 0) {
                    reputationCompanyData._trademarks = tmData2.slice(0, 20);
                    console.log(`Reputation: Got ${tmData2.length} trademarks`);
                  }
                } else {
                  console.error('Reputation card error:', cardRes2.status, await cardRes2.text());
                  reputationCompanyData = normalizeCompanyData(firstResult);
                }
              } catch (e) { console.error('Reputation card+tm error:', e); reputationCompanyData = normalizeCompanyData(firstResult); }
            } else {
              console.log('Reputation: No results found');
            }
          } else {
            console.error('Reputation search error:', searchRes.status, await searchRes.text());
          }
        }
      } catch (repErr: any) {
        if (repErr?.name === 'TimeoutError' || repErr?.name === 'AbortError') {
          console.error(`Reputation API timeout after ${REP_TIMEOUT}ms`);
          reputationContext = 'API Reputation.ru не ответил вовремя. Попробуйте уточнить запрос — например, добавьте ИНН или город.';
        } else {
          console.error('Reputation API error:', repErr);
        }
      }
    } else if (externalApis?.reputation?.enabled && !REPUTATION_API_KEY) {
      console.error('Reputation API: REPUTATION_API_KEY not configured');
    }

    // =====================================================
    // SHORT-CIRCUIT: Pure Reputation API role (no LLM needed)
    // If role has reputation enabled and it's the primary function,
    // return results directly without calling any LLM
    // =====================================================
    const isReputationOnlyRole = externalApis?.reputation?.enabled && folderIds.length === 0;
    
    if (isReputationOnlyRole) {
      const responseTimeMs = Date.now() - startTime;
      console.log(`Reputation-only role: bypassing LLM, returning structured data directly (${responseTimeMs}ms)`);
      
      const encoder = new TextEncoder();
      
      // Build a human-readable text summary from reputation data
      let textContent = '';
      
      if (reputationSearchResults.length > 0) {
        // Multiple results found — user needs to select
        textContent = `🔍 **Найдено компаний: ${reputationSearchResults.length}**\n\nВыберите нужную компанию из списка ниже:`;
      } else if (reputationCompanyData) {
        // Card UI handles full display — no text needed, web search available via button in card
        const d = reputationCompanyData;
        const ss = (v: any): string => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'string') return v;
          if (typeof v === 'number' || typeof v === 'boolean') return String(v);
          if (typeof v === 'object') {
            if (v.Name) return String(v.Name);
            if (v.Value) return String(v.Value);
            try { return JSON.stringify(v); } catch { return ''; }
          }
          return String(v);
        };
        const companyName = ss(d._searchResultName || d.Name || d.ShortName || d.FullName || d.name || d.CompanyName || d.Title) || 'Компания';
        textContent = `📋 **${companyName}** — досье в карточке ниже.`;
      } else {
        textContent = '❌ По вашему запросу ничего не найдено. Попробуйте уточнить ИНН, ОГРН или название компании.';
      }
      
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: textContent })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: responseTimeMs,
            reputation_results: reputationSearchResults.length > 0 ? reputationSearchResults : undefined,
            reputation_company_data: reputationCompanyData || undefined,
            web_search_citations: reputationCompanyData?._webCitations || undefined,
            web_search_used: !!reputationCompanyData?._webCitations,
          })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      
      // Log the API call
      await supabase.from('chat_logs').insert({
        user_id: userId,
        department_id: deptId,
        provider_id: null,
        prompt: message,
        response: textContent.substring(0, 5000),
        response_time_ms: responseTimeMs,
        metadata: { type: 'reputation_api_only', results_count: reputationSearchResults.length, has_company: !!reputationCompanyData },
      });
      
      return new Response(stream, { headers: corsHeaders });
    }

    // HYBRID WEB SEARCH: If RAG results are insufficient and provider is Anthropic,
    // perform a web search via Perplexity to supplement the context
    let webSearchContext: string[] = [];
    let webSearchCitations: string[] = [];
    let webSearchUsed = false;
    
    // OPTIMIZATION: Only perform web search if RAG context is insufficient
    // This saves ~60-80% of Perplexity API calls
    const ragInsufficient = rankedChunks.length < 2 || 
      (rankedChunks.length > 0 && rankedChunks[0].relevance_score < 7);
    
    // Perform web search only if:
    // 1. Role allows web search (allowWebSearch = true)
    // 2. Not in strict RAG mode
    // 3. RAG results are insufficient (< 2 chunks or low relevance)
    // 4. Provider is Anthropic (Claude needs external data augmentation)
    if (
      allowWebSearch && // Check role setting
      !strictRagMode && // Never do web search in strict RAG mode
      ragInsufficient && // ONLY if RAG didn't find enough good context
      PERPLEXITY_API_KEY &&
      message // Only if there's a user message
    ) {
      console.log(`Performing web search: RAG insufficient (chunks=${rankedChunks.length}, topScore=${rankedChunks[0]?.relevance_score || 0})`);
      
      try {
        const webSearchResponse = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',  // Use base sonar model (cheaper than sonar-pro)
            messages: [
              { role: 'system', content: 'Provide a concise, factual answer with sources. Focus on key facts relevant to the query.' },
              { role: 'user', content: message }
            ],
          }),
        });
        
        if (webSearchResponse.ok) {
          const searchData = await webSearchResponse.json();
          const searchContent = searchData.choices?.[0]?.message?.content;
          if (searchContent) {
            webSearchContext = [searchContent];
            webSearchUsed = true;
          }
          if (searchData.citations && Array.isArray(searchData.citations)) {
            webSearchCitations = searchData.citations;
          }
          console.log(`Web search successful: ${webSearchCitations.length} citations found`);
        } else {
          console.error('Web search failed:', webSearchResponse.status);
        }
      } catch (webSearchError) {
        console.error('Web search error:', webSearchError);
      }
    } else if (!ragInsufficient) {
      console.log(`Skipping web search: RAG sufficient (chunks=${rankedChunks.length}, topScore=${rankedChunks[0]?.relevance_score || 0})`);
    }

    // =====================================================
    // GOLDEN RESPONSES - Find relevant reference examples
    // =====================================================
    let goldenExamples: string[] = [];
    
    if (role_id && message) {
      try {
        const { data: goldens, error: goldenError } = await supabase.rpc('search_golden_responses', {
          query_text: message,
          p_role_id: role_id,
          match_count: 3,
        });
        
        if (goldenError) {
          console.error('Golden responses search error:', goldenError);
        } else if (goldens && goldens.length > 0) {
          goldenExamples = goldens.map((g: { question: string; answer: string; category?: string }, i: number) => 
            `Пример ${i + 1}${g.category ? ` (${g.category})` : ''}:\nВопрос: ${g.question}\nЭталонный ответ: ${g.answer}`
          );
          
          console.log(`Golden: Found ${goldens.length} relevant golden responses`);
          
          // Increment usage count for found golden responses
          const goldenIds = goldens.map((g: { id: string }) => g.id);
          await supabase.rpc('increment_golden_usage', { p_ids: goldenIds });
        }
      } catch (goldenErr) {
        console.error('Golden responses error:', goldenErr);
      }
    }

    // Build messages with combined context (RAG + Web + Reply-to + Golden)
    let finalPrompt = message || '';
    
    // Add reply-to context if present
    let replyContext = '';
    if (reply_to && reply_to.content) {
      const authorLabel = reply_to.message_role === 'assistant' 
        ? (reply_to.author_name || 'Ассистент')
        : (reply_to.author_name || 'Пользователь');
      replyContext = `\n\n--- КОНТЕКСТ ОТВЕТА ---\nПользователь отвечает на сообщение от "${authorLabel}":\n"${reply_to.content.slice(0, 2000)}${reply_to.content.length > 2000 ? '...' : ''}"\n--- КОНЕЦ КОНТЕКСТА ОТВЕТА ---\n`;
    }
    
    if (ragContext.length > 0 || webSearchContext.length > 0 || goldenExamples.length > 0 || reputationContext) {
      let contextParts: string[] = [];
      
      // Add reputation API data first (highest priority external data)
      if (reputationContext) {
        contextParts.push(reputationContext);
      }
      
      // Add golden examples first (they set the tone/style)
      if (goldenExamples.length > 0) {
        contextParts.push(`ЭТАЛОННЫЕ ПРИМЕРЫ ОТВЕТОВ:
Следующие ответы были помечены как образцовые. Используй их стиль, структуру и уровень детализации:

${goldenExamples.join('\n\n---\n\n')}

Применяй этот подход к своему ответу.`);
      }
      
      if (ragContext.length > 0) {
        contextParts.push(`КОНТЕКСТ ИЗ ДОКУМЕНТОВ (база знаний):\n${ragContext.join('\n\n---\n\n')}`);
      }
      
      if (webSearchContext.length > 0) {
        const sourcesNote = webSearchCitations.length > 0 
          ? `\n\n(Веб-источники: ${webSearchCitations.slice(0, 5).join(', ')}${webSearchCitations.length > 5 ? '...' : ''})`
          : '';
        contextParts.push(`КОНТЕКСТ ИЗ ИНТЕРНЕТА (дополнительная информация):${sourcesNote}\n${webSearchContext.join('\n\n')}`);
      }
      
      // Different instructions based on strict RAG mode
      let instructions: string;
      if (strictRagMode) {
        instructions = `
ИНСТРУКЦИИ (СТРОГИЙ РЕЖИМ - ТОЛЬКО БАЗА ЗНАНИЙ):

ПРАВИЛА РАБОТЫ С БАЗОЙ ЗНАНИЙ:
1. Проанализируй ВСЕ предоставленные фрагменты документов, не ограничивайся первыми
2. Сопоставь информацию из РАЗНЫХ документов для полноты ответа
3. Если вопрос затрагивает несколько нормативных актов — процитируй КАЖДЫЙ релевантный
4. Судебная практика: укажи ВСЕ найденные дела, даже если они частично релевантны
5. Не ограничивайся пересказом — проведи АНАЛИЗ и сделай ВЫВОДЫ на основе найденного

ПРАВИЛА ЦИТИРОВАНИЯ (КРИТИЧЕСКИ ВАЖНО):
1. Каждое ОТДЕЛЬНОЕ утверждение должно иметь СВОЮ ссылку [N]
2. НЕ повторяй одну ссылку [1] для разных фактов — это делает проверку невозможной
3. Формат: "Утверждение [N]." — ссылка СРАЗУ после факта, который она подтверждает
4. Если факт основан на нескольких источниках, укажи все: "Утверждение [1][3]."
5. ЗАПРЕЩЕНО ссылаться на документы, которых НЕТ в контексте выше

ОТВЕТ:
- Отвечай ТОЛЬКО на основе предоставленных документов из базы знаний
- Если информация НЕ найдена в документах — честно сообщи об этом
- НЕ додумывай и НЕ используй общие знания
- Если ответ получается очень длинным, завершай логично и предлагай продолжение`;
      } else {
        instructions = `
ИНСТРУКЦИИ:

ПРАВИЛА РАБОТЫ С БАЗОЙ ЗНАНИЙ:
1. Проанализируй ВСЕ предоставленные фрагменты документов, не ограничивайся первыми
2. Сопоставь информацию из РАЗНЫХ документов для полноты ответа
3. Если вопрос затрагивает несколько нормативных актов — процитируй КАЖДЫЙ релевантный
4. Судебная практика: укажи ВСЕ найденные дела, даже если они частично релевантны
5. Не ограничивайся пересказом — проведи АНАЛИЗ и сделай ВЫВОДЫ на основе найденного

ПРАВИЛА ЦИТИРОВАНИЯ (КРИТИЧЕСКИ ВАЖНО):
1. Каждое ОТДЕЛЬНОЕ утверждение должно иметь СВОЮ ссылку [N]
2. НЕ повторяй одну ссылку [1] для разных фактов — это делает проверку невозможной
3. Формат: "Утверждение [N]." — ссылка СРАЗУ после факта, который она подтверждает
4. Если факт основан на нескольких источниках, укажи все: "Утверждение [1][3]."
5. ЗАПРЕЩЕНО ссылаться на документы, которых НЕТ в контексте выше
6. Веб-источники указывай как (URL) в тексте, не смешивая с нумерацией [N]

ОТВЕТ:
- Используй ОБА источника для полного ответа: документы [N] И интернет (URL)
- Приоритет: документы первичны, интернет — для дополнения и актуализации
- Если ответ получается очень длинным, завершай логично и предлагай продолжение`;
      }
      
      finalPrompt = `${contextParts.join('\n\n---\n\n')}\n\n---\n${instructions}${replyContext}\n\n---\n\nВОПРОС ПОЛЬЗОВАТЕЛЯ: ${message || 'Проанализируй прикрепленные файлы'}`;
    } else if (strictRagMode && ragContext.length === 0) {
      // Strict RAG mode but no documents found - inform user
      finalPrompt = `${replyContext}\n\nВОПРОС ПОЛЬЗОВАТЕЛЯ: ${message || 'Проанализируй прикрепленные файлы'}\n\n[СИСТЕМНОЕ ПРИМЕЧАНИЕ: Включен строгий режим RAG, но релевантные документы не найдены. Сообщи пользователю, что для данного запроса нет информации в базе знаний.]`;
    } else if (replyContext) {
      // No RAG/web context but has reply context
      finalPrompt = `${replyContext}\n\nВОПРОС ПОЛЬЗОВАТЕЛЯ: ${message || 'Проанализируй прикрепленные файлы'}`;
    }

    // =====================================================
    // PII MASKING - Mask personal data before sending to LLM
    // =====================================================
    let piiMasked = false;
    let piiTokensCount = 0;
    const piiSourceId = crypto.randomUUID(); // Shared source_id for masking + unmasking
    
    const PII_KEY = Deno.env.get('PII_ENCRYPTION_KEY');
    if (PII_KEY && finalPrompt) {
      try {
        const piiResult = await maskPiiInline(finalPrompt, {
          source_type: 'chat_message',
          source_id: piiSourceId,
          session_id: undefined,
          user_id: userId || undefined,
          pii_key: PII_KEY,
          supabase,
        });
        
        if (piiResult.tokens_count > 0) {
          finalPrompt = piiResult.masked_text;
          piiMasked = true;
          piiTokensCount = piiResult.tokens_count;
          console.log(`PII: Masked ${piiResult.tokens_count} tokens in user message. Types: ${piiResult.pii_types_found.join(', ')}`);
        }
      } catch (piiError) {
        console.error('PII masking error (continuing without masking):', piiError);
      }
    }

    // =====================================================
    // PERSISTENT DOCUMENT CONTEXT - Collect attachments from current request + history
    // =====================================================
    const allAttachments: AttachmentInput[] = [];
    
    // Add attachments from current request first (highest priority)
    if (attachments && attachments.length > 0) {
      allAttachments.push(...attachments);
    }
    
    // Collect attachments from message history (persistent context)
    if (message_history && message_history.length > 0) {
      for (const msg of message_history) {
        if (msg.attachments && Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            // Only add if has valid file_path
            if (att.file_path) {
              allAttachments.push(att);
            }
          }
        }
      }
    }
    
    // Deduplicate by file_path (keep first occurrence - most recent)
    const uniqueAttachments = Array.from(
      new Map(allAttachments.map(a => [a.file_path, a])).values()
    );
    
    // Limit to prevent context overflow: max 5 documents or 20MB total
    let totalSize = 0;
    const MAX_ATTACHMENTS = 5;
    const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB
    
    const limitedAttachments = uniqueAttachments.filter(a => {
      if (totalSize + a.file_size > MAX_TOTAL_SIZE) return false;
      totalSize += a.file_size;
      return true;
    }).slice(0, MAX_ATTACHMENTS);
    
    console.log(`Persistent context: ${allAttachments.length} total attachments, ${uniqueAttachments.length} unique, ${limitedAttachments.length} after limits`);
    
    // Load attachments and build multimodal content for Anthropic
    type MultimodalContentPart = 
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };
    
    const attachmentParts: MultimodalContentPart[] = [];
    
    if (limitedAttachments.length > 0) {
      console.log(`Processing ${limitedAttachments.length} attachments (from current + history)`);
      
      for (const attachment of limitedAttachments) {
        try {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('chat-attachments')
            .download(attachment.file_path);
            
          if (downloadError) {
            console.error(`Error downloading ${attachment.file_name}:`, downloadError);
            continue;
          }
          
          const buffer = await fileData.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          
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
    
    // ALWAYS use message history if available (fixes context loss bug)
    // Previously this was gated on isProjectMode || is_department_chat, causing context loss
    if (message_history && message_history.length > 0) {
      console.log(`Using message history: ${message_history.length} messages, isProjectMode=${isProjectMode}, is_department_chat=${is_department_chat}`);
      
      // Build messages from history
      const rawMessages = message_history.map((msg) => {
        // For department chat, prefix assistant messages with agent name for context
        let content = msg.content;
        if (is_department_chat && msg.role === 'assistant' && (msg as { agent_name?: string }).agent_name) {
          content = `[${(msg as { agent_name?: string }).agent_name}]: ${content}`;
        }
        return { role: msg.role, content };
      });
      
      // CRITICAL: Perplexity requires alternating user/assistant messages
      // Merge consecutive messages with the same role
      simpleMessages = [];
      for (const msg of rawMessages) {
        const last = simpleMessages[simpleMessages.length - 1];
        if (last && last.role === msg.role) {
          // Merge with previous message of same role
          last.content += '\n\n' + msg.content;
        } else {
          simpleMessages.push({ role: msg.role, content: msg.content });
        }
      }
      
      // CRITICAL: Always ensure current user message is at the end
      // The message_history may not include the current message being sent
      const lastMessage = simpleMessages[simpleMessages.length - 1];
      
      // Use finalPrompt which already contains:
      // - RAG context (documents from knowledge base)
      // - Web search context (Perplexity results)
      // - Combined instructions for using both sources
      const userContent = finalPrompt;
        
      if (lastMessage?.role === 'user') {
        // Merge current message with last user message
        lastMessage.content += '\n\n' + userContent;
      } else {
        // Add as new user message
        simpleMessages.push({ role: 'user', content: userContent });
      }
    } else {
      console.log(`No message history, starting new conversation`);
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
    
    // Add instruction for web search context
    if (webSearchUsed) {
      enhancedSystemPrompt += '\n\nК этому запросу добавлена информация из интернета (веб-поиск). Используй её как дополнительный источник, но приоритет отдавай документам из базы знаний, если они есть.';
    }
    
    if (hasTrademarkImages) {
      enhancedSystemPrompt += `\n\nК этому запросу приложены изображения товарных знаков из релевантных документов (${trademarkImages.map(t => t.documentName).join(', ')}). Учитывай визуальные характеристики товарных знаков при анализе. Если спрашивают о товарном знаке - опиши его внешний вид, цвета, шрифты, графические элементы.`;
    }
    
    if (hasAttachments) {
      const piiAttachments = limitedAttachments.filter(a => a.contains_pii);
      if (piiAttachments.length > 0) {
        enhancedSystemPrompt += `\n\nПользователь прикрепил файлы к сообщению. Проанализируй их содержимое и ответь на вопрос пользователя. ВНИМАНИЕ: Следующие файлы содержат персональные данные (ПДн): ${piiAttachments.map(a => a.file_name).join(', ')}. При ответе используй маскирующие токены из текста сообщения (например [PERSON_1], [PHONE_1]) для всех персональных данных из этих документов. НЕ раскрывай настоящие персональные данные из документов.`;
      } else {
        enhancedSystemPrompt += '\n\nПользователь прикрепил файлы к сообщению. Проанализируй их содержимое и ответь на вопрос пользователя, учитывая информацию из файлов.';
      }
    }

    console.log(`Streaming from ${providerConfig.provider_type} with model: ${finalModel}, attachments: ${hasAttachments}, trademarks: ${hasTrademarkImages}`);

    // Validate model identifiers for each provider
    const validAnthropicModels = [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-5-20251101',
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
    ];
    
    if (providerConfig.provider_type === 'anthropic' && !validAnthropicModels.includes(finalModel)) {
      console.warn(`Invalid Anthropic model: ${finalModel}, falling back to claude-sonnet-4-6`);
      finalModel = 'claude-sonnet-4-6';
    }

    // Map Anthropic models to their correct max_tokens limits
    function getAnthropicMaxTokens(model: string): number {
      if (model.includes('claude-3-5-sonnet') || model.includes('claude-3-5-haiku')) return 8192;
      if (model.includes('opus-4-6')) return 128000; // Opus 4.6 supports 128k output
      return 16384; // claude-sonnet-4-6, claude-sonnet-4-5, claude-sonnet-4, haiku-4-5, opus-4-5
    }

    // Create streaming response based on provider with timeout
    const isDeepResearchModel = finalModel.includes('deep-research');
    const apiTimeoutMs = isDeepResearchModel ? 300000 : 120000; // 300s for deep-research, 120s for others
    const apiAbortController = new AbortController();
    const apiTimeout = setTimeout(() => apiAbortController.abort(), apiTimeoutMs);
    
    let streamResponse: Response;
    
    switch (providerConfig.provider_type) {
      case 'anthropic':
        streamResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: apiAbortController.signal,
          headers: {
            'x-api-key': providerConfig.api_key || ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'pdfs-2024-09-25',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            max_tokens: getAnthropicMaxTokens(finalModel),
            system: enhancedSystemPrompt,
            messages: anthropicMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
            stream: true,
          }),
        });
        break;

      case 'openai':
        streamResponse = await fetch(`${providerConfig.base_url || 'https://api.openai.com/v1'}/chat/completions`, {
          method: 'POST',
          signal: apiAbortController.signal,
          headers: {
            'Authorization': `Bearer ${providerConfig.api_key}`,
            'Content-Type': 'application/json',
          },
           body: JSON.stringify({
            model: finalModel,
            messages: [{ role: 'system', content: enhancedSystemPrompt }, ...simpleMessages],
            stream: true,
            max_tokens: 16384,
          }),
        });
        break;

      case 'gemini': {
        const geminiApiKey = providerConfig.api_key || GEMINI_API_KEY || '';
        const geminiModel = finalModel;
        
        // Build Gemini contents from simpleMessages
        const geminiContents = simpleMessages.map((m, idx) => {
          const parts: any[] = [{ text: m.content }];
          
          // Add attachments to the last user message
          if (m.role === 'user' && idx === simpleMessages.length - 1 && hasAttachments && attachmentParts.length > 0) {
            for (const att of attachmentParts) {
              if (att.type === 'image') {
                parts.unshift({
                  inline_data: {
                    mime_type: att.media_type,
                    data: att.data,
                  }
                });
              } else if (att.type === 'document' && att.media_type === 'application/pdf') {
                parts.unshift({
                  inline_data: {
                    mime_type: 'application/pdf',
                    data: att.data,
                  }
                });
              }
            }
          }
          
          return {
            role: m.role === 'assistant' ? 'model' : 'user',
            parts,
          };
        });
        
        streamResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${geminiApiKey}`,
          {
            method: 'POST',
            signal: apiAbortController.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: geminiContents,
              systemInstruction: { parts: [{ text: enhancedSystemPrompt }] },
              generationConfig: {
                maxOutputTokens: 16384,
              },
            }),
          }
        );
        break;
      }

      case 'gigachat': {
        const gigachatAuthKey = providerConfig.api_key || GIGACHAT_API_KEY || '';
        const gigachatAccessToken = await getGigaChatAccessToken(gigachatAuthKey);
        
        streamResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
          method: 'POST',
          signal: apiAbortController.signal,
          headers: {
            'Authorization': `Bearer ${gigachatAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            messages: [{ role: 'system', content: enhancedSystemPrompt }, ...simpleMessages],
            stream: true,
            max_tokens: 16384,
          }),
        });
        break;
      }

      case 'perplexity':
      default: {
        // Models that don't support streaming or need special handling
        const isDeepResearch = finalModel.includes('deep-research');
        const isReasoningModel = finalModel.includes('reasoning');
        console.log(`Perplexity request: model=${finalModel}, isDeepResearch=${isDeepResearch}, isReasoning=${isReasoningModel}`);
        
        streamResponse = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          signal: apiAbortController.signal,
          headers: {
            'Authorization': `Bearer ${providerConfig.api_key || PERPLEXITY_API_KEY || ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            messages: [{ role: 'system', content: enhancedSystemPrompt }, ...simpleMessages],
            max_tokens: 12000,
            // Deep research doesn't support streaming; reasoning models work better non-streaming too
            stream: !(isDeepResearch || isReasoningModel),
          }),
        });
        
        console.log(`Perplexity response status: ${streamResponse.status}`);
        break;
      }
    }
    
    clearTimeout(apiTimeout);

    // Handle provider errors with fallback
    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      console.error('Provider stream error:', streamResponse.status, errorText);
      
      // If provider fails with any error, try fallback to other providers
      const canFallback = providerConfig.provider_type !== 'gemini'; // Don't fallback from gemini (it's already the fallback)
      if (canFallback) {
        console.log(`Provider ${providerConfig.provider_type} error ${streamResponse.status}, attempting fallback...`);
        
        // Try Gemini first, then Anthropic
        const fallbackProviders = [
          { type: 'gemini', key: GEMINI_API_KEY, model: 'gemini-2.5-flash' },
          { type: 'anthropic', key: ANTHROPIC_API_KEY, model: 'claude-sonnet-4-20250514' },
        ];
        
        for (const fallback of fallbackProviders) {
          if (fallback.key) {
            console.log(`Falling back to ${fallback.type}...`);
            
            let fallbackResponse: Response;
            
            if (fallback.type === 'gemini') {
              const geminiContents = simpleMessages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
              }));
              
              fallbackResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${fallback.model}:streamGenerateContent?alt=sse&key=${fallback.key}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: geminiContents,
                    systemInstruction: { parts: [{ text: enhancedSystemPrompt }] },
                    generationConfig: { maxOutputTokens: 16384 },
                  }),
                }
              );
            } else {
              fallbackResponse = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'x-api-key': fallback.key,
                  'anthropic-version': '2023-06-01',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: fallback.model,
                  max_tokens: 16384,
                  system: enhancedSystemPrompt,
                  messages: simpleMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
                  stream: true,
                }),
              });
            }
            
            if (fallbackResponse.ok) {
              console.log(`Fallback to ${fallback.type} successful`);
              streamResponse = fallbackResponse;
              // Update provider type for correct response parsing
              providerConfig.provider_type = fallback.type;
              break;
            } else {
              console.error(`Fallback to ${fallback.type} failed:`, fallbackResponse.status);
            }
          }
        }
        
        // Check if fallback worked
        if (!streamResponse.ok) {
          throw new Error(`Provider error: ${streamResponse.status} - All fallbacks failed`);
        }
      } else {
        throw new Error(`Provider error: ${streamResponse.status} (${providerConfig.provider_type})`);
      }
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullContent = '';

    // Helper: strip <think>...</think> blocks from reasoning model responses
    function stripThinkTags(text: string): string {
      // Remove <think>...</think> blocks (including multiline)
      return text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
    }

    // Check if this is a non-streaming response (e.g., Perplexity deep-research, reasoning models)
    const contentType = streamResponse.headers.get('content-type') || '';
    const isPerplexityNonStreaming = providerConfig.provider_type === 'perplexity' && 
      (finalModel.includes('deep-research') || finalModel.includes('reasoning'));
    const isNonStreaming = contentType.includes('application/json') || isPerplexityNonStreaming;
    
    if (isNonStreaming) {
      // Handle non-streaming JSON response
      console.log(`Handling non-streaming response for model: ${finalModel}`);
      const jsonResponse = await streamResponse.json();
      let rawContent = jsonResponse.choices?.[0]?.message?.content || '';
      
      // Strip <think> blocks from reasoning/deep-research models
      fullContent = stripThinkTags(rawContent);
      if (rawContent !== fullContent) {
        console.log(`Stripped <think> block from response (${rawContent.length} -> ${fullContent.length} chars)`);
      }
      
      // Capture Perplexity citations from non-streaming response
      if (jsonResponse.citations && Array.isArray(jsonResponse.citations)) {
        webSearchCitations = [...webSearchCitations, ...jsonResponse.citations];
        webSearchUsed = true;
        console.log(`Captured ${jsonResponse.citations.length} Perplexity citations from non-streaming response`);
      }
      
      // PII UNMASKING for non-streaming response
      if (piiMasked && PII_KEY) {
        try {
          const piiCache = await loadPiiCache(piiSourceId, PII_KEY, supabase);
          if (piiCache.size > 0) {
            fullContent = unmaskWithCache(fullContent, piiCache);
            console.log(`PII: Unmasked ${piiCache.size} tokens in non-streaming response`);
          }
        } catch (unmaskErr) {
          console.error('PII unmasking error (non-stream):', unmaskErr);
        }
      }
      
      const responseTimeMs = Date.now() - startTime;
      // Fetch document metadata for storage_path AND page numbers (non-streaming)
      let chunkToDocNonStream = new Map<string, { document_id: string; storage_path: string | null; page_start: number | null; page_end: number | null }>();
      if (rankedChunks.length > 0) {
        const chunkDocIdsNS = rankedChunks.map(c => c.id);
        const { data: chunkDocMetaNS } = await supabase
          .from('document_chunks')
          .select('id, document_id, page_start, page_end, documents!inner(id, storage_path)')
          .in('id', chunkDocIdsNS);
        
        for (const chunk of chunkDocMetaNS || []) {
          chunkToDocNonStream.set(chunk.id, {
            document_id: chunk.document_id,
            storage_path: (chunk.documents as any)?.storage_path || null,
            page_start: chunk.page_start,
            page_end: chunk.page_end,
          });
        }
      }
      
      // Extract search keywords from original query for PDF navigation
      const searchKeywords = extractSearchKeywords(message);
      console.log(`RAG (non-stream): Search keywords for PDF: ${searchKeywords.join(', ')}`);
      
      const citations = rankedChunks.map((chunk, idx) => {
        const docMeta = chunkToDocNonStream.get(chunk.id);
        // Use real page_start from DB if available, fallback to part_number for split docs
        const pageStart = docMeta?.page_start || chunk.page_start || chunk.part_number || 1;
        const pageEnd = docMeta?.page_end || chunk.page_end || pageStart;
        
        return {
          index: idx + 1,
          document: chunk.original_document_name || chunk.document_name,
          section: chunk.section_title,
          article: chunk.article_number,
          relevance: Math.min(chunk.relevance_score / 10, 1),
          chunk_id: chunk.id,
          document_id: docMeta?.document_id || chunk.parent_document_id,
          page_start: pageStart,
          page_end: pageEnd,
          content_preview: extractRelevantPreview(chunk.content, message, 300),
          full_chunk_content: chunk.content, // Full text for Text Viewer
          storage_path: docMeta?.storage_path,
          search_keywords: searchKeywords,
        };
      });
      
      // Create a simple stream that sends the full content at once
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: fullContent })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: responseTimeMs,
            rag_context: ragContext.length > 0 ? ragContext : undefined,
            citations: citations.length > 0 ? citations : undefined,
            web_search_citations: webSearchCitations.length > 0 ? webSearchCitations : undefined,
            web_search_used: webSearchUsed,
            smart_search: usedSmartSearch,
            reputation_results: reputationSearchResults.length > 0 ? reputationSearchResults : undefined,
            reputation_company_data: reputationCompanyData || undefined,
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
        // HEARTBEAT: Keep connection alive during long AI responses
        const HEARTBEAT_INTERVAL = 15000; // 15 seconds
        const heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            clearInterval(heartbeatTimer);
          }
        }, HEARTBEAT_INTERVAL);
        
        try {
          let buffer = ''; // Buffer for incomplete SSE chunks
          let perplexityCitations: string[] = []; // Capture Perplexity citations
          let stopReason: string | null = null; // Track if response was truncated

          // PII UNMASKING BUFFER: accumulate text, detect and unmask tokens before sending to client
          let piiUnmaskBuffer = '';
          let piiCache: Map<string, string> | null = null;
          
          // Pre-load PII cache if masking was applied
          if (piiMasked && PII_KEY) {
            try {
              piiCache = await loadPiiCache(piiSourceId, PII_KEY, supabase);
              console.log(`PII: Pre-loaded ${piiCache.size} mappings for stream unmasking`);
            } catch (cacheErr) {
              console.error('PII cache load error:', cacheErr);
            }
          }
          
          // Helper: flush safe portion of piiUnmaskBuffer to client
          function flushPiiBuffer(force: boolean) {
            if (!piiCache || piiCache.size === 0) return;
            
            // Replace complete tokens in buffer
            const tokenRegex = /\[[A-Z_]+_\d+\]/g;
            piiUnmaskBuffer = piiUnmaskBuffer.replace(tokenRegex, (match) => {
              return piiCache!.get(match) || match;
            });
            
            if (force) {
              // Send everything remaining
              if (piiUnmaskBuffer) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: piiUnmaskBuffer })}\n\n`));
                piiUnmaskBuffer = '';
              }
              return;
            }
            
            // Find last '[' that might be start of incomplete token
            const lastBracket = piiUnmaskBuffer.lastIndexOf('[');
            let safeEnd = piiUnmaskBuffer.length;
            
            if (lastBracket !== -1) {
              // Check if there's a closing ']' after this '['
              const closingBracket = piiUnmaskBuffer.indexOf(']', lastBracket);
              if (closingBracket === -1) {
                // Incomplete token - hold back from '['
                safeEnd = lastBracket;
              }
            }
            
            if (safeEnd > 0) {
              const safeContent = piiUnmaskBuffer.substring(0, safeEnd);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: safeContent })}\n\n`));
              piiUnmaskBuffer = piiUnmaskBuffer.substring(safeEnd);
            }
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep last potentially incomplete line

            for (const line of lines) {
              if (!line.trim() || line.startsWith(':')) continue;
              
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  let content = '';

                  // Capture Perplexity citations from response
                  if (providerConfig!.provider_type === 'perplexity' && parsed.citations && Array.isArray(parsed.citations)) {
                    perplexityCitations = parsed.citations;
                  }

                  // Handle different provider formats
                  if (providerConfig!.provider_type === 'anthropic') {
                    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                      content = parsed.delta.text;
                    }
                    // Capture stop reason from Anthropic message_delta event
                    if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
                      stopReason = parsed.delta.stop_reason;
                    }
                  } else if (providerConfig!.provider_type === 'gemini') {
                    // Gemini SSE format: candidates[0].content.parts[0].text
                    content = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  } else {
                    // Capture stop reason from OpenAI/Perplexity format
                    if (parsed.choices?.[0]?.finish_reason) {
                      stopReason = parsed.choices[0].finish_reason;
                    }
                    // OpenAI/Perplexity/Lovable format
                    content = parsed.choices?.[0]?.delta?.content || 
                              parsed.choices?.[0]?.message?.content || '';
                  }

                  if (content) {
                    fullContent += content;
                    
                    // If PII unmasking is active, buffer the content
                    if (piiCache && piiCache.size > 0) {
                      piiUnmaskBuffer += content;
                      flushPiiBuffer(false);
                    } else {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`));
                    }
                  }
                } catch {
                  // Ignore parsing errors
                }
              }
            }
          }

          // Process remaining SSE buffer
          if (buffer.startsWith('data: ')) {
            const data = buffer.slice(6).trim();
            if (data && data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                if (providerConfig!.provider_type === 'perplexity' && parsed.citations && Array.isArray(parsed.citations)) {
                  perplexityCitations = parsed.citations;
                }
                const content = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || '';
                if (content) {
                  fullContent += content;
                  if (piiCache && piiCache.size > 0) {
                    piiUnmaskBuffer += content;
                  } else {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`));
                  }
                }
              } catch { }
            }
          }
          
          // Flush remaining PII buffer
          if (piiCache && piiCache.size > 0) {
            flushPiiBuffer(true);
          }
          
          // Also unmask fullContent for logging/metadata
          if (piiCache && piiCache.size > 0) {
            fullContent = unmaskWithCache(fullContent, piiCache);
          }

          // Send metadata at the end with citations
          const responseTimeMs = Date.now() - startTime;
          
          // Parse actually used citations from response [1], [2], etc.
          const usedIndices = new Set<number>();
          const citationMatches = fullContent.matchAll(/\[(\d+)\]/g);
          for (const match of citationMatches) {
            usedIndices.add(parseInt(match[1], 10));
          }
          console.log(`RAG: Response uses ${usedIndices.size} citation indices:`, Array.from(usedIndices));
          
          // Fetch document metadata for storage_path AND page numbers
          let chunkToDoc = new Map<string, { document_id: string; storage_path: string | null; page_start: number | null; page_end: number | null }>();
          if (rankedChunks.length > 0) {
            const chunkDocIds = rankedChunks.map(c => c.id);
            const { data: chunkDocMeta } = await supabase
              .from('document_chunks')
              .select('id, document_id, page_start, page_end, documents!inner(id, storage_path)')
              .in('id', chunkDocIds);
            
            for (const chunk of chunkDocMeta || []) {
              chunkToDoc.set(chunk.id, {
                document_id: chunk.document_id,
                storage_path: (chunk.documents as any)?.storage_path || null,
                page_start: chunk.page_start,
                page_end: chunk.page_end,
              });
            }
          }
          
          // Extract search keywords from original query for PDF navigation (fallback)
          const globalSearchKeywords = extractSearchKeywords(message);
          console.log(`RAG: Global search keywords for PDF navigation: ${globalSearchKeywords.join(', ')}`);
          
          // Function to extract specific keywords from chunk content for better navigation
          function extractChunkKeywords(chunkContent: string, query: string): string[] {
            // Get keywords that appear BOTH in the chunk and the query (most specific)
            const queryWords = query.toLowerCase()
              .replace(/[^\wа-яё\s\d]/gi, ' ')
              .split(/\s+/)
              .filter(w => (w.length > 3 && !STOP_WORDS.has(w)) || /^\d+$/.test(w));
            
            const chunkLower = chunkContent.toLowerCase();
            const matchedKeywords = queryWords.filter(w => chunkLower.includes(w));
            
            // If we have matched keywords, return them (max 5)
            if (matchedKeywords.length > 0) {
              return matchedKeywords.slice(0, 5);
            }
            
            // Fallback to global query keywords
            return globalSearchKeywords;
          }
          
          // Build citations with enhanced metadata - unique search_keywords per citation
          const allCitations = rankedChunks.map((chunk, idx) => {
            const docMeta = chunkToDoc.get(chunk.id);
            // Extract keywords specific to THIS chunk's content
            const chunkKeywords = extractChunkKeywords(chunk.content, message);
            
            // Use real page_start from DB if available, fallback to part_number for split docs
            const pageStart = docMeta?.page_start || chunk.page_start || chunk.part_number || 1;
            const pageEnd = docMeta?.page_end || chunk.page_end || pageStart;
            
            return {
              index: idx + 1,
              document: chunk.original_document_name || chunk.document_name,
              section: chunk.section_title,
              article: chunk.article_number,
              // Normalize relevance to 0-1 scale for UI (score is 0-10)
              relevance: Math.min(chunk.relevance_score / 10, 1),
              // Enhanced metadata for document navigation
              chunk_id: chunk.id,
              document_id: docMeta?.document_id || chunk.parent_document_id,
              page_start: pageStart,
              page_end: pageEnd,
              content_preview: extractRelevantPreview(chunk.content, message, 300),
              full_chunk_content: chunk.content, // Full text for Text Viewer
              storage_path: docMeta?.storage_path,
              // Use chunk-specific keywords for better PDF navigation accuracy
              search_keywords: chunkKeywords,
            };
          });
          
          // Filter to only citations actually used in the response (or all if none explicitly cited)
          const citations = usedIndices.size > 0 
            ? allCitations.filter(c => usedIndices.has(c.index))
            : allCitations;
          
          console.log(`RAG: Sending ${citations.length} citations (${allCitations.length} total available)`);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: responseTimeMs,
            rag_context: ragContext.length > 0 ? ragContext : undefined,
            citations: citations.length > 0 ? citations : undefined,
            perplexity_citations: perplexityCitations.length > 0 ? perplexityCitations : undefined,
            web_search_citations: webSearchCitations.length > 0 ? webSearchCitations : undefined,
            web_search_used: webSearchUsed,
            smart_search: usedSmartSearch,
            stop_reason: stopReason,
            reputation_results: reputationSearchResults.length > 0 ? reputationSearchResults : undefined,
            reputation_company_data: reputationCompanyData || undefined,
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
        } finally {
          clearInterval(heartbeatTimer);
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

// =====================================================
// INLINE PII MASKING (to avoid HTTP call latency)
// =====================================================
interface InlineMaskContext {
  source_type: string;
  source_id: string;
  session_id?: string;
  user_id?: string;
  pii_key: string;
  supabase: any;
}

interface InlineMaskResult {
  masked_text: string;
  tokens_count: number;
  pii_types_found: string[];
}

async function maskPiiInline(text: string, context: InlineMaskContext): Promise<InlineMaskResult> {
  const patterns = getActivePatterns();
  const tokenCounters: Record<string, number> = {};
  let maskedText = text;
  let totalTokens = 0;
  const piiTypesFound: string[] = [];
  
  // Track already masked positions to avoid overlapping
  const maskedRanges: Array<{ start: number; end: number }> = [];

  for (const pattern of patterns) {
    for (const regex of pattern.patterns) {
      // Reset regex state
      regex.lastIndex = 0;
      
      // Find all matches and store them first
      const matches: Array<{ match: string; index: number }> = [];
      let regexMatch: RegExpExecArray | null;
      
      while ((regexMatch = regex.exec(maskedText)) !== null) {
        // Skip if this position is already masked
        const matchIndex = regexMatch.index;
        const isOverlapping = maskedRanges.some(
          range => matchIndex >= range.start && matchIndex < range.end
        );
        
        if (!isOverlapping && !regexMatch[0].startsWith('[') && !regexMatch[0].includes('_')) {
          matches.push({ match: regexMatch[0], index: matchIndex });
        }
      }

      // Process matches in reverse order to maintain indices
      for (const { match: originalValue, index } of matches.reverse()) {
        // Increment counter for this type
        tokenCounters[pattern.type] = (tokenCounters[pattern.type] || 0) + 1;
        const tokenNum = tokenCounters[pattern.type];
        const token = `[${pattern.token_prefix}_${tokenNum}]`;

        // Encrypt the original value and store mapping
        try {
          const { encrypted, iv } = await encryptAES256(originalValue, context.pii_key);
          
          await context.supabase
            .from('pii_mappings')
            .insert({
              token,
              pii_type: pattern.type,
              encrypted_value: encrypted,
              encryption_iv: iv,
              source_type: context.source_type,
              source_id: context.source_id,
              session_id: context.session_id,
              created_by: context.user_id,
            });
        } catch (err) {
          console.error('Error storing PII mapping:', err);
        }

        // Replace in text
        maskedText = maskedText.substring(0, index) + token + maskedText.substring(index + originalValue.length);
        
        // Track masked range
        maskedRanges.push({ start: index, end: index + token.length });
        totalTokens++;
        
        if (!piiTypesFound.includes(pattern.type)) {
          piiTypesFound.push(pattern.type);
        }
      }
    }
  }

  return {
    masked_text: maskedText,
    tokens_count: totalTokens,
    pii_types_found: piiTypesFound,
  };
}

// =====================================================
// PII UNMASKING - Load cache and replace tokens in LLM response
// =====================================================

// Load all PII mappings for a source_id into a Map<token, decrypted_value>
async function loadPiiCache(
  sourceId: string,
  piiKey: string,
  supabaseClient: any,
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  
  const { data: mappings, error } = await supabaseClient
    .from('pii_mappings')
    .select('token, encrypted_value, encryption_iv')
    .eq('source_id', sourceId);
  
  if (error) {
    console.error('Error loading PII mappings for cache:', error);
    return cache;
  }
  
  for (const mapping of mappings || []) {
    try {
      const decrypted = await decryptAES256(
        mapping.encrypted_value,
        mapping.encryption_iv,
        piiKey,
      );
      cache.set(mapping.token, decrypted);
    } catch (err) {
      console.error(`Error decrypting token ${mapping.token}:`, err);
    }
  }
  
  return cache;
}

// Replace all PII tokens in text using pre-loaded cache
function unmaskWithCache(text: string, cache: Map<string, string>): string {
  return text.replace(/\[[A-Z_]+_\d+\]/g, (match) => cache.get(match) || match);
}
