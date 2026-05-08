// Backfills empty FIPS applications by fetching fresh HTML from fips.ru.
// Designed to be called repeatedly from the UI in batches (50 rows by default).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const cleanText = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&#13;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

const grabBib = (html: string, code: string): string | null => {
  // <p class="bib"> ... (CODE) <i>label</i> ... <b>VALUE</b> ... </p>
  const re = new RegExp(`<p class="bib"[^>]*>([\\s\\S]*?)</p>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (!m[1].includes(`(${code})`)) continue;
    const bm = m[1].match(/<b>([\s\S]*?)<\/b>/);
    if (bm) {
      const v = cleanText(bm[1]);
      if (v) return v;
    }
  }
  return null;
};

const grabImage = (html: string): string | null => {
  // (540) image block
  const sec = html.match(/\(540\)[\s\S]{0,3000}/);
  if (!sec) return null;
  const im = sec[0].match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!im) return null;
  let u = im[1];
  if (u.startsWith("/")) u = "https://fips.ru" + u;
  return u;
};

const parseDmy = (s: string | null): string | null => {
  if (!s) return null;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const fetchFips = async (num: string): Promise<string | null> => {
  const url = `https://fips.ru/registers-doc-view/fips_servlet?DB=RUTMAP&DocNumber=${num}&TypeFile=html`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
          Accept: "text/html",
          "Accept-Encoding": "identity",
        },
        redirect: "follow",
      });
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      const html = new TextDecoder("windows-1251").decode(buf);
      if (html.length < 500 || html.includes("Документ не найден")) return null;
      return html;
    } catch {
      // retry
    }
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: any signed-in user (admin app)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);
  const token = authHeader.replace("Bearer ", "");
  if (token !== serviceKey) {
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);
    const year = body.year ? Number(body.year) : null;

    // Skip rows we already tried in the last 3 days (no point hammering empty ones)
    const cutoff = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    let q = sb
      .from("fips_applications")
      .select("id, application_number, parsed_data, thumbnail_url, submitted_at")
      .is("applicant_name", null)
      .or(`parsed_data->>refresh_attempted_at.is.null,parsed_data->>refresh_attempted_at.lt.${cutoff}`)
      .order("application_number", { ascending: false })
      .limit(limit);
    if (year) q = q.eq("year", year);

    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, updated: 0, remaining: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    let stillEmpty = 0;

    for (const row of rows) {
      const num = row.application_number;
      if (!num) continue;
      const html = await fetchFips(num);
      if (!html) {
        stillEmpty++;
        continue;
      }

      const applicantRaw = grabBib(html, "731") || grabBib(html, "732");
      const addr = grabBib(html, "750");
      const classes = grabBib(html, "511");
      const color = grabBib(html, "591");
      const unprot = grabBib(html, "526");
      const submittedRaw = grabBib(html, "200") || grabBib(html, "220");
      const thumb = grabImage(html);

      // Split applicant "NAME, ADDRESS (CC)" → name (no address)
      let applicantName: string | null = applicantRaw;
      let applicantAddress: string | null = addr;
      if (applicantRaw) {
        const idx = applicantRaw.search(/, \d{6},/); // first ZIP
        if (idx > 0) {
          applicantName = applicantRaw.slice(0, idx).trim();
          if (!applicantAddress) {
            applicantAddress = applicantRaw.slice(idx + 2).replace(/\s*\([A-Z]{2}\)\s*$/, "").trim();
          }
        }
      }

      const nowIso = new Date().toISOString();
      const newParsed = {
        ...(row.parsed_data || {}),
        applicant_raw: applicantRaw,
        correspondence_address_raw: addr,
        classes_raw: classes,
        color_specification_raw: color,
        unprotected_elements_raw: unprot,
        submitted_date_raw: submittedRaw,
        refreshed_at: nowIso,
        refresh_attempted_at: nowIso,
      };

      const patch: Record<string, unknown> = { parsed_data: newParsed };
      if (applicantName) patch.applicant_name = applicantName;
      if (applicantAddress) patch.applicant_address = applicantAddress;
      if (thumb && !row.thumbnail_url) patch.thumbnail_url = thumb;
      const submittedAt = parseDmy(submittedRaw);
      if (submittedAt) patch.submitted_at = submittedAt;

      const { error: upErr } = await sb
        .from("fips_applications")
        .update(patch)
        .eq("id", row.id);
      if (upErr) {
        console.error("update failed", row.id, upErr.message);
        stillEmpty++;
      } else if (applicantName) {
        updated++;
      } else {
        stillEmpty++;
      }
    }

    // Remaining count
    let remQuery = sb
      .from("fips_applications")
      .select("id", { count: "exact", head: true })
      .is("applicant_name", null);
    if (year) remQuery = remQuery.eq("year", year);
    const { count: remaining } = await remQuery;

    return new Response(
      JSON.stringify({ success: true, processed: rows.length, updated, still_empty: stillEmpty, remaining: remaining ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
