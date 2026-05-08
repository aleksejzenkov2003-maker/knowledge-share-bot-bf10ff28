import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getActivePatterns, PiiPatternConfig } from "../_shared/pii-patterns.ts";
import { encryptAES256 } from "../_shared/pii-crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PiiMaskRequest {
  text: string;
  source_type: 'chat_message' | 'document_chunk' | 'attachment' | 'document';
  source_id: string;
  session_id?: string;
  user_id?: string;
  preview_mode?: boolean; // If true, don't save mappings to DB
}

interface PiiMapping {
  token: string;
  pii_type: string;
  encrypted_value: string;
  encryption_iv: string;
  source_type: string;
  source_id: string;
  session_id?: string;
  created_by?: string;
}

interface MaskResult {
  masked_text: string;
  tokens_count: number;
  pii_types_found: string[];
  mapping_ids: string[];
  highlights?: Array<{
    original: string;
    token: string;
    type: string;
    start: number;
    end: number;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check — validate JWT, not just header presence
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  {
    const token = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (token !== serviceRoleKey) {
      const sbAuth = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);
      const { data: { user } } = await sbAuth.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
  }

  try {
    const PII_KEY = Deno.env.get('PII_ENCRYPTION_KEY');
    if (!PII_KEY) {
      throw new Error('PII_ENCRYPTION_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: PiiMaskRequest = await req.json();
    const { text, source_type, source_id, session_id, user_id, preview_mode } = body;

    if (!text || !source_type || !source_id) {
      return new Response(
        JSON.stringify({ error: 'text, source_type, and source_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await maskPii(text, {
      source_type,
      source_id,
      session_id,
      user_id,
      pii_key: PII_KEY,
      supabase,
      preview_mode: preview_mode || false,
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('PII mask error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

interface MaskContext {
  source_type: string;
  source_id: string;
  session_id?: string;
  user_id?: string;
  pii_key: string;
  supabase: any;
  preview_mode: boolean;
}

async function maskPii(text: string, context: MaskContext): Promise<MaskResult> {
  const patterns = getActivePatterns();
  const mappings: PiiMapping[] = [];
  const tokenCounters: Record<string, number> = {};
  let maskedText = text;
  
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

        // Encrypt the original value
        const { encrypted, iv } = await encryptAES256(originalValue, context.pii_key);

        mappings.push({
          token,
          pii_type: pattern.type,
          encrypted_value: encrypted,
          encryption_iv: iv,
          source_type: context.source_type,
          source_id: context.source_id,
          session_id: context.session_id,
          created_by: context.user_id,
        });

        // Replace in text
        maskedText = maskedText.substring(0, index) + token + maskedText.substring(index + originalValue.length);
        
        // Track masked range
        maskedRanges.push({ start: index, end: index + token.length });
      }
    }
  }

  // Save mappings to database only if NOT in preview mode
  const mappingIds: string[] = [];
  if (mappings.length > 0 && !context.preview_mode) {
    const { data, error } = await context.supabase
      .from('pii_mappings')
      .insert(mappings.map(m => ({
        token: m.token,
        pii_type: m.pii_type,
        encrypted_value: m.encrypted_value,
        encryption_iv: m.encryption_iv,
        source_type: m.source_type,
        source_id: m.source_id,
        session_id: m.session_id,
        created_by: m.created_by,
      })))
      .select('id');

    if (error) {
      console.error('Error saving PII mappings:', error);
    } else if (data) {
      mappingIds.push(...data.map((d: any) => d.id));
    }
  }

  const piiTypesFound = [...new Set(mappings.map(m => m.pii_type))];
  
  const mode = context.preview_mode ? 'preview' : 'production';
  console.log(`[${mode}] Masked ${mappings.length} PII tokens. Types: ${piiTypesFound.join(', ')}`);

  return {
    masked_text: maskedText,
    tokens_count: mappings.length,
    pii_types_found: piiTypesFound,
    mapping_ids: mappingIds,
  };
}
