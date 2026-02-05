// PII Detection Patterns for Russian Personal Data (152-ФЗ)

// Priority order: Lower number = higher priority (processed first)
// Phone should be processed BEFORE passport to avoid misdetection

export interface PiiPatternConfig {
  type: string;
  token_prefix: string;
  patterns: RegExp[];
  priority: number; // Lower = higher priority (processed first)
  enabled: boolean;
  description: string;
}

export const PII_PATTERNS: PiiPatternConfig[] = [
  // ==================== HIGH PRIORITY (Unique identifiers) ====================
  
  // ==================== PHONE (before passport to prevent misdetection) ====================
  
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
    priority: 4, // Higher priority than passport
    enabled: true,
    description: 'Номер телефона',
  },
  
  {
    type: 'passport',
    token_prefix: 'PASSPORT',
    patterns: [
      // Паспорт с контекстом: серия XXXX номер XXXXXX
      /(?:паспорт|серия)\s*:?\s*(\d{2}\s?\d{2})\s*(?:номер|№)?\s*(\d{6})/gi,
      // Строго: 4 цифры + пробел + 6 цифр (не склеенные, не телефон)
      /\b(\d{4})\s(\d{6})\b/g,
    ],
    priority: 5,
    enabled: true,
    description: 'Паспортные данные РФ',
  },
  
  {
    type: 'snils',
    token_prefix: 'SNILS',
    patterns: [
      // СНИЛС: 123-456-789 12 или 123-456-789-12
      /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{2}\b/g,
    ],
    priority: 6,
    enabled: true,
    description: 'СНИЛС',
  },
  
  {
    type: 'inn_person',
    token_prefix: 'INN',
    patterns: [
      // ИНН физлица: 12 цифр
      /\bИНН[:\s]*(\d{12})\b/gi,
      // ИНН с контекстом
      /(?:инн|идентификационный\s*номер)[:\s]*(\d{12})\b/gi,
    ],
    priority: 7,
    enabled: true,
    description: 'ИНН физического лица (12 цифр)',
  },
  
  {
    type: 'inn_org',
    token_prefix: 'INN_ORG',
    patterns: [
      // ИНН юрлица: 10 цифр
      /\bИНН[:\s]*(\d{10})\b/gi,
    ],
    priority: 8,
    enabled: true,
    description: 'ИНН юридического лица (10 цифр)',
  },
  
  {
    type: 'card',
    token_prefix: 'CARD',
    patterns: [
      // Банковская карта: 1234 5678 9012 3456
      /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/g,
    ],
    priority: 9,
    enabled: true,
    description: 'Номер банковской карты',
  },
  
  {
    type: 'account',
    token_prefix: 'ACCOUNT',
    patterns: [
      // Банковский счёт: 20 цифр, начинается с 408 или 407
      /\b(?:40[78]\d{17})\b/g,
    ],
    priority: 10,
    enabled: true,
    description: 'Номер банковского счёта',
  },
  
  // ==================== MEDIUM PRIORITY (Contact info) ====================
  
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
  
  // ==================== LOWER PRIORITY (Names, Dates, Addresses) ====================
  
  {
    type: 'birthdate',
    token_prefix: 'BIRTHDATE',
    patterns: [
      // Дата рождения в контексте
      /(?:дата\s*рождения|родил(?:ся|ась)|д\.?\s*р\.?)[:\s]*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/gi,
      // DD.MM.YYYY (строгий формат)
      /\b(0?[1-9]|[12][0-9]|3[01])[.\-/](0?[1-9]|1[0-2])[.\-/](19[0-9]{2}|20[0-2][0-9])\b/g,
    ],
    priority: 20,
    enabled: true,
    description: 'Дата рождения',
  },
  
  {
    type: 'address',
    token_prefix: 'ADDRESS',
    patterns: [
      // Адрес с улицей, домом, квартирой
      /(?:г\.?\s*[А-ЯЁа-яё\-]+\s*,?\s*)?(?:ул\.?|улица|пр\.?|проспект|пер\.?|переулок|б-р\.?|бульвар|ш\.?|шоссе|наб\.?|набережная)\s*[А-ЯЁа-яё][а-яёА-ЯЁ\s\-]*,?\s*(?:д\.?|дом)\s*\d+[а-яё]?(?:\s*(?:корп\.?|к\.?|стр\.?)\s*\d+)?(?:\s*,?\s*(?:кв\.?|квартира|офис)\s*\d+)?/gi,
      // Индекс + адрес
      /\b\d{6}\s*,?\s*(?:г\.?\s*)?[А-ЯЁа-яё]+/g,
      // Расширенный адрес с городом
      /адрес[:\s]*[^,\n]{10,80}/gi,
    ],
    priority: 25,
    enabled: true,
    description: 'Почтовый адрес',
  },
  
  {
    type: 'person',
    token_prefix: 'PERSON',
    patterns: [
      // Полное ФИО с отчеством (Иванов Иван Иванович, Петрова Анна Сергеевна)
      /[А-ЯЁ][а-яё]{2,15}\s+[А-ЯЁ][а-яё]{2,12}\s+[А-ЯЁ][а-яё]*(?:вич|вна|ич|ьич|евич|ович|евна|овна|ьевна|ьевич)\b/gi,
      // И.И. Иванов (инициалы + фамилия)
      /[А-ЯЁ]\.\s?[А-ЯЁ]\.\s+[А-ЯЁ][а-яё]{2,15}/g,
      // Иванов И.И. (фамилия + инициалы) 
      /[А-ЯЁ][а-яё]{2,15}\s+[А-ЯЁ]\.\s?[А-ЯЁ]\./g,
      // Творительный падеж ФИО (с Ивановым Иваном Ивановичем)
      /[А-ЯЁ][а-яё]{2,15}(?:ым|ой|ем)\s+[А-ЯЁ][а-яё]{2,12}(?:ом|ой|ем)\s+[А-ЯЁ][а-яё]*(?:вичем|вной|ичем|евичем|овичем|евной|овной)\b/gi,
    ],
    priority: 35, // Lower priority to avoid false positives
    enabled: true,
    description: 'ФИО',
  },
];

// Типы ПДн для UI
export const PII_TYPE_LABELS: Record<string, string> = {
  passport: 'Паспорт',
  snils: 'СНИЛС',
  inn_person: 'ИНН',
  inn_org: 'ИНН организации',
  card: 'Банковская карта',
  account: 'Банковский счёт',
  phone: 'Телефон',
  email: 'Email',
  birthdate: 'Дата рождения',
  address: 'Адрес',
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
