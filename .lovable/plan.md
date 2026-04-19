

## Цель

Привести чат шага воркфлоу к функционалу чата отдела: загрузка файлов прямо из инпута чата, переключатель «Скрыть перс. данные» на каждом вложении, обращение к памяти проекта и кнопка «Сохранить в память» на ответах агента.

## Что уже есть

- Наследование вложений от предыдущих шагов (банер сверху чата) ✅
- Загрузка файлов на шаге через отдельный блок снизу `WorkflowStepView` ✅
- `usePiiMasking` хук, `PiiIndicator`, `AttachmentPreview` с PII-тогглами ✅
- `useProjectMemory` через `useProjectChat` (память проекта в `project_memory`) ✅
- `ChatInputEnhanced` — готовый компонент с PII/файлами/KB/replyTo ✅

## Чего не хватает

1. В `WorkflowStepChat` сейчас примитивный `<Input>` без вложений и PII.
2. Память проекта не пробрасывается в `workflow-step-execute` (только досье/контекст-паки).
3. На сообщениях агента в чате шага нет кнопки «Сохранить в память».
4. PII в ответе агента шага не маскируется (нет `PiiIndicator`).

## Решение

### 1. Заменить инпут в `WorkflowStepChat` на `ChatInputEnhanced`

- Подключить `ChatInputEnhanced` (без `roles`/`agents` — агент шага фиксирован шаблоном).
- Использовать локальный state для `attachments` + `usePiiMasking` для тогглинга `containsPii`.
- При отправке: загрузить файлы в `chat-attachments`, если `containsPii=true` — пропустить через `pii-mask`, передать массив в `onSendMessage(message, attachments)`.

### 2. Расширить `onSendMessage` сигнатуру

`(message: string, attachments?: AttachmentMeta[]) => void` — пробрасывается до `executeStep` в `useProjectWorkflow`, который добавляет их в body запроса к `workflow-step-execute` (`requestAttachments` — уже принимается бэком).

### 3. Подключить память проекта к шагам

- В `useProjectWorkflow.executeStep` подгружать `project_memory` для `projectId` (через существующий запрос) и передавать в body как `project_memory: [...]`.
- В `workflow-step-execute/index.ts` принимать `project_memory` и пробрасывать в `chat-stream` (который уже умеет подмешивать память в system prompt).

### 4. Кнопка «Сохранить в память» на сообщениях агента

В `WorkflowStepChat` для `assistant`-сообщений добавить иконку 🧠 (как в `ProjectChatMessage`):
- Открывает `useAddProjectMemory` диалог/быстрый toast («Сохранено как факт»).
- Тип по умолчанию — `fact`, привязка к `source_message_id`.

### 5. PII индикатор в ответе агента

Если `message.content` содержит PII-токены `[ИМЯ_001]`/`[ТЕЛ_001]`/`[EMAIL_001]` — показать `PiiIndicator` с возможностью «раскрыть» (тот же flow, что в `ChatMessage`).

### 6. Удалить дублирующий блок загрузки внизу `WorkflowStepView`

После переноса аплоада в `ChatInputEnhanced` нижний блок "Файлы для шага" в `WorkflowStepView.tsx` (строки ~712+) убираем — остаётся только список «Вложения этапа» (read-only) и инпут чата с скрепкой.

## Файлы к изменению

- `src/components/workflow/WorkflowStepChat.tsx` — `ChatInputEnhanced`, PII, кнопка «в память».
- `src/components/workflow/WorkflowStepView.tsx` — убрать дублирующий аплоадер, прокинуть `projectMemory` + `onAddToMemory`.
- `src/hooks/useProjectWorkflow.ts` — `executeStep` принимает `attachments` + `project_memory`, пробрасывает в edge function.
- `supabase/functions/workflow-step-execute/index.ts` — принять `project_memory`, передать в `chat-stream`.

## Технические детали

- Лимиты: 5 файлов × 10МБ (как везде).
- PII-маскирование происходит на клиенте через `pii-mask` edge function перед отправкой; в БД хранится уже маскированный текст в `project_step_messages`.
- Память берётся из `project_memory` через существующий `useProjectMemoryQuery(projectId)`.
- Никаких миграций БД не требуется.

## Что подтвердить

Двигаемся в полном объёме (инпут как в чате отдела + PII + память + сохранение в память)?

