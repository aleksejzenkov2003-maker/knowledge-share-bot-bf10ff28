

# План: Использование Claude Sonnet 4.5 для OCR

## Изменение

Заменить модель на Claude Sonnet 4.5:

```typescript
// Файл: supabase/functions/process-document/index.ts

// БЫЛО:
model: 'claude-3-5-sonnet-latest',

// СТАНЕТ:
model: 'claude-sonnet-4-5-20250514',
```

## Преимущества Claude 4.5

- Улучшенное понимание документов
- Лучшее качество OCR для сложных PDF
- Актуальная модель с поддержкой PDF beta

## Порядок выполнения

1. **Исправить модель** в `tryAnthropicOcr()` на `claude-sonnet-4-5-20250514`
2. **Развернуть edge function**
3. **Сбросить застрявшие документы** в `pending`
4. **Протестировать** загрузку PDF

## Файл для изменения

| Файл | Изменение |
|------|-----------|
| `supabase/functions/process-document/index.ts` | Строка 170: `model: 'claude-sonnet-4-5-20250514'` |

