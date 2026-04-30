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

const extractTrademarkImage = (html) => {
  // Prefer trademark image from the FIPS image storage.
  const directTmImage =
    html.match(/src="(https?:\/\/fips\.ru\/Image\/RUTMAP_Images\/[^"]+)"/i) ||
    html.match(/src="(https?:\/\/fips\.ru\/Image\/[^"]+)"/i);
  if (directTmImage?.[1]) return directTmImage[1];

  // Fallback: look for mini image but skip state logo.
  const mini = html.match(/<img[^>]+class="mini"[^>]+src="([^"]+)"/i);
  if (mini?.[1] && !mini[1].includes("RFP_LOGO.gif")) return mini[1];

  return null;
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
  const publicationDateRaw = extractFirst(plain, [/\(441\)\s*Опубликовано:\s*(\d{2}\.\d{2}\.\d{4})/i]);
  const correspondenceAddressRaw = extractFirst(plain, [
    /\(750\)\s*Адрес для переписки:\s*(.*?)(?:\(\d{3}\)|$)/i,
  ]);
  const unprotectedElementsRaw = extractFirst(plain, [
    /\(526\)\s*Неохраняемые элементы товарного знака:\s*(.*?)(?:\(\d{3}\)|$)/i,
  ]);
  const colorSpecificationRaw = extractFirst(plain, [
    /\(591\)\s*Указание цвета или цветового сочетания:\s*(.*?)(?:\(\d{3}\)|$)/i,
  ]);
  const classesRaw = extractFirst(plain, [/\(511\)\s*Классы МКТУ[^:]*:\s*(.*)$/i]);
  const processingStatusRaw = extractFirst(plain, [
    /Состояние делопроизводства:\s*(.*?)(?:Заявки на товарные знаки|\(\d{3}\)|$)/i,
  ]);

  const imageUrl = extractTrademarkImage(html);
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
    thumbnail_url: imageUrl,
    parsed_data: {
      submitted_date_raw: submittedDateRaw,
      publication_date_raw: publicationDateRaw,
      applicant_raw: applicantName,
      correspondence_address_raw: correspondenceAddressRaw,
      unprotected_elements_raw: unprotectedElementsRaw,
      color_specification_raw: colorSpecificationRaw,
      classes_raw: classesRaw,
      processing_status_raw: processingStatusRaw,
      raw_preview: plain.slice(0, 2500),
    },
  };
};

const walkHtmlFiles = async (rootDir) => {
  const out = [];
  const years = await fs.readdir(rootDir, { withFileTypes: true });

  for (const yearDir of years) {
    if (!yearDir.isDirectory() || !/^\d{4}$/.test(yearDir.name)) continue;
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
        out.push({
          absPath: path.join(sectionPath, file.name),
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
  // Detect encoding from raw bytes (meta tags are ASCII-safe in HTML head).
  const headSlice = buffer.subarray(0, Math.min(buffer.length, 4096));
  const headAscii = Buffer.from(headSlice).toString("latin1").toLowerCase();

  const isWin1251 =
    headAscii.includes("charset=windows-1251") ||
    headAscii.includes('charset="windows-1251"') ||
    headAscii.includes("charset=cp1251") ||
    headAscii.includes("windows-1251");

  if (isWin1251) return decoderWin1251.decode(buffer);

  const utf8 = decoderUtf8.decode(buffer);
  // Fallback heuristic for common cp1251 mojibake in UTF-8 decode.
  if (utf8.includes("����") || /Р[А-Яа-яЁё]/.test(utf8.slice(0, 2000))) {
    return decoderWin1251.decode(buffer);
  }
  return utf8;
};

const main = async () => {
  console.log(`Scanning: ${ROOT_DIR}`);
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
    if (error) {
      // Some environments may miss unique index for ON CONFLICT(file_path).
      // Fallback to plain insert for initial bulk load.
      if (String(error.message || "").includes("no unique or exclusion constraint")) {
        const { error: insertError } = await supabase.from("fips_applications").insert(batch);
        // If rerun happened after partial import, ignore duplicate key violations
        // and continue with the rest of the dataset.
        if (insertError && String(insertError.message || "").includes("duplicate key value")) {
          batch.length = 0;
          return;
        }
        if (insertError) throw insertError;
      } else {
        throw error;
      }
    }
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
