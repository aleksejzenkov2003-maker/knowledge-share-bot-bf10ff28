

# План: Мониторинг AI провайдеров на дашборде

## Обзор

Добавить на дашборд карточки с балансом и статистикой расходов AI провайдеров (Anthropic, Perplexity) через их официальные API.

## Исследование API

### Anthropic Admin API
- **Endpoint**: `GET /v1/organizations/usage_report/messages`
- **Endpoint**: `GET /v1/organizations/cost_report`
- **Требует**: Admin API Key (sk-ant-admin...)
- **Возвращает**: использование токенов по дням, стоимость в USD

### Perplexity API
К сожалению, Perplexity **не предоставляет публичного API** для получения баланса или использования. Данные доступны только через веб-интерфейс API Portal.

## Решение

Создаём Edge Function `provider-stats` которая:
1. Запрашивает данные у Anthropic Admin API
2. Для Perplexity показываем локальную статистику на основе наших логов

## Архитектура

```text
┌─────────────────────────────────────────────────────────────────┐
│                         Dashboard.tsx                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Edge Function: provider-stats                       │
├─────────────────────────────────────────────────────────────────┤
│  1. Anthropic: GET /v1/organizations/cost_report                │
│     - Баланс/кредиты (если доступно)                            │
│     - Расходы за текущий месяц                                   │
│     - Использование токенов                                      │
│                                                                  │
│  2. Perplexity: SELECT FROM chat_logs (локально)                │
│     - Количество запросов                                        │
│     - Расчётная стоимость по ценам API                          │
└─────────────────────────────────────────────────────────────────┘
```

## UI на дашборде

```text
┌─────────────────────────────────────────────────────────────────┐
│  💰 Баланс AI провайдеров                            [Обновить] │
├────────────────────────┬────────────────────────────────────────┤
│  Anthropic             │  Perplexity                            │
│  ────────────────────  │  ────────────────────────────────────  │
│  Расход (мес): $12.45  │  Запросов (мес): 156                   │
│  Токены: 2.1M вх/450K  │  ~Расход (расчёт): $2.34               │
│  ▼ Детали              │  ▼ Детали                              │
│                        │                                        │
│  [•] Последние 7 дней  │  Модель: sonar                         │
│  ├ 02.02: $1.23        │  Среднее/день: 22 запроса              │
│  ├ 01.02: $2.11        │                                        │
│  └ 31.01: $0.89        │  ⚠ Баланс API недоступен               │
│                        │                                        │
│  ✓ Admin API подключен │  Проверить: settings.perplexity.ai     │
└────────────────────────┴────────────────────────────────────────┘
```

## Секреты

| Секрет | Описание |
|--------|----------|
| `ANTHROPIC_ADMIN_API_KEY` | Новый секрет для Admin API |

Существующий `ANTHROPIC_API_KEY` останется для чата.

## Техническая реализация

### Edge Function: `supabase/functions/provider-stats/index.ts`

```typescript
interface ProviderStats {
  anthropic?: {
    available: boolean;
    currentMonthCost?: number;
    inputTokens?: number;
    outputTokens?: number;
    dailyCosts?: { date: string; amount: number }[];
    error?: string;
  };
  perplexity?: {
    totalRequests: number;
    estimatedCost: number;
    requestsByDay: { date: string; count: number }[];
    note: string;
  };
}

// Anthropic Cost Report API
async function fetchAnthropicStats(): Promise<ProviderStats['anthropic']> {
  const ADMIN_KEY = Deno.env.get('ANTHROPIC_ADMIN_API_KEY');
  if (!ADMIN_KEY) {
    return { available: false, error: 'Admin API key not configured' };
  }
  
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  const response = await fetch(
    `https://api.anthropic.com/v1/organizations/cost_report?` +
    `starting_at=${startOfMonth.toISOString()}&` +
    `ending_at=${new Date().toISOString()}&` +
    `bucket_width=1d`,
    {
      headers: {
        'x-api-key': ADMIN_KEY,
        'anthropic-version': '2023-06-01',
      },
    }
  );
  
  if (!response.ok) {
    return { available: false, error: `API error: ${response.status}` };
  }
  
  const data = await response.json();
  // Parse and return stats...
}

// Perplexity - local stats from chat_logs
async function fetchPerplexityStats(supabase): Promise<ProviderStats['perplexity']> {
  const { data } = await supabase
    .from('chat_logs')
    .select('created_at, metadata')
    .eq('metadata->>provider_type', 'perplexity')
    .gte('created_at', startOfMonth.toISOString());
  
  // Calculate estimated cost based on sonar pricing ($5/1000 requests)
  const estimatedCost = (data?.length || 0) * 0.005;
  
  return {
    totalRequests: data?.length || 0,
    estimatedCost,
    note: 'Баланс API недоступен. Расчёт на основе локальных данных.',
  };
}
```

### Компонент: `src/components/dashboard/ProviderStatsCard.tsx`

```typescript
interface ProviderStatsCardProps {
  stats: ProviderStats | null;
  isLoading: boolean;
  onRefresh: () => void;
}

const ProviderStatsCard = ({ stats, isLoading, onRefresh }: ProviderStatsCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Баланс AI провайдеров
          </span>
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          <AnthropicStats stats={stats?.anthropic} />
          <PerplexityStats stats={stats?.perplexity} />
        </div>
      </CardContent>
    </Card>
  );
};
```

## Ценообразование для расчётов

| Провайдер | Модель | Input | Output |
|-----------|--------|-------|--------|
| Anthropic | Claude Sonnet 4.5 | $3/1M | $15/1M |
| Anthropic | Claude Sonnet 4 | $3/1M | $15/1M |
| Perplexity | sonar | ~$5/1000 req | - |
| Perplexity | sonar-deep-research | ~$5/1000 req + tokens | - |

## Порядок реализации

### Шаг 1: Добавить секрет
- Запросить `ANTHROPIC_ADMIN_API_KEY` через add_secret

### Шаг 2: Создать Edge Function
- `supabase/functions/provider-stats/index.ts`
- Эндпоинты для Anthropic Admin API
- Локальная статистика для Perplexity

### Шаг 3: Создать UI компонент
- `src/components/dashboard/ProviderStatsCard.tsx`
- Карточки для каждого провайдера
- График расходов за неделю

### Шаг 4: Интегрировать в Dashboard
- Добавить вызов Edge Function
- Показывать только для админа

## Файлы

| Файл | Действие |
|------|----------|
| `supabase/functions/provider-stats/index.ts` | Создать |
| `src/components/dashboard/ProviderStatsCard.tsx` | Создать |
| `src/pages/Dashboard.tsx` | Добавить компонент статистики |
| `supabase/config.toml` | Добавить конфигурацию функции |

