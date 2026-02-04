
# МОДУЛЬ 2: Защита персональных данных (152-ФЗ)

## Обзор архитектуры

Модуль автоматического обезличивания персональных данных (ПДн) перед отправкой в LLM с возможностью восстановления по запросу и полным аудитом операций.

---

## Текущее состояние системы

| Компонент | Статус |
|-----------|--------|
| `chat-stream` Edge Function | Обрабатывает сообщения чата, отправляет в LLM |
| `process-document` Edge Function | Индексирует документы в RAG |
| Таблица `documents` | Хранит метаданные документов |
| Таблица `document_chunks` | Хранит чанки для RAG |
| Флаг `is_pii` в документах | **Отсутствует** |

---

## Архитектура модуля PII

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        ВХОДЯЩИЙ ПОТОК ДАННЫХ                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [Загрузка документа]           [Сообщение в чат]                       │
│         ↓                              ↓                                │
│  ┌─────────────────┐          ┌─────────────────┐                       │
│  │ Documents.tsx   │          │ chat-stream     │                       │
│  │ + флаг ПДн      │          │ Edge Function   │                       │
│  └────────┬────────┘          └────────┬────────┘                       │
│           ↓                            ↓                                │
│  ┌─────────────────────────────────────────────────┐                    │
│  │           PII MASKING ENGINE                    │                    │
│  │  ─────────────────────────────────────────────  │                    │
│  │  1. Regex детекторы (ФИО, телефоны, email...)   │                    │
│  │  2. Словарные паттерны (города, ФМС коды...)    │                    │
│  │  3. NER модель (опционально, через Lovable AI) │                    │
│  │                                                 │                    │
│  │  Выход: masked_text + mapping table             │                    │
│  └───────────────────────┬─────────────────────────┘                    │
│                          ↓                                              │
│  ┌─────────────────────────────────────────────────┐                    │
│  │           ХРАНЕНИЕ МАППИНГА                     │                    │
│  │  ─────────────────────────────────────────────  │                    │
│  │  Таблица: pii_mappings                          │                    │
│  │  - token: [PHONE_1], [PERSON_1]                 │                    │
│  │  - encrypted_value: AES-256-GCM                 │                    │
│  │  - source_type: chat | document                 │                    │
│  │  - expires_at: автоудаление через N дней        │                    │
│  └───────────────────────┬─────────────────────────┘                    │
│                          ↓                                              │
│  ┌─────────────────────────────────────────────────┐                    │
│  │           ОТПРАВКА В LLM                        │                    │
│  │  ─────────────────────────────────────────────  │                    │
│  │  В LLM уходит ТОЛЬКО masked_text:               │                    │
│  │  "Позвоните [PHONE_1] или напишите [EMAIL_1]"   │                    │
│  └───────────────────────┬─────────────────────────┘                    │
│                          ↓                                              │
│  ┌─────────────────────────────────────────────────┐                    │
│  │           ВОССТАНОВЛЕНИЕ (по запросу)           │                    │
│  │  ─────────────────────────────────────────────  │                    │
│  │  UI кнопка "Показать скрытые данные"            │                    │
│  │  - Проверка permission                          │                    │
│  │  - Расшифровка через Edge Function              │                    │
│  │  - Логирование в pii_audit_log                  │                    │
│  └─────────────────────────────────────────────────┘                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Детектируемые типы ПДн

### 1.1 Минимальный набор (regex)

| Тип | Паттерн | Токен |
|-----|---------|-------|
| ФИО | `Иванов Иван Иванович`, `И.И. Петров` | `[PERSON_N]` |
| Телефон | `+7 (999) 123-45-67`, `89991234567` | `[PHONE_N]` |
| Email | `user@domain.com` | `[EMAIL_N]` |
| Паспорт | `1234 567890`, `серия 1234 номер 567890` | `[PASSPORT_N]` |
| ИНН (физлицо) | `123456789012` (12 цифр) | `[INN_N]` |
| ИНН (юрлицо) | `1234567890` (10 цифр) | `[INN_ORG_N]` |
| СНИЛС | `123-456-789 12` | `[SNILS_N]` |
| Дата рождения | `01.01.1990`, `1 января 1990` | `[BIRTHDATE_N]` |
| Адрес | `г. Москва, ул. Ленина, д. 1, кв. 2` | `[ADDRESS_N]` |
| Банковский счёт | `40817810099910004312` | `[ACCOUNT_N]` |
| Номер карты | `4276 1234 5678 9012` | `[CARD_N]` |

### 1.2 Расширяемость

```typescript
// pii-patterns.ts - конфигурация паттернов
export const PII_PATTERNS: PiiPatternConfig[] = [
  {
    type: 'phone',
    token_prefix: 'PHONE',
    patterns: [
      /(?:\+7|8)[\s\-]?\(?[0-9]{3}\)?[\s\-]?[0-9]{3}[\s\-]?[0-9]{2}[\s\-]?[0-9]{2}/g,
      /\b[0-9]{10,11}\b/g, // Fallback for raw numbers
    ],
    priority: 10,
    enabled: true,
  },
  {
    type: 'email',
    token_prefix: 'EMAIL',
    patterns: [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    ],
    priority: 20,
    enabled: true,
  },
  // ... остальные паттерны
];
```

---

## 2. Схема базы данных

### 2.1 Таблица pii_mappings (маппинг токенов)

```sql
CREATE TABLE public.pii_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Контекст источника
  source_type TEXT NOT NULL, -- 'chat_message' | 'document_chunk' | 'attachment'
  source_id UUID NOT NULL,   -- ID сообщения/чанка/вложения
  session_id UUID,           -- Для группировки в рамках диалога
  
  -- Токен и зашифрованное значение
  token TEXT NOT NULL,                -- [PHONE_1], [PERSON_2]
  pii_type TEXT NOT NULL,             -- 'phone', 'email', 'person', 'passport'
  encrypted_value TEXT NOT NULL,      -- AES-256-GCM encrypted
  encryption_iv TEXT NOT NULL,        -- Initialization vector
  
  -- Метаданные
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '90 days',
  
  -- Индексы
  UNIQUE(source_id, token)
);

-- Индекс для быстрого поиска по session
CREATE INDEX idx_pii_mappings_session ON pii_mappings(session_id);

-- Автоудаление просроченных записей
CREATE INDEX idx_pii_mappings_expires ON pii_mappings(expires_at);
```

### 2.2 Таблица pii_audit_log (аудит восстановлений)

```sql
CREATE TABLE public.pii_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Кто запросил
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_email TEXT,
  user_ip TEXT,
  
  -- Что запросил
  mapping_id UUID REFERENCES pii_mappings(id),
  token TEXT NOT NULL,
  pii_type TEXT NOT NULL,
  action TEXT NOT NULL, -- 'view' | 'export' | 'copy'
  
  -- Контекст
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  
  -- Время
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: только сервисная роль может писать/читать аудит
ALTER TABLE pii_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON pii_audit_log
  FOR ALL USING (false);
```

### 2.3 Расширение таблицы documents

```sql
-- Добавить флаг PII в документы
ALTER TABLE documents ADD COLUMN IF NOT EXISTS 
  contains_pii BOOLEAN DEFAULT false;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS 
  pii_processed BOOLEAN DEFAULT false;
```

### 2.4 Расширение таблицы document_chunks

```sql
-- Чанки хранят masked-версию, оригинал — в pii_mappings
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS 
  has_masked_pii BOOLEAN DEFAULT false;
```

---

## 3. Ключ шифрования

### 3.1 Генерация мастер-ключа

```sql
-- Хранится в Supabase Vault
SELECT vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'base64'),
  'pii_encryption_key',
  'AES-256 key for PII encryption'
);
```

### 3.2 Получение ключа в Edge Functions

```typescript
// Доступ через переменную окружения (настраивается в Secrets)
const PII_ENCRYPTION_KEY = Deno.env.get('PII_ENCRYPTION_KEY');

// Или через Vault RPC (более безопасно)
const { data } = await supabase.rpc('get_pii_key');
```

---

## 4. Edge Function: pii-mask

### 4.1 Интерфейс

```typescript
// POST /functions/v1/pii-mask
interface PiiMaskRequest {
  text: string;
  source_type: 'chat_message' | 'document_chunk' | 'attachment';
  source_id: string;
  session_id?: string;
  user_id?: string;
}

interface PiiMaskResponse {
  masked_text: string;
  tokens_count: number;
  pii_types_found: string[];
  mapping_ids: string[];
}
```

### 4.2 Логика маскирования

```typescript
async function maskPii(text: string, context: MaskContext): Promise<MaskResult> {
  const mappings: PiiMapping[] = [];
  let maskedText = text;
  let tokenCounters: Record<string, number> = {};

  // Применяем паттерны в порядке приоритета
  for (const pattern of PII_PATTERNS.sort((a, b) => a.priority - b.priority)) {
    if (!pattern.enabled) continue;

    for (const regex of pattern.patterns) {
      const matches = maskedText.matchAll(regex);
      
      for (const match of matches) {
        const originalValue = match[0];
        
        // Инкремент счётчика токенов
        tokenCounters[pattern.type] = (tokenCounters[pattern.type] || 0) + 1;
        const tokenNum = tokenCounters[pattern.type];
        const token = `[${pattern.token_prefix}_${tokenNum}]`;
        
        // Шифрование оригинала
        const { encrypted, iv } = await encryptAES256(originalValue, PII_KEY);
        
        mappings.push({
          token,
          pii_type: pattern.type,
          encrypted_value: encrypted,
          encryption_iv: iv,
          source_type: context.source_type,
          source_id: context.source_id,
          session_id: context.session_id,
          created_by: context.user_id,
        });
        
        // Замена в тексте
        maskedText = maskedText.replace(originalValue, token);
      }
    }
  }

  // Сохранение маппингов в БД
  if (mappings.length > 0) {
    await supabase.from('pii_mappings').insert(mappings);
  }

  return {
    masked_text: maskedText,
    tokens_count: mappings.length,
    pii_types_found: [...new Set(mappings.map(m => m.pii_type))],
  };
}
```

---

## 5. Edge Function: pii-unmask

### 5.1 Интерфейс

```typescript
// POST /functions/v1/pii-unmask
interface PiiUnmaskRequest {
  text: string;           // Текст с токенами [PHONE_1] etc
  source_id: string;      // ID источника для поиска маппингов
  audit_action?: string;  // 'view' | 'export' | 'copy'
}

interface PiiUnmaskResponse {
  original_text: string;
  tokens_restored: number;
}
```

### 5.2 Проверка прав доступа

```typescript
async function canUnmaskPii(userId: string): Promise<boolean> {
  // Проверяем роль пользователя
  const { data: role } = await supabase
    .rpc('get_user_role', { uid: userId });
  
  // Только admin и moderator могут восстанавливать ПДн
  return role === 'admin' || role === 'moderator';
}
```

### 5.3 Логирование в аудит

```typescript
async function logPiiAccess(params: AuditParams): Promise<void> {
  await supabase.from('pii_audit_log').insert({
    user_id: params.userId,
    user_email: params.userEmail,
    user_ip: params.userIp,
    mapping_id: params.mappingId,
    token: params.token,
    pii_type: params.piiType,
    action: params.action,
    source_type: params.sourceType,
    source_id: params.sourceId,
  });
}
```

---

## 6. Интеграция в chat-stream

### 6.1 Точка вызова маскирования

```typescript
// В chat-stream, ПЕРЕД отправкой в LLM:

// 1. Проверяем, включен ли PII-режим для агента/отдела
const piiEnabled = role?.config?.pii_masking !== false;

if (piiEnabled) {
  // 2. Маскируем пользовательское сообщение
  const maskResult = await maskPii(message, {
    source_type: 'chat_message',
    source_id: messageId,
    session_id: conversationId,
    user_id: userId,
  });
  
  message = maskResult.masked_text;
  
  // 3. Маскируем RAG-контекст
  for (const chunk of rankedChunks) {
    if (chunk.has_masked_pii) {
      // Уже замаскирован при индексации
      continue;
    }
    // Маскируем на лету (для legacy документов)
    const chunkMask = await maskPii(chunk.content, {
      source_type: 'rag_chunk',
      source_id: chunk.id,
    });
    chunk.content = chunkMask.masked_text;
  }
  
  // 4. Маскируем вложения
  for (const attachment of attachments) {
    // ... аналогично
  }
}

// 5. Теперь отправляем в LLM
const response = await callLLM(message, context);
```

---

## 7. Интеграция в process-document

### 7.1 Маскирование при индексации

```typescript
// В process-document, ПОСЛЕ извлечения текста:

// Проверяем флаг contains_pii в документе
if (doc.contains_pii) {
  console.log('PII mode enabled, masking document text');
  
  // Маскируем полный текст
  const maskResult = await maskPii(text, {
    source_type: 'document',
    source_id: document_id,
  });
  
  text = maskResult.masked_text;
  console.log(`Masked ${maskResult.tokens_count} PII tokens`);
}

// Далее стандартный chunking...
const structuredChunks = processDocumentText(text, ...);

// При сохранении чанков отмечаем наличие маскированных ПДн
for (const chunk of structuredChunks) {
  chunk.has_masked_pii = doc.contains_pii;
}
```

---

## 8. UI компоненты

### 8.1 Флаг ПДн при загрузке документа

```text
┌─────────────────────────────────────────────────────────────────┐
│  📄 Загрузка документа                                          │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Название документа: [___________________________]              │
│  Папка: [Выберите папку           ▼]                            │
│  Тип документа: [Автоопределение  ▼]                            │
│                                                                 │
│  ☑️ Документ содержит персональные данные (152-ФЗ)              │
│     ⓘ ПДн будут автоматически замаскированы перед               │
│       отправкой в AI. Оригиналы доступны только                 │
│       пользователям с соответствующими правами.                 │
│                                                                 │
│  [Отмена]                              [Загрузить]              │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Индикатор маскированных ПДн в чате

```text
┌─────────────────────────────────────────────────────────────────┐
│  🤖 Ассистент                                                   │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Согласно документу, [PERSON_1] является наследником            │
│  первой очереди. Для связи используйте [PHONE_1].               │
│                                                                 │
│  🔒 Скрыто 2 персональных данных                                │
│  [👁️ Показать скрытые данные]                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Диалог подтверждения восстановления

```text
┌─────────────────────────────────────────────────────────────────┐
│  🔓 Раскрытие персональных данных                               │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Вы собираетесь просмотреть защищённые персональные данные.    │
│                                                                 │
│  Обнаружено ПДн: 2                                              │
│  • [PERSON_1] — ФИО                                             │
│  • [PHONE_1] — Телефон                                          │
│                                                                 │
│  ⚠️ Это действие будет записано в журнал аудита                │
│     в соответствии с требованиями 152-ФЗ.                       │
│                                                                 │
│  [Отмена]                              [Подтверждаю]            │
└─────────────────────────────────────────────────────────────────┘
```

### 8.4 Страница аудита ПДн (для админов)

```text
┌─────────────────────────────────────────────────────────────────┐
│  📋 Журнал доступа к персональным данным                        │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Фильтры: [Все типы ▼] [Последние 7 дней ▼] [Поиск...]         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Дата/время        │ Пользователь │ Действие  │ Тип ПДн │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 04.02.2026 15:32  │ admin@co.ru  │ Просмотр  │ ФИО     │   │
│  │ 04.02.2026 14:21  │ mod@co.ru    │ Просмотр  │ Телефон │   │
│  │ 04.02.2026 11:05  │ admin@co.ru  │ Экспорт   │ Email   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  📊 Статистика: 47 операций за период                           │
│  • Просмотров: 42                                               │
│  • Экспортов: 5                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Файлы для создания/изменения

### 9.1 Новые файлы

| Файл | Описание |
|------|----------|
| `supabase/functions/pii-mask/index.ts` | Edge Function для маскирования |
| `supabase/functions/pii-unmask/index.ts` | Edge Function для восстановления |
| `supabase/functions/_shared/pii-patterns.ts` | Конфигурация паттернов ПДн |
| `supabase/functions/_shared/pii-crypto.ts` | Функции шифрования AES-256 |
| `src/components/chat/PiiIndicator.tsx` | Индикатор скрытых ПДн |
| `src/components/chat/PiiUnmaskDialog.tsx` | Диалог восстановления |
| `src/pages/PiiAuditLog.tsx` | Страница журнала аудита |
| `src/hooks/usePiiMasking.ts` | Хук для работы с ПДн |

### 9.2 Изменяемые файлы

| Файл | Изменения |
|------|-----------|
| `supabase/functions/chat-stream/index.ts` | + вызов pii-mask перед LLM |
| `supabase/functions/process-document/index.ts` | + маскирование при индексации |
| `src/pages/Documents.tsx` | + чекбокс "Содержит ПДн" |
| `src/components/chat/ChatMessage.tsx` | + PiiIndicator |
| `src/components/layout/AdminSidebar.tsx` | + ссылка на аудит |
| `src/App.tsx` | + роут /pii-audit |

---

## 10. Миграция БД

```sql
-- 01_create_pii_tables.sql

-- Таблица маппингов
CREATE TABLE public.pii_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('chat_message', 'document_chunk', 'attachment')),
  source_id UUID NOT NULL,
  session_id UUID,
  token TEXT NOT NULL,
  pii_type TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '90 days',
  UNIQUE(source_id, token)
);

CREATE INDEX idx_pii_mappings_session ON pii_mappings(session_id);
CREATE INDEX idx_pii_mappings_source ON pii_mappings(source_type, source_id);
CREATE INDEX idx_pii_mappings_expires ON pii_mappings(expires_at);

-- RLS для pii_mappings
ALTER TABLE pii_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access only" ON pii_mappings
  FOR ALL USING (false);

-- Таблица аудита
CREATE TABLE public.pii_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_email TEXT,
  user_ip TEXT,
  mapping_id UUID REFERENCES pii_mappings(id),
  token TEXT NOT NULL,
  pii_type TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('view', 'export', 'copy')),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pii_audit_user ON pii_audit_log(user_id);
CREATE INDEX idx_pii_audit_date ON pii_audit_log(created_at DESC);

ALTER TABLE pii_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit" ON pii_audit_log
  FOR SELECT USING (is_admin());

-- Расширение documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS contains_pii BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pii_processed BOOLEAN DEFAULT false;

-- Расширение document_chunks
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS has_masked_pii BOOLEAN DEFAULT false;
```

---

## 11. Секреты для настройки

| Секрет | Описание |
|--------|----------|
| `PII_ENCRYPTION_KEY` | Мастер-ключ AES-256 (32 байта, base64) |

---

## 12. Порядок реализации

1. **Фаза 1: Инфраструктура** (миграция БД + секреты)
2. **Фаза 2: Маскирование** (pii-mask Edge Function + паттерны)
3. **Фаза 3: Интеграция в chat-stream** (маскирование перед LLM)
4. **Фаза 4: Интеграция в process-document** (маскирование при индексации)
5. **Фаза 5: Восстановление** (pii-unmask + UI компоненты)
6. **Фаза 6: Аудит** (страница журнала + логирование)
7. **Фаза 7: Тестирование** (unit-тесты паттернов + E2E)

---

## 13. Тестовые сценарии

### 13.1 Контроль отправки в LLM

```typescript
// Тест: оригинал НЕ попадает в LLM
test('PII is masked before LLM call', async () => {
  const input = 'Позвоните Иванову по телефону +7 999 123-45-67';
  const masked = await maskPii(input, context);
  
  expect(masked.masked_text).not.toContain('Иванову');
  expect(masked.masked_text).not.toContain('+7 999 123-45-67');
  expect(masked.masked_text).toContain('[PERSON_1]');
  expect(masked.masked_text).toContain('[PHONE_1]');
});
```

### 13.2 Контроль восстановления

```typescript
// Тест: пользователь без прав НЕ может восстановить
test('Employee cannot unmask PII', async () => {
  const result = await unmaskPii('[PHONE_1]', {
    userId: employeeUserId,
    sourceId: messageId,
  });
  
  expect(result.error).toBe('PERMISSION_DENIED');
});
```

### 13.3 Контроль шифрования

```typescript
// Тест: значения зашифрованы в БД
test('PII values are encrypted in database', async () => {
  const { data } = await supabase
    .from('pii_mappings')
    .select('encrypted_value')
    .eq('token', '[PHONE_1]')
    .single();
  
  // Encrypted value should NOT be readable
  expect(data.encrypted_value).not.toContain('999');
  expect(data.encrypted_value.length).toBeGreaterThan(50);
});
```

---

## 14. Ожидаемый результат

После реализации модуля:

1. В LLM уходит **только** обезличенный текст
2. Оригиналы ПДн **зашифрованы** AES-256-GCM
3. Восстановление доступно **только** admin/moderator
4. **Все** операции восстановления логируются
5. Паттерны ПДн **расширяемы** через конфигурацию
6. UI показывает индикаторы скрытых данных
