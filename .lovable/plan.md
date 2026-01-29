
# План: Фиксированный центрированный Input в стиле ChatGPT

## Проблема

На скриншоте ChatGPT видно:
- Поле ввода всегда центрировано **относительно всего экрана**, а не относительно области контента
- При открытии/закрытии сайдбара поле ввода **остаётся на месте**

Текущая архитектура:
```
<div flex>
  <Sidebar w-64/>
  <main flex-1>  ← сужается при открытии сайдбара
    <ScrollArea/>
    <Input max-w-3xl mx-auto/>  ← центрируется внутри main, поэтому сдвигается
  </main>
</div>
```

## Решение

Изменить позиционирование Input так, чтобы он был центрирован относительно **viewport**, а не родительского контейнера.

### Два варианта:

**Вариант A (простой)**: CSS-компенсация ширины сайдбара
- Вычислять offset = sidebarWidth / 2 и применять к контейнеру ввода

**Вариант B (как в ChatGPT)**: Абсолютное позиционирование снизу
- Input позиционировать `fixed` или `absolute` снизу по центру экрана
- Это требует изменения структуры layout

Рекомендую **Вариант A** — минимальные изменения, сохранение текущей архитектуры.

---

## Изменения

### Файл 1: `src/components/chat/ChatInputEnhanced.tsx`

Добавить prop для смещения:

```tsx
interface ChatInputEnhancedProps {
  // ...existing props
  sidebarOffset?: number; // Ширина открытого сайдбара для компенсации центрирования
}

export function ChatInputEnhanced({
  // ...
  sidebarOffset = 0,
}: ChatInputEnhancedProps) {
  return (
    <div 
      className="w-full px-4 pb-4"
      style={{
        maxWidth: '768px',
        margin: '0 auto',
        // Компенсация сайдбара: сдвигаем влево на половину ширины сайдбара
        transform: sidebarOffset ? `translateX(-${sidebarOffset / 2}px)` : undefined,
        transition: 'transform 0.3s ease',
      }}
      // ...
    >
```

### Файл 2: Страницы чата (Chat.tsx, ChatFullscreen.tsx, DepartmentChat.tsx, DepartmentChatFullscreen.tsx)

Передавать ширину сайдбара в Input:

```tsx
const SIDEBAR_WIDTH = 288; // w-72 = 18rem = 288px

// В Chat.tsx, ChatFullscreen.tsx
<ChatInputEnhanced
  // ...existing props
  sidebarOffset={sidebarOpen ? SIDEBAR_WIDTH : 0}
/>
```

---

## Альтернативный подход (более чистый): CSS Grid

Изменить layout на CSS Grid с фиксированной центральной колонкой:

```tsx
<div className="grid grid-cols-[auto_1fr] h-screen">
  <Sidebar className="w-64"/>
  <main className="flex flex-col">
    <ScrollArea className="flex-1">
      <div className="max-w-[768px] mx-auto">
        {messages}
      </div>
    </ScrollArea>
    {/* Input с фиксированной шириной, центрированный относительно viewport */}
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[768px] px-4">
        <ChatInput />
      </div>
    </div>
  </main>
</div>
```

Этот подход требует:
1. Добавить `padding-bottom` к ScrollArea чтобы контент не перекрывался с fixed Input
2. Обработать z-index для корректного наложения

---

## Рекомендация: Вариант A (transform offset)

Минимальные изменения, сохраняет текущую архитектуру, легко откатить.

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/components/chat/ChatInputEnhanced.tsx` | Добавить `sidebarOffset` prop, применить `transform: translateX()` |
| `src/pages/Chat.tsx` | Передавать `sidebarOffset={sidebarOpen ? 288 : 0}` |
| `src/pages/ChatFullscreen.tsx` | Передавать `sidebarOffset={sidebarOpen ? 256 : 0}` (w-64) |
| `src/pages/DepartmentChat.tsx` | Передавать `sidebarOffset={sidebarOpen ? 256 : 0}` |
| `src/pages/DepartmentChatFullscreen.tsx` | Передавать `sidebarOffset={sidebarOpen ? 256 : 0}` |

---

## Ожидаемый результат

**До**: При открытии сайдбара поле ввода сдвигается вправо вместе с контентом

**После**: Поле ввода всегда центрировано по экрану, независимо от состояния сайдбара — как в ChatGPT
