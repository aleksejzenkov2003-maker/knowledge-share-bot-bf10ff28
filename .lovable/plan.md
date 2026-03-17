

# Именование скачиваемых файлов по тексту запроса пользователя

## Проблема
Все скачанные файлы из чата называются `response-2025-01-01.md/docx/pdf`. Нужно называть по первым словам вопроса пользователя, как это делается в истории чатов.

## Решение

Добавить новый проп `userQuestion?: string` в `DownloadDropdown` и использовать его для формирования имени файла.

### Генерация имени файла
Утилита `generateFileName(userQuestion, ext)`:
- Берёт первые 5-6 слов из вопроса пользователя
- Транслитерирует кириллицу или оставляет как есть (современные ОС поддерживают кириллицу в именах)
- Убирает спецсимволы, обрезает до ~50 символов
- Fallback: `response-{date}` если вопрос не передан

### Файлы для изменения

1. **`src/components/chat/DownloadDropdown.tsx`**
   - Добавить проп `userQuestion?: string`
   - Создать функцию `generateFileName(question, extension)`
   - Заменить все `response-${date}` на вызов этой функции

2. **`src/components/chat/MessageActions.tsx`**
   - Добавить проп `userQuestion?: string` в интерфейс
   - Прокинуть его в `<DownloadDropdown>`

3. **`src/components/chat/ChatMessage.tsx`**
   - Добавить проп `userQuestion?: string` в `ChatMessageProps`
   - Прокинуть в `<MessageActions>`

4. **`src/pages/Chat.tsx`**
   - При рендере `ChatMessage` для assistant-сообщений найти предыдущее user-сообщение и передать его текст как `userQuestion`

5. **Аналогично для других чатов**:
   - `src/components/chat/DepartmentChatMessage.tsx` — добавить проп и прокинуть в `<DownloadDropdown>`
   - `src/components/chat/BitrixMessageActions.tsx` — добавить проп и прокинуть в `<DownloadDropdown>`
   - Страницы `DepartmentChat.tsx`, `BitrixChatSecure.tsx` и др. — прокинуть `userQuestion` при рендере

