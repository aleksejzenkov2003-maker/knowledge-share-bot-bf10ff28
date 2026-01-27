import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bitrix-user-id, x-bitrix-user-name, x-bitrix-user-email',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

interface SendMessageRequest {
  message: string;
  attachments?: Array<{
    file_name: string;
    file_base64: string;
    file_type: string;
  }>;
  role_slug?: string;
}

interface PersonalMessageRequest {
  message: string;
  conversation_id?: string;
  role_id?: string;
  attachments?: Array<{
    file_name: string;
    file_base64: string;
    file_type: string;
  }>;
}

interface BitrixAuthRequest {
  portal: string;
  bitrix_user_id: string;
  bitrix_user_name?: string;
  bitrix_user_email?: string;
  access_token?: string;
  auth_id?: string;
  department_id?: string; // Explicit department override for demo mode
}

interface JWTPayload {
  sub: string; // user_id
  department_id: string;
  bitrix_user_id: string;
  portal: string;
  role: 'admin' | 'moderator' | 'employee'; // User role
  exp: number;
  iat: number;
}

interface BitrixUserInfo {
  bitrix_user_id: string;
  user_name?: string;
  user_email?: string;
}

// Simple JWT implementation using Web Crypto API
async function createJWT(payload: Omit<JWTPayload, 'iat'>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now };
  
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(fullPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [headerB64, payloadB64, signatureB64] = parts;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    // Decode signature
    const signatureStr = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - signatureStr.length % 4) % 4);
    const signature = Uint8Array.from(atob(signatureStr + padding), c => c.charCodeAt(0));
    
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) return null;
    
    // Decode payload
    const payloadStr = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const payloadPadding = '='.repeat((4 - payloadStr.length % 4) % 4);
    const payload: JWTPayload = JSON.parse(atob(payloadStr + payloadPadding));
    
    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const jwtSecret = Deno.env.get('BITRIX_JWT_SECRET') || 'fallback-secret-change-me';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/bitrix-chat-api\/?/, '').replace(/^\//, '');

    // ============ PUBLIC ENDPOINT: AUTH ============
    if (path === 'auth') {
      if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return await handleAuth(req, supabase, jwtSecret);
    }

    // ============ JWT-PROTECTED ENDPOINTS ============
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const token = authHeader.substring(7);
    
    // Try JWT auth first (new secure flow)
    let jwtPayload = await verifyJWT(token, jwtSecret);
    let departmentId: string;
    let bitrixUserInfo: BitrixUserInfo;
    let userId: string;
    let userRole: 'admin' | 'moderator' | 'employee' = 'employee';
    
    if (jwtPayload) {
      // JWT auth - verify session is still valid
      const tokenHash = await hashToken(token);
      const { data: session } = await supabase
        .from('bitrix_sessions')
        .select('id')
        .eq('jwt_token_hash', tokenHash)
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (!session) {
        return new Response(JSON.stringify({ error: 'Session expired or revoked' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Update last activity
      await supabase
        .from('bitrix_sessions')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', session.id);
      
      departmentId = jwtPayload.department_id;
      bitrixUserInfo = {
        bitrix_user_id: jwtPayload.bitrix_user_id,
      };
      userId = jwtPayload.sub;
      userRole = jwtPayload.role || 'employee';
    } else {
      // Legacy API key auth (backwards compatibility)
      const { data: apiKeyData, error: apiKeyError } = await supabase
        .from('department_api_keys')
        .select('id, department_id, is_active, expires_at, request_count')
        .eq('api_key', token)
        .single();

      if (apiKeyError || !apiKeyData) {
        return new Response(JSON.stringify({ error: 'Invalid token or API key' }), {
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

      departmentId = apiKeyData.department_id;

      // Update usage stats
      await supabase
        .from('department_api_keys')
        .update({ 
          last_used_at: new Date().toISOString(),
          request_count: (apiKeyData.request_count || 0) + 1
        })
        .eq('id', apiKeyData.id);

      // Extract Bitrix user info from headers (legacy flow)
      bitrixUserInfo = {
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

      // Get or create user for legacy flow
      const userResult = await getOrCreateUser(supabase, departmentId, bitrixUserInfo);
      userId = userResult.userId;
      userRole = userResult.role;
    }

    // Route to appropriate handler
    // === PERSONAL CHAT ENDPOINTS ===
    if (path === 'personal/conversations' && req.method === 'GET') {
      return await handleGetPersonalConversations(url, supabase, userId);
    }
    if (path === 'personal/conversations' && req.method === 'POST') {
      return await handleCreatePersonalConversation(req, supabase, userId);
    }
    if (path.match(/^personal\/conversations\/[^/]+$/) && req.method === 'GET') {
      const conversationId = path.split('/')[2];
      return await handleGetPersonalConversation(url, supabase, userId, conversationId);
    }
    if (path.match(/^personal\/conversations\/[^/]+$/) && req.method === 'DELETE') {
      const conversationId = path.split('/')[2];
      return await handleDeletePersonalConversation(supabase, userId, conversationId);
    }
    if (path.match(/^personal\/conversations\/[^/]+\/messages$/) && req.method === 'POST') {
      const conversationId = path.split('/')[2];
      return await handleSendPersonalMessage(req, supabase, userId, conversationId, departmentId);
    }
    
    // === NEW: DELETE PERSONAL MESSAGE ===
    if (path.match(/^personal\/messages\/[^/]+$/) && req.method === 'DELETE') {
      const messageId = path.split('/')[2];
      return await handleDeletePersonalMessage(supabase, userId, messageId);
    }
    
    // === NEW: REGENERATE PERSONAL MESSAGE ===
    if (path.match(/^personal\/conversations\/[^/]+\/regenerate$/) && req.method === 'POST') {
      const conversationId = path.split('/')[2];
      return await handleRegeneratePersonalMessage(req, supabase, userId, conversationId, departmentId);
    }
    
    // === NEW: DELETE DEPARTMENT MESSAGE ===
    if (path.match(/^department\/messages\/[^/]+$/) && req.method === 'DELETE') {
      const messageId = path.split('/')[2];
      return await handleDeleteDepartmentMessage(supabase, userId, departmentId, messageId, userRole);
    }
    
    // === NEW: REGENERATE DEPARTMENT MESSAGE ===
    if (path === 'department/regenerate' && req.method === 'POST') {
      return await handleRegenerateDepartmentMessage(req, supabase, userId, departmentId, userRole);
    }

    // === EXISTING + NEW DEPARTMENT CHAT ENDPOINTS ===
    switch (path) {
      case 'me':
        if (req.method !== 'GET') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleGetMe(supabase, userId, departmentId, userRole);

      case 'send-message':
      case 'department/send-message':
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleSendMessage(req, supabase, departmentId, bitrixUserInfo, userId);

      case 'messages':
      case 'department/messages':
        if (req.method !== 'GET') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleGetMessages(url, supabase, departmentId, userId);

      case 'agents':
      case 'department/agents':
        if (req.method !== 'GET') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleGetAgents(supabase, departmentId, userRole);

      case 'personal/roles':
        if (req.method !== 'GET') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleGetAgents(supabase, departmentId, userRole);

      case 'sync-user':
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleSyncUser(req, supabase, departmentId, bitrixUserInfo);

      case 'logout':
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleLogout(token, supabase, jwtSecret);

      // === DOCUMENT ACCESS ENDPOINTS (for Bitrix context) ===
      case 'documents/search':
        if (req.method !== 'GET') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleDocumentSearch(url, supabase);

      case 'documents/signed-url':
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return await handleDocumentSignedUrl(req, supabase);

      default:
        return new Response(JSON.stringify({ 
          error: 'Not found',
          available_endpoints: [
            'POST /auth',
            'GET /me',
            // Personal chat
            'GET /personal/conversations',
            'POST /personal/conversations',
            'GET /personal/conversations/:id',
            'DELETE /personal/conversations/:id',
            'POST /personal/conversations/:id/messages',
            'DELETE /personal/messages/:id',
            'POST /personal/conversations/:id/regenerate',
            'GET /personal/roles',
            // Department chat
            'POST /department/send-message (or /send-message)',
            'GET /department/messages (or /messages)',
            'DELETE /department/messages/:id',
            'POST /department/regenerate',
            'GET /department/agents (or /agents)',
            // Document access
            'GET /documents/search',
            'POST /documents/signed-url',
            // User
            'POST /sync-user',
            'POST /logout'
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

// ============ AUTH HANDLER ============
async function handleAuth(
  req: Request,
  supabase: any,
  jwtSecret: string
): Promise<Response> {
  const body: BitrixAuthRequest = await req.json();

  console.log('[AUTH] Incoming request:', {
    portal: body.portal,
    bitrix_user_id: body.bitrix_user_id,
    bitrix_user_name: body.bitrix_user_name,
    department_id: body.department_id,
  });

  if (!body.portal || !body.bitrix_user_id) {
    console.log('[AUTH] Missing required fields');
    return new Response(JSON.stringify({ 
      error: 'Missing required fields: portal, bitrix_user_id' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get explicitly passed department_id (for demo mode / admin testing)
  const explicitDepartmentId = body.department_id;

  // Normalize portal domain: extract domain only (no protocol, no path)
  let normalizedPortal = body.portal.trim().toLowerCase();
  normalizedPortal = normalizedPortal.replace(/^https?:\/\//, '');
  normalizedPortal = normalizedPortal.split('/')[0].split('?')[0].split('#')[0];
  
  console.log('[AUTH] Normalized portal domain:', normalizedPortal);

  // STEP 1: Try to find existing user by bitrix_user_id and check their department
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, department_id')
    .eq('bitrix_user_id', body.bitrix_user_id)
    .single();

  let departmentId: string | null = null;
  let apiKeyId: string | null = null;
  let isUserDepartmentDetected = false;

  // STEP 0: If explicit department_id passed (demo/admin mode), prioritize it FIRST
  if (explicitDepartmentId) {
    console.log('[AUTH] Explicit department_id requested (demo mode):', explicitDepartmentId);
    
    // Verify this department exists and has API key for the portal
    const { data: apiKeyData } = await supabase
      .from('department_api_keys')
      .select('id, department_id, request_count')
      .eq('portal_domain', normalizedPortal)
      .eq('department_id', explicitDepartmentId)
      .eq('is_active', true)
      .maybeSingle();

    if (apiKeyData) {
      departmentId = explicitDepartmentId;
      apiKeyId = apiKeyData.id;
      isUserDepartmentDetected = true;
      console.log('[AUTH] Using explicit department_id:', departmentId);
      
      // Update usage stats
      await supabase
        .from('department_api_keys')
        .update({ 
          last_used_at: new Date().toISOString(),
          request_count: (apiKeyData.request_count || 0) + 1
        })
        .eq('id', apiKeyData.id);
    } else {
      console.log('[AUTH] Explicit department not found for this portal, will try user profile or fallback');
    }
  }

  // STEP 1: If no explicit department set, check existing user's department
  if (!departmentId && existingProfile?.department_id) {
    // User already has a department assigned - use it
    console.log('[AUTH] User already has department_id:', existingProfile.department_id);
    departmentId = existingProfile.department_id;
    isUserDepartmentDetected = true;

    // Verify this portal has an API key for this department
    const { data: apiKeyForDept } = await supabase
      .from('department_api_keys')
      .select('id, request_count')
      .eq('portal_domain', normalizedPortal)
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .maybeSingle();

    if (apiKeyForDept) {
      apiKeyId = apiKeyForDept.id;
      // Update usage stats
      await supabase
        .from('department_api_keys')
        .update({ 
          last_used_at: new Date().toISOString(),
          request_count: (apiKeyForDept.request_count || 0) + 1
        })
        .eq('id', apiKeyForDept.id);
    }
    // If no API key for this specific department - that's okay, user can still use their assigned department
  }

  // STEP 2: If user doesn't have department - find API key by portal (legacy flow / first login)
  if (!departmentId) {
    console.log('[AUTH] User has no department, looking up API key by portal');
    
    // For multi-department portals, we need to pick one
    let query = supabase
      .from('department_api_keys')
      .select('id, department_id, is_active, request_count, portal_domain')
      .eq('portal_domain', normalizedPortal)
      .eq('is_active', true);

    // If explicit department_id passed (demo mode), prefer it
    if (explicitDepartmentId) {
      query = query.eq('department_id', explicitDepartmentId);
    }

    const { data: apiKeys, error: apiKeyError } = await query;

    console.log('[AUTH] DB lookup result:', {
      found: apiKeys?.length || 0,
      error: apiKeyError?.message,
      explicitDepartmentId,
    });

    if (apiKeyError || !apiKeys || apiKeys.length === 0) {
      // If explicit department not found, try without filter
      if (explicitDepartmentId) {
        console.log('[AUTH] Explicit department not found, falling back to any available');
        const { data: fallbackKeys } = await supabase
          .from('department_api_keys')
          .select('id, department_id, is_active, request_count, portal_domain')
          .eq('portal_domain', normalizedPortal)
          .eq('is_active', true);
        
        if (fallbackKeys && fallbackKeys.length > 0) {
          const selectedApiKey = fallbackKeys[0];
          departmentId = selectedApiKey.department_id;
          apiKeyId = selectedApiKey.id;
          console.log('[AUTH] Fallback API key found, department_id:', departmentId);
        }
      }
      
      if (!departmentId) {
        console.log('[AUTH] Portal not registered - lookup failed for:', normalizedPortal);
        return new Response(JSON.stringify({ 
          error: 'Portal not registered',
          details: `No active API key found for portal domain "${normalizedPortal}". Contact administrator.`,
          received_portal: body.portal,
          normalized_portal: normalizedPortal,
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // If multiple departments available for this portal, use the first one for new users
      // Admin can later reassign user to correct department
      const selectedApiKey = apiKeys[0];
      departmentId = selectedApiKey.department_id;
      apiKeyId = selectedApiKey.id;
      
      console.log('[AUTH] API key found, department_id:', departmentId, 
        apiKeys.length > 1 ? `(${apiKeys.length} departments available)` : '');
    }

    // Update API key usage stats - note: we already updated in STEP 0/1/2 where apiKeyId was set
  }

  // Get or create user
  const bitrixUserInfo: BitrixUserInfo = {
    bitrix_user_id: body.bitrix_user_id,
    user_name: body.bitrix_user_name,
    user_email: body.bitrix_user_email,
  };

  const { userId, isNew, role } = await getOrCreateUser(supabase, departmentId!, bitrixUserInfo);

  // Create JWT (1 hour expiration)
  const expiresIn = 3600; // 1 hour
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  
  const jwtPayload: Omit<JWTPayload, 'iat'> = {
    sub: userId,
    department_id: departmentId!,
    bitrix_user_id: body.bitrix_user_id,
    portal: body.portal,
    role: role, // Include role in JWT
    exp: expiresAt,
  };

  const token = await createJWT(jwtPayload, jwtSecret);
  const tokenHash = await hashToken(token);

  // Save session
  await supabase
    .from('bitrix_sessions')
    .insert({
      user_id: userId,
      department_id: departmentId,
      bitrix_user_id: body.bitrix_user_id,
      portal_domain: body.portal,
      jwt_token_hash: tokenHash,
      expires_at: new Date(expiresAt * 1000).toISOString(),
    });

  // Get user profile with department info
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, department_id')
    .eq('id', userId)
    .single();

  // Get department name
  let departmentName = null;
  if (profile?.department_id) {
    const { data: dept } = await supabase
      .from('departments')
      .select('name')
      .eq('id', profile.department_id)
      .single();
    departmentName = dept?.name;
  }

  return new Response(JSON.stringify({
    token,
    expires_in: expiresIn,
    user: {
      ...profile,
      role,
      department_name: departmentName,
    },
    is_new_user: isNew,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============ GET ME HANDLER ============
async function handleGetMe(
  supabase: any,
  userId: string,
  departmentId: string,
  userRole: 'admin' | 'moderator' | 'employee'
): Promise<Response> {
  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, department_id')
    .eq('id', userId)
    .single();

  // Get department name
  let departmentName = null;
  if (departmentId) {
    const { data: dept } = await supabase
      .from('departments')
      .select('name')
      .eq('id', departmentId)
      .single();
    departmentName = dept?.name;
  }

  // Get available roles/agents based on permissions
  let availableRolesQuery = supabase
    .from('chat_roles')
    .select('id, name, slug, mention_trigger, description')
    .eq('is_active', true);

  // Admin/moderator can see all roles
  if (userRole !== 'admin' && userRole !== 'moderator') {
    availableRolesQuery = availableRolesQuery.or(
      `department_ids.cs.{${departmentId}},department_ids.eq.{},department_ids.is.null`
    );
  }

  const { data: roles } = await availableRolesQuery;

  return new Response(JSON.stringify({
    user_id: userId,
    full_name: profile?.full_name,
    email: profile?.email,
    avatar_url: profile?.avatar_url,
    role: userRole,
    department_id: departmentId,
    department_name: departmentName,
    permissions: {
      can_access_personal_chat: true,
      can_access_department_chat: true,
      can_view_all_departments: userRole === 'admin' || userRole === 'moderator',
      available_role_ids: (roles || []).map((r: any) => r.id),
    },
    available_roles: roles || [],
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============ LOGOUT HANDLER ============
async function handleLogout(
  token: string,
  supabase: any,
  jwtSecret: string
): Promise<Response> {
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const tokenHash = await hashToken(token);
  
  await supabase
    .from('bitrix_sessions')
    .delete()
    .eq('jwt_token_hash', tokenHash);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getOrCreateUser(
  supabase: any, 
  departmentId: string, 
  bitrixUserInfo: BitrixUserInfo
): Promise<{ userId: string; isNew: boolean; role: 'admin' | 'moderator' | 'employee' }> {
  // Try to find existing user by bitrix_user_id
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('bitrix_user_id', bitrixUserInfo.bitrix_user_id)
    .single();

  if (existingProfile) {
    // Get user role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', existingProfile.id)
      .single();
    
    return { 
      userId: existingProfile.id, 
      isNew: false, 
      role: userRole?.role || 'employee' 
    };
  }

  // Try to find by email if provided
  if (bitrixUserInfo.user_email) {
    const { data: profileByEmail } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', bitrixUserInfo.user_email)
      .single();

    if (profileByEmail) {
      // Link existing profile to bitrix_user_id and update department if not set
      await supabase
        .from('profiles')
        .update({ 
          bitrix_user_id: bitrixUserInfo.bitrix_user_id,
          department_id: departmentId
        })
        .eq('id', profileByEmail.id);
      
      // Get user role
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', profileByEmail.id)
        .single();
      
      return { 
        userId: profileByEmail.id, 
        isNew: false, 
        role: userRole?.role || 'employee' 
      };
    }
  }

  // No existing profile found - need to create an auth user first
  // Use Supabase Admin API to create a user
  const email = bitrixUserInfo.user_email || `bitrix_${bitrixUserInfo.bitrix_user_id}@bitrix.local`;
  const password = await generateSecurePassword();
  
  console.log('[AUTH] Creating new auth user for Bitrix user:', bitrixUserInfo.bitrix_user_id);
  
  // Create user via Supabase Admin API
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      full_name: bitrixUserInfo.user_name || `Bitrix User ${bitrixUserInfo.bitrix_user_id}`,
      bitrix_user_id: bitrixUserInfo.bitrix_user_id,
    }
  });

  if (authError) {
    console.error('[AUTH] Failed to create auth user:', authError.message);
    
    // If user already exists (maybe email conflict), try to find them
    if (authError.message.includes('already') || authError.message.includes('duplicate')) {
      const { data: existingAuthUser } = await supabase.auth.admin.listUsers();
      const foundUser = existingAuthUser?.users?.find(
        (u: any) => u.email === email
      );
      
      if (foundUser) {
        // Update the profile with bitrix_user_id
        await supabase
          .from('profiles')
          .update({ 
            bitrix_user_id: bitrixUserInfo.bitrix_user_id,
            department_id: departmentId
          })
          .eq('id', foundUser.id);
        
        const { data: userRole } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', foundUser.id)
          .single();
        
        return {
          userId: foundUser.id,
          isNew: false,
          role: userRole?.role || 'employee'
        };
      }
    }
    
    throw new Error(`Failed to create user: ${authError.message}`);
  }

  const newUserId = authData.user.id;
  console.log('[AUTH] Created new auth user with id:', newUserId);

  // The profile should be created automatically by the handle_new_user trigger
  // But we need to update it with bitrix_user_id and department_id
  // Wait a bit for trigger to complete
  await new Promise(resolve => setTimeout(resolve, 500));

  // Update profile with Bitrix info
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      bitrix_user_id: bitrixUserInfo.bitrix_user_id,
      department_id: departmentId,
      full_name: bitrixUserInfo.user_name || `Bitrix User ${bitrixUserInfo.bitrix_user_id}`,
    })
    .eq('id', newUserId);

  if (updateError) {
    console.error('[AUTH] Failed to update profile:', updateError.message);
  }

  // Get user role (should be 'employee' from trigger)
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', newUserId)
    .single();

  return { userId: newUserId, isNew: true, role: userRole?.role || 'employee' };
}

async function generateSecurePassword(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}


async function getOrCreateDepartmentChat(supabase: any, departmentId: string): Promise<string> {
  const { data: existingChat } = await supabase
    .from('department_chats')
    .select('id')
    .eq('department_id', departmentId)
    .eq('is_active', true)
    .single();

  if (existingChat) {
    return existingChat.id;
  }

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

// ============ PERSONAL CHAT HANDLERS ============
async function handleGetPersonalConversations(
  url: URL,
  supabase: any,
  userId: string
): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(`
      id, 
      title, 
      role_id, 
      is_active, 
      is_pinned, 
      created_at, 
      updated_at,
      chat_roles(id, name, slug)
    `)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch conversations' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    conversations: conversations.map((c: any) => ({
      id: c.id,
      title: c.title,
      role_id: c.role_id,
      role: c.chat_roles,
      is_pinned: c.is_pinned,
      created_at: c.created_at,
      updated_at: c.updated_at,
    })),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleCreatePersonalConversation(
  req: Request,
  supabase: any,
  userId: string
): Promise<Response> {
  const body = await req.json();
  const title = body.title || 'Новый диалог';
  const roleId = body.role_id || null;

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      title,
      role_id: roleId,
      is_active: true,
    })
    .select('id, title, role_id, created_at')
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: 'Failed to create conversation' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ conversation }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleGetPersonalConversation(
  url: URL,
  supabase: any,
  userId: string,
  conversationId: string
): Promise<Response> {
  // Verify ownership
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, title, role_id, is_pinned, created_at, updated_at')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  if (convError || !conversation) {
    return new Response(JSON.stringify({ error: 'Conversation not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get messages
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('id, role, content, metadata, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (msgError) {
    return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    conversation,
    messages: messages || [],
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleDeletePersonalConversation(
  supabase: any,
  userId: string,
  conversationId: string
): Promise<Response> {
  // Verify ownership and soft delete
  const { error } = await supabase
    .from('conversations')
    .update({ is_active: false })
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) {
    return new Response(JSON.stringify({ error: 'Failed to delete conversation' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleSendPersonalMessage(
  req: Request,
  supabase: any,
  userId: string,
  conversationId: string,
  departmentId: string
): Promise<Response> {
  // Verify ownership
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, role_id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  if (convError || !conversation) {
    return new Response(JSON.stringify({ error: 'Conversation not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body: PersonalMessageRequest = await req.json();

  if (!body.message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const roleId = body.role_id || conversation.role_id;

  // Handle file attachments
  const attachments: any[] = [];
  if (body.attachments && body.attachments.length > 0) {
    for (const att of body.attachments) {
      try {
        const base64 = att.file_base64;
        const chunkSize = 65536;
        const chunks: number[] = [];
        
        for (let i = 0; i < base64.length; i += chunkSize) {
          const chunk = base64.slice(i, i + chunkSize);
          const decoded = atob(chunk);
          for (let j = 0; j < decoded.length; j++) {
            chunks.push(decoded.charCodeAt(j));
          }
        }
        
        const fileData = new Uint8Array(chunks);
        const filePath = `personal/${userId}/${Date.now()}_${att.file_name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, fileData, {
            contentType: att.file_type,
            upsert: false
          });

        if (!uploadError) {
          attachments.push({
            file_name: att.file_name,
            file_type: att.file_type,
            file_size: fileData.length,
            file_path: filePath,
          });
        }
      } catch (e) {
        console.error('Attachment upload error:', e);
      }
    }
  }

  // Save user message
  const { data: userMessage, error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content: body.message,
      metadata: {
        attachments: attachments.length > 0 ? attachments : undefined,
      }
    })
    .select('id')
    .single();

  if (msgError) {
    return new Response(JSON.stringify({ error: 'Failed to save message' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update conversation title if first message
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  if (count === 1) {
    const title = body.message.substring(0, 50) + (body.message.length > 50 ? '...' : '');
    await supabase
      .from('conversations')
      .update({ title })
      .eq('id', conversationId);
  }

  // Update conversation timestamp
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Call chat-stream function
  const chatStreamUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/chat-stream`;
  
  const { data: history } = await supabase
    .from('messages')
    .select('role, content, metadata')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(30);

  const messages = (history || []).map((m: any) => ({
    role: m.role,
    content: m.content,
    attachments: m.metadata?.attachments,
  }));

  const chatRequest = {
    message: body.message,
    role_id: roleId,
    department_id: departmentId,
    messages: messages,
    message_history: messages, // Ensure context is passed to chat-stream
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
                // Save assistant message
                await supabase
                  .from('messages')
                  .insert({
                    conversation_id: conversationId,
                    role: 'assistant',
                    content: fullResponse,
                    metadata: metadata
                  });

                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              } else {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.content) {
                    fullResponse += parsed.content;
                  }
                  // Capture metadata chunk OR individual metadata fields
                  if (parsed.type === 'metadata' || 
                      parsed.citations || 
                      parsed.response_time_ms || 
                      parsed.rag_context || 
                      parsed.web_search_citations) {
                    const { type, content, ...metaFields } = parsed;
                    metadata = { ...metadata, ...metaFields };
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

// ============ DEPARTMENT CHAT HANDLERS ============
async function handleSendMessage(
  req: Request,
  supabase: any,
  departmentId: string,
  bitrixUserInfo: BitrixUserInfo,
  userId: string
): Promise<Response> {
  const body: SendMessageRequest = await req.json();

  if (!body.message?.trim() && (!body.attachments || body.attachments.length === 0)) {
    return new Response(JSON.stringify({ error: 'Message or attachments required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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
      try {
        // Process base64 in chunks to avoid stack overflow
        const base64 = att.file_base64;
        const chunkSize = 65536;
        const chunks: number[] = [];
        
        for (let i = 0; i < base64.length; i += chunkSize) {
          const chunk = base64.slice(i, i + chunkSize);
          const decoded = atob(chunk);
          for (let j = 0; j < decoded.length; j++) {
            chunks.push(decoded.charCodeAt(j));
          }
        }
        
        const fileData = new Uint8Array(chunks);
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
      } catch (e) {
        console.error('Attachment upload error:', e);
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

  // Call chat-stream function
  const chatStreamUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/chat-stream`;
  
  const { data: history } = await supabase
    .from('department_chat_messages')
    .select('message_role, content, metadata, role_id')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(30);

  const messages = (history || []).map((m: any) => ({
    role: m.message_role,
    content: m.content,
    agent_name: m.metadata?.agent_name,
    attachments: m.metadata?.attachments,
  }));

  const chatRequest = {
    message: body.message,
    role_id: roleId,
    department_id: departmentId,
    messages: messages,
    message_history: messages, // Ensure context is passed to chat-stream
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
                  // Capture metadata chunk OR individual metadata fields
                  if (parsed.type === 'metadata' || 
                      parsed.citations || 
                      parsed.response_time_ms || 
                      parsed.rag_context || 
                      parsed.web_search_citations) {
                    const { type, content, ...metaFields } = parsed;
                    metadata = { ...metadata, ...metaFields };
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
  userId: string
): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const chatId = await getOrCreateDepartmentChat(supabase, departmentId);

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

async function handleGetAgents(
  supabase: any, 
  departmentId: string,
  userRole: 'admin' | 'moderator' | 'employee' = 'employee'
): Promise<Response> {
  let query = supabase
    .from('chat_roles')
    .select('id, name, slug, mention_trigger, description')
    .eq('is_active', true);

  // Admin/moderator can see all agents
  if (userRole !== 'admin' && userRole !== 'moderator') {
    query = query.or(`department_ids.cs.{${departmentId}},department_ids.eq.{},department_ids.is.null`);
  }

  const { data: agents, error } = await query;

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
      mention: a.mention_trigger || null,
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

  const { userId, isNew, role } = await getOrCreateUser(supabase, departmentId, bitrixUserInfo);

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
    role: role,
    bitrix_user_id: bitrixUserInfo.bitrix_user_id
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============ DELETE PERSONAL MESSAGE HANDLER ============
async function handleDeletePersonalMessage(
  supabase: any,
  userId: string,
  messageId: string
): Promise<Response> {
  // Get message with conversation ownership check
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .select('id, role, conversation_id, created_at, conversations!inner(user_id)')
    .eq('id', messageId)
    .single();

  if (msgError || !message) {
    return new Response(JSON.stringify({ error: 'Message not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify ownership
  if (message.conversations.user_id !== userId) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // If user message, also delete the next assistant message
  if (message.role === 'user') {
    const { data: nextMessage } = await supabase
      .from('messages')
      .select('id, role')
      .eq('conversation_id', message.conversation_id)
      .gt('created_at', message.created_at)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextMessage && nextMessage.role === 'assistant') {
      await supabase.from('messages').delete().eq('id', nextMessage.id);
    }
  }

  // Delete the message
  const { error: deleteError } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);

  if (deleteError) {
    return new Response(JSON.stringify({ error: 'Failed to delete message' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============ REGENERATE PERSONAL MESSAGE HANDLER ============
async function handleRegeneratePersonalMessage(
  req: Request,
  supabase: any,
  userId: string,
  conversationId: string,
  departmentId: string
): Promise<Response> {
  const body = await req.json();
  const { message_id, role_id } = body;

  if (!message_id) {
    return new Response(JSON.stringify({ error: 'message_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify conversation ownership
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, role_id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  if (convError || !conversation) {
    return new Response(JSON.stringify({ error: 'Conversation not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get the target assistant message
  const { data: targetMessage, error: msgError } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('id', message_id)
    .eq('conversation_id', conversationId)
    .single();

  if (msgError || !targetMessage) {
    return new Response(JSON.stringify({ error: 'Message not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (targetMessage.role !== 'assistant') {
    return new Response(JSON.stringify({ error: 'Can only regenerate assistant messages' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Find the previous user message
  const { data: userMessage } = await supabase
    .from('messages')
    .select('id, content, metadata')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .lt('created_at', targetMessage.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!userMessage) {
    return new Response(JSON.stringify({ error: 'No user message found to regenerate from' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Delete the assistant message
  await supabase.from('messages').delete().eq('id', message_id);

  // Get history before the deleted message
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .lt('created_at', targetMessage.created_at)
    .order('created_at', { ascending: true });

  const messages = (history || []).map((m: any) => ({
    role: m.role,
    content: m.content
  }));

  // Get attachments from user message if any
  const attachments = userMessage.metadata?.attachments || [];

  // Determine the effective role
  const effectiveRoleId = role_id || conversation.role_id;

  // Call chat-stream function
  const chatStreamUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/chat-stream`;
  
  const chatRequest = {
    message: userMessage.content,
    role_id: effectiveRoleId,
    department_id: departmentId,
    message_history: messages,
    attachments: attachments.map((a: any) => ({
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
    return new Response(JSON.stringify({ error: 'Failed to regenerate response' }), {
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
                // Save new assistant message
                await supabase
                  .from('messages')
                  .insert({
                    conversation_id: conversationId,
                    role: 'assistant',
                    content: fullResponse,
                    metadata: metadata
                  });

                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              } else {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.content) {
                    fullResponse += parsed.content;
                  }
                  // Capture metadata chunk OR individual metadata fields
                  if (parsed.type === 'metadata' || 
                      parsed.citations || 
                      parsed.response_time_ms || 
                      parsed.rag_context || 
                      parsed.web_search_citations) {
                    const { type, content, ...metaFields } = parsed;
                    metadata = { ...metadata, ...metaFields };
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
        console.error('Regenerate stream error:', error);
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

// ============ DELETE DEPARTMENT MESSAGE HANDLER ============
async function handleDeleteDepartmentMessage(
  supabase: any,
  userId: string,
  departmentId: string,
  messageId: string,
  userRole: string
): Promise<Response> {
  // Get message with chat info
  const { data: message, error: msgError } = await supabase
    .from('department_chat_messages')
    .select('id, message_role, chat_id, created_at, user_id, department_chats!inner(department_id)')
    .eq('id', messageId)
    .single();

  if (msgError || !message) {
    return new Response(JSON.stringify({ error: 'Message not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check access: admin can delete any, others can only delete from their department
  const msgDepartmentId = message.department_chats.department_id;
  if (userRole !== 'admin' && msgDepartmentId !== departmentId) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // If user message, also delete the next assistant message
  if (message.message_role === 'user') {
    const { data: nextMessage } = await supabase
      .from('department_chat_messages')
      .select('id, message_role')
      .eq('chat_id', message.chat_id)
      .gt('created_at', message.created_at)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextMessage && nextMessage.message_role === 'assistant') {
      await supabase.from('department_chat_messages').delete().eq('id', nextMessage.id);
    }
  }

  // Delete the message
  const { error: deleteError } = await supabase
    .from('department_chat_messages')
    .delete()
    .eq('id', messageId);

  if (deleteError) {
    return new Response(JSON.stringify({ error: 'Failed to delete message' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============ REGENERATE DEPARTMENT MESSAGE HANDLER ============
async function handleRegenerateDepartmentMessage(
  req: Request,
  supabase: any,
  userId: string,
  departmentId: string,
  userRole: string
): Promise<Response> {
  const body = await req.json();
  const { message_id, role_id } = body;

  if (!message_id) {
    return new Response(JSON.stringify({ error: 'message_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get the target assistant message
  const { data: targetMessage, error: msgError } = await supabase
    .from('department_chat_messages')
    .select('id, message_role, chat_id, content, created_at, role_id, department_chats!inner(department_id)')
    .eq('id', message_id)
    .single();

  if (msgError || !targetMessage) {
    return new Response(JSON.stringify({ error: 'Message not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check access
  const msgDepartmentId = targetMessage.department_chats.department_id;
  if (userRole !== 'admin' && msgDepartmentId !== departmentId) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (targetMessage.message_role !== 'assistant') {
    return new Response(JSON.stringify({ error: 'Can only regenerate assistant messages' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const chatId = targetMessage.chat_id;

  // Find the previous user message
  const { data: userMessage } = await supabase
    .from('department_chat_messages')
    .select('id, content, metadata')
    .eq('chat_id', chatId)
    .eq('message_role', 'user')
    .lt('created_at', targetMessage.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!userMessage) {
    return new Response(JSON.stringify({ error: 'No user message found to regenerate from' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Delete the assistant message
  await supabase.from('department_chat_messages').delete().eq('id', message_id);

  // Get role info for agent name
  const effectiveRoleId = role_id || targetMessage.role_id;
  let roleName: string | null = null;
  
  if (effectiveRoleId) {
    const { data: role } = await supabase
      .from('chat_roles')
      .select('name')
      .eq('id', effectiveRoleId)
      .single();
    roleName = role?.name || null;
  }

  // Get history before the deleted message
  const { data: history } = await supabase
    .from('department_chat_messages')
    .select('message_role, content')
    .eq('chat_id', chatId)
    .lt('created_at', targetMessage.created_at)
    .order('created_at', { ascending: true });

  const messages = (history || []).map((m: any) => ({
    role: m.message_role,
    content: m.content
  }));

  // Get attachments from user message if any
  const attachments = userMessage.metadata?.attachments || [];

  // Call chat-stream function
  const chatStreamUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/chat-stream`;
  
  const chatRequest = {
    message: userMessage.content,
    role_id: effectiveRoleId,
    department_id: departmentId,
    message_history: messages,
    is_department_chat: true,
    attachments: attachments.map((a: any) => ({
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
    return new Response(JSON.stringify({ error: 'Failed to regenerate response' }), {
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
                // Save new assistant message
                await supabase
                  .from('department_chat_messages')
                  .insert({
                    chat_id: chatId,
                    user_id: userId,
                    role_id: effectiveRoleId,
                    message_role: 'assistant',
                    content: fullResponse,
                    source: 'bitrix',
                    metadata: {
                      ...metadata,
                      agent_name: roleName,
                    }
                  });

                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              } else {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.content) {
                    fullResponse += parsed.content;
                  }
                  // Capture metadata chunk OR individual metadata fields
                  if (parsed.type === 'metadata' || 
                      parsed.citations || 
                      parsed.response_time_ms || 
                      parsed.rag_context || 
                      parsed.web_search_citations) {
                    const { type, content, ...metaFields } = parsed;
                    metadata = { ...metadata, ...metaFields };
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
        console.error('Regenerate stream error:', error);
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

// ============ DOCUMENT ACCESS HANDLERS ============

// Search documents by name (for Bitrix context - bypasses RLS)
async function handleDocumentSearch(url: URL, supabase: any): Promise<Response> {
  const name = url.searchParams.get('name');
  
  if (!name) {
    return new Response(JSON.stringify({ error: 'Missing name parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Extract base name for search
    const baseName = name
      .replace(/\s*\(часть.*$/, '')
      .replace(/\s*\(стр\..*$/, '')
      .trim();

    // Search for documents matching the name
    // Note: Values with special characters (spaces, Cyrillic) must be quoted for PostgREST
    const { data: docs, error } = await supabase
      .from('documents')
      .select('id, storage_path, name, file_name')
      .or(`name.eq."${name}",name.ilike."%${baseName}%",file_name.ilike."%${baseName}%"`)
      .eq('status', 'ready')
      .limit(10);

    if (error) {
      console.error('Document search error:', error);
      throw error;
    }

    return new Response(JSON.stringify({ documents: docs || [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('handleDocumentSearch error:', error);
    return new Response(JSON.stringify({ error: 'Failed to search documents' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// Get signed URL for document (for Bitrix context - bypasses RLS)
async function handleDocumentSignedUrl(req: Request, supabase: any): Promise<Response> {
  let body: { storage_path?: string };
  
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { storage_path } = body;
  
  if (!storage_path) {
    return new Response(JSON.stringify({ error: 'Missing storage_path in request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Create signed URL using service role (bypasses RLS)
    const { data, error } = await supabase.storage
      .from('rag-documents')
      .createSignedUrl(storage_path, 3600); // 1 hour expiry

    if (error) {
      console.error('Signed URL error:', error);
      throw error;
    }

    return new Response(JSON.stringify({ signed_url: data?.signedUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('handleDocumentSignedUrl error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate signed URL' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
