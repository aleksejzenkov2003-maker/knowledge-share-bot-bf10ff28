

## План: Обновить цвета

Пользователь хочет:
- Фон страницы: `#F2F1EC` 
- Поле ввода (белый): `#F9F8F4`
- Цвет текста: `#2A2722`

### HSL-конвертация
- `#F2F1EC` → `50 15% 94%`
- `#F9F8F4` → `48 28% 97%`
- `#2A2722` → `37 10% 15%`

### Файлы

**`src/index.css`** — обновить переменные:
- `--background` / `--chat-background`: `50 15% 94%` (#F2F1EC)
- `--foreground` / `--card-foreground` / `--popover-foreground`: `37 10% 15%` (#2A2722)

**`src/components/chat/ChatInputEnhanced.tsx`** — заменить `bg-white` на `bg-[#F9F8F4]` для поля ввода

