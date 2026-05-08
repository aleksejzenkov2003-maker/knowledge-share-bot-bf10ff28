## Цель

Импортировать все заявки с сервера `91.228.221.227:/parser` со всеми полями биографии, добавить боковую навигацию по годам с счётчиками и встроенный просмотр оригинального HTML-файла заявки.

## 1. Раздача файлов с сервера (вы делаете на сервере)

Настроить nginx на `apt728.ru` так, чтобы папка `/parser` была доступна как:
```
https://apt728.ru/parser/<year>/<section>/<file>.html
```

Минимальный server-block (на сервере, не в коде проекта):
```
location /parser/ {
  alias /parser/;
  add_header Access-Control-Allow-Origin "*";
  autoindex off;
  default_type text/html;
  charset windows-1251;  # фронт сам перекодирует, но лучше отдавать с правильным charset
}
```

В приложении используем переменную окружения `VITE_FIPS_FILES_BASE_URL = https://apt728.ru/parser` (значение по умолчанию).

## 2. Миграция БД (схема)

Добавить недостающие колонки в `fips_applications`, чтобы расширенные поля жили в нормальных столбцах (для фильтров и индекса), а полный сырой набор всё равно сохраняется в `parsed_data`:

- `priority_date` date — приоритет (220)
- `publication_date` date — дата публикации (450)
- `bulletin_number` text — № бюллетеня
- `expiry_date` date — срок действия (181)
- `classes_mktu` text — классы МКТУ (511), через запятую
- `color_specification` text (591)
- `unprotected_elements` text (526)
- `description_element` text (540 текстом)
- `transliteration` text (441)
- `kind_specification` text (550)
- `image_url_full` text — полноразмерное изображение
- `right_holder_country_code` text (2 буквы)
- `correspondence_address` text (750)

Индексы:
- `idx_fips_year` ON `(year)` — для счётчиков и фильтра
- `idx_fips_app_number_prefix` ON `(left(application_number, 4))` — резерв, если года нет
- Подтверждаем существующий trigram-индекс на `applicant_name/title`.

RPC для боковой панели (одной поездкой получаем счётчики по годам):
```sql
CREATE OR REPLACE FUNCTION public.fips_year_counts()
RETURNS TABLE(year int, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT COALESCE(year, NULLIF(left(application_number,4),'')::int) AS year,
         count(*)::bigint
  FROM fips_applications
  GROUP BY 1
  ORDER BY 1 DESC NULLS LAST;
$$;
```

## 3. Доработка парсера `scripts/import-fips-applications.mjs`

Расширить `parseRecord` так, чтобы:
- Для каждого `<p class="bib">…(CODE)…<b>VALUE</b></p>` извлекался каждый код ИНИД (151, 181, 210, 220, 230, 441, 450, 511, 526, 540, 550, 591, 731, 732, 750…).
- Поля 220/450/181/151 парсились в `date`.
- Из 450 вынимался номер бюллетеня (`Бюл.№N`).
- Из 732 вынимался `country_code` `(XX)` в конце.
- Изображение: `<img class="mini">` → thumbnail; `<a href="*.jpg">` рядом → `image_url_full`. Относительные ссылки клеим через base = путь к файлу на `https://apt728.ru/parser/...`.
- `year` = либо текущая папка (если есть), либо `Number(application_number.slice(0,4))`.
- В `parsed_data` пишем **все** найденные коды ИНИД как `{ "210": "...", "220": "...", ... }` + `raw_text` (первые 4000 символов) для отладки.
- `file_path` сохраняем уже как относительный путь от `/parser` (например `2024/TM/2024100123.html`) — фронт сам префиксует базой.
- Декодирование HTML — текущая логика `decodeHtml` уже корректна для cp1251, оставляем.

Запуск (вы):
```bash
SUPABASE_URL=https://eidesurdreoxroarympm.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=*** \
node scripts/import-fips-applications.mjs --root=/parser --batch=300
```

## 4. UI — `src/pages/FipsApplications.tsx`

Перевод страницы на layout «sidebar + контент»:

```text
┌─ Боковая панель (240 px) ──────┬─ Контент ─────────────────────┐
│ Все годы           (350 124)   │ [поиск] [статус ▼]            │
│ 2026               ( 12 003)   │ ─────────────────────────────  │
│ 2025               ( 48 110)   │  таблица заявок                │
│ 2024               ( 42 884)   │  пагинация                     │
│ ...                            │                                │
└────────────────────────────────┴───────────────────────────────┘
```

- Боковая панель — отдельный компонент `FipsYearSidebar`, использует RPC `fips_year_counts()` (1 запрос), кэш React Query 5 мин, кликом меняет `yearFilter`.
- Текущий select «Год» убираем — функцию полностью забирает sidebar.
- Активный год подсвечивается, есть пункт «Все годы».
- На мобильном — collapsible через shadcn `Sidebar` (`collapsible="icon"`).

## 5. Карточка — `src/pages/FipsApplicationDetails.tsx`

Реорганизация карточки в две колонки:

- Слева: блок «Изображение» (thumbnail + ссылка на полноразмерное), блок «Реквизиты» (название, заявка, рег. номер, заявитель, ИНН/ОГРН, страна, адрес, корресп. адрес).
- Справа: блок «Даты и публикация» (приоритет, заявка, регистрация, публикация + бюллетень, окончание), блок «Классификация» (МКТУ, цвета, неохраняемые, тип знака, транслитерация).
- Под карточкой — **встроенный просмотр оригинального HTML** в `<iframe>`:
  ```tsx
  <iframe
    src={`${BASE}/${file_path}`}
    sandbox="allow-same-origin"
    className="w-full h-[80vh] rounded border"
  />
  ```
  + кнопка «Открыть в новой вкладке» и «Скачать».
- Сворачиваемый блок «Все поля парсера (raw)» — текущий `autoFields`, оставляем для отладки.

## 6. Порядок выполнения

1. Миграция (новые колонки + индексы + `fips_year_counts`).
2. Доработка `scripts/import-fips-applications.mjs` (расширенные поля, год из номера, относительные пути).
3. Компонент `FipsYearSidebar` + переработка `FipsApplications.tsx`.
4. Переработка `FipsApplicationDetails.tsx` с iframe.
5. Вы запускаете импорт на сервере; проверяем счётчики, открытие карточки, корректность iframe.

## Технические детали для реализатора

- Базовый URL файлов: `const FIPS_BASE = import.meta.env.VITE_FIPS_FILES_BASE_URL ?? "https://apt728.ru/parser";` — единое место.
- iframe изолируется `sandbox="allow-same-origin"` (без скриптов и форм) — безопасный показ.
- Если `file_path` начинается с `http`, считаем его абсолютным; иначе клеим с `FIPS_BASE`.
- При апдейте `parsed_data` использовать `upsert(..., { onConflict: 'file_path' })` (уже так).
- ВАЖНО: тип в `src/integrations/supabase/types.ts` обновится автоматически после миграции — после этого можно использовать новые поля типизированно.
