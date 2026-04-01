import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChunkForRerank {
  id: string;
  content: string;
  document_name: string;
  section_title?: string;
  article_number?: string;
  fts_rank?: number;
}

interface RerankRequest {
  query: string;
  chunks: ChunkForRerank[];
  top_k?: number;
}

interface RankedChunk extends ChunkForRerank {
  relevance_score: number;
  relevance_reason: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { query, chunks, top_k = 10 }: RerankRequest = await req.json();
    
    if (!query || !chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query and chunks are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    // Prepare chunks for Claude evaluation
    const chunksForEval = chunks.slice(0, 80).map((chunk, index) => ({
      index,
      id: chunk.id,
      content: chunk.content.substring(0, 2500), // Limit content length
      document_name: chunk.document_name,
      section_title: chunk.section_title,
      article_number: chunk.article_number,
    }));

    const systemPrompt = `Ты — эксперт по анализу релевантности текстовых фрагментов. 
Твоя задача — оценить, насколько каждый фрагмент документа релевантен запросу пользователя.

ПРАВИЛА ОЦЕНКИ:
- Оценка от 0 до 10, где 10 = идеально релевантен
- 9-10: Прямой ответ на вопрос, точное совпадение темы
- 7-8: Высоко релевантен, содержит полезную информацию по теме
- 5-6: Частично релевантен, косвенно связан с вопросом
- 3-4: Слабо релевантен, упоминает схожие термины
- 1-2: Почти не релевантен
- 0: Совершенно не связан с запросом

ОСОБОЕ ВНИМАНИЕ:
- Если в запросе упомянут конкретный номер статьи — приоритет фрагментам с этой статьёй
- Учитывай контекст и смысл, не только ключевые слова
- Юридическая точность важнее общих рассуждений`;

    const userPrompt = `ЗАПРОС ПОЛЬЗОВАТЕЛЯ: "${query}"

ФРАГМЕНТЫ ДЛЯ ОЦЕНКИ:
${chunksForEval.map(c => `
[${c.index}] Документ: ${c.document_name}${c.section_title ? ` | Раздел: ${c.section_title}` : ''}${c.article_number ? ` | Статья: ${c.article_number}` : ''}
Содержание: ${c.content}
---`).join('\n')}

Верни JSON массив с оценками для каждого фрагмента в формате:
[
  {"index": 0, "score": 8, "reason": "Краткое объяснение оценки"},
  ...
]

ВАЖНО: Верни ТОЛЬКО валидный JSON массив, без дополнительного текста.`;

    console.log(`Reranking ${chunks.length} chunks for query: "${query.substring(0, 100)}..."`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        system: systemPrompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const anthropicResponse = await response.json();
    const content = anthropicResponse.content?.[0]?.text || '';
    
    console.log('Claude response:', content.substring(0, 500));

    // Parse the JSON response
    let rankings: { index: number; score: number; reason: string }[] = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        rankings = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON array found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response:', parseError);
      // Fallback: return chunks in original order with FTS scores
      const fallbackRanked = chunks.slice(0, top_k).map(chunk => ({
        ...chunk,
        relevance_score: chunk.fts_rank ? chunk.fts_rank * 10 : 5,
        relevance_reason: 'Fallback to FTS ranking',
      }));
      return new Response(
        JSON.stringify({ ranked_chunks: fallbackRanked }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sort by score and map back to original chunks
    const rankedChunks: RankedChunk[] = rankings
      .sort((a, b) => b.score - a.score)
      .slice(0, top_k)
      .map(ranking => {
        const originalChunk = chunks[ranking.index];
        return {
          ...originalChunk,
          relevance_score: ranking.score,
          relevance_reason: ranking.reason,
        };
      })
      .filter(chunk => chunk && chunk.id); // Filter out any undefined chunks

    console.log(`Reranking complete. Top ${rankedChunks.length} chunks selected.`);

    return new Response(
      JSON.stringify({ 
        ranked_chunks: rankedChunks,
        total_evaluated: chunksForEval.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Rerank error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
