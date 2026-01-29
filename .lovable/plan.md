

# План модернизации UI чата в стиле ChatGPT/Perplexity

## Текущий дизайн (проблемы)

На скриншоте видно:
- Ответы ограничены ~70% ширины в сером `Card`
- Нет информации о том, какая роль/агент отвечает
- Визуальный стиль устарел (плашки-карточки)

## Референсы из современных AI

**ChatGPT (скриншот 3)**:
- Ответ занимает почти всю ширину контента
- Нет фоновой карточки — чистый белый фон
- Кнопки действий внизу (копировать, лайк, дизлайк, обновить)
- Минималистичный дизайн

**Perplexity (скриншот 2)**:
- Светло-бирюзовый фон для всей области ответа
- Inline теги источников `brandside +1`, `vademec +3`
- Секция "Связанные" внизу
- Кнопки: поделиться, скачать, копировать, обновить, источники

---

## Изменения

### 1. Увеличить ширину ответа

**Файлы**: `ChatMessage.tsx`, `BitrixChatMessage.tsx`, `DepartmentChatMessage.tsx`

Изменить с:
```tsx
<Card className="max-w-[70%] p-4 ...">
```

На:
```tsx
<div className="w-full ...">  // Полная ширина, без Card для ассистента
```

Для пользовательских сообщений — оставить карточку, но расширить до `max-w-[85%]`

### 2. Убрать Card (фоновую плашку) для ответов ассистента

Вместо `Card` с `bg-muted` — обычный `div` без фона, как в ChatGPT:

```tsx
{message.role === "assistant" ? (
  <div className="w-full px-4 py-2">  // Без Card, без фона
    {/* content */}
  </div>
) : (
  <Card className="max-w-[85%] p-4 bg-primary text-primary-foreground">
    {/* user message stays in card */}
  </Card>
)}
```

### 3. Добавить "автора ответа" (роль/агент)

Добавить в header ответа имя агента:

```tsx
{message.role === "assistant" && (
  <div className="flex items-center gap-2 mb-2">
    <Bot className="h-4 w-4 text-primary" />
    <span className="text-sm font-medium text-muted-foreground">
      {/* Find role name by currentRoleId */}
      {availableRoles?.find(r => r.id === currentRoleId)?.name || 'Ассистент'}
    </span>
  </div>
)}
```

Для `BitrixChatMessage` — использовать `message.roleId` или `currentRoleId`

### 4. Общий layout изменить

Убрать аватары слева/справа для ассистента (как в ChatGPT — нет аватара), оставить только для пользователя или вовсе упростить:

```tsx
<div className={cn(
  "flex gap-3 group w-full",
  message.role === "user" ? "justify-end" : "justify-start"
)}>
  {message.role === "assistant" && (
    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
      <Bot className="h-4 w-4 text-primary" />
    </div>
  )}
  
  {message.role === "assistant" ? (
    // Full width, no background
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium">{roleName}</span>
      </div>
      {/* content */}
      {/* metadata footer */}
    </div>
  ) : (
    // User message in card
    <Card className="max-w-[85%] p-4 ...">
      {/* content */}
    </Card>
  )}
  
  {message.role === "user" && (
    <div className="flex-shrink-0 h-8 w-8 ...">
      <User />
    </div>
  )}
</div>
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/components/chat/ChatMessage.tsx` | Убрать Card для ассистента, расширить ширину, добавить имя роли |
| `src/components/chat/BitrixChatMessage.tsx` | Аналогичные изменения |
| `src/components/chat/DepartmentChatMessage.tsx` | Уже имеет имя агента (`agentName`), обновить layout |
| `src/types/chat.ts` | Добавить `roleName?: string` в Message если нужно (опционально) |

---

## Визуальный результат

**До**:
```
[Bot avatar] [Gray Card with 70% width                ]
             | Response text here...                  |
             | metadata badges                        |
             [end card]
```

**После** (стиль ChatGPT):
```
[Bot icon] Ассистент ТЗ консультант
           Response text here, full width...
           
           ⏱️ 153211ms  📄 10 источников  📖 7 цитат
           
           📋 Копировать  ⬇️ Скачать  🔄 Обновить
```

Для сообщений пользователя — сохраняем карточку справа, но шире.

---

## Технические детали

### Изменение ChatMessage.tsx

Основная структура станет:

```tsx
<div className="flex gap-3 group w-full">
  {message.role === "assistant" && (
    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
      <Bot className="h-4 w-4 text-primary" />
    </div>
  )}
  
  {message.role === "assistant" ? (
    <div className="flex-1 min-w-0">
      {/* Role name header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-foreground">
          {availableRoles?.find(r => r.id === currentRoleId)?.name || 'Ассистент'}
        </span>
      </div>
      
      {/* Content */}
      <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
        {/* markdown content */}
      </div>
      
      {/* Metadata footer */}
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t text-xs text-muted-foreground">
        {/* badges */}
      </div>
      
      {/* Actions */}
      <MessageActions ... />
    </div>
  ) : (
    <>
      <Card className="max-w-[85%] ml-auto p-4 bg-primary text-primary-foreground">
        <p className="whitespace-pre-wrap">{message.content}</p>
      </Card>
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
        <User className="h-4 w-4" />
      </div>
    </>
  )}
</div>
```

### Props обновление

Добавить `roleName` в props или использовать `availableRoles` + `currentRoleId` для определения имени.

