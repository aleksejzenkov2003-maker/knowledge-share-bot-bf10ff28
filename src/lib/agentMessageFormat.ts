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

const TEXT_FIELDS = [
  'human_readable.summary',
  'humanReadable.summary',
  'summary',
  '_stream_text',
  'content',
  'text',
  'message',
  'answer',
  'output.summary',
  'output.use_summary',
  'output.notes',
  'output.description',
];

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

function renderValue(value: unknown, depth = 0): string {
  if (value == null) return '_—_';
  if (typeof value === 'string') return value.trim() || '_—_';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '_—_';
    if (value.every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      return value.map((v) => `- ${escapeMd(String(v))}`).join('\n');
    }
    return value.map((v, i) => `${i + 1}. ${renderValue(v, depth + 1).replace(/\n/g, '\n   ')}`).join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '_—_';
    return entries
      .map(([k, v]) => {
        const label = humanizeKey(k);
        const rendered = renderValue(v, depth + 1);
        if (rendered.includes('\n')) {
          return `**${label}:**\n${rendered.split('\n').map((l) => l).join('\n')}`;
        }
        return `**${label}:** ${rendered}`;
      })
      .join('\n\n');
  }
  return String(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderStructured(parsed: any): string {
  // Заголовок
  const parts: string[] = [];
  const title = pickFirstString(parsed, ['title', 'agent', 'output.title']);
  if (title) parts.push(`### ${title}`);

  // Краткое summary
  const summary = pickFirstString(parsed, TEXT_FIELDS);
  if (summary) parts.push(summary);

  // Основной output
  const output = parsed?.output ?? parsed?.result ?? parsed?.data;
  if (output && typeof output === 'object') {
    parts.push(renderValue(output));
  } else if (!summary && !title) {
    // fallback: рендерим всё, что есть
    parts.push(renderValue(parsed));
  }

  return parts.filter(Boolean).join('\n\n');
}

/**
 * Делит контент сообщения агента на «человеческий» markdown и сырой JSON.
 * Поддерживает:
 *  1. Чистый JSON (объект/массив) — рендерим структурированно.
 *  2. Markdown + ```json``` — показываем markdown, JSON сворачиваем.
 *  3. Обычный markdown/текст — отдаём как есть.
 */
export function splitAgentMessage(raw: string): AgentMessageRender {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { display: raw ?? '' };

  // Markdown с ```json ... ```
  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const before = trimmed.slice(0, fenceMatch.index ?? 0).trim();
    const after = trimmed.slice((fenceMatch.index ?? 0) + fenceMatch[0].length).trim();
    let pretty = fenceMatch[1].trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(pretty);
      pretty = JSON.stringify(parsed, null, 2);
    } catch { /* keep as is */ }
    const human = [before, after].filter(Boolean).join('\n\n');
    const structured = parsed ? renderStructured(parsed) : '';
    const display = [human, structured].filter(Boolean).join('\n\n')
      || '_(см. структурированный ответ ниже)_';
    return { display, json: pretty };
  }

  // Чистый JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const display = renderStructured(parsed) || '_(структурированный ответ агента)_';
      return { display, json: JSON.stringify(parsed, null, 2) };
    } catch { /* not valid JSON */ }
  }

  return { display: raw };
}
