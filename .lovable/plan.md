

## План: Красивое досье в чатах с полными данными

### Текущая ситуация
- `ReputationCompanyCard` уже рендерится в обоих чатах (личный и отдельский) и выглядит хорошо
- Проблема: edge function генерирует **длинный markdown-текст** который дублирует карточку и выглядит как "сплошняк"
- Финансовые данные (выручка, прибыль) не извлекаются из API
- Контакты из поисковой выдачи не мёрджатся в `reputationCompanyData`

### Изменения

**Файл 1: `supabase/functions/chat-stream/index.ts`**

1. **Сократить текстовый дossier** — вместо длинного markdown оставить только краткую сводку (название, ИНН, статус, адрес — 3-4 строки), т.к. все данные уже показываются в `ReputationCompanyCard`
2. **Добавить финансовые данные в нормализатор** — извлечь `FinancialStatements` / `Finance` / `Revenue` / `Profit` из API (поля вида `{Items: [{Year, Revenue, Profit}]}`)
3. **Мёрджить контакты** из search result в company data (Phones, Emails, Sites) — как уже сделано на странице Reputation

**Файл 2: `src/components/chat/ReputationCompanyCard.tsx`**

1. **Добавить секцию "Финансы"** — таблица выручка/прибыль по годам (если данные есть)
2. **Добавить кнопки "Выписка ЕГРЮЛ" и "Reputation.ru"** — как на странице /reputation
3. **Показать контакты из Sites** — уже есть `websites`, но нужно добавить `Sites` как fallback

### Технические детали

Нормализатор — добавить извлечение:
```typescript
// Financial data
const rawFinance = unwrapItems(n.FinancialStatements || n.Finance);
if (rawFinance.length > 0) {
  n.FinancialHistory = rawFinance.map(f => ({
    Year: f.Year || extractYear(f.Date),
    Revenue: f.Revenue ?? f.Income,
    Profit: f.Profit ?? f.NetProfit,
  })).sort((a,b) => String(b.Year).localeCompare(String(a.Year)));
}

// Merge contacts from search result
if (searchResult.Phones) n.Phones = searchResult.Phones;
```

Текст дossier — заменить на:
```
📋 **Компания:** ИНН 1234567890 — Действующая
Подробное досье отображено в карточке ниже.
```

### Итого: 2 файла
- `supabase/functions/chat-stream/index.ts` — сокращённый текст + финансы + мёрдж контактов
- `src/components/chat/ReputationCompanyCard.tsx` — секция финансов + кнопки ЕГРЮЛ

