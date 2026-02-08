

## План: Упрощение системы маскирования ПДн

### Что меняем

Оставляем **только 3 типа** ПДн для маскирования:
1. **PERSON** — ФИО, Фамилия И.О., И.О. Фамилия
2. **PHONE** — номера телефонов (начинаются с +7/8, 11 цифр)
3. **EMAIL** — электронная почта

Удаляем: паспорт, СНИЛС, ИНН, карты, счета, даты рождения, адреса.

### Файлы для изменения

#### 1. `supabase/functions/_shared/pii-patterns.ts`
- Удалить паттерны: passport, snils, inn_org, inn_person, card, account, birthdate, address
- Оставить: phone, email, person
- Обновить `PII_TYPE_LABELS` — оставить только 3 типа

#### 2. `src/components/chat/PiiIndicator.tsx`
- Обновить `PII_TYPE_LABELS` — оставить только PERSON, PHONE, EMAIL

#### 3. `src/components/chat/PiiUnmaskDialog.tsx`
- Обновить `PII_TYPE_LABELS` — оставить только PERSON, PHONE, EMAIL

#### 4. `src/components/documents/PiiPreviewDialog.tsx`
- Обновить `PII_TYPE_LABELS` — оставить только person, phone, email

#### 5. `src/pages/PiiAudit.tsx`
- Обновить `PII_TYPE_LABELS` — оставить только PERSON, PHONE, EMAIL

#### 6. Переразвернуть edge functions: `pii-mask`, `process-document`

### Итог

Система будет маскировать только ФИО, телефоны и email. Все остальные данные (номера документов, даты, адреса) останутся в открытом виде.

