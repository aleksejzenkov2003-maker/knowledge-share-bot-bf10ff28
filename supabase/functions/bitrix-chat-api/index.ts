import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bitrix-user-id, x-bitrix-user-name, x-bitrix-user-email',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface SendMessageRequest {
  message: string;
  attachments?: Array<{
    file_name: string;
    file_base64: string;
    file_type: string;
  }>;
  role_slug?: string; // Optional: specify agent by slug instead of @mention
}

interface BitrixUserInfo {
  bitrix_user_id: string;
  user_name?: string;
  user_email?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/bitrix-chat-api\/?/, '').replace(/^\//, '');

    // Extract API key from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const apiKey = authHeader.substring(7);

    // Validate API key and get department
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('department_api_keys')
      .select('id, department_id, is_active, expires_at')
      .eq('api_key', apiKey)
      .single();

    if (apiKeyError || !apiKeyData) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!apiKeyData.is_active) {
      return new Response(JSON.stringify({ error: 'API key is deactivated' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'API key has expired' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const departmentId = apiKeyData.department_id;

    // Update last_used_at and request_count
    await supabase
      .from('department_api_keys')
      .update({ 
        last_used_at: new Date().toISOString(),
        request_count: (apiKeyData as any).request_count ? (apiKeyData as any).request_count + 1 : 1
      })
      .eq('id', apiKeyData.id);

    // Extract Bitrix user info from headers
    const bitrixUserInfo: BitrixUserInfo = {
      bitrix_user_id: req.headers.get('X-Bitrix-User-Id') || '',
      user_name: req.headers.get('X-Bitrix-User-Name') || undefined,
      user_email: req.headers.get('X-Bitrix-User-Email') || undefined,
    };

    if (!bitrixUserInfo.bitrix_user_id) {
      return new Response(JSON.stringify({ error: 'Missing X-Bitrix-User-Id header' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route to appropriate handler
    switch (path) {
      case 'send-message':
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleSendMessage(req, supabase, departmentId, bitrixUserInfo);

      case 'messages':
        if (req.method !== 'GET') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleGetMessages(url, supabase, departmentId, bitrixUserInfo);

      case 'agents':
        if (req.method !== 'GET') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleGetAgents(supabase, departmentId);

      case 'sync-user':
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleSyncUser(req, supabase, departmentId, bitrixUserInfo);

      default:
        return new Response(JSON.stringify({ 
          error: 'Not found',
          available_endpoints: [
            'POST /send-message',
            'GET /messages',
            'GET /agents',
            'POST /sync-user'
          ]
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('Bitrix API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: 'Internal server error', details: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function getOrCreateUser(
  supabase: any, 
  departmentId: string, 
  bitrixUserInfo: BitrixUserInfo
): Promise<{ userId: string; isNew: boolean }> {
  // Try to find existing user by bitrix_user_id
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('bitrix_user_id', bitrixUserInfo.bitrix_user_id)
    .single();

  if (existingProfile) {
    return { userId: existingProfile.id, isNew: false };
  }

  // Try to find by email if provided
  if (bitrixUserInfo.user_email) {
    const { data: profileByEmail } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', bitrixUserInfo.user_email)
      .single();

    if (profileByEmail) {
      // Link existing profile to bitrix_user_id
      await supabase
        .from('profiles')
        .update({ bitrix_user_id: bitrixUserInfo.bitrix_user_id })
        .eq('id', profileByEmail.id);
      return { userId: profileByEmail.id, isNew: false };
    }
  }

  // Create new profile for Bitrix user (without auth.users entry)
  // Generate a deterministic UUID from bitrix_user_id
  const namespaceUUID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Standard namespace
  const newUserId = await generateUUIDv5(bitrixUserInfo.bitrix_user_id, namespaceUUID);

  const { error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: newUserId,
      bitrix_user_id: bitrixUserInfo.bitrix_user_id,
      full_name: bitrixUserInfo.user_name || `Bitrix User ${bitrixUserInfo.bitrix_user_id}`,
      email: bitrixUserInfo.user_email,
      department_id: departmentId,
      status: 'active'
    });

  if (insertError) {
    // If insert failed, try to fetch again (race condition)
    const { data: retryProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('bitrix_user_id', bitrixUserInfo.bitrix_user_id)
      .single();
    
    if (retryProfile) {
      return { userId: retryProfile.id, isNew: false };
    }
    throw new Error(`Failed to create user: ${insertError.message}`);
  }

  return { userId: newUserId, isNew: true };
}

async function generateUUIDv5(name: string, namespace: string): Promise<string> {
  // Simple deterministic UUID generation based on bitrix_user_id
  const encoder = new TextEncoder();
  const data = encoder.encode(namespace + name);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Format as UUID v5
  const hex = Array.from(hashArray.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${(parseInt(hex.slice(16, 18), 16) & 0x3f | 0x80).toString(16).padStart(2, '0')}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

async function getOrCreateDepartmentChat(supabase: any, departmentId: string): Promise<string> {
  // Find existing chat for department
  const { data: existingChat } = await supabase
    .from('department_chats')
    .select('id')
    .eq('department_id', departmentId)
    .eq('is_active', true)
    .single();

  if (existingChat) {
    return existingChat.id;
  }

  // Create new chat
  const { data: newChat, error } = await supabase
    .from('department_chats')
    .insert({
      department_id: departmentId,
      title: 'Чат отдела',
      is_active: true
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create chat: ${error.message}`);
  return newChat.id;
}

async function handleSendMessage(
  req: Request,
  supabase: any,
  departmentId: string,
  bitrixUserInfo: BitrixUserInfo
): Promise<Response> {
  const body: SendMessageRequest = await req.json();

  if (!body.message?.trim() && (!body.attachments || body.attachments.length === 0)) {
    return new Response(JSON.stringify({ error: 'Message or attachments required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get or create user
  const { userId } = await getOrCreateUser(supabase, departmentId, bitrixUserInfo);
  
  // Get or create department chat
  const chatId = await getOrCreateDepartmentChat(supabase, departmentId);

  // Parse @mention from message to get role
  let roleId: string | null = null;
  let roleName: string | null = null;
  const mentionMatch = body.message.match(/@(\S+)/);
  
  if (mentionMatch) {
    const mentionTrigger = mentionMatch[1].toLowerCase();
    const { data: role } = await supabase
      .from('chat_roles')
      .select('id, name, mention_trigger')
      .eq('is_active', true)
      .or(`department_ids.cs.{${departmentId}},department_ids.eq.{}`)
      .ilike('mention_trigger', mentionTrigger)
      .single();
    
    if (role) {
      roleId = role.id;
      roleName = role.name;
    }
  } else if (body.role_slug) {
    // Use role_slug if no @mention
    const { data: role } = await supabase
      .from('chat_roles')
      .select('id, name')
      .eq('slug', body.role_slug)
      .eq('is_active', true)
      .single();
    
    if (role) {
      roleId = role.id;
      roleName = role.name;
    }
  }

  // Handle file attachments
  const attachments: any[] = [];
  if (body.attachments && body.attachments.length > 0) {
    for (const att of body.attachments) {
      // Decode base64 and upload to storage
      const fileData = Uint8Array.from(atob(att.file_base64), c => c.charCodeAt(0));
      const filePath = `bitrix/${departmentId}/${userId}/${Date.now()}_${att.file_name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, fileData, {
          contentType: att.file_type,
          upsert: false
        });

      if (!uploadError) {
        attachments.push({
          id: crypto.randomUUID(),
          file_name: att.file_name,
          file_type: att.file_type,
          file_size: fileData.length,
          file_path: filePath,
          status: 'uploaded'
        });
      }
    }
  }

  // Save user message
  const { data: userMessage, error: msgError } = await supabase
    .from('department_chat_messages')
    .insert({
      chat_id: chatId,
      user_id: userId,
      role_id: roleId,
      message_role: 'user',
      content: body.message,
      source: 'bitrix',
      metadata: {
        bitrix_user_id: bitrixUserInfo.bitrix_user_id,
        user_name: bitrixUserInfo.user_name,
        attachments: attachments.length > 0 ? attachments : undefined
      }
    })
    .select('id')
    .single();

  if (msgError) {
    return new Response(JSON.stringify({ error: 'Failed to save message', details: msgError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Call chat-stream function internally
  const chatStreamUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/chat-stream`;
  
  // Load message history for context
  const { data: history } = await supabase
    .from('department_chat_messages')
    .select('message_role, content, role_id')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(20);

  const messages = (history || []).map((m: any) => ({
    role: m.message_role,
    content: m.content
  }));

  // Prepare request to chat-stream
  const chatRequest = {
    message: body.message,
    role_id: roleId,
    department_id: departmentId,
    messages: messages,
    attachments: attachments.map(a => ({
      file_name: a.file_name,
      file_type: a.file_type,
      file_path: a.file_path
    }))
  };

  const chatResponse = await fetch(chatStreamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
    },
    body: JSON.stringify(chatRequest)
  });

  if (!chatResponse.ok || !chatResponse.body) {
    return new Response(JSON.stringify({ 
      error: 'Failed to get AI response',
      user_message_id: userMessage.id 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Stream response back to client
  const reader = chatResponse.body.getReader();
  let fullResponse = '';
  let metadata: any = {};

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data === '[DONE]') {
                // Save assistant message to database
                await supabase
                  .from('department_chat_messages')
                  .insert({
                    chat_id: chatId,
                    user_id: userId,
                    role_id: roleId,
                    message_role: 'assistant',
                    content: fullResponse,
                    source: 'bitrix',
                    metadata: {
                      ...metadata,
                      agent_name: roleName,
                      bitrix_user_id: bitrixUserInfo.bitrix_user_id
                    }
                  });

                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              } else {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.content) {
                    fullResponse += parsed.content;
                  }
                  if (parsed.citations || parsed.response_time_ms) {
                    metadata = { ...metadata, ...parsed };
                  }
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                  controller.enqueue(encoder.encode(line + '\n'));
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Stream error:', error);
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function handleGetMessages(
  url: URL,
  supabase: any,
  departmentId: string,
  bitrixUserInfo: BitrixUserInfo
): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  // Get user
  const { userId } = await getOrCreateUser(supabase, departmentId, bitrixUserInfo);

  // Get chat
  const chatId = await getOrCreateDepartmentChat(supabase, departmentId);

  // Get messages
  const { data: messages, error } = await supabase
    .from('department_chat_messages')
    .select('id, message_role, content, metadata, created_at, role_id')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    messages: messages.reverse(),
    chat_id: chatId,
    user_id: userId
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleGetAgents(supabase: any, departmentId: string): Promise<Response> {
  const { data: agents, error } = await supabase
    .from('chat_roles')
    .select('id, name, slug, mention_trigger, description')
    .eq('is_active', true)
    .or(`department_ids.cs.{${departmentId}},department_ids.eq.{},department_ids.is.null`);

  if (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch agents' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    agents: agents.map((a: any) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      mention: a.mention_trigger ? `@${a.mention_trigger}` : null,
      description: a.description
    }))
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleSyncUser(
  req: Request,
  supabase: any,
  departmentId: string,
  bitrixUserInfo: BitrixUserInfo
): Promise<Response> {
  const body = await req.json();

  // Update user info
  const { userId, isNew } = await getOrCreateUser(supabase, departmentId, bitrixUserInfo);

  // Update additional fields if provided
  if (body.full_name || body.email || body.avatar_url) {
    await supabase
      .from('profiles')
      .update({
        ...(body.full_name && { full_name: body.full_name }),
        ...(body.email && { email: body.email }),
        ...(body.avatar_url && { avatar_url: body.avatar_url }),
      })
      .eq('id', userId);
  }

  return new Response(JSON.stringify({
    user_id: userId,
    is_new: isNew,
    bitrix_user_id: bitrixUserInfo.bitrix_user_id
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
