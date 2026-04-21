

## Проблема

В чате и в «Результате» project workflow рендерятся только верхнеуровневые поля JSON (`title`, `qc`, `input`), а основной блок `output` (owners, qualification и т.п.) пропадает.

### Причина

`splitAgentMessage` пытается распарсить контент как JSON, но падает в двух типичных случаях:

1. **В чате** (`project_step_messages.content`) хранится **сырой стрим** агента (`fullContent`) — часто с прозой/префиксом перед `{...}` («Вот результат:\n{…}»). `JSON.parse(trimmed)` падает → срабатывает `renderLooseAgentJson`, который через regex достаёт только `title/summary/qc/input`, а **`output` не вытаскивает вовсе**.
2. **В «Результате»** для не‑KP узлов `displayContent` берётся из `hr.summary`, который backend (`workflow-step-execute` строка ~1075) формирует как `fullContent.slice(0, 1200)` — обрезанный JSON, который тоже не парсится.

В обычных чатах/чатах отдела такой проблемы нет, потому что там агенты возвращают чистый markdown, без обёртки в JSON-схему.

### Что чинить

**1. `src/lib/agentMessageFormat.ts` — устойчивый парсер**
- Перед `JSON.parse(trimmed)` извлекать первый сбалансированный `{...}` блок (как делает backend на строке 1054), чтобы отрезать любую прозу до/после JSON.
- Добавить очистку: trailing commas, ```` ```json ```` обёртки, control‑chars (по мотивам snippet'а из stack-overflow).
- В `renderStructured` приоритет:
  - если есть `client_kp` (string) → возвращать его как markdown (это уже готовый КП, не нужно ничего разбирать);
  - иначе — заголовок (`title` → `agent`), summary (`human_readable.summary` → `summary` → `_stream_text` first 300 chars), затем `output`/`result`/`data` через `renderValue`, плюс блоки `qc` и `input` отдельными секциями в конце (как сейчас в loose).
- В `renderLooseAgentJson` (fallback при битом JSON) добавить grep‑извлечение блока `"output": { ... }` с балансировкой скобок и прогон через `renderValue`, чтобы owners/qualification всё-таки отрисовывались.

**2. `src/components/workflow/WorkflowStepView.tsx` — приоритет полного output над обрезанным summary**
- Изменить `displayContent` для не‑KP узлов: вместо `userEditsContent || hr?.summary || outputContent` использовать `userEditsContent || outputContent` (т.е. полный `raw_output` вместо обрезанных 1200 символов из `hr.summary`). `hr.summary` оставить только как fallback, если `outputContent` пустой.
- Это даст `WorkflowResultEditor` валидный JSON целиком, и новый парсер корректно отрендерит вложенный `output`.

**3. `supabase/functions/workflow-step-execute/index.ts` — чистый контент в чат-сообщения** (опционально, но желательно)
- При `parsedResult` найден — записывать в `project_step_messages.content` именно `JSON.stringify(parsedResult, null, 2)` (валидный JSON), а не сырой `fullContent` с прозой. Это гарантирует, что чат всегда получает парсимый JSON.
- Для случаев без `parsedResult` оставить `fullContent` как есть (это и есть markdown).

### Технические детали

- Новая функция `extractBalancedJson(raw: string): string | null` — ищет первое `{` или `[`, идёт со счётчиком скобок (с учётом строк/escape), возвращает сбалансированную подстроку.
- `renderStructured` распознаёт `client_kp` / `internal_report` и для них пропускает structured-рендер (отдаёт markdown как есть).
- Тест‑кейсы (mental): JSON в фенсе, JSON с prefix‑прозой, JSON с trailing comma, обрезанный JSON (до закрывающей `}`), валидный JSON со вложенным `output.owners[]`, payload с `client_kp` строкой.

### Без изменений

- UI компоненты `WorkflowStepChat` и `WorkflowResultEditor` — продолжают использовать `splitAgentMessage` без знания о деталях.
- Схема БД, migrations.
- Логика QC/branching/orchestration.

### Результат

В чате и в «Результате» проектов появятся читаемые блоки вида:
```
### Активность правообладателя

**Owners:**
1. **Owner:** Матяш Сергей Викторович
   **Sources:**
   - https://egrul.nalog.ru
   - https://www.rusprofile.ru
   **Legal Status:** действует
   **Signs Of Use:** Обнаружены признаки отсутствия выявленного…
   **Evidence Strength:** low

**Проверки:**
- legal_status_set
- evidence_strength_set
```

JSON по‑прежнему доступен через «Показать JSON».

