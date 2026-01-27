
# План: Добавление доступа к документам в Bitrix-чатах

## Обнаруженная проблема

В Bitrix-чатах источники **не будут открываться**, потому что:

1. `SourcesPanel` и `DocumentViewer` используют Supabase клиент напрямую
2. В Bitrix-контексте пользователь авторизован через JWT от `bitrix-chat-api`, но **НЕ через Supabase Auth**
3. Таблица `documents` защищена RLS: `get_user_department(auth.uid())` - но `auth.uid()` = NULL
4. Storage bucket `rag-documents` приватный - требует авторизации

**Результат:** При клике на источник будет ошибка "Документ не найден" или "Не удалось загрузить документ"

---

## Решение

Создать API endpoints в `bitrix-chat-api` для поиска документов и получения signed URL, затем модифицировать компоненты чтобы использовать эти endpoints в Bitrix-контексте.

### Архитектура решения

```text
Админка (Supabase Auth):
  SourcesPanel → supabase.from('documents') → RLS OK → DocumentViewer → Storage → OK

Bitrix (JWT Auth):
  SourcesPanel → bitrix-chat-api/documents/search → Service Role → OK
                 bitrix-chat-api/documents/signed-url → Service Role → OK
```

---

## Детальные изменения

### 1. Edge Function: Новые endpoints

**Файл:** `supabase/functions/bitrix-chat-api/index.ts`

Добавить 2 новых роута:

#### GET /documents/search
```typescript
// Поиск документа по имени
async function handleDocumentSearch(req: Request, token: JWTPayload) {
  const url = new URL(req.url);
  const name = url.searchParams.get('name');
  
  // Поиск документа (используем service role, игнорируя RLS)
  const { data: docs } = await supabase
    .from('documents')
    .select('id, storage_path, name, file_name')
    .or(`name.eq.${name},name.ilike.%${baseName}%,file_name.ilike.%${baseName}%`)
    .limit(5);
  
  return new Response(JSON.stringify({ documents: docs }), { headers });
}
```

#### POST /documents/signed-url
```typescript
// Получение signed URL для документа
async function handleDocumentSignedUrl(req: Request, token: JWTPayload) {
  const { storage_path } = await req.json();
  
  // Создаём signed URL через service role
  const { data, error } = await supabase.storage
    .from('rag-documents')
    .createSignedUrl(storage_path, 3600);
  
  return new Response(JSON.stringify({ signed_url: data?.signedUrl }), { headers });
}
```

### 2. Компонент SourcesPanel: Контекст-aware логика

**Файл:** `src/components/chat/SourcesPanel.tsx`

Добавить prop для Bitrix-контекста и использовать API вместо прямого Supabase:

```typescript
interface SourcesPanelProps {
  ragContext?: string[];
  citations?: Citation[];
  webSearchCitations?: string[];
  webSearchUsed?: boolean;
  // Новые пропсы для Bitrix
  isBitrixContext?: boolean;
  bitrixApiBaseUrl?: string;
  bitrixToken?: string;
}

const openDocumentWithHighlight = async (...) => {
  if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
    // Используем API
    const searchRes = await fetch(`${bitrixApiBaseUrl}/documents/search?name=${encodeURIComponent(searchName)}`, {
      headers: { 'Authorization': `Bearer ${bitrixToken}` }
    });
    const { documents } = await searchRes.json();
    // ... далее работаем с documents
  } else {
    // Стандартная логика через Supabase
    const { data: docs } = await supabase.from('documents')...
  }
};
```

### 3. Компонент DocumentViewer: API-режим

**Файл:** `src/components/documents/DocumentViewer.tsx`

Добавить возможность получать URL через API:

```typescript
interface DocumentViewerProps {
  // ... existing props
  // Новые для Bitrix
  isBitrixContext?: boolean;
  bitrixApiBaseUrl?: string;
  bitrixToken?: string;
  preSignedUrl?: string; // Уже готовый URL
}

const loadDocument = async () => {
  if (preSignedUrl) {
    setDocumentUrl(preSignedUrl);
    return;
  }
  
  if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
    const res = await fetch(`${bitrixApiBaseUrl}/documents/signed-url`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${bitrixToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ storage_path: storagePath })
    });
    const { signed_url } = await res.json();
    setDocumentUrl(signed_url);
  } else {
    // Стандартная логика
  }
};
```

### 4. BitrixChatMessage: Передача контекста

**Файл:** `src/components/chat/BitrixChatMessage.tsx`

Передать Bitrix-специфичные пропсы в SourcesPanel:

```typescript
interface BitrixChatMessageProps {
  // ... existing
  bitrixApiBaseUrl?: string;
  bitrixToken?: string;
}

// В рендере:
<SourcesPanel 
  ragContext={message.ragContext}
  citations={message.citations}
  webSearchCitations={message.webSearchCitations}
  webSearchUsed={message.webSearchUsed}
  isBitrixContext={true}
  bitrixApiBaseUrl={bitrixApiBaseUrl}
  bitrixToken={bitrixToken}
/>
```

### 5. BitrixPersonalChat & BitrixDepartmentChat: Передача токена

**Файлы:** 
- `src/pages/BitrixPersonalChat.tsx`
- `src/pages/BitrixDepartmentChat.tsx`

Передать `token` и `apiBaseUrl` в BitrixChatMessage:

```typescript
<BitrixChatMessage
  message={msg}
  // ... existing props
  bitrixApiBaseUrl={apiBaseUrl}
  bitrixToken={token}
/>
```

---

## Порядок реализации

1. **Edge Function:** Добавить endpoints `/documents/search` и `/documents/signed-url`
2. **Deploy Edge Function**
3. **SourcesPanel:** Добавить Bitrix-aware логику с fallback на Supabase
4. **DocumentViewer:** Добавить поддержку pre-signed URL и API режима
5. **BitrixChatMessage:** Передать контекстные пропсы
6. **BitrixPersonalChat/DepartmentChat:** Передать token/apiBaseUrl в сообщения
7. **Тестирование** открытия документов в Bitrix-чате

---

## Ожидаемый результат

После реализации:
- При клике на источник в Bitrix-чате откроется DocumentViewer с PDF
- Поиск текста в PDF будет работать
- Подсветка цитаты будет работать
- Функциональность полностью идентична админке

---

## Примечание по безопасности

Endpoint `/documents/signed-url` защищён JWT авторизацией - только авторизованные пользователи Bitrix24 смогут получить ссылки на документы. Signed URL действителен 1 час.
