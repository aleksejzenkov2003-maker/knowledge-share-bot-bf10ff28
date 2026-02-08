// PII Detection Patterns for Russian Personal Data (152-ФЗ)
// Simplified: only PERSON, PHONE, EMAIL

export interface PiiPatternConfig {
  type: string;
  token_prefix: string;
  patterns: RegExp[];
  priority: number;
  enabled: boolean;
  description: string;
}

export const PII_PATTERNS: PiiPatternConfig[] = [
  {
    type: 'phone',
    token_prefix: 'PHONE',
    patterns: [
      // +7 (999) 123-45-67
      /(?:\+7|8)[\s\-]?\(?[0-9]{3}\)?[\s\-]?[0-9]{3}[\s\-]?[0-9]{2}[\s\-]?[0-9]{2}/g,
      // 89991234567 - строго 11 цифр
      /\b8[0-9]{10}\b/g,
      // +79991234567
      /\+7[0-9]{10}\b/g,
    ],
    priority: 4,
    enabled: true,
    description: 'Номер телефона',
  },

  {
    type: 'email',
    token_prefix: 'EMAIL',
    patterns: [
      /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    ],
    priority: 15,
    enabled: true,
    description: 'Адрес электронной почты',
  },

  {
    type: 'person',
    token_prefix: 'PERSON',
    patterns: [
      // Полное ФИО (все падежи отчества): Иванов Иван Иванович / Бабарыкова Константина Борисовича
      /[А-ЯЁ][а-яё]{1,20}[\s\u00A0]+[А-ЯЁ][а-яё]{1,15}[\s\u00A0]+[А-ЯЁ][а-яё]*(?:ович[ауем]?|евич[ауем]?|овн[аыеой]?|евн[аыеой]?|ичн[аыеой]?)(?=[^а-яёА-ЯЁ]|$)/g,
      // Фамилия И.О.: Иванов И.И. или Иванов И. И.
      /[А-ЯЁ][а-яё]{2,20}[\s\u00A0]+[А-ЯЁ]\.[\s\u00A0]?[А-ЯЁ]\./g,
      // И.О. Фамилия: И.И. Иванов или И. И. Иванов
      /[А-ЯЁ]\.[\s\u00A0]?[А-ЯЁ]\.[\s\u00A0]+[А-ЯЁ][а-яё]{2,20}/g,
    ],
    priority: 35,
    enabled: true,
    description: 'ФИО',
  },
];

// Типы ПДн для UI
export const PII_TYPE_LABELS: Record<string, string> = {
  phone: 'Телефон',
  email: 'Email',
  person: 'ФИО',
};

// Функция для получения активных паттернов
export function getActivePatterns(): PiiPatternConfig[] {
  return PII_PATTERNS
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);
}

// Функция для подсчёта найденных токенов в тексте
export function countPiiTokens(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const tokenPattern = /\[([A-Z_]+)_(\d+)\]/g;
  
  let match;
  while ((match = tokenPattern.exec(text)) !== null) {
    const type = match[1].toLowerCase();
    counts[type] = (counts[type] || 0) + 1;
  }
  
  return counts;
}

// Функция для извлечения токенов из текста
export function extractPiiTokens(text: string): string[] {
  const tokenPattern = /\[([A-Z_]+_\d+)\]/g;
  const tokens: string[] = [];
  
  let match;
  while ((match = tokenPattern.exec(text)) !== null) {
    tokens.push(match[0]);
  }
  
  return [...new Set(tokens)];
}
