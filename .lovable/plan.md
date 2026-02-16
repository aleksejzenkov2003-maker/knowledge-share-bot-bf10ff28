

# 5 задач: двойная генерация, повтор, шаблоны документов, сообщения без агента, вложения Gemini

## 1. Убрать двойную генерацию при запуске

**Проблема**: В `useOptimizedChat.ts` мьютекс `sendingRef` уже добавлен, но в `useOptimizedDepartmentChat.ts` его нет. Также в department chat нет проверки `isGenerating` перед отправкой.

**Решение**:
- `src/hooks/useOptimizedDepartmentChat.ts` -- добавить `sendingRef = useRef(false)` и проверку в начале `sendMessage`, сброс в `finally`
- Убедиться, что `ChatInputEnhanced.tsx` дизейблит кнопку отправки при `isLoading/isGenerating`

---

## 2. Кнопка повтора под сообщением пользователя

**Проблема**: Если ответ "подвис" или не пришёл, пользователь не может повторить свой вопрос. Кнопка "Обновить" есть только у ответа ассистента.

**Решение**:
- `src/components/chat/ChatMessage.tsx` -- добавить кнопку "Повторить" (RefreshCw) под сообщениями пользователя. При клике вызывает `onRegenerateResponse` с ID следующего сообщения-ассистента (или если его нет -- повторно отправляет текст)
- `src/components/chat/MessageActions.tsx` -- добавить кнопку "Повторить" для `role === "user"` 
- `src/components/chat/DepartmentChatMessage.tsx` -- аналогичная кнопка для пользовательских сообщений
- Новый колбэк `onRetryMessage?: (messageId: string) => void` в пропсах

В хуках:
- `src/hooks/useOptimizedChat.ts` -- добавить `retryMessage(messageId)`: находит сообщение пользователя, удаляет все сообщения после него, и повторно отправляет текст
- `src/hooks/useOptimizedDepartmentChat.ts` -- аналогичный `retryMessage`

---

## 3. Подготовка документов по шаблонам (Word/PDF)

**Текущее состояние**: `DownloadDropdown` уже скачивает ответ как DOCX/PDF/MD. Но нет механизма "шаблонных документов" -- когда пользователь просит подготовить конкретный тип документа (договор, акт, письмо).

**Решение** (фаза 1 -- минимальная):
- Добавить в системный промпт инструкцию для агента: если пользователь просит подготовить документ, форматировать ответ в Markdown с чёткой структурой (заголовки, списки, таблицы)
- Существующий `DownloadDropdown` уже конвертирует Markdown в DOCX/PDF, поэтому технически пользователь может скачать результат
- Добавить в `MessageActions` кнопку "Скачать как документ" (отдельно от общего скачивания), которая будет более заметной для ассистентских ответов с длинным контентом (более 500 символов)

Файлы:
- `src/components/chat/MessageActions.tsx` -- сделать кнопку скачивания более видимой (не только в hover)
- `src/components/chat/DepartmentChatMessage.tsx` -- аналогично

---

## 4. Сообщения без вызова агента в чате отдела

**Проблема**: В `useOptimizedDepartmentChat.ts` строки 268-273 -- если `parseMention` не находит агента, показывается ошибка и сообщение не отправляется. Пользователи не могут общаться между собой.

**Решение**:
- `src/hooks/useOptimizedDepartmentChat.ts` -- если `!agentId`, сохранять сообщение как обычное текстовое (без вызова AI). Убрать `toast.error` и `return`. Сообщение сохраняется в `department_chat_messages` с `role_id: null`, `message_role: 'user'`, без создания assistant message и стриминга.
- `src/components/chat/DepartmentChatMessage.tsx` -- никаких изменений не нужно, уже отображает user-сообщения

---

## 5. Вложения не видны для Gemini (роль "Поговорить")

**Проблема**: В `chat-stream/index.ts` (строки 1203-1228) при вызове Gemini вложения **не передаются**. Multimodal content строится только для `anthropicMessages`, а `geminiContents` формируется из `simpleMessages` (только текст). Gemini поддерживает inline_data для изображений и PDF, но код этого не использует.

**Решение**:
- `supabase/functions/chat-stream/index.ts` -- при формировании `geminiContents` добавить вложения в `parts` последнего user-сообщения:
  ```text
  Для каждого attachment:
  - image/* -> { inline_data: { mime_type, data: base64 } }
  - application/pdf -> { inline_data: { mime_type: "application/pdf", data: base64 } }
  ```
- Аналогично для OpenAI: добавить image_url parts в сообщения

Файлы:
- `supabase/functions/chat-stream/index.ts` -- модифицировать секцию `case 'gemini'` для включения attachmentParts в Gemini-формате

---

## Порядок реализации

1. Сообщения без агента в чате отдела (критично для UX)
2. Мьютекс в department chat (предотвращение двойной генерации)
3. Кнопка повтора под сообщением пользователя
4. Вложения для Gemini (исправление бага)
5. Улучшение видимости кнопки скачивания

## Затронутые файлы

- `src/hooks/useOptimizedDepartmentChat.ts`
- `src/hooks/useOptimizedChat.ts`
- `src/components/chat/ChatMessage.tsx`
- `src/components/chat/MessageActions.tsx`
- `src/components/chat/DepartmentChatMessage.tsx`
- `supabase/functions/chat-stream/index.ts`

