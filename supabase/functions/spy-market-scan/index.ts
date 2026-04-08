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

type SearchResultWithScreenshot = SearchResult & {
  screenshot?: { bucket: string; path: string };
  screenshot_error?: string;
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
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

  if (normalized.length === 0 && citations.length > 0) {
    for (const c of citations) {
      const url = normalizeUrl(String(c));
      if (!url) continue;
      normalized.push({ url, marketplace: guessMarketplace(url) });
    }
  }

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
  timeoutMs: number;
  fullPage: boolean;
}): Promise<{ bytes: Uint8Array; provider: string }> {
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
    api.searchParams.set("full_page", args.fullPage ? "true" : "false");

    const startedAt = Date.now();
    const r = await fetchWithTimeout(api.toString(), {}, args.timeoutMs);
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`ScreenshotOne error [${r.status}]: ${t}`);
    }
    const ab = await r.arrayBuffer();
    console.log(`Screenshot captured in ${Date.now() - startedAt}ms for ${args.url}`);
    return { bytes: new Uint8Array(ab), provider: "screenshotone" };
  }

  throw new Error(
    "No screenshot provider configured. Set SCREENSHOTONE_API_KEY in Edge Function env.",
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

    let trademark = String(body.trademark || body.designation || body.name || "");
    const goodsServices = body.goods_services ? String(body.goods_services) : undefined;
    const requestedMaxLinks = Number(body.max_links || 12);
    const maxLinks = Math.min(Math.max(requestedMaxLinks, 1), 30);
    const takeScreenshots = body.take_screenshots !== false;
    const maxScreenshots = takeScreenshots
      ? Math.min(Math.max(Number(body.max_screenshots || 4), 0), 8)
      : 0;
    const screenshotTimeoutMs = Math.min(
      Math.max(Number(body.screenshot_timeout_ms || 25000), 5000),
      45000,
    );
    const screenshotConcurrency = Math.min(
      Math.max(Number(body.screenshot_concurrency || 3), 1),
      4,
    );
    const screenshotFullPage = body.screenshot_full_page === true;

    if (!trademark.trim() && body.content && typeof body.content === "string") {
      const content = body.content as string;
      const patterns = [
        /(?:товарн\w+\s+знак\w*|ТЗ|обозначени\w+)\s+[«"«]([^»"»]+)[»"»]/i,
        /[«"«]([^»"»]{2,40})[»"»]/,
      ];
      for (const p of patterns) {
        const m = content.match(p);
        if (m?.[1]) {
          trademark = m[1].trim();
          console.log(`Extracted trademark from content: "${trademark}"`);
          break;
        }
      }
    }

    if (!meta?.project_id || !meta.workflow_id || !meta.step_id) {
      throw new Error("__workflow meta is required (project_id, workflow_id, step_id)");
    }
    if (!trademark.trim()) {
      throw new Error("trademark/designation is required");
    }

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

    console.log(`Starting spy scan for \"${trademark}\" with up to ${maxLinks} links`);
    const search = await perplexitySearchLinks({
      apiKey: pplxKey,
      trademark,
      goodsServices,
      maxLinks,
    });
    console.log(`Found ${search.results.length} links for \"${trademark}\"`);

    const resultsWithShots: SearchResultWithScreenshot[] = search.results.map((r) => ({ ...r }));

    if (takeScreenshots && maxScreenshots > 0 && resultsWithShots.length > 0) {
      const screenshotTargets = resultsWithShots.slice(0, maxScreenshots);
      console.log(
        `Capturing screenshots for ${screenshotTargets.length} links with concurrency=${screenshotConcurrency}, timeout=${screenshotTimeoutMs}ms`,
      );

      await mapWithConcurrency(screenshotTargets, screenshotConcurrency, async (item, index) => {
        try {
          const shot = await fetchScreenshotPng({
            url: item.url,
            timeoutMs: screenshotTimeoutMs,
            fullPage: screenshotFullPage,
          });
          const ext = "png";
          const fileName = `spy_${String(index + 1).padStart(2, "0")}.${ext}`;
          const path = `${meta.project_id}/${meta.workflow_id}/${meta.step_id}/${fileName}`;

          const { error: upErr } = await supabase.storage
            .from("node-artifacts")
            .upload(path, shot.bytes, { contentType: "image/png", upsert: true });
          if (upErr) throw upErr;

          await supabase.from("workflow_artifacts").insert({
            project_id: meta.project_id,
            workflow_run_id: meta.workflow_id,
            project_workflow_step_id: meta.step_id,
            artifact_type: "screenshot",
            bucket: "node-artifacts",
            path,
            mime: "image/png",
            metadata: {
              url: item.url,
              title: item.title,
              source: item.source,
              marketplace: item.marketplace,
              provider: shot.provider,
            },
          });

          item.screenshot = { bucket: "node-artifacts", path };
        } catch (error) {
          item.screenshot_error = error instanceof Error ? error.message : "Failed to capture screenshot";
          console.warn(`Skipping screenshot for ${item.url}: ${item.screenshot_error}`);
        }
      });
    }

    const createdArtifacts = resultsWithShots.flatMap((item) =>
      item.screenshot ? [{ bucket: item.screenshot.bucket, path: item.screenshot.path, url: item.url }] : []
    );

    const output = {
      trademark,
      results: resultsWithShots,
      citations: search.citations,
      artifacts: createdArtifacts,
      notes: takeScreenshots
        ? `Скриншоты сохранены для ${createdArtifacts.length} из ${Math.min(resultsWithShots.length, maxScreenshots)} ссылок. Остальные ссылки оставлены без скриншотов для ускорения шага.`
        : "Скриншоты отключены (take_screenshots=false).",
      screenshot_settings: takeScreenshots
        ? {
            max_screenshots: maxScreenshots,
            screenshot_timeout_ms: screenshotTimeoutMs,
            screenshot_concurrency: screenshotConcurrency,
            full_page: screenshotFullPage,
          }
        : undefined,
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
