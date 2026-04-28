#!/usr/bin/env node
/**
 * Перенос всех файлов из Storage старого Supabase в новый.
 *
 * ENV:
 *   OLD_SUPABASE_URL          — https://eidesurdreoxroarympm.supabase.co
 *   OLD_SERVICE_ROLE_KEY      — service_role старого проекта (Lovable Cloud)
 *   NEW_SUPABASE_URL          — https://<NEW_REF>.supabase.co
 *   NEW_SERVICE_ROLE_KEY      — service_role нового проекта
 *
 * Опции:
 *   --bucket=rag-documents    — перенести только один бакет
 *   --dry-run                 — только посчитать файлы, не качать
 *   --concurrency=4           — параллельность (по умолчанию 4)
 *   --skip-existing           — пропускать файлы, которые уже есть в новом бакете
 */

import { createClient } from "@supabase/supabase-js";

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const [k, v] = raw.split("=");
  if (k?.startsWith("--")) args.set(k.slice(2), v ?? "true");
}

const {
  OLD_SUPABASE_URL,
  OLD_SERVICE_ROLE_KEY,
  NEW_SUPABASE_URL,
  NEW_SERVICE_ROLE_KEY,
} = process.env;

if (!OLD_SUPABASE_URL || !OLD_SERVICE_ROLE_KEY || !NEW_SUPABASE_URL || !NEW_SERVICE_ROLE_KEY) {
  console.error("Missing one of: OLD_SUPABASE_URL, OLD_SERVICE_ROLE_KEY, NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY");
  process.exit(1);
}

const ONLY_BUCKET = args.get("bucket") || null;
const DRY_RUN = args.get("dry-run") === "true";
const CONCURRENCY = Number(args.get("concurrency") || "4");
const SKIP_EXISTING = args.get("skip-existing") === "true";

const oldSb = createClient(OLD_SUPABASE_URL, OLD_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const newSb = createClient(NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const listAllInBucket = async (sb, bucket, prefix = "") => {
  const out = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      if (item.id === null) {
        // папка — рекурсивно
        const sub = await listAllInBucket(sb, bucket, prefix ? `${prefix}/${item.name}` : item.name);
        out.push(...sub);
      } else {
        out.push({
          path: prefix ? `${prefix}/${item.name}` : item.name,
          size: item.metadata?.size ?? 0,
          contentType: item.metadata?.mimetype ?? "application/octet-stream",
        });
      }
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
};

const ensureBucket = async (bucket, isPublic) => {
  const { data: list } = await newSb.storage.listBuckets();
  if (list?.find((b) => b.name === bucket)) return;
  const { error } = await newSb.storage.createBucket(bucket, { public: isPublic });
  if (error && !error.message.includes("already exists")) throw error;
  console.log(`  + создан бакет ${bucket} (public=${isPublic})`);
};

const fileExistsInNew = async (bucket, path) => {
  const dir = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "";
  const name = path.includes("/") ? path.substring(path.lastIndexOf("/") + 1) : path;
  const { data } = await newSb.storage.from(bucket).list(dir, { limit: 1, search: name });
  return Boolean(data?.find((f) => f.name === name));
};

const copyFile = async (bucket, file) => {
  if (SKIP_EXISTING && (await fileExistsInNew(bucket, file.path))) {
    return "skipped";
  }
  const { data: blob, error: dlErr } = await oldSb.storage.from(bucket).download(file.path);
  if (dlErr) throw new Error(`download ${file.path}: ${dlErr.message}`);
  const buf = Buffer.from(await blob.arrayBuffer());
  const { error: upErr } = await newSb.storage.from(bucket).upload(file.path, buf, {
    contentType: file.contentType,
    upsert: true,
  });
  if (upErr) throw new Error(`upload ${file.path}: ${upErr.message}`);
  return "copied";
};

const runWithConcurrency = async (items, fn, concurrency) => {
  const stats = { copied: 0, skipped: 0, failed: 0 };
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      try {
        const r = await fn(item);
        stats[r] += 1;
        if ((stats.copied + stats.skipped) % 25 === 0) {
          console.log(`    ... ${stats.copied + stats.skipped + stats.failed}/${items.length}`);
        }
      } catch (e) {
        stats.failed += 1;
        console.error(`    ✗ ${item.path}: ${e.message}`);
      }
    }
  });
  await Promise.all(workers);
  return stats;
};

const main = async () => {
  console.log(`OLD: ${OLD_SUPABASE_URL}`);
  console.log(`NEW: ${NEW_SUPABASE_URL}`);
  console.log(`DRY_RUN=${DRY_RUN}, CONCURRENCY=${CONCURRENCY}, SKIP_EXISTING=${SKIP_EXISTING}\n`);

  const { data: buckets, error } = await oldSb.storage.listBuckets();
  if (error) throw error;

  const target = ONLY_BUCKET ? buckets.filter((b) => b.name === ONLY_BUCKET) : buckets;
  if (target.length === 0) {
    console.error(`Бакет не найден: ${ONLY_BUCKET}`);
    process.exit(1);
  }

  let grandCopied = 0, grandSkipped = 0, grandFailed = 0;

  for (const b of target) {
    console.log(`\n=== Бакет: ${b.name} (public=${b.public}) ===`);
    if (!DRY_RUN) await ensureBucket(b.name, b.public);

    const files = await listAllInBucket(oldSb, b.name);
    console.log(`  файлов: ${files.length}`);

    if (DRY_RUN) {
      const totalMB = files.reduce((s, f) => s + (f.size || 0), 0) / 1024 / 1024;
      console.log(`  суммарно: ${totalMB.toFixed(1)} MB`);
      continue;
    }

    const stats = await runWithConcurrency(files, (f) => copyFile(b.name, f), CONCURRENCY);
    console.log(`  ✓ скопировано: ${stats.copied}, пропущено: ${stats.skipped}, ошибок: ${stats.failed}`);
    grandCopied += stats.copied;
    grandSkipped += stats.skipped;
    grandFailed += stats.failed;
  }

  console.log(`\n=== Итого: copied=${grandCopied}, skipped=${grandSkipped}, failed=${grandFailed} ===`);
  if (grandFailed > 0) process.exit(2);
};

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
