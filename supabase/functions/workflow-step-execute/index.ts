import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth check
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { step_id, message, additional_context } = await req.json();
    if (!step_id) {
      return new Response(JSON.stringify({ error: 'step_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load step with relations
    const { data: step, error: stepError } = await supabase
      .from('project_workflow_steps')
      .select('*, project_workflows!inner(project_id, template_id)')
      .eq('id', step_id)
      .single();

    if (stepError || !step) {
      return new Response(JSON.stringify({ error: 'Step not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const projectId = step.project_workflows.project_id;

    // Check membership
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Not a project member' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update step status to running
    await supabase
      .from('project_workflow_steps')
      .update({ status: 'running', started_at: new Date().toISOString(), error_message: null })
      .eq('id', step_id);

    // Update workflow status
    await supabase
      .from('project_workflows')
      .update({ status: 'running' })
      .eq('id', step.workflow_id);

    // Load agent (chat_role)
    let agentRoleId = step.agent_id;
    if (!agentRoleId && step.template_step_id) {
      const { data: templateStep } = await supabase
        .from('workflow_template_steps')
        .select('agent_id')
        .eq('id', step.template_step_id)
        .single();
      agentRoleId = templateStep?.agent_id;
    }

    // Load previous steps' output for context
    const { data: prevSteps } = await supabase
      .from('project_workflow_steps')
      .select('step_order, output_data, user_edits')
      .eq('workflow_id', step.workflow_id)
      .lt('step_order', step.step_order)
      .eq('status', 'completed')
      .order('step_order');

    // Load project memory
    const { data: projectMemory } = await supabase
      .from('project_memory')
      .select('memory_type, content')
      .eq('project_id', projectId)
      .eq('is_active', true);

    // Load step messages for chat history within this step
    const { data: stepMessages } = await supabase
      .from('project_step_messages')
      .select('message_role, content')
      .eq('step_id', step_id)
      .order('created_at');

    // Build context message
    let contextMessage = '';

    // Previous steps results
    if (prevSteps && prevSteps.length > 0) {
      contextMessage += '## Результаты предыдущих этапов\n\n';
      for (const ps of prevSteps) {
        const data = ps.user_edits || ps.output_data;
        const content = typeof data === 'object' && data !== null && 'content' in data
          ? (data as Record<string, unknown>).content
          : JSON.stringify(data);
        contextMessage += `### Этап ${ps.step_order}\n${content}\n\n`;
      }
    }

    // Input data for this step
    if (step.input_data && Object.keys(step.input_data).length > 0) {
      contextMessage += '## Входные данные текущего этапа\n\n';
      const inputContent = typeof step.input_data === 'object' && 'content' in step.input_data
        ? (step.input_data as Record<string, unknown>).content
        : JSON.stringify(step.input_data);
      contextMessage += `${inputContent}\n\n`;
    }

    // Project memory
    if (projectMemory && projectMemory.length > 0) {
      contextMessage += '## Память проекта\n\n';
      for (const mem of projectMemory) {
        contextMessage += `- [${mem.memory_type}] ${mem.content}\n`;
      }
      contextMessage += '\n';
    }

    // Additional context from user
    if (additional_context) {
      contextMessage += `## Дополнительный контекст\n\n${additional_context}\n\n`;
    }

    // Build message history
    const messageHistory: { role: string; content: string }[] = [];

    if (contextMessage) {
      messageHistory.push({ role: 'user', content: contextMessage });
      messageHistory.push({ role: 'assistant', content: 'Понял контекст. Готов выполнить задачу этого этапа.' });
    }

    // Add step chat history
    if (stepMessages && stepMessages.length > 0) {
      for (const msg of stepMessages) {
        messageHistory.push({ role: msg.message_role, content: msg.content });
      }
    }

    // The actual message for this step
    const userMessage = message || 'Выполни задачу этого этапа на основе предоставленного контекста.';

    // Load context packs for the project
    const { data: contextPacks } = await supabase
      .from('project_context_packs')
      .select('context_pack_id, context_packs!inner(folder_ids)')
      .eq('project_id', projectId)
      .eq('is_enabled', true);

    const contextFolderIds = contextPacks?.flatMap(
      (p: any) => p.context_packs?.folder_ids || []
    ) || [];

    // Call chat-stream internally
    const chatStreamUrl = `${supabaseUrl}/functions/v1/chat-stream`;
    const chatBody: Record<string, unknown> = {
      message: userMessage,
      message_history: messageHistory,
      project_id: projectId,
    };

    if (agentRoleId) {
      chatBody.role_id = agentRoleId;
    }
    if (contextFolderIds.length > 0) {
      chatBody.context_folder_ids = contextFolderIds;
    }

    const chatResponse = await fetch(chatStreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(chatBody),
    });

    if (!chatResponse.ok) {
      const errText = await chatResponse.text();
      await supabase
        .from('project_workflow_steps')
        .update({ status: 'error', error_message: `Chat stream error: ${errText}` })
        .eq('id', step_id);

      return new Response(JSON.stringify({ error: 'Chat stream failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stream through the response, accumulate content
    const reader = chatResponse.body?.getReader();
    if (!reader) {
      return new Response(JSON.stringify({ error: 'No stream reader' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let fullContent = '';
    let metadata: Record<string, unknown> = {};

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Forward raw SSE to client
            controller.enqueue(value);

            // Parse for accumulation
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]' || !data) continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === 'content' && parsed.content) {
                    fullContent += parsed.content;
                  }
                  if (parsed.type === 'metadata') {
                    metadata = parsed;
                  }
                } catch {
                  // skip
                }
              }
            }
          }

          // Save result
          await supabase
            .from('project_workflow_steps')
            .update({
              status: 'completed',
              output_data: { content: fullContent, metadata },
              completed_at: new Date().toISOString(),
            })
            .eq('id', step_id);

          // Save assistant message in step chat
          await supabase
            .from('project_step_messages')
            .insert({
              step_id,
              user_id: user.id,
              message_role: 'assistant',
              content: fullContent,
              metadata: metadata as any,
            });

          // Check if all steps completed
          const { data: allSteps } = await supabase
            .from('project_workflow_steps')
            .select('status')
            .eq('workflow_id', step.workflow_id);

          const allCompleted = allSteps?.every(s => s.status === 'completed' || s.status === 'skipped');
          if (allCompleted) {
            await supabase
              .from('project_workflows')
              .update({ status: 'completed', completed_at: new Date().toISOString() })
              .eq('id', step.workflow_id);
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          await supabase
            .from('project_workflow_steps')
            .update({ status: 'error', error_message: errorMsg })
            .eq('id', step_id);
          controller.error(err);
        }
      },
    });

    return new Response(stream, { headers: corsHeaders });
  } catch (error) {
    console.error('workflow-step-execute error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
