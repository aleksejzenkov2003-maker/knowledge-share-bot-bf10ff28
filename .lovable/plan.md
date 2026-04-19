
## Контекст

Пользователь хочет, чтобы в воркфлоу проектов на каждом шаге (на этапе ввода данных и в чате обсуждения шага) можно было загружать документы (PDF, DOC, DOCX, MD и др.) — как в обычном чате — и чтобы LLM их анализировала как контекст.

## Что уже есть

1. **Чат с проектами** (`WorkflowStepChat.tsx`) — обсуждение шага. Нужно проверить, поддерживает ли он вложения.
2. **Форма ввода шага** (`WorkflowStepView.tsx` + `InputNodeConfig` `form_config.fields` с типом `file`) — поле `file` уже декларировано, но надо проверить, реально ли загружает и передаёт файлы в `workflow-step-execute`.
3. **Извлечение текста из файлов** уже отработано:
   - На фронте: `useAttachmentTextExtractor.ts` (PDF через pdfjs, DOCX через JSZip, plain text)
   - На бэке: `chat-stream` имеет unified text extraction layer (mem: ai-provider-text-extraction-v2)
4. **Storage bucket** `project-documents` существует.
5. **Edge function `workflow-step-execute`** — основной исполнитель шагов; нужно проверить, принимает ли он вложения и как пробрасывает их в LLM.

## Что нужно изучить (быстрый аудит)

- `WorkflowStepView.tsx` — как рендерится поле `file` в форме старта
- `WorkflowStepChat.tsx` — есть ли там `ChatInput` с поддержкой вложений
- `workflow-step-execute/index.ts` — принимает ли `attachments`, передаёт ли их в LLM (multimodal или text extraction)
- `useProjectWorkflow.ts` — как payload отправляется

## План реализации

### 1. Загрузка файлов на этапе ввода (форма старта)
- В `WorkflowStepView.tsx` для полей `type: 'file'` сделать полноценный uploader (drag&drop, до 10МБ × 5 файлов, как в чате — соответствует `file-upload-system`).
- Загружать файлы в bucket `project-documents` по пути `{projectId}/workflow/{stepId}/{uuid}_{filename}`.
- В payload шага сохранять массив `{ file_path, file_name, file_type, file_size }`.

### 2. Загрузка файлов в чате обсуждения шага
- В `WorkflowStepChat.tsx` подключить ту же логику вложений, что и в `ChatInputEnhanced`/обычном чате (если ещё не подключена) — кнопка скрепки, превью, лимит 5×10МБ.
- Сохранять вложения в `metadata.attachments` сообщения чата шага (по аналогии с `ProjectChatMessage`).

### 3. Передача файлов в LLM (бэкенд `workflow-step-execute`)
- Принимать массив `attachments` в payload шага и в чате шага.
- Для каждого файла:
  - Скачать из storage через `service_role`.
  - Если AI multimodal (Gemini/Claude/GPT-4o) и файл — изображение/PDF, передавать как inline_data/image_url.
  - Иначе — извлекать текст (PDF → pdfjs, DOCX → JSZip, txt/md/csv → as-is) с лимитом 50k символов и подмешивать в system prompt блоком `=== ВЛОЖЕНИЯ ПОЛЬЗОВАТЕЛЯ ===`.
- Переиспользовать существующий unified text extraction layer (тот же, что в `chat-stream`).

### 4. UI-индикаторы
- В превью результата шага показывать список загруженных файлов (имя + размер + кнопка скачать через signed URL).
- В сообщениях чата шага — `AttachmentPreview` (компонент уже есть).

## Технические детали

- **Лимиты**: 10МБ × 5 файлов на одно действие (соответствует core-правилу).
- **Поддерживаемые типы для извлечения текста**: PDF, DOC/DOCX, MD, TXT, CSV, JSON, XML, HTML, RTF.
- **Multimodal**: PNG/JPG/WEBP — напрямую модели; PDF для Gemini/Claude — как document; иначе — текстовая экстракция.
- **Storage path**: `project-documents/{projectId}/workflow-inputs/{stepRunId}/{uuid}_{name}` и `project-documents/{projectId}/workflow-chat/{stepId}/{uuid}_{name}`.
- **Безопасность**: RLS на bucket по `is_project_member(projectId, auth.uid())`.

## Файлы к изменению

- `src/components/workflow/WorkflowStepView.tsx` — uploader в форме старта
- `src/components/workflow/WorkflowStepChat.tsx` — вложения в чате шага
- `src/hooks/useProjectWorkflow.ts` — пробросить attachments в payload
- `supabase/functions/workflow-step-execute/index.ts` — приём вложений + extraction/multimodal
- (опц.) миграция RLS-политик для `storage.objects` bucket `project-documents`, если ещё не настроены под workflow-пути.

## Что подтвердить

Готово ли двигаться в таком объёме (форма старта + чат шага + бэкенд приём + текстовая экстракция/multimodal), или ограничиться только формой старта на первом этапе?
