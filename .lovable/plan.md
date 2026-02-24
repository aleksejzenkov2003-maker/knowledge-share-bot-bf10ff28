

# Добавить поиск товарных знаков по номеру заявки/регистрации

## Что будет сделано

На странице Reputation появится отдельная секция для поиска товарных знаков напрямую по номеру заявки или номеру регистрации, без привязки к конкретной компании.

## Изменения на фронтенде

### Файл: `src/pages/Reputation.tsx`

**1. Добавить переключатель режима поиска:**
- Две вкладки над полем поиска: "Компании" и "Товарные знаки"
- При выборе "Товарные знаки" меняется placeholder и логика поиска

**2. Новый state и логика:**
- `searchMode`: `'company'` | `'trademark'` — режим поиска
- `trademarkSearchResults`: массив результатов поиска ТЗ по номеру
- `handleTrademarkSearch()` — вызывает edge function с `action: 'trademark_search'`

**3. Отображение результатов ТЗ:**
- Карточки с данными: номер регистрации, номер заявки, дата, название/описание, правообладатель, изображение (если есть), статус, классы МКТУ

## Изменения в edge function

### Файл: `supabase/functions/reputation-api/index.ts`

**Новый action `trademark_search`:**
- Попытка поиска по эндпоинту `/fips/patents?number=...` или `/fips/applications?number=...`
- Если Reputation.ru API не поддерживает прямой поиск по номеру — используем альтернативный подход: поиск компании-правообладателя, затем фильтрация её ТЗ по номеру
- Возвращаем найденные данные клиенту

## Технические детали

### Edge Function — новый action:

```typescript
if (action === 'trademark_search') {
  const number = query?.trim();
  if (!number) {
    return error 400;
  }

  const results = [];

  // Try both patents (registered) and applications endpoints with number filter
  for (const endpoint of ['patents', 'applications']) {
    const res = await fetch(
      `${API_BASE}/fips/${endpoint}?number=${encodeURIComponent(number)}`,
      { method: 'GET', headers }
    );
    if (res.ok) {
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.Items || data.Results || []);
      results.push(...items.map(item => ({ ...item, _source: endpoint })));
    }
  }

  return { trademarks: results, count: results.length, query: number };
}
```

### Фронтенд — переключатель режима:

Над строкой поиска добавляются Tabs: "Компании" / "Товарные знаки". При переключении:
- Меняется placeholder: `Номер заявки или номер регистрации`
- Вызывается другой action в edge function
- Результаты отображаются в таблице/карточках с полями ТЗ

### Отображение результатов ТЗ:

Таблица с колонками:
- Номер регистрации
- Номер заявки
- Дата регистрации / подачи
- Описание / словесное обозначение
- Правообладатель
- Статус
- Классы МКТУ

