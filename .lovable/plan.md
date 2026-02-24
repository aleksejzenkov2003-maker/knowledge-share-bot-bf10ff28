

# Исправить отображение данных из полной карточки Reputation.ru

## Проблема
API Reputation.ru возвращает **два разных формата данных**:
1. **Поиск** (`/entities/search`) -- плоская структура: `Name`, `ManagerName`, `Capital`, `Phones`, `Emails`, `Address`
2. **Полная карточка** (`/entities/company`) -- вложенная структура: `Names.Items[]`, `Managers.Items[]`, `AuthorizedCapitals.Items[]`, `Addresses.Items[]`, `ActivityTypes.Items[]`, `EmployeesInfo.Items[]`, `Taxation.Items[]`

Сейчас `CompanyDetailCard` читает только плоские поля. Когда `handleSelectResult` заменяет данные поиска на полную карточку, вкладки пустеют -- вложенные поля не распарсиваются.

## Решение
Нормализовать данные карточки: либо на уровне edge-функции (серверная нормализация), либо на уровне фронтенда (клиентская нормализация). Наилучший подход -- **нормализация на фронтенде** в `CompanyDetailCard`, потому что:
- Не нужно менять edge-функцию
- Мы видим оба формата и можем обработать оба

## Технические детали

### Файл: `src/pages/Reputation.tsx`

**1. Добавить функцию нормализации** (перед `CompanyDetailCard`):

```typescript
function normalizeCompanyData(raw: any): any {
  const c = { ...raw };

  // Name
  if (!c.Name && c.Names?.Items?.length > 0) {
    c.Name = c.Names.Items[0].ShortName || c.Names.Items[0].FullName;
  }

  // Address
  if (!c.Address && c.Addresses?.Items?.length > 0) {
    const actual = c.Addresses.Items.find((a: any) => a.IsActual) || c.Addresses.Items[0];
    c.Address = actual.UnsplittedAddress;
  }

  // ManagerName + Managers list
  if (!c.ManagerName && c.Managers?.Items?.length > 0) {
    const director = c.Managers.Items.find((m: any) => 
      m.IsActual && m.Position?.some((p: any) => p.PositionType === '02')
    ) || c.Managers.Items.find((m: any) => m.IsActual) || c.Managers.Items[0];
    c.ManagerName = director?.Entity?.Name;
    // Учредители
    c._managers = c.Managers.Items;
  }

  // Founders from Managers (учредители)
  if (!c.Founders && c.Founders?.Items) {
    c.Founders = c.Founders.Items;
  }

  // Capital
  if (c.Capital == null && c.AuthorizedCapitals?.Items?.length > 0) {
    const actual = c.AuthorizedCapitals.Items.find((a: any) => a.IsActual) || c.AuthorizedCapitals.Items[0];
    c.Capital = actual.Sum;
    c._capitalType = actual.Type;
  }

  // EmployeesCount + history
  if (c.EmployeesCount == null && c.EmployeesInfo?.Items?.length > 0) {
    const actual = c.EmployeesInfo.Items.find((e: any) => e.IsActual) || c.EmployeesInfo.Items[0];
    c.EmployeesCount = actual.Count;
    c._employeesHistory = c.EmployeesInfo.Items;
  }

  // ActivityTypes -- преобразовать из объектов в читаемый формат
  if (c.ActivityTypes?.Items) {
    c.MainActivityType = c.ActivityTypes.Items.find((a: any) => a.IsMain);
    c._activityTypes = c.ActivityTypes.Items;
    c.ActivityTypes = c.ActivityTypes.Items.filter((a: any) => !a.IsMain).map((a: any) => a.Code);
  }

  // Status -- нормализовать объект
  if (typeof c.Status === 'object' && c.Status?.Status) {
    c._statusObj = c.Status;
    // оставляем как объект, CompanyDetailCard уже обрабатывает объектный Status
  }

  // Taxation
  if (c.Taxation?.Items?.length > 0) {
    const actual = c.Taxation.Items.find((t: any) => t.IsActual) || c.Taxation.Items[0];
    c._taxation = actual.Types;
  }

  // Rsmp
  if (c.Rsmp?.Items?.length > 0) {
    const actual = c.Rsmp.Items.find((r: any) => r.IsActual) || c.Rsmp.Items[0];
    c.RsmpCategory = actual.Category;
  }

  // OtherAddresses
  if (!c.OtherAddresses && c.Addresses?.Items?.length > 1) {
    c.OtherAddresses = c.Addresses.Items
      .filter((a: any) => !a.IsActual)
      .map((a: any) => a.UnsplittedAddress);
  }

  return c;
}
```

**2. Применить нормализацию в `CompanyDetailCard`** (строка 478):

Заменить `const c = company as any;` на:
```typescript
const c = normalizeCompanyData(company);
```

**3. Улучшить отображение во вкладках:**

- **Руководство**: показать всех менеджеров из `c._managers` с должностями
- **Финансы**: показать тип капитала из `c._capitalType`, историю сотрудников из `c._employeesHistory`
- **ОКВЭД**: показать полные названия для допкодов из `c._activityTypes` (не только коды)
- **Реквизиты**: добавить систему налогообложения из `c._taxation`

**4. Вкладка "Руководство"** -- расширенное отображение:

Вместо одного поля "Руководитель" показать таблицу всех менеджеров:
- ФИО
- Должность
- Дата назначения
- Статус (действующий/бывший)

**5. Вкладка "ОКВЭД"** -- полные названия:

Вместо Badge с кодами показать список:
- Код + Название (из `c._activityTypes`)
- Пометка "Основной" для IsMain

**6. Вкладка "Финансы"** -- расширение:

Добавить:
- Тип капитала
- График численности сотрудников по годам (`c._employeesHistory`)
- Система налогообложения (`c._taxation`)

