

## Снять ограничения на типы файлов в чатах

Сейчас в 4 компонентах ввода (`ChatInput`, `ChatInputEnhanced`, `MentionInput`, и частично в Bitrix-чатах) жёстко ограничены MIME-типы. Нужно убрать эти ограничения и принимать любые файлы, оставив только проверку размера (10MB) и количества (5 файлов).

### Изменения

**4 файла — одинаковая правка в каждом:**

1. **`src/components/chat/ChatInput.tsx`**
   - Убрать константу `ALLOWED_TYPES`
   - В `validateFiles`: убрать проверку типа/расширения, оставить только size и count
   - В `<input>` убрать `accept` атрибут (или поставить `accept="*/*"`)
   - Обновить help text: "Любые файлы до 10MB"

2. **`src/components/chat/ChatInputEnhanced.tsx`**
   - Аналогично: убрать `ALLOWED_TYPES`, убрать проверку типа, убрать `accept`
   - Обновить help text

3. **`src/components/chat/MentionInput.tsx`**
   - Аналогично: убрать `ALLOWED_TYPES`, убрать проверку типа, убрать `accept`
   - Обновить help text

4. **`src/hooks/useAttachmentTextExtractor.ts`**
   - Добавить поддержку `.doc` (plain text fallback) и `.md` (как plain text)
   - Расширить ветку plain text: добавить `'md', 'doc', 'json', 'xml', 'html'` и другие текстовые форматы

Bitrix-чаты (`BitrixPersonalChat.tsx`, `BitrixDepartmentChat.tsx`) — тоже убрать ограничения типов аналогично.

### Файлы
- `src/components/chat/ChatInput.tsx`
- `src/components/chat/ChatInputEnhanced.tsx`
- `src/components/chat/MentionInput.tsx`
- `src/hooks/useAttachmentTextExtractor.ts`
- `src/pages/BitrixPersonalChat.tsx`
- `src/pages/BitrixDepartmentChat.tsx`

