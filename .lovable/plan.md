
# Исправление 4 проблем: RAG для Юриста, веб-поиск, регенерация, DOCX-экспорт

## Обнаруженные проблемы

### 1. Юрист (Gemini/Sonnet) - веб-поиск не работает

**Причина:** В `chat-stream/index.ts` (строка 716) веб-поиск через Perplexity срабатывает ТОЛЬКО для провайдера `anthropic`:
```
providerConfig.provider_type === 'anthropic'
```
Юрист настроен на провайдер `gemini` (Gemini 2.5 Pro), поэтому веб-поиск никогда не вызывается, даже если `allow_web_search: true`.

**Решение:** Убрать ограничение на тип провайдера -- веб-поиск должен работать для всех провайдеров (anthropic, gemini, gigachat, openai), если роль позволяет.

### 2. Юрист (Sonnet 3.5) - не работает

**Причина:** Роль "Юрист" в БД настроена с `model_config: {model: gemini-2.5-pro, provider_id: ...}`. Если пользователь пытается переключить на Sonnet 3.5 через UI -- модель `claude-3-5-sonnet-20241022` уже в списке валидных моделей. Но если в `model_config` указана не та модель -- система использует Gemini вместо Claude. Это вопрос конфигурации роли, но стоит проверить, что `claude-3-5-sonnet-20241022` корректно обрабатывается (он уже в whitelist, строка 1125).

**Действие:** Убедиться, что при регенерации с другой ролью (Claude) корректно передается provider_id.

### 3. Регенерация ответа через другую роль -- игнорируется

**Причина:** В `useOptimizedChat.ts` (строка 618-627) при регенерации:
```typescript
if (newRoleId && newRoleId !== selectedRoleId) {
  setSelectedRoleId(newRoleId);  // React setState -- асинхронно!
}
sendMessage(userMessage.content, ...);  // Использует selectedRoleId из замыкания
```
`setSelectedRoleId` -- это React setState, обновление происходит асинхронно. Вызов `sendMessage` сразу после использует СТАРЫЙ `selectedRoleId`. Результат: регенерация всегда использует текущего агента, а не выбранного.

**Решение:** Передавать `roleIdToUse` напрямую в `sendMessage`, добавив опциональный параметр `overrideRoleId` в функцию отправки. Или сделать `sendMessage` принимающим roleId явно.

### 4. Скачивание в DOCX -- звездочки и сломанные таблицы

**Причина:** В `DownloadDropdown.tsx` (строки 130-151) парсер Markdown для DOCX:
- Обрабатывает `**bold**` и `*italic*` через regex split, но regex `(\*\*[^*]+\*\*|\*[^*]+\*|...)` ломается на вложенных паттернах и оставляет непарсенные `*` в тексте
- Таблицы Markdown (`| col1 | col2 |`) **вообще не обрабатываются** -- они идут как обычный текст, разбиваясь на строки с `|` символами
- Ссылки вида `[text](url)` не обрабатываются

**Решение:** Добавить обработку Markdown-таблиц через `docx` Table/TableRow/TableCell. Улучшить парсинг inline-форматирования (bold/italic) с поддержкой вложенных паттернов. Очищать оставшиеся `*` после парсинга.

## Файлы для изменения

### 1. `supabase/functions/chat-stream/index.ts`
- **Строка 716:** Убрать условие `providerConfig.provider_type === 'anthropic'` из проверки веб-поиска. Заменить на проверку наличия PERPLEXITY_API_KEY (которая уже есть на строке 717).

### 2. `src/hooks/useOptimizedChat.ts`
- **Функция `sendMessage`** (~строка 200): Добавить опциональный параметр `overrideRoleId?: string`, который при наличии будет использоваться вместо `selectedRoleId` для запроса к chat-stream.
- **Функция `regenerateResponse`** (строка 627): Передавать `roleIdToUse` в `sendMessage` через новый параметр вместо надежды на async setState.

### 3. `src/components/chat/DownloadDropdown.tsx`
- **Функция `handleDownloadDOCX`** (строки 84-152): 
  - Добавить обработку Markdown-таблиц (строки `| ... |`): парсить заголовки и строки, создавать `Table`, `TableRow`, `TableCell` из библиотеки `docx`
  - Улучшить inline-парсинг: обрабатывать `[text](url)`, очищать оставшиеся `*` после парсинга bold/italic
  - Добавить импорт `Table`, `TableRow`, `TableCell`, `WidthType`, `BorderStyle` из `docx`

## Порядок реализации

1. Исправить веб-поиск в chat-stream (быстро, 1 строка)
2. Исправить регенерацию в useOptimizedChat (5-10 строк)
3. Переделать DOCX-экспорт с поддержкой таблиц (40-60 строк)
4. Передеплоить chat-stream
