import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function cleanMarkdownNoise(input: string): string {
  return input
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/([а-яa-z0-9])-\n([а-яa-z0-9])/gi, "$1$2")
    .replace(/(\S)\n(\S)/g, (m, a, b) => {
      const endPunct = /[.!?:;)]/;
      const startUpper = /^[A-ZА-ЯЁ0-9#-]/;
      if (endPunct.test(a) || startUpper.test(b)) return `${a}\n${b}`;
      return `${a} ${b}`;
    })
    .trim();
}

function buildMarkdownFromChunks(
  chunks: Array<{ section_title: string | null; content: string; chunk_index: number }>,
): string {
  const sorted = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index);
  let lastTitle = "";
  const out: string[] = [];
  for (const ch of sorted) {
    const title = (ch.section_title || "").trim();
    if (title && title !== lastTitle) {
      out.push(`## ${title}`);
      lastTitle = title;
    }
    out.push(ch.content.trim());
  }
  return out.join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    let user: { id: string } | null = null;
    if (claimsError || !claimsData?.claims?.sub) {
      const { data, error } = await supabaseAuth.auth.getUser();
      if (error || !data?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: jsonHeaders,
        });
      }
      user = { id: data.user.id };
    } else {
      user = { id: claimsData.claims.sub as string };
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const documentId = String(body?.document_id || "");
    const projectId = body?.project_id ? String(body.project_id) : null;
    const forceReprocess = body?.force_reprocess === true;

    if (!documentId) {
      return new Response(JSON.stringify({ error: "document_id is required" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, name, status")
      .eq("id", documentId)
      .single();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    if (forceReprocess || doc.status !== "ready") {
      const processResp = await fetch(`${supabaseUrl}/functions/v1/process-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ document_id: documentId }),
      });
      if (!processResp.ok) {
        const txt = await processResp.text();
        return new Response(JSON.stringify({ error: `process-document failed: ${txt}` }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
    }

    const { data: chunks, error: chErr } = await supabase
      .from("document_chunks")
      .select("section_title, content, chunk_index")
      .eq("document_id", documentId)
      .order("chunk_index", { ascending: true });

    if (chErr || !chunks || chunks.length === 0) {
      return new Response(JSON.stringify({ error: "No chunks found for document" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    const mergedMarkdown = buildMarkdownFromChunks(
      chunks as Array<{ section_title: string | null; content: string; chunk_index: number }>,
    );
    const cleanedMarkdown = cleanMarkdownNoise(mergedMarkdown);

    if (projectId) {
      const { data: membership } = await supabase
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membership) {
        await supabase.from("project_memory").insert({
          project_id: projectId,
          memory_type: "document_markdown",
          content: cleanedMarkdown.slice(0, 100000),
          is_active: true,
          created_by: user.id,
        } as never);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        document_id: documentId,
        chunks_count: chunks.length,
        markdown: cleanedMarkdown,
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});

