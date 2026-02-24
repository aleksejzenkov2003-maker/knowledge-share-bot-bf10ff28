

# Подключить все API-эндпоинты Reputation.ru при выборе компании

## Проблема
Сейчас при выборе компании из списка результатов (`handleSelectResult`) используются только данные из поискового ответа — без загрузки полной карточки компании. Из-за этого вкладки "Руководство", "Финансы", "ОКВЭД", "Контакты" и другие часто пустые, потому что API поиска возвращает лишь базовые поля (Name, Inn, Ogrn, Address, Type, Status).

Согласно скриншоту, у Reputation.ru доступны 5 эндпоинтов:
1. `POST /entities/search` -- поиск (работает)
2. `GET /entities/company` -- полная карточка компании (не вызывается при выборе из списка)
3. `GET /fips/patents` -- патенты (работает через кнопку)
4. `GET /fips/applications` -- заявки (работает через кнопку)
5. `GET /entities/id` -- внутренний ID по ИНН/ОГРН (вызывается только для единичного результата)

## Решение

### 1. Фронтенд: `src/pages/Reputation.tsx`

**Изменить `handleSelectResult`** -- при клике на карточку из списка:
- Показать лоадер
- Вызвать edge-функцию с `action: 'company'` (или `'entrepreneur'`), передав `entity_id` и `entity_type`
- Параллельно вызвать `action: 'trademarks'` для автоматической загрузки товарных знаков
- Если карточка загрузилась -- показать полные данные
- Если ошибка -- показать данные из поиска как fallback

**Добавить автозагрузку товарных знаков** -- при открытии карточки компании автоматически загружать FIPS данные (вместо ручной кнопки).

**Добавить автозагрузку entity ID** -- при наличии ИНН загружать дополнительные данные через `/entities/id`.

### 2. Edge-функция: `supabase/functions/reputation-api/index.ts`

Без изменений -- все нужные actions (`company`, `entrepreneur`, `trademarks`, `search`) уже реализованы в backend.

## Технические детали

**Файл: `src/pages/Reputation.tsx`**

Функция `handleSelectResult` (строка 159-163):
- Заменить прямое присвоение на async-функцию
- Добавить `setLoading(true)` 
- Вызвать `supabase.functions.invoke('reputation-api', { body: { action: entityType, entity_id: result.Id, entity_type: result.Type } })`
- Параллельно вызвать трейдмарки: `supabase.functions.invoke('reputation-api', { body: { action: 'trademarks', entity_id: result.Id, entity_type: result.Type } })`
- Результат карточки записать в `setSelectedCompany`
- Результат трейдмарков передать в `CompanyDetailCard` через новый проп или state

Добавить state:
- `loadingDetail` (boolean) -- для индикации загрузки карточки отдельно от поиска
- `trademarksData` (array) -- автозагруженные товарные знаки

В `CompanyDetailCard`:
- Принять проп `initialTrademarks` для автозагруженных данных
- Убрать кнопку "Поиск в FIPS" если данные уже загружены, или оставить для перезагрузки

