

# План: Исправление выбора агента в чате отделов

## Обнаруженная проблема

При выборе агента из выпадающего списка и отправке сообщения появляется ошибка "Укажите агента через @упоминание".

### Причина

Функция `parseMention` в `useOptimizedDepartmentChat.ts` использует **ленивый regex**, который не может распознать триггеры с пробелами:

```typescript
const mentionRegex = /^@([^\n]+?)(?:\s+|$)/;
```

Для сообщения `@ТЗ консультант вопрос` regex захватывает только `ТЗ`, а не `ТЗ консультант`.

### Агенты с многословными триггерами:
- `@ТЗ консультант` (15 символов)
- `@Отказы ТЗ` (10 символов)

Эти агенты не распознаются при парсинге.

---

## Решение

Изменить логику `parseMention` для поддержки многословных триггеров:

### Изменение 1: Новый алгоритм парсинга

Вместо regex, который пытается угадать границу триггера, использовать **прямое сопоставление** со списком известных триггеров:

```typescript
const parseMention = useCallback((text: string): { agentId: string | null; cleanText: string } => {
  if (!text.startsWith('@')) {
    return { agentId: null, cleanText: text };
  }

  const textLower = text.toLowerCase();

  // Sort agents by trigger length (longest first) to match "ТЗ консультант" before "ТЗ"
  const sortedAgents = [...availableAgents].sort((a, b) => {
    const aLen = (a.mention_trigger || a.slug).length;
    const bLen = (b.mention_trigger || b.slug).length;
    return bLen - aLen; // Descending order
  });

  for (const agent of sortedAgents) {
    const triggers = [
      agent.mention_trigger?.toLowerCase().trim(),
      `@${agent.slug}`.toLowerCase(),
      `@${agent.name.toLowerCase().trim()}`
    ].filter(Boolean);

    for (const trigger of triggers) {
      // Check if text starts with trigger followed by space or end
      if (textLower.startsWith(trigger!) && 
          (textLower.length === trigger!.length || textLower[trigger!.length] === ' ')) {
        const cleanText = text.slice(trigger!.length).trim();
        return { agentId: agent.id, cleanText };
      }
    }
  }

  return { agentId: null, cleanText: text };
}, [availableAgents]);
```

### Почему это работает:

1. **Сортировка по длине триггера** — `@ТЗ консультант` проверяется раньше гипотетического `@ТЗ`
2. **Точное сопоставление** — проверяем, что после триггера идёт пробел или конец строки
3. **Множественные варианты** — проверяем `mention_trigger`, `slug` и `name`

---

## Файл для изменения

**`src/hooks/useOptimizedDepartmentChat.ts`** (строки 133-169)

Заменить функцию `parseMention` на новую версию с прямым сопоставлением вместо regex.

---

## Дополнительно: Очистка данных

В базе данных есть агенты с trailing spaces в именах (например `Поисковик `). Рекомендуется очистить через миграцию:

```sql
UPDATE chat_roles SET name = TRIM(name) WHERE name != TRIM(name);
```

---

## Ожидаемый результат

После исправления:
- Агенты с многословными триггерами (`@ТЗ консультант`, `@Отказы ТЗ`) будут корректно распознаваться
- Выбор агента из списка и последующая отправка сообщения будут работать без ошибок
- Улучшенная отладка через console.log для диагностики проблем

