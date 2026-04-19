
## Проблема

Пользователь загружает документ на 1-м шаге (input), но на следующих шагах агент его «не видит» — нет визуального подтверждения, что вложение доступно агенту, и фактически оно теряется по цепочке шагов.

## Аудит (что нужно посмотреть)

1. `WorkflowStepView.tsx` — как сейчас сохраняются `attachments` в `input_data` шага и отображаются ли они после сохранения.
2. `workflow-step-execute/index.ts` — как `attachments` собираются из предыдущих шагов:
   - сейчас берутся из `requestAttachments`, `step.input_data.attachments`, `workingInput.attachments`;
   - **проблема**: `workingInput` строится через `buildInputPayloadFromEdges` + `mapping`, и если в маппинге ребра нет ключа `attachments` — они НЕ пробрасываются.
3. `workflowGraphRuntime.ts` (`buildInputPayloadFromEdges`) — маппинг по `targetPath`/`sourcePath`; `attachments` теряются если их явно не указали в edge mapping.
4. `WorkflowStepChat.tsx` / `WorkflowStepView.tsx` — есть ли индикатор «к шагу подключено N файлов из предыдущих шагов».

## Решение

### 1. Бэкенд: автопроброс attachments по всей цепочке (`workflow-step-execute`)

Изменить логику сборки `attachments` так, чтобы они **всегда** наследовались от всех предков шага, независимо от edge mapping:

- После определения `incoming edges` для текущего шага — отдельно пройтись по всем источникам (предыдущим шагам) и собрать их `approved_output.attachments` + `input_data.attachments`.
- Объединить с текущими (request + step.input_data) и дедуплицировать по `file_path`, лимит 5.
- Дополнительно: записывать список вложений в `output_data.attachments` каждого шага (чтобы `getApprovedPayload` их сохранял для следующих).

### 2. Сохранение attachments в результат шага

В `workflow-step-execute` при финальной записи `output_data` шага:
```ts
output_data: { ...llmResult, attachments: dedupedAttachments }
```
Это гарантирует, что вложения «живут» в payload шага и видны как для UI, так и для следующих узлов.

### 3. UI: показать «Подключённые документы» на каждом шаге

В `WorkflowStepView.tsx`:
- Перед формой ввода добавить блок **«Документы из предыдущих шагов»** — список файлов, унаследованных от предков (имя + размер + значок 📎).
- В превью результата шага показывать список `output_data.attachments` (как уже использует AttachmentPreview).
- В `WorkflowStepChat.tsx` — в шапке чата шага показывать «К шагу подключено: N документов» с раскрывающимся списком.

Источник для UI: новое поле `inheritedAttachments`, которое фронт может вычислить либо запросом к предыдущим шагам run'а через `useProjectWorkflow`, либо через RPC.

### 4. Хук `useProjectWorkflow.ts`

Добавить вычисление `inheritedAttachments` для каждого шага (агрегировать `output_data.attachments` всех завершённых предыдущих шагов run'а) и пробрасывать в `WorkflowStepView`/`WorkflowStepChat`.

## Файлы к изменению

- `supabase/functions/workflow-step-execute/index.ts` — автонаследование attachments из всех предков + запись в `output_data`.
- `src/hooks/useProjectWorkflow.ts` — вычисление `inheritedAttachments` per step.
- `src/components/workflow/WorkflowStepView.tsx` — UI блок «Документы из предыдущих шагов» + отображение в превью результата.
- `src/components/workflow/WorkflowStepChat.tsx` — индикатор подключённых документов в шапке чата шага.

## Технические детали

- Лимит 5 файлов на шаг сохраняется (после дедупликации по `file_path`).
- Передача в LLM остаётся через `chat-stream` (multimodal или text extraction — уже работает).
- Никаких миграций БД не требуется: `attachments` хранятся в существующих JSONB-полях `input_data`/`output_data`.
- Бэкенд логирует количество унаследованных вложений в edge logs для отладки.

## Что подтвердить

Двигаемся в таком объёме (бэкенд автонаследование + UI «подключённые документы» на форме шага и в чате шага)?
