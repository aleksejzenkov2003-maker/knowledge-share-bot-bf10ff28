import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: { step: string; status: string; message?: string }[] = [];

    // 1. Check and create default AI provider (Lovable AI)
    const { data: existingProvider } = await supabase
      .from('ai_providers')
      .select('id')
      .eq('provider_type', 'lovable')
      .single();

    if (!existingProvider) {
      const { error: providerError } = await supabase
        .from('ai_providers')
        .insert({
          name: 'Lovable AI (по умолчанию)',
          provider_type: 'lovable',
          default_model: 'google/gemini-2.5-flash',
          is_active: true,
          is_default: true,
        });

      if (providerError) {
        results.push({ step: 'provider', status: 'error', message: providerError.message });
      } else {
        results.push({ step: 'provider', status: 'created', message: 'Lovable AI provider created and set as default' });
      }
    } else {
      results.push({ step: 'provider', status: 'exists', message: 'Lovable AI provider already exists' });
    }

    // 2. Check and create default system prompt
    const { data: existingPrompt } = await supabase
      .from('system_prompts')
      .select('id')
      .limit(1)
      .single();

    if (!existingPrompt) {
      const { error: promptError } = await supabase
        .from('system_prompts')
        .insert({
          name: 'Универсальный ассистент',
          prompt_text: `Ты — умный и полезный AI-ассистент. 

Твои основные правила:
- Отвечай на русском языке, если вопрос на русском
- Давай точные и полезные ответы
- Если в контексте есть документы, используй их для ответа
- Признавай, когда не знаешь ответа
- Будь вежливым и профессиональным

Если тебе предоставлен контекст из документов, основывай свой ответ на этой информации и ссылайся на неё.`,
          is_active: true,
        });

      if (promptError) {
        results.push({ step: 'prompt', status: 'error', message: promptError.message });
      } else {
        results.push({ step: 'prompt', status: 'created', message: 'Default system prompt created' });
      }
    } else {
      results.push({ step: 'prompt', status: 'exists', message: 'System prompt already exists' });
    }

    // 3. Check and create default chat role
    const { data: existingRole } = await supabase
      .from('chat_roles')
      .select('id')
      .limit(1)
      .single();

    if (!existingRole) {
      // Get the prompt we just created or existing one
      const { data: prompt } = await supabase
        .from('system_prompts')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();

      // Get the provider we just created or existing one  
      const { data: provider } = await supabase
        .from('ai_providers')
        .select('id')
        .eq('is_default', true)
        .limit(1)
        .single();

      const { error: roleError } = await supabase
        .from('chat_roles')
        .insert({
          name: 'Универсальный ассистент',
          slug: 'universal-assistant',
          description: 'Общий AI-ассистент для любых вопросов',
          system_prompt_id: prompt?.id || null,
          model_config: provider ? { provider_id: provider.id, model: 'google/gemini-2.5-flash' } : null,
          is_active: true,
          is_project_mode: false,
        });

      if (roleError) {
        results.push({ step: 'role', status: 'error', message: roleError.message });
      } else {
        results.push({ step: 'role', status: 'created', message: 'Default chat role created' });
      }
    } else {
      results.push({ step: 'role', status: 'exists', message: 'Chat role already exists' });
    }

    // 4. Check and create default department  
    const { data: existingDept } = await supabase
      .from('departments')
      .select('id')
      .limit(1)
      .single();

    if (!existingDept) {
      const { error: deptError } = await supabase
        .from('departments')
        .insert({
          name: 'Общий',
          slug: 'general',
          description: 'Общий отдел для всех пользователей',
        });

      if (deptError) {
        results.push({ step: 'department', status: 'error', message: deptError.message });
      } else {
        results.push({ step: 'department', status: 'created', message: 'Default department created' });
      }
    } else {
      results.push({ step: 'department', status: 'exists', message: 'Department already exists' });
    }

    // 5. Check and create default document folder
    const { data: existingFolder } = await supabase
      .from('document_folders')
      .select('id')
      .limit(1)
      .single();

    if (!existingFolder) {
      const { error: folderError } = await supabase
        .from('document_folders')
        .insert({
          name: 'База знаний',
          slug: 'knowledge-base',
          description: 'Основная папка для документов базы знаний',
          folder_type: 'knowledge',
        });

      if (folderError) {
        results.push({ step: 'folder', status: 'error', message: folderError.message });
      } else {
        results.push({ step: 'folder', status: 'created', message: 'Default document folder created' });
      }
    } else {
      results.push({ step: 'folder', status: 'exists', message: 'Document folder already exists' });
    }

    const hasErrors = results.some(r => r.status === 'error');
    const hasCreated = results.some(r => r.status === 'created');

    return new Response(
      JSON.stringify({
        success: !hasErrors,
        message: hasCreated ? 'Система инициализирована' : 'Система уже настроена',
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Init error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
