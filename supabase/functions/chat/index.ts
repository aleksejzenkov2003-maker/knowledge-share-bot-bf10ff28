import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatRequest {
  message: string;
  department_id: string;
  model?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      console.error('PERPLEXITY_API_KEY not configured');
      throw new Error('PERPLEXITY_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { message, department_id, model = 'sonar' }: ChatRequest = await req.json();

    if (!message || !department_id) {
      return new Response(
        JSON.stringify({ error: 'message and department_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Chat request for department: ${department_id}, model: ${model}`);

    // Get system prompt for the department
    const { data: promptData, error: promptError } = await supabase
      .from('system_prompts')
      .select('prompt_text')
      .eq('department_id', department_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    // Fallback to general prompt if no department-specific prompt
    let systemPrompt = 'You are a helpful AI assistant. Answer questions accurately and provide sources when possible.';
    
    if (promptData?.prompt_text) {
      systemPrompt = promptData.prompt_text;
      console.log('Using department-specific prompt');
    } else {
      // Try to get a general prompt (no department)
      const { data: generalPrompt } = await supabase
        .from('system_prompts')
        .select('prompt_text')
        .is('department_id', null)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      if (generalPrompt?.prompt_text) {
        systemPrompt = generalPrompt.prompt_text;
        console.log('Using general prompt');
      } else {
        console.log('Using default prompt');
      }
    }

    // Call Perplexity API
    console.log('Calling Perplexity API...');
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('Perplexity API error:', perplexityResponse.status, errorText);
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`);
    }

    const perplexityData = await perplexityResponse.json();
    console.log('Perplexity response received');

    const content = perplexityData.choices?.[0]?.message?.content || '';
    const citations = perplexityData.citations || [];
    const usage = perplexityData.usage || {};

    const responseTimeMs = Date.now() - startTime;

    // Log the chat
    const { error: logError } = await supabase.from('chat_logs').insert({
      user_id: userId,
      department_id: department_id,
      prompt: message,
      response: content,
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      response_time_ms: responseTimeMs,
      metadata: {
        model: model,
        citations_count: citations.length,
      },
    });

    if (logError) {
      console.error('Error logging chat:', logError);
    }

    const responseData = {
      content,
      citations,
      model,
      response_time_ms: responseTimeMs,
    };

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Chat function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
