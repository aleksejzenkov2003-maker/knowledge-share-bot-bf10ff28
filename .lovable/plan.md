

## План: Добавить вкладку "Интернет" с поиском через Perplexity Sonar

### Суть задачи
В карточке компании на странице `/reputation` добавить новую вкладку "Интернет", которая позволяет выполнить поиск информации о компании через Perplexity Sonar API и отобразить результаты с источниками прямо в этой вкладке.

### Техническая реализация

**Файл 1: `src/pages/Reputation.tsx`**

1. **Добавить секцию в `DATA_SECTIONS`**: Новый элемент `{ key: 'internet', label: 'Интернет', description: 'Поиск информации в интернете' }` и иконку `Globe` в `SECTION_ICONS`.

2. **Добавить state в `CompanyDetailCard`**:
   - `webSearchResult: string` — результат поиска (markdown)
   - `webSearchCitations: string[]` — массив URL-источников
   - `webSearchLoading: boolean` — индикатор загрузки
   - `webSearchError: string | null`

3. **Добавить вкладку "Интернет"** после "Контакты" (после строки ~1168):
   - Кнопка "Поиск в интернете" — вызывает edge function `reputation-web-search`
   - Формирует запрос: `"Полное досье на компанию {Name}, ИНН {Inn}. Основная деятельность, репутация, новости, отзывы, ключевые факты."`
   - Результат рендерится через `ReactMarkdown` (уже установлен в проекте)
   - Источники отображаются как кликабельные бейджи с номерами

**Файл 2: `supabase/functions/reputation-web-search/index.ts`** (новый)

Edge function, которая:
- Принимает `{ companyName, inn, ogrn }` 
- Формирует промпт для Perplexity Sonar: подробное досье о компании
- Вызывает `https://api.perplexity.ai/chat/completions` с моделью `sonar-pro` (для максимума цитат)
- Возвращает `{ content, citations }` — markdown-текст и массив источников
- Обрабатывает 429/402 ошибки

### UI вкладки "Интернет"

```text
┌─────────────────────────────────────┐
│ 🌐 Интернет                        │
│                                     │
│ [🔍 Найти информацию в интернете]   │
│                                     │
│ ─── после нажатия ───               │
│                                     │
│ Markdown-рендер результата          │
│ с заголовками, списками и т.д.      │
│                                     │
│ Источники:                          │
│ [1] rbc.ru  [2] forbes.ru  [3] ...  │
└─────────────────────────────────────┘
```

### Итого файлов: 2
- `src/pages/Reputation.tsx` — добавить секцию "internet" + вкладку с UI поиска и рендером markdown
- `supabase/functions/reputation-web-search/index.ts` — новая edge function для Perplexity Sonar

