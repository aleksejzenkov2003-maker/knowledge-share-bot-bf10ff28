import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type WorkflowMeta = {
  project_id: string;
  workflow_id: string;
  step_id: string;
  template_id?: string;
  template_step_id?: string | null;
  step_order?: number;
};

type SearchResult = {
  url: string;
  title?: string;
  source?: string;
  marketplace?: "wb" | "ozon" | "yandex_market" | "site" | "other";
};

function normalizeUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function guessMarketplace(url: string): SearchResult["marketplace"] {
  const u = url.toLowerCase();
  if (u.includes("wildberries.") || u.includes("wb.ru")) return "wb";
  if (u.includes("ozon.")) return "ozon";
  if (u.includes("market.yandex.") || u.includes("yandex.ru/market")) return "yandex_market";
  if (u.startsWith("http")) return "site";
  return "other";
}

async function perplexitySearchLinks(args: {
  apiKey: string;
  trademark: string;
  goodsServices?: string;
  maxLinks: number;
}): Promise<{ results: SearchResult[]; citations: string[]; raw: string }> {
  const { apiKey, trademark, goodsServices, maxLinks } = args;

  const system =
    "Ты — поисковый ассистент. Верни только JSON без пояснений. " +
    "Нужно собрать ссылки на сайты и маркетплейсы (Wildberries, Ozon, Яндекс Маркет) " +
    "где может встречаться указанный товарный знак или сходные обозначения.";

  const user =
    `Товарный знак: "${trademark}".\n` +
    (goodsServices ? `Товары/услуги: ${goodsServices}\n` : "") +
    `Собери до ${maxLinks} ссылок.\n` +
    `Формат ответа строго JSON:\n` +
    `{\n` +
    `  "results": [\n` +
    `    { "url": "https://...", "title": "опционально", "source": "опционально" }\n` +
    `  ]\n` +
    `}\n` +
    `Важно: включи ссылки на Wildberries/Ozon/Яндекс Маркет, если найдёшь.`;

  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Perplexity error [${resp.status}]: ${text}`);
  }
  const data = JSON.parse(text);
  const content: string = data.choices?.[0]?.message?.content || "";
  const citations: string[] = Array.isArray(data.citations) ? data.citations : [];

  let parsed: { results?: SearchResult[] } | null = null;
  try {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {
    parsed = null;
  }

  const rawResults = Array.isArray(parsed?.results) ? parsed!.results : [];
  const normalized: SearchResult[] = rawResults
    .map((r) => {
      const url = normalizeUrl(String(r.url || ""));
      if (!url) return null;
      return {
        url,
        title: r.title ? String(r.title) : undefined,
        source: r.source ? String(r.source) : undefined,
        marketplace: guessMarketplace(url),
      } as SearchResult;
    })
    .filter(Boolean) as SearchResult[];

  // If perplexity returned nothing structured, fallback to citations
  if (normalized.length === 0 && citations.length > 0) {
    for (const c of citations) {
      const url = normalizeUrl(String(c));
      if (!url) continue;
      normalized.push({ url, marketplace: guessMarketplace(url) });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of normalized) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
    if (out.length >= maxLinks) break;
  }

  return { results: out, citations, raw: content };
}

async function fetchScreenshotPng(args: {
  url: string;
}): Promise<{ bytes: Uint8Array; provider: string }> {
  // Provider 1: screenshotone (recommended)
  const screenshotOneKey = Deno.env.get("SCREENSHOTONE_API_KEY");
  if (screenshotOneKey) {
    const api = new URL("https://api.screenshotone.com/take");
    api.searchParams.set("access_key", screenshotOneKey);
    api.searchParams.set("url", args.url);
    api.searchParams.set("format", "png");
    api.searchParams.set("viewport_width", "1280");
    api.searchParams.set("viewport_height", "720");
    api.searchParams.set("device_scale_factor", "1");
    api.searchParams.set("cache", "false");
    api.searchParams.set("block_ads", "true");
    api.searchParams.set("block_cookie_banners", "true");
    api.searchParams.set("full_page", "true");

    const r = await fetch(api.toString());
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`ScreenshotOne error [${r.status}]: ${t}`);
    }
    const ab = await r.arrayBuffer();
    return { bytes: new Uint8Array(ab), provider: "screenshotone" };
  }

  throw new Error(
    "No screenshot provider configured. Set SCREENSHOTONE_API_KEY in Edge Function env."
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate JWT via claims (does not require a live session on the server)
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    let user: { id: string; email?: string };
    if (claimsError || !claimsData?.claims?.sub) {
      const { data: { user: fallbackUser }, error: fallbackErr } = await supabaseAuth.auth.getUser();
      if (fallbackErr || !fallbackUser) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = fallbackUser;
    } else {
      user = { id: claimsData.claims.sub as string, email: (claimsData.claims.email as string) || "" };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const meta = (body.__workflow || null) as WorkflowMeta | null;

    const trademark = String(body.trademark || body.designation || body.name || "");
    const goodsServices = body.goods_services ? String(body.goods_services) : undefined;
    const maxLinks = Number(body.max_links || 12);
    const takeScreenshots = body.take_screenshots !== false;

    if (!meta?.project_id || !meta.workflow_id || !meta.step_id) {
      throw new Error("__workflow meta is required (project_id, workflow_id, step_id)");
    }
    if (!trademark.trim()) {
      throw new Error("trademark/designation is required");
    }

    // Membership check
    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", meta.project_id)
      .eq("user_id", user.id)
      .single();
    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a project member" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pplxKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!pplxKey) throw new Error("PERPLEXITY_API_KEY is not configured");

    const search = await perplexitySearchLinks({
      apiKey: pplxKey,
      trademark,
      goodsServices,
      maxLinks: Math.min(Math.max(maxLinks, 1), 30),
    });

    const resultsWithShots: Array<SearchResult & { screenshot?: { bucket: string; path: string } }> = [];
    const createdArtifacts: Array<{ bucket: string; path: string; url: string }> = [];

    for (let i = 0; i < search.results.length; i++) {
      const r = search.results[i];
      const item: SearchResult & { screenshot?: { bucket: string; path: string } } = { ...r };

      if (takeScreenshots) {
        const shot = await fetchScreenshotPng({ url: r.url });
        const ext = "png";
        const fileName = `spy_${String(i + 1).padStart(2, "0")}.${ext}`;
        const path = `${meta.project_id}/${meta.workflow_id}/${meta.step_id}/${fileName}`;

        const { error: upErr } = await supabase.storage
          .from("node-artifacts")
          .upload(path, shot.bytes, { contentType: "image/png", upsert: true });
        if (upErr) throw upErr;

        // Register artifact
        await supabase.from("workflow_artifacts").insert({
          project_id: meta.project_id,
          workflow_run_id: meta.workflow_id,
          project_workflow_step_id: meta.step_id,
          artifact_type: "screenshot",
          bucket: "node-artifacts",
          path,
          mime: "image/png",
          metadata: {
            url: r.url,
            title: r.title,
            source: r.source,
            marketplace: r.marketplace,
            provider: shot.provider,
          },
        });

        item.screenshot = { bucket: "node-artifacts", path };
        createdArtifacts.push({ bucket: "node-artifacts", path, url: r.url });
      }

      resultsWithShots.push(item);
    }

    const output = {
      trademark,
      results: resultsWithShots,
      citations: search.citations,
      artifacts: createdArtifacts,
      notes:
        takeScreenshots
          ? "Скриншоты сохранены в node-artifacts и зарегистрированы в workflow_artifacts."
          : "Скриншоты отключены (take_screenshots=false).",
    };

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

