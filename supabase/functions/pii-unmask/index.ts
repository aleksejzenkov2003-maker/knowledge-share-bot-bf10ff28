import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptAES256 } from "../_shared/pii-crypto.ts";
import { extractPiiTokens } from "../_shared/pii-patterns.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PiiUnmaskRequest {
  text: string;
  source_id: string;
  audit_action?: 'view' | 'export' | 'copy';
}

interface PiiUnmaskResponse {
  original_text: string;
  tokens_restored: number;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PII_KEY = Deno.env.get('PII_ENCRYPTION_KEY');
    if (!PII_KEY) {
      throw new Error('PII_ENCRYPTION_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has permission to unmask PII
    const { data: roleData } = await supabase
      .rpc('get_user_role', { uid: user.id });

    if (roleData !== 'admin' && roleData !== 'moderator') {
      console.log(`User ${user.id} (role: ${roleData}) denied PII unmask access`);
      return new Response(
        JSON.stringify({ error: 'PERMISSION_DENIED', message: 'Only admins and moderators can view PII' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: PiiUnmaskRequest = await req.json();
    const { text, source_id, audit_action = 'view' } = body;

    if (!text || !source_id) {
      return new Response(
        JSON.stringify({ error: 'text and source_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract tokens from text
    const tokens = extractPiiTokens(text);
    
    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ original_text: text, tokens_restored: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch mappings from database
    const { data: mappings, error: fetchError } = await supabase
      .from('pii_mappings')
      .select('*')
      .eq('source_id', source_id)
      .in('token', tokens);

    if (fetchError) {
      console.error('Error fetching PII mappings:', fetchError);
      throw new Error('Failed to fetch PII mappings');
    }

    // Decrypt and replace tokens
    let restoredText = text;
    let tokensRestored = 0;

    // Get user IP for audit
    const userIp = req.headers.get('x-forwarded-for') || 
                   req.headers.get('x-real-ip') || 
                   'unknown';

    for (const mapping of mappings || []) {
      try {
        const decrypted = await decryptAES256(
          mapping.encrypted_value,
          mapping.encryption_iv,
          PII_KEY
        );

        restoredText = restoredText.replace(mapping.token, decrypted);
        tokensRestored++;

        // Log access to audit
        await supabase.from('pii_audit_log').insert({
          user_id: user.id,
          user_email: user.email,
          user_ip: userIp,
          mapping_id: mapping.id,
          token: mapping.token,
          pii_type: mapping.pii_type,
          action: audit_action,
          source_type: mapping.source_type,
          source_id: mapping.source_id,
        });

      } catch (decryptError) {
        console.error(`Error decrypting token ${mapping.token}:`, decryptError);
      }
    }

    console.log(`Unmasked ${tokensRestored} PII tokens for user ${user.id}`);

    return new Response(
      JSON.stringify({
        original_text: restoredText,
        tokens_restored: tokensRestored,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('PII unmask error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
