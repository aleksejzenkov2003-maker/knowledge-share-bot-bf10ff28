#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = new Map();
for (const rawArg of process.argv.slice(2)) {
  const [key, value] = rawArg.split("=");
  if (key?.startsWith("--")) {
    args.set(key.slice(2), value ?? "true");
  }
}

const ROOT_DIR = args.get("root") ?? process.env.FIPS_FILES_DIR ?? "/var/www/fips-parser/files";
const LIMIT = Number(args.get("limit") ?? process.env.IMPORT_LIMIT ?? "0");
const BATCH_SIZE = Number(args.get("batch") ?? process.env.IMPORT_BATCH ?? "200");
const DRY_RUN = args.get("dry-run") === "true";

// Incremental mode:
//   --since=2026-04-20            — only files with mtime >= this date
//   --mtime-days=1                — only files modified in last N days (e.g. for daily cron)
//   --year=2026                   — limit walk to a specific year directory
const SINCE_RAW = args.get("since") ?? process.env.IMPORT_SINCE ?? null;
const MTIME_DAYS = Number(args.get("mtime-days") ?? process.env.IMPORT_MTIME_DAYS ?? "0");
const YEAR_FILTER = args.get("year") ?? process.env.IMPORT_YEAR ?? null;

let SINCE_TS = null;
if (SINCE_RAW) {
  const parsed = new Date(SINCE_RAW).getTime();
  if (!Number.isNaN(parsed)) SINCE_TS = parsed;
}
if (!SINCE_TS && MTIME_DAYS > 0) {
  SINCE_TS = Date.now() - MTIME_DAYS * 24 * 60 * 60 * 1000;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const decoderWin1251 = new TextDecoder("windows-1251");
const decoderUtf8 = new TextDecoder("utf-8");

const normalizeWhitespace = (text) => text.replace(/\s+/g, " ").trim();

const htmlToPlainText = (html) => {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const noTags = noScript.replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(
    noTags
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&"),
  );
};

const extractFirst = (text, regexes) => {
  for (const pattern of regexes) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeWhitespace(match[1]);
  }
  return null;
};

const parseDate = (value) => {
  if (!value) return null;
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const extractInn = (text) => {
  const match = text.match(/\bИНН[:\s]*([0-9]{10,12})\b/i);
  return match?.[1] ?? null;
};

const extractOgrn = (text) => {
  const match = text.match(/\bОГРН[:\s]*([0-9]{13,15})\b/i);
  return match?.[1] ?? null;
};

const parseRecord = ({ html, filePath, year, sectionCode, fileName }) => {
  const plain = htmlToPlainText(html);
  const applicationNumber = extractFirst(plain, [
    /\(210\)\s*Номер заявки:\s*([0-9]{8,15})/i,
    /\(210\)\s*([0-9]{8,15})/i,
  ]);

  const registrationNumber = extractFirst(plain, [/\(111\)\s*Номер регистрации:\s*([0-9]{4,15})/i]);
  const title = extractFirst(plain, [
    /Товарные знаки, знаки обслуживания[^.]{0,300}/i,
    /Наименования мест происхождения товаров[^.]{0,300}/i,
  ]);
  const applicantName = extractFirst(plain, [
    /\(731\)\s*Заявитель:\s*(.*?)(?:\(\d{3}\)|$)/i,
    /\(732\)\s*Правообладатель:\s*(.*?)(?:\(\d{3}\)|$)/i,
  ]);
  const applicantAddress = extractFirst(plain, [
    /\(750\)\s*Адрес для переписки:\s*(.*?)(?:\(\d{3}\)|$)/i,
  ]);
  const submittedDateRaw = extractFirst(plain, [
    /\(200\)\s*Дата поступления заявки:\s*(\d{2}\.\d{2}\.\d{4})/i,
    /\(220\)\s*Дата подачи заявки:\s*(\d{2}\.\d{2}\.\d{4})/i,
  ]);

  const imageMatch = html.match(/<img[^>]+class="mini"[^>]+src="([^"]+)"/i) || html.match(/<img[^>]+src="([^"]+)"/i);
  const hrefMatch = html.match(/<a[^>]+title="Ссылка на реестр[^"]*"[^>]+href="([^"]+)"/i) || html.match(/<a[^>]+href="([^"]+)"/i);

  return {
    application_number: applicationNumber,
    registration_number: registrationNumber,
    title,
    applicant_name: applicantName,
    applicant_inn: extractInn(plain),
    applicant_ogrn: extractOgrn(plain),
    applicant_address: applicantAddress,
    file_name: fileName,
    file_path: filePath,
    source_url: hrefMatch?.[1] ?? null,
    year,
    section_code: sectionCode,
    status: "active",
    submitted_at: parseDate(submittedDateRaw),
    thumbnail_url: imageMatch?.[1] ?? null,
    parsed_data: {
      submitted_date_raw: submittedDateRaw,
      raw_preview: plain.slice(0, 2500),
    },
  };
};

const walkHtmlFiles = async (rootDir) => {
  const out = [];
  const years = await fs.readdir(rootDir, { withFileTypes: true });

  for (const yearDir of years) {
    if (!yearDir.isDirectory() || !/^\d{4}$/.test(yearDir.name)) continue;
    if (YEAR_FILTER && yearDir.name !== String(YEAR_FILTER)) continue;
    const year = Number(yearDir.name);
    const yearPath = path.join(rootDir, yearDir.name);
    const sections = await fs.readdir(yearPath, { withFileTypes: true });

    for (const sectionDir of sections) {
      if (!sectionDir.isDirectory()) continue;
      const sectionCode = sectionDir.name;
      const sectionPath = path.join(yearPath, sectionCode);
      const files = await fs.readdir(sectionPath, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile() || !file.name.toLowerCase().endsWith(".html")) continue;
        const absPath = path.join(sectionPath, file.name);

        if (SINCE_TS) {
          try {
            const stat = await fs.stat(absPath);
            if (stat.mtimeMs < SINCE_TS) continue;
          } catch {
            continue;
          }
        }

        out.push({
          absPath,
          relPath: path.posix.join(yearDir.name, sectionCode, file.name),
          year,
          sectionCode,
          fileName: file.name,
        });
        if (LIMIT > 0 && out.length >= LIMIT) return out;
      }
    }
  }

  return out;
};

const decodeHtml = (buffer) => {
  const utf8 = decoderUtf8.decode(buffer);
  if (/charset\s*=\s*windows-1251/i.test(utf8) || utf8.includes("����")) {
    return decoderWin1251.decode(buffer);
  }
  return utf8;
};

const main = async () => {
  console.log(`Scanning: ${ROOT_DIR}`);
  if (SINCE_TS) {
    console.log(`Incremental mode: only files modified since ${new Date(SINCE_TS).toISOString()}`);
  }
  if (YEAR_FILTER) {
    console.log(`Year filter: ${YEAR_FILTER}`);
  }
  const files = await walkHtmlFiles(ROOT_DIR);
  console.log(`Found HTML files: ${files.length}`);

  let parsed = 0;
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    if (DRY_RUN) {
      inserted += batch.length;
      batch.length = 0;
      return;
    }

    const { error } = await supabase
      .from("fips_applications")
      .upsert(batch, { onConflict: "file_path", ignoreDuplicates: false });
    if (error) throw error;
    inserted += batch.length;
    batch.length = 0;
  };

  for (const file of files) {
    try {
      const raw = await fs.readFile(file.absPath);
      const html = decodeHtml(raw);
      const record = parseRecord({
        html,
        filePath: file.relPath,
        year: file.year,
        sectionCode: file.sectionCode,
        fileName: file.fileName,
      });

      if (!record.application_number) {
        skipped += 1;
        continue;
      }

      batch.push(record);
      parsed += 1;
      if (batch.length >= BATCH_SIZE) await flush();
    } catch (error) {
      failed += 1;
      console.error(`Failed to parse ${file.relPath}:`, error.message);
    }
  }

  await flush();

  console.log("Import done:");
  console.log(`- parsed: ${parsed}`);
  console.log(`- inserted/updated: ${inserted}`);
  console.log(`- skipped: ${skipped}`);
  console.log(`- failed: ${failed}`);
  if (DRY_RUN) console.log("Dry run mode enabled, DB not changed.");
};

main().catch((error) => {
  console.error("Fatal import error:", error);
  process.exit(1);
});
