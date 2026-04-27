## Проблема

Запрос «Исследование (1)» от 27.04 в 07:22 на сонаре **отработал успешно**:
- В `chat_logs` есть ответ — 3952 символа, 101 секунда, fallback на `sonar-reasoning-pro`
- В `messages` (id `4d0dfbe7…`) **тот же ответ сохранён** в чат
- Но в интерфейсе ответа не видно — пусто/«нет ответа»

Значит ломается **только UI-отображение** после возврата ответа, не сам стрим и не сохранение.

## Корневая причина

В `useOptimizedChat.ts` строка 69:
```ts
const messages = isLoading ? localMessages : (dbMessages || localMessages);
```

После завершения стрима хук делает в таком порядке:
1. `setLocalMessages(...)` — обновляет UI с финальным контентом ✅
2. `saveMessage(...)` в БД ✅
3. `await queryClient.invalidateQueries(...)` — перезагружает `dbMessages`
4. `finally { setIsLoading(false) }` — переключает UI на `dbMessages`

**Гонка:** `invalidateQueries` стартует refetch, но `setIsLoading(false)` срабатывает **раньше**, чем приходит свежий `dbMessages`. В этот момент `messages = dbMessages` — а там ещё **старая версия без ответа ассистента** (или с пустым плейсхолдером, который мы вставили в начале как `assistantMessageId`). Локальное состояние `localMessages` с правильным контентом игнорируется.

Дополнительно: для `sonar-reasoning-pro` (fallback от deep-research) timeout 360с не срабатывает, но клиент закрывает соединение **сразу после** получения last byte. Если в этот момент `dbMessages` ещё не подтянулись — UI пустой.

## Что исправлю

В `src/hooks/useOptimizedChat.ts`:

**1. Дождаться появления сохранённого сообщения в `dbMessages` перед снятием `isLoading`.**
Заменить простой `invalidateQueries` на `refetchQueries` + проверку, что в свежих данных есть assistant-сообщение со свежим контентом:

```ts
await queryClient.refetchQueries({ queryKey: chatQueryKeys.messages(conversationId) });
// гарантирует что dbMessages уже содержит финальный ответ к моменту isLoading=false
```

**2. Если refetch почему-то не вернул сообщение — НЕ переключать UI на dbMessages.**
Изменить условие в строке 69 на:
```ts
const lastLocalAssistant = localMessages[localMessages.length - 1];
const lastDbAssistant = dbMessages?.[dbMessages.length - 1];
const dbHasLatest = lastDbAssistant && lastLocalAssistant 
  && lastDbAssistant.role === lastLocalAssistant.role
  && lastDbAssistant.content === lastLocalAssistant.content;
const messages = isLoading || !dbHasLatest 
  ? (localMessages.length ? localMessages : (dbMessages || []))
  : (dbMessages || localMessages);
```

Это страхует: если refetch отстал — показываем localMessages (где ответ точно есть).

**3. Применить аналогичные правки в:**
- `src/hooks/useChat.ts`
- `src/hooks/useOptimizedDepartmentChat.ts`  
- `src/hooks/useProjectChat.ts`

(во всех та же конструкция `isLoading ? localMessages : dbMessages`)

**4. Не сбрасывать `streamingContentRef.current = ""` в `finally`** — он уже не сбрасывается (только в начале), это ок. Но добавлю явное **обнуление** в самом начале нового запроса — на всякий, чтобы старые данные не подмешивались.

## Как проверим
- Запустить «Исследование (1)» с тем же запросом — ответ должен появиться в чате сразу после окончания, без перезагрузки страницы.
- Проверить, что после F5 ответ остаётся (он уже сохранён — это главное).
- Тест на других чатах (department, project) — UI обновляется так же стабильно.

## Файлы
- `src/hooks/useOptimizedChat.ts` — основной фикс
- `src/hooks/useChat.ts`, `src/hooks/useOptimizedDepartmentChat.ts`, `src/hooks/useProjectChat.ts` — те же правки

## Чего НЕ трогаю
- Edge functions (`deep-research`, `chat-stream`) — они работают, ответ доходит и сохраняется
- Логику refresh-токена и retry-on-401 — она тоже работает
- Парсинг SSE и сохранение в БД
