

## План: Исправить нормализацию данных Reputation API в чате

### Проблема
API Reputation.ru возвращает вложенные объекты вида `{Items: [...], TotalItems: N}`, а нормализатор в `chat-stream` и компонент `ReputationCompanyCard` ожидают плоские массивы. Из-за этого в чате не отображаются: адрес, директор, учредители, финансы, сотрудники, налогообложение.

### Изменения

**Файл 1: `supabase/functions/chat-stream/index.ts`** (~строки 818-1186)

Переписать `normalizeCompanyData`:
- Извлекать `Address` из `Addresses.Items[0].UnsplittedAddress` (первый `IsActual`)
- Извлекать директора из `Managers.Items[0].Entity.Name` + `Position[0].PositionName`
- Маппить `Managers.Items` → плоский массив `[{Name, Position}]`
- Маппить `Shareholders.Items` → `Founders` с `Share.Size` как процент
- Извлекать `AuthorizedCapitals.Items[0].Sum` → `AuthorizedCapital`
- Извлекать `EmployeesInfo.Items` → `EmployeesCount` + массив по годам
- Извлекать `Rsmp.Items[0].Category` → `RsmpCategory`
- Извлекать `Taxation.Items[0].Types` → `TaxationType`
- Извлекать `ActivityTypes.Items` → плоский массив + `MainActivityCode/Name`
- Извлекать контакты из `ContactInfo.Items`

Обновить текстовый дossier (строки 1056-1186):
- Добавить секцию "Сотрудники" с историей по годам
- Добавить секцию "Налогообложение" (УСН/ОСН/ЕНВД)
- Добавить секцию "Категория МСП" (микро/малое/среднее)
- Добавить секцию "Учредители" с долями из `Shareholders`
- Убедиться что адрес, директор, капитал корректно попадают в дossier

**Файл 2: `src/components/chat/ReputationCompanyCard.tsx`**

Обновить карточку для отображения новых данных:
- Добавить секцию "Сотрудники" (число + год)
- Добавить секцию "Налогообложение"
- Добавить секцию "МСП"
- Исправить извлечение `Founders` из `Shareholders` (с долями в %)
- Исправить извлечение `Managers` — обработка `{Items: [{Entity: {Name}, Position: [{PositionName}]}]}`
- Добавить `Address` из `Addresses.Items[].UnsplittedAddress`

### Итого: 2 файла
- `supabase/functions/chat-stream/index.ts` — фикс нормализатора + расширение дossier
- `src/components/chat/ReputationCompanyCard.tsx` — новые секции данных

