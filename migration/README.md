# Миграция с Lovable Cloud на собственный Supabase

Этот документ описывает полный перенос проекта `knowledge-share-bot` с Lovable Cloud (`eidesurdreoxroarympm`) на ваш собственный Supabase-проект.

## Что мы переносим

| Компонент | Объём |
|---|---|
| Таблицы public | 46 |
| Auth users | 16 (с хешами паролей) |
| Storage файлы | 849 (~408 МБ) в 6 бакетах |
| Edge Functions | 27 |
| Секреты | 24 (см. `SECRETS.md`) |
| Расширения PostgreSQL | `vector`, `pg_trgm`, `uuid-ossp` |

## Требования

- Локально: `psql`, `pg_dump` версии **≥ 15** (в идеале 17)
- Node.js 20+ для скрипта `migrate-storage.mjs`
- Supabase CLI: `npm i -g supabase`
- На новом Supabase: план **Pro** (для размера БД и доступа к Direct Connection)

---

## Шаг 1. Создайте новый Supabase-проект

1. Зайдите в https://supabase.com/dashboard
2. New Project → выберите регион (для РФ/EU — Frankfurt `eu-central-1`)
3. Дождитесь, пока проект станет ACTIVE
4. Запишите:
   - **Project Ref** (`xxxxxxxxxxxxxxxxx`)
   - **Database password** (показывается один раз!)
   - **Service role key**: Settings → API → `service_role` (secret)
   - **Anon key**: Settings → API → `anon` (public)
   - **DB URL Direct**: Settings → Database → Connection string → **Direct connection** (НЕ pooler!)

## Шаг 2. Включите расширения

В новой БД (SQL Editor):

```sql
create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
```

## Шаг 3. Получите connection string старой БД (Lovable Cloud)

В Lovable: **Backend → Settings → Database → Connection string → Direct connection**.

Формат:
```
postgresql://postgres.eidesurdreoxroarympm:<PASSWORD>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

Запишите как `OLD_URL`.

## Шаг 4. Дамп схемы

```bash
export OLD_URL="postgresql://postgres.eidesurdreoxroarympm:<PWD>@..."
export NEW_URL="postgresql://postgres.<NEW_REF>:<PWD>@..."

mkdir dumps && cd dumps

# 1. Схема public (таблицы, индексы, функции, триггеры, RLS)
pg_dump "$OLD_URL" \
  --schema=public \
  --no-owner --no-privileges \
  --schema-only \
  > schema_public.sql

# 2. Кастомные ENUM-типы (app_role, user_status, project_member_role, workflow_status и т.д.)
# Они уже включены в schema_public.sql, но проверьте начало файла
```

## Шаг 5. Импорт схемы в новую БД

```bash
psql "$NEW_URL" -v ON_ERROR_STOP=1 -f schema_public.sql
```

⚠️ Если будут ошибки про существующие функции (`has_role`, `is_admin`) — это нормально, удалите их из `schema_public.sql` перед запуском или используйте `--clean`.

## Шаг 6. Дамп и импорт данных

```bash
# Дамп данных public
pg_dump "$OLD_URL" \
  --schema=public \
  --data-only \
  --disable-triggers \
  --no-owner --no-privileges \
  > data_public.sql

# Импорт
psql "$NEW_URL" -v ON_ERROR_STOP=1 -f data_public.sql
```

## Шаг 7. Перенос Auth users

```bash
# Дамп
pg_dump "$OLD_URL" \
  --schema=auth \
  --table=auth.users \
  --table=auth.identities \
  --data-only --no-owner \
  > auth_users.sql

# В новом Supabase сначала очистите тестовых пользователей если есть:
psql "$NEW_URL" -c "TRUNCATE auth.users CASCADE;"

# Импорт
psql "$NEW_URL" -v ON_ERROR_STOP=1 -f auth_users.sql
```

⚠️ Хеши паролей переносятся как есть (bcrypt), пользователи смогут войти со старыми паролями.

## Шаг 8. Перенос Storage метаданных + файлов

### 8a. Бакеты и метаданные

```bash
pg_dump "$OLD_URL" \
  --schema=storage \
  --table=storage.buckets \
  --table=storage.objects \
  --data-only --no-owner \
  > storage_meta.sql

psql "$NEW_URL" -v ON_ERROR_STOP=1 -f storage_meta.sql
```

### 8b. Файлы (через скрипт)

```bash
cd ../  # вернуться в migration/
npm install @supabase/supabase-js

export OLD_SUPABASE_URL="https://eidesurdreoxroarympm.supabase.co"
export OLD_SERVICE_ROLE_KEY="<старый service_role key>"
export NEW_SUPABASE_URL="https://<NEW_REF>.supabase.co"
export NEW_SERVICE_ROLE_KEY="<новый service_role key>"

node migrate-storage.mjs
```

Скрипт пройдёт по всем 6 бакетам и перенесёт ~849 файлов. Время: ~15-30 мин для 408 МБ.

## Шаг 9. RLS политики на storage.objects

В Lovable Cloud они уже настроены, но при дампе `--schema=storage` политики **не переносятся**. Создайте их вручную в новой БД:

```sql
-- Пример для rag-documents (приватный бакет, доступ admin/moderator)
CREATE POLICY "Admin manage rag-documents" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'rag-documents' AND public.is_admin())
  WITH CHECK (bucket_id = 'rag-documents' AND public.is_admin());

-- chat-attachments — пользователь видит только свои файлы
CREATE POLICY "Users see own attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ... и т.д. для остальных бакетов
```

Полный список политик можно скопировать из старой БД:
```sql
-- В старой БД:
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects';
```

## Шаг 10. Деплой Edge Functions

```bash
cd /var/www/knowledge-share-bot
supabase login
supabase link --project-ref <NEW_PROJECT_REF>

# Деплой всех функций сразу
supabase functions deploy --no-verify-jwt
```

## Шаг 11. Секреты Edge Functions

В новом дашборде: **Edge Functions → Manage secrets**. Добавьте все секреты из `SECRETS.md`.

⚠️ `LOVABLE_API_KEY` — это внутренний ключ Lovable AI Gateway. Его не получится перенести. Замените прямыми ключами OpenAI/Anthropic/Gemini в коде функций (`chat-stream`, `chat`, `deep-research` и т.д. — поищите `LOVABLE_API_KEY` в `supabase/functions/`).

## Шаг 12. Auth настройки

В новом дашборде: **Authentication → Providers → Email**:
- ☐ **Disable signup** (важно — у нас публичная регистрация запрещена)
- ☑ Confirm email (по необходимости)
- Site URL: ваш фронтенд-домен
- Redirect URLs: добавить все домены (728ai.ru, apt728.ru, ваш новый)

## Шаг 13. Подключение фронтенда

⚠️ **Важно**: Lovable жёстко привязан к Cloud. Чтобы фронтенд работал на вашем Supabase:

1. **Форкните проект на GitHub** (Lovable → Connect GitHub)
2. Клонируйте локально
3. Замените содержимое `src/integrations/supabase/client.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = "https://<NEW_REF>.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "<NEW_ANON_KEY>";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
```

4. Сгенерируйте новые типы:
```bash
supabase gen types typescript --project-id <NEW_REF> > src/integrations/supabase/types.ts
```

5. Деплой на свой хостинг (Vercel, Netlify, ваш сервер):
```bash
npm run build
# upload dist/ на сервер
```

После этого Lovable-проект можно отключить (или оставить как песочницу).

---

## Проверка после миграции

```sql
-- В новой БД:
SELECT 'tables' as obj, COUNT(*) FROM information_schema.tables WHERE table_schema='public'
UNION ALL
SELECT 'auth_users', COUNT(*) FROM auth.users
UNION ALL
SELECT 'storage_objects', COUNT(*) FROM storage.objects
UNION ALL
SELECT 'documents', COUNT(*) FROM public.documents
UNION ALL
SELECT 'chat_roles', COUNT(*) FROM public.chat_roles;
```

Должно совпадать со старой БД.

## Откат

Старая БД на Lovable Cloud остаётся нетронутой. Если что-то пошло не так — просто продолжайте использовать её, ничего не удаляйте в новой БД до полной проверки.
