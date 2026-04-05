import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEFAULT_SYSTEM_PROMPT = 'Ты — аналитик деловой репутации. Предоставляй структурированную, фактическую информацию о компаниях на основе открытых источников. Отвечай на русском языке.';

const DEFAULT_USER_PROMPT = `Составь подробное досье на компанию "{{companyName}}"{{identifiers}}. 

Включи следующие разделы:
1. **Общая информация** — чем занимается компания, основная деятельность
2. **История и ключевые факты** — когда основана, важные события
3. **Репутация и отзывы** — что говорят о компании клиенты, партнёры, сотрудники
4. **Новости** — последние упоминания в СМИ
5. **Конкуренты и позиция на рынке** — основные конкуренты, доля рынка
6. **Риски и проблемы** — судебные дела, скандалы, проблемы если есть

Отвечай на русском языке. Будь максимально конкретен, приводи факты и цифры.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!apiKey) {
      throw new Error('PERPLEXITY_API_KEY is not configured');
    }

    const { companyName, inn, ogrn } = await req.json();
    if (!companyName) {
      throw new Error('companyName is required');
    }

    // Fetch custom prompt from system_prompts table
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    let userPromptTemplate = DEFAULT_USER_PROMPT;

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: promptData } = await supabase
        .from('system_prompts')
        .select('prompt_text')
        .eq('name', 'reputation-web-search')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (promptData?.prompt_text) {
        userPromptTemplate = promptData.prompt_text;
      }
    } catch (e) {
      console.warn('Failed to fetch custom prompt, using default:', e);
    }

    const identifiers = [
      inn ? `ИНН ${inn}` : '',
      ogrn ? `ОГРН ${ogrn}` : '',
    ].filter(Boolean).join(', ');

    const prompt = userPromptTemplate
      .replace('{{companyName}}', companyName)
      .replace('{{identifiers}}', identifiers ? ` (${identifiers})` : '');

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      const status = response.status;
      if (status === 429) {
        throw new Error('Превышен лимит запросов к Perplexity API. Попробуйте позже.');
      }
      if (status === 402) {
        throw new Error('Недостаточно средств на аккаунте Perplexity API.');
      }
      throw new Error(`Perplexity API error [${status}]: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations: string[] = data.citations || [];

    return new Response(JSON.stringify({ content, citations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('reputation-web-search error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
