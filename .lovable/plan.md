

# Чёрный цвет заголовков в DOCX

## Проблема
При скачивании ответа в DOCX заголовки (H1, H2, H3) используют стандартные стили Word — синий цвет. Нужно сделать весь текст чёрным для удобной вставки в документы.

## Решение

В `src/components/chat/DownloadDropdown.tsx` в `handleDownloadDOCX`:

1. **Добавить кастомные стили заголовков** в объект `Document` — переопределить встроенные стили `Heading1`, `Heading2`, `Heading3` с `color: "000000"`:

```typescript
const doc = new Document({
  styles: {
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", run: { bold: true, size: 32, color: "000000", font: "Arial" } },
      { id: "Heading2", name: "Heading 2", run: { bold: true, size: 28, color: "000000", font: "Arial" } },
      { id: "Heading3", name: "Heading 3", run: { bold: true, size: 24, color: "000000", font: "Arial" } },
    ]
  },
  sections: [{ children: docChildren }],
});
```

2. **Заголовки в разделе "Источники"** — тоже используют `HeadingLevel`, поэтому стили применятся автоматически.

### Файл для изменения
- `src/components/chat/DownloadDropdown.tsx` — добавить `styles` в конструктор `Document` (~строка 240)

