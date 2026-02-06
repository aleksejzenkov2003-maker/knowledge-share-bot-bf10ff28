
## План: Исправить превью PII для PDF документов

### Проблема
Сейчас для PDF файлов `extractTextForPreview` возвращает демо-текст вместо реального содержимого документа. Это значит что пользователь видит фейковые примеры маскирования вместо реальных PII из документа.

### Решение
Использовать библиотеку `pdfjs-dist` (уже установлена) для извлечения текста из PDF на стороне клиента.

### Изменения в файле `src/pages/Documents.tsx`

Заменить текущую логику для PDF:

**Было:**
```typescript
if (file.type === "application/pdf") {
  return `[PDF файл: ${file.name}]...демо текст...`;
}
```

**Станет:**
```typescript
if (file.type === "application/pdf") {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    let text = "";
    const maxPages = Math.min(pdf.numPages, 3); // Первые 3 страницы
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(" ");
      text += pageText + "\n\n";
    }
    
    return text.slice(0, 5000) || "[PDF не содержит текстового слоя]";
  } catch (err) {
    console.error("Error extracting PDF text:", err);
    return `[Ошибка извлечения текста из PDF: ${file.name}]`;
  }
}
```

### Что изменится для пользователя
- При нажатии "Превью маскирования" система извлечёт реальный текст из первых 3 страниц PDF
- Пользователь увидит настоящие ФИО (Панюхиной Н.В., Акпарсовой А.А.), телефоны, ИНН, email из документа
- Эти данные будут отправлены на маскирование и показаны с токенами [PERSON_1], [INN_ORG_1] и т.д.
- Если PDF защищён или не имеет текстового слоя — покажем соответствующее сообщение

### Технические детали
- Используем dynamic import для `pdfjs-dist` чтобы не нагружать bundle
- Извлекаем максимум 3 страницы и 5000 символов для быстрого превью
- Worker загружается с CDN (так же как в DocumentViewer)

### Ограничения
- PDF со сканами без OCR-слоя не покажут текст — это ожидаемо, т.к. OCR происходит на бэкенде
- Для таких файлов покажем сообщение что текст появится после полной обработки
