
# План: Исправление потери источников в Bitrix-чатах

## Диагностика

Проанализировал данные в БД и обнаружил, что все сообщения за сегодня (27 января) имеют пустые поля `rag_context`, `citations`, `web_search_citations` в metadata - хотя в логах chat-stream видно, что RAG работает ("RAG: Final context has 10 chunks").

**Корневая причина:** В функции `handleSendMessage` в `bitrix-chat-api` отсутствует буферизация при чтении SSE стрима. Когда metadata чанк (который может быть большим, т.к. содержит 10+ контекстных строк) приходит разбитым на несколько TCP пакетов, `JSON.parse()` падает на неполном JSON, и metadata теряется.

### Сравнение кода

**chat-stream (правильно - с буфером):**
```typescript
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Сохраняем неполную строку
  // ...
}
```

**bitrix-chat-api (проблема - без буфера):**
```typescript
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);  // ❌ Без буфера!
  const lines = chunk.split('\n');       // ❌ Неполные строки теряются!
  // ...
}
```

---

## Решение

### Изменение 1: Добавить буферизацию в handleSendMessage

**Файл:** `supabase/functions/bitrix-chat-api/index.ts`  
**Строки:** ~1515-1575

Добавить буфер для корректного чтения SSE:

```typescript
const stream = new ReadableStream({
  async start(controller) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = ''; // ← Добавить буфер

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true }); // ← Накапливать в буфер
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // ← Сохранить неполную строку

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            // ... existing logic
          }
        }
      }
      
      // Обработать остаток буфера после завершения стрима
      if (buffer.startsWith('data: ')) {
        const data = buffer.substring(6);
        // ... process remaining data
      }
    } catch (error) {
      console.error('Stream error:', error);
    } finally {
      controller.close();
    }
  }
});
```

### Изменение 2: Применить такое же исправление к handleRegenerateMessage (Department)

**Файл:** `supabase/functions/bitrix-chat-api/index.ts`  
**Строки:** ~2050-2130

Аналогичное добавление буферизации.

### Изменение 3: Применить исправление к Personal Chat функциям

**Файл:** `supabase/functions/bitrix-chat-api/index.ts`

- `handleSendPersonalMessage` (~1270-1330)
- `handleRegeneratePersonalMessage` (~1880-1940)

### Изменение 4: Добавить логирование для отладки

Для диагностики добавить console.log при получении metadata:

```typescript
if (parsed.type === 'metadata' || parsed.rag_context || parsed.citations) {
  const { type, content, ...metaFields } = parsed;
  metadata = { ...metadata, ...metaFields };
  console.log('Captured metadata:', JSON.stringify(Object.keys(metaFields)));
}
```

---

## Технические детали

### Почему metadata теряется именно у неё:

1. **Контент** приходит маленькими чанками (по 1-3 слова), каждый влезает в один TCP пакет
2. **Metadata** - один большой JSON объект (10 rag_context строк, citations, web_search_citations)
3. Большой JSON может разбиться на границе TCP пакета
4. Без буфера: `JSON.parse('{"type":"metadata","rag_cont')` → SyntaxError
5. Catch block проглатывает ошибку, metadata = {} остаётся пустым

### Почему раньше работало (до 22 января):

Возможно, меньший объём контекста или другие сетевые условия. Также возможно что изменения в deployment повлияли на размер TCP пакетов.

---

## Порядок реализации

1. Исправить `handleSendMessage` - добавить буферизацию SSE стрима
2. Исправить `handleRegenerateDepartmentMessage` - аналогично
3. Исправить `handleSendPersonalMessage` - аналогично  
4. Исправить `handleRegeneratePersonalMessage` - аналогично
5. Добавить логирование для подтверждения захвата metadata
6. Деплой edge function `bitrix-chat-api`
7. Тестирование - отправить сообщение и проверить что источники появляются

---

## Ожидаемый результат

После исправления:
- Metadata (rag_context, citations, web_search_citations) будет корректно парситься
- Sources badges ("X источников", "X цитат", "X веб") появятся в Bitrix-чатах
- Данные будут сохраняться в БД и отображаться после перезагрузки страницы
