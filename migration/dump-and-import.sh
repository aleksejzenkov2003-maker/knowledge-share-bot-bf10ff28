#!/usr/bin/env bash
# Полный дамп старой БД и импорт в новую.
# Использование:
#   export OLD_URL="postgresql://postgres.eidesurdreoxroarympm:..."
#   export NEW_URL="postgresql://postgres.<NEW_REF>:..."
#   bash dump-and-import.sh

set -euo pipefail

if [[ -z "${OLD_URL:-}" || -z "${NEW_URL:-}" ]]; then
  echo "ERROR: задайте OLD_URL и NEW_URL (Direct connection strings, не pooler)"
  exit 1
fi

# Проверка версий
PGV=$(pg_dump --version | grep -oP '\d+' | head -1)
if [[ "$PGV" -lt 15 ]]; then
  echo "ERROR: нужен pg_dump >= 15 (у вас $PGV). Установите: apt install postgresql-client-17"
  exit 1
fi

mkdir -p dumps
cd dumps

echo "=== 1/5 Дамп схемы public ==="
pg_dump "$OLD_URL" \
  --schema=public \
  --no-owner --no-privileges \
  --schema-only \
  > schema_public.sql
echo "    ✓ schema_public.sql ($(wc -l < schema_public.sql) строк)"

echo "=== 2/5 Дамп данных public ==="
pg_dump "$OLD_URL" \
  --schema=public \
  --data-only \
  --disable-triggers \
  --no-owner --no-privileges \
  > data_public.sql
echo "    ✓ data_public.sql ($(du -h data_public.sql | cut -f1))"

echo "=== 3/5 Дамп auth users ==="
pg_dump "$OLD_URL" \
  --schema=auth \
  --table=auth.users \
  --table=auth.identities \
  --data-only --no-owner --no-privileges \
  > auth_users.sql
echo "    ✓ auth_users.sql"

echo "=== 4/5 Дамп storage метаданных ==="
pg_dump "$OLD_URL" \
  --schema=storage \
  --table=storage.buckets \
  --table=storage.objects \
  --data-only --no-owner --no-privileges \
  > storage_meta.sql
echo "    ✓ storage_meta.sql"

echo ""
echo "=== Готово к импорту в новую БД ==="
echo "Запустите вручную (после включения расширений vector/pg_trgm/uuid-ossp):"
echo ""
echo "  psql \"\$NEW_URL\" -v ON_ERROR_STOP=1 -f dumps/schema_public.sql"
echo "  psql \"\$NEW_URL\" -v ON_ERROR_STOP=1 -f dumps/data_public.sql"
echo "  psql \"\$NEW_URL\" -c 'TRUNCATE auth.users CASCADE;'   # если нужно очистить тестовые"
echo "  psql \"\$NEW_URL\" -v ON_ERROR_STOP=1 -f dumps/auth_users.sql"
echo "  psql \"\$NEW_URL\" -v ON_ERROR_STOP=1 -f dumps/storage_meta.sql"
echo ""
echo "Затем перенос файлов:"
echo "  node ../migrate-storage.mjs"
