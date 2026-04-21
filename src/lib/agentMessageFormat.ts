/**
 * Утилиты для превращения «сырого» JSON-ответа агента в человекочитаемый markdown.
 * Используется и в чате шага, и в просмотре «Результата».
 */

export interface AgentMessageRender {
  /** Markdown для отображения пользователю. */
  display: string;
  /** Красиво отформатированный JSON (если был распознан). */
  json?: string;
}

const SUMMARY_FIELDS = [
  'human_readable.summary',
  'humanReadable.summary',
  'output.summary',
  'output.use_summary',
  'output.notes',
  'output.description',
  'summary',
  'use_summary',
  'status_summary',
  'message',
  'answer',
  'text',
  'content',
];

const TITLE_FIELDS = ['title', 'agent', 'output.title', 'human_readable.title'];

const SKIP_TOP_KEYS = new Set([
  'title',
  'agent',
  'summary',
  'use_summary',
  'status_summary',
  'message',
  'answer',
  'human_readable',
  'humanReadable',
  '_stream_text',
  'metadata',
  'qc',
  'input',
  'output',
  'result',
  'data',
  'client_kp',
  'internal_report',
]);

function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function pickFirstString(obj: any, paths: string[]): string | undefined {
  for (const p of paths) {
    const v = getPath(obj, p);
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value: unknown, depth = 0): string {
  if (value == null) return '_—_';
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return '_—_';
    // Если это URL — делаем кликабельной ссылкой
    if (/^https?:\/\/\S+$/i.test(t)) return `[${t}](${t})`;
    return t;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '_—_';
    if (value.every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      return value.map((v) => `- ${escapeMd(renderValue(v, depth + 1))}`).join('\n');
    }
    return value
      .map((v, i) => {
        const rendered = renderValue(v, depth + 1);
        if (rendered.includes('\n')) {
          const indented = rendered.split('\n').map((l, idx) => (idx === 0 ? l : `   ${l}`)).join('\n');
          return `${i + 1}. ${indented}`;
        }
        return `${i + 1}. ${rendered}`;
      })
      .join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '_—_';
    return entries
      .map(([k, v]) => {
        const label = humanizeKey(k);
        const rendered = renderValue(v, depth + 1);
        if (rendered.includes('\n')) {
          return `**${label}:**\n${rendered}`;
        }
        return `**${label}:** ${rendered}`;
      })
      .join('\n\n');
  }
  return String(value);
}

function renderQcInput(parsed: any): string[] {
  const parts: string[] = [];
  const qc = parsed?.qc;
  if (Array.isArray(qc) && qc.length > 0) {
    parts.push(`**Проверки:**\n${qc.map((item: unknown) => `- ${renderValue(item)}`).join('\n')}`);
  } else if (qc && typeof qc === 'object') {
    parts.push(`**Проверки:**\n${renderValue(qc)}`);
  }
  const input = parsed?.input;
  if (Array.isArray(input) && input.length > 0) {
    parts.push(`**Входные данные:**\n${input.map((item: unknown) => `- ${renderValue(item)}`).join('\n')}`);
  }
  return parts;
}

function renderStructured(parsed: any): string {
  // Спец-кейс: уже готовый markdown-документ
  if (parsed && typeof parsed === 'object') {
    if (typeof parsed.client_kp === 'string' && parsed.client_kp.trim()) {
      return parsed.client_kp.trim();
    }
    if (typeof parsed.internal_report === 'string' && parsed.internal_report.trim()) {
      return parsed.internal_report.trim();
    }
  }

  const parts: string[] = [];
  const title = pickFirstString(parsed, TITLE_FIELDS);
  if (title) parts.push(`### ${title}`);

  const summary = pickFirstString(parsed, SUMMARY_FIELDS);
  if (summary && !looksLikeRawJson(summary)) parts.push(summary);

  // Основной output
  const output = parsed?.output ?? parsed?.result ?? parsed?.data;
  if (output !== undefined && output !== null) {
    if (typeof output === 'string') {
      if (output.trim() && output.trim() !== summary) parts.push(output.trim());
    } else {
      const rendered = renderValue(output);
      if (rendered && rendered !== '_—_') parts.push(rendered);
    }
  }

  // Дополнительные поля верхнего уровня (не из SKIP_TOP_KEYS)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const extra = Object.entries(parsed as Record<string, unknown>)
      .filter(([k, v]) => !SKIP_TOP_KEYS.has(k) && v !== undefined && v !== null && !(typeof v === 'string' && !v.trim()));
    if (extra.length > 0) {
      const extraRendered = extra
        .map(([k, v]) => {
          const label = humanizeKey(k);
          const r = renderValue(v);
          if (r.includes('\n')) return `**${label}:**\n${r}`;
          return `**${label}:** ${r}`;
        })
        .join('\n\n');
      if (extraRendered) parts.push(extraRendered);
    }
  }

  // QC + input в конец
  parts.push(...renderQcInput(parsed));

  if (parts.length === 0) {
    parts.push(renderValue(parsed));
  }

  return parts.filter(Boolean).join('\n\n');
}

function looksLikeRawJson(s: string): boolean {
  const t = s.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

/**
 * Извлекает первый сбалансированный {...} или [...] блок из строки,
 * корректно обрабатывая строки и escape-символы. Возвращает null, если
 * валидный блок не найден (или скобки не сбалансированы).
 */
function extractBalancedJson(raw: string): string | null {
  const text = raw;
  const startIdx = text.search(/[{[]/);
  if (startIdx < 0) return null;
  const open = text[startIdx];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  return null;
}

function cleanJsonCandidate(raw: string): string {
  return raw
    // удалить ```json fences (внешние)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    // trailing commas внутри объектов/массивов
    .replace(/,(\s*[}\]])/g, '$1')
    // одиночные control-chars (кроме \n \r \t)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function tryParseJson(raw: string): any | null {
  const cleaned = cleanJsonCandidate(raw);
  try { return JSON.parse(cleaned); } catch {}
  // Попытка расширить экранирование
  try { return JSON.parse(cleaned.replace(/\\n/g, '\n')); } catch {}
  return null;
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
}

function extractStringField(raw: string, key: string): string | undefined {
  const match = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'));
  return match?.[1] ? decodeJsonString(match[1]).trim() : undefined;
}

function extractStringArray(raw: string, key: string): string[] {
  const match = raw.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)]`, 'i'));
  if (!match?.[1]) return [];
  return Array.from(match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)).map((m) => decodeJsonString(m[1]).trim()).filter(Boolean);
}

/** Выдёргивает блок "key": { ... } со счётчиком скобок. */
function extractObjectBlock(raw: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*\\{`, 'i');
  const m = raw.match(re);
  if (!m || m.index == null) return null;
  const braceStart = m.index + m[0].length - 1; // позиция «{»
  return extractBalancedJson(raw.slice(braceStart));
}

function looksLikeAgentJson(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
  return /"(agent|title|output|qc|input|human_readable|client_kp|internal_report|result|data)"\s*:/.test(trimmed);
}

function renderLooseAgentJson(raw: string): string {
  const title = extractStringField(raw, 'title') || extractStringField(raw, 'agent') || 'Структурированный ответ агента';
  const summary =
    extractStringField(raw, 'summary') ||
    extractStringField(raw, 'use_summary') ||
    extractStringField(raw, 'status_summary');

  const parts: string[] = [`### ${title}`];
  if (summary) parts.push(summary);

  // Попытка достать "output": { ... }
  const outputBlock = extractObjectBlock(raw, 'output') || extractObjectBlock(raw, 'result') || extractObjectBlock(raw, 'data');
  if (outputBlock) {
    const parsed = tryParseJson(outputBlock);
    if (parsed && typeof parsed === 'object') {
      const r = renderValue(parsed);
      if (r && r !== '_—_') parts.push(r);
    }
  }

  const qc = extractStringArray(raw, 'qc');
  const input = extractStringArray(raw, 'input');
  if (qc.length) parts.push(`**Проверки:**\n${qc.map((item) => `- ${item}`).join('\n')}`);
  if (input.length) parts.push(`**Входные данные:**\n${input.map((item) => `- ${item}`).join('\n')}`);

  if (parts.length === 1 && !summary && !outputBlock && !qc.length && !input.length) {
    parts.push('_(структурированный ответ агента — JSON ниже)_');
  }
  return parts.join('\n\n');
}

/**
 * Делит контент сообщения агента на «человеческий» markdown и сырой JSON.
 * Сырой JSON никогда не возвращается как display: даже неполный/кривой JSON получает человекочитаемый fallback.
 */
export function splitAgentMessage(raw: string): AgentMessageRender {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { display: raw ?? '' };

  // 1. JSON в ```json ... ``` фенсе
  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const before = trimmed.slice(0, fenceMatch.index ?? 0).trim();
    const after = trimmed.slice((fenceMatch.index ?? 0) + fenceMatch[0].length).trim();
    const jsonRaw = fenceMatch[1].trim();
    const parsed = tryParseJson(jsonRaw);
    if (parsed && typeof parsed === 'object') {
      const display = [before, after, renderStructured(parsed)].filter(Boolean).join('\n\n') || '_(структурированный ответ агента)_';
      return { display, json: JSON.stringify(parsed, null, 2) };
    }
    const display = [before, after, renderLooseAgentJson(jsonRaw)].filter(Boolean).join('\n\n');
    return { display, json: jsonRaw };
  }

  // 2. JSON где-то в середине прозы — извлекаем сбалансированный блок
  if (looksLikeAgentJson(trimmed)) {
    const balanced = extractBalancedJson(trimmed);
    if (balanced) {
      const before = trimmed.slice(0, trimmed.indexOf(balanced)).trim();
      const after = trimmed.slice(trimmed.indexOf(balanced) + balanced.length).trim();
      const parsed = tryParseJson(balanced);
      if (parsed && typeof parsed === 'object') {
        const display = [before, renderStructured(parsed), after].filter(Boolean).join('\n\n') || '_(структурированный ответ агента)_';
        return { display, json: JSON.stringify(parsed, null, 2) };
      }
      // Парсинг не удался — пробуем loose-режим на блоке
      const display = [before, renderLooseAgentJson(balanced), after].filter(Boolean).join('\n\n');
      return { display, json: balanced };
    }

    // Сбалансированный блок не нашли — loose на всём контенте
    return { display: renderLooseAgentJson(trimmed), json: trimmed };
  }

  return { display: raw };
}
