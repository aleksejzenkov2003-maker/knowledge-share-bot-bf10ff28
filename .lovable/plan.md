
## Аудит текущего состояния

Изучу как сейчас устроен редактор воркфлоу, что именно сложно для пользователя, и какие точки боли.
<lov-tool-use id="toolu_vrtx_01TxwuxnGGVUiKDhWWLBb2mc" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/WorkflowTemplateEditor.tsx\", \"lines\": \"1-80\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01RjqmhQetvWWk2zMtDAMgM8" name="code--view" integration-id="code" data="{\"file_path\": \"src/hooks/useWorkflowEditor.ts\", \"lines\": \"1-100\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Jg9DRkNin7Az84teik2QNQ" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/workflow-editor/EdgeConfigPanel.tsx\", \"lines\": \"1-80\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_013ykTDdpgfxyA7Dh7jJnfv3" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/workflow-editor/WorkflowNodeConfigPanel.tsx\", \"lines\": \"1-60\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_012ebUTVjwz1gEKVLJurjnky" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/WorkflowTemplateEditor.tsx\", \"lines\": \"1-100\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01P4ystNKCJMMiQjkumRAyQc" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/workflow-editor/EdgeConfigPanel.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01JAwDGrsSCNWQyzA8aPFkjQ" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/workflow-editor/AddNodeMenu.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_0148X6VfuASJDYFFHykwnqyj" name="code--view" integration-id="code" data="{\"file_path\": \"src/hooks/useWorkflowEditor.ts\", \"lines\": \"1-150\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01VdtUDmLfdbGBpDy5Fn6nRD" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/workflow-editor/WorkflowNode.tsx\"}">
</lov-tool-use>
Достаточно контекста. Формирую план редизайна редактора воркфлоу.

<lov-plan>
## Цель

Сделать редактор шаблонов воркфлоу интуитивным: убрать необходимость вручную настраивать маппинг полей между шагами, сильно упростить связи (по умолчанию всё «само работает»), сделать визуальный поток шагов очевидным.

## Что сейчас сложно

1. **Связи (edges)** требуют ручного маппинга `sourcePath → targetPath` + опционального `transform` + опциональных `conditions` — пользователь должен знать имена полей JSON-схем.
2. **Узлы** требуют отдельной настройки `input_schema` / `output_schema` / `form_config` через `SchemaEditor` — это для разработчиков, а не для аналитика.
3. **Условия (IF / Quality Check)** дублируются: и на узле, и на ребре.
4. Нет визуального ощущения «потока» — все стрелки одинаковые, непонятно «что данные предыдущего шага автоматически попадают в следующий».
5. **Этапы (stage_group)** — отдельное поле, легко забыть, путаница со `step_order`.

## Решение: «Smart Flow» режим (по умолчанию)

### 1. Авто-маппинг по умолчанию — связи без полей

- Любая новая связь создаётся с **passthrough** (`$` → `$`): весь approved_output предыдущего шага автоматически становится input следующего. Это уже частично есть в `workflowAutoFix.ts` (`DEFAULT_PASSTHROUGH_MAPPING`) — закрепить как **единственный режим по умолчанию**.
- Кроме того, бэкенд уже наследует `attachments`, `project_memory`, `context_packs` через все шаги — пользователю это и нужно.
- Панель `EdgeConfigPanel` упрощается до 3 элементов:
  - чекбокс **«Передавать всё»** (вкл по умолчанию) — скрывает маппинг полностью;
  - один селектор **«Когда переходить»**: «Всегда» / «Если предыдущий шаг успешен» / «По условию» (только тогда раскрывается простой builder одного условия);
  - кнопка «Удалить связь».
- Старый расширенный режим (маппинг полей, json_stringify, множественные условия) прячется под аккордеон **«Эксперт»** — для редких кейсов.

### 2. Визуальные стили рёбер по смыслу

- **Простая стрелка** (серая, тонкая) = «всё передаётся дальше» — без подписи.
- **Стрелка с замком** (оранжевая, подпись «требует подтверждения») = next step за approval.
- **Ветка от Condition/QC** — уже цветные (зелёный «Да/Ок» / красный «Нет/Не ок»), оставляем, но добавляем крупную подпись прямо на стрелке.
- Убрать подпись «N полей» с обычных рёбер — она пугает. Показывать её только если включён ручной маппинг.

### 3. Пресеты узлов вместо ручных схем

При добавлении **AI Агента** убираем обязательность редактирования `input_schema`/`output_schema`. Вместо этого даём 3 пресета результата:
- **«Текстовый ответ»** (output: `{ content: string }`) — по умолчанию;
- **«Документ Markdown»** (`{ markdown: string, title?: string }`);
- **«Структурированные данные»** — только тогда показываем редактор схемы.

Аналогично для **Ввода данных**: пресеты «Только текст», «Текст + файлы», «Своя форма».

`SchemaEditor` уезжает в раскрывающийся блок **«Дополнительно (продвинутые поля)»**.

### 4. Переменные «по имени шага» вместо JSONPath

В промптах агентов вместо `{{node.<key>.approved_output.field}}` ввести поповер-вставку **«@шаг»**:
- кнопка `@` рядом с textarea промпта → выпадающий список предыдущих шагов с человеко-понятными именами;
- вставляется чип `@Досье клиента` (а под капотом — `{{step.<id>.text}}`);
- бэкенд (`workflow-step-execute`) при сборке промпта подменяет чипы на approved_output.text/markdown/content предыдущего шага.

### 5. Этапы — drag-into-group

Вместо ручного ввода `stage_group` строкой:
- На канвасе появляется кнопка **«+ Этап»** — создаёт визуальную группу-рамку (уже есть `stage-group` в `WorkflowCanvas`);
- Пользователь перетаскивает узлы внутрь рамки — `stage_group` проставляется автоматически по `parentId`;
- Удалил из рамки — `stage_group` очищается.

Поле «Этап» в боковой панели превращается в селект существующих этапов + «Новый этап…».

### 6. Подсказки прямо на канвасе

- Когда выделено ребро без условий — показываем **callout** «Все данные предыдущего шага автоматически попадают сюда. Условие нужно только если хотите пропускать связь».
- Когда выделен агент без `prompt_override` — callout «Здесь будет работать агент @… с его стандартным промптом. Уточните задачу или вставьте `@шаг` для контекста.»
- Пустой канвас → кнопка **«Собрать из шаблона»** (templates gallery) или **«Через AI-архитектора»**.

### 7. Режим «Карта потока» (read-only превью)

Кнопка-переключатель **Карта / Редактор**:
- **Карта** — только узлы и стрелки, крупные, без хэндлов и без меток рёбер; используется для презентации владельцу процесса;
- **Редактор** — текущий вид со всеми элементами.

## Файлы к изменению

- `src/components/workflow-editor/EdgeConfigPanel.tsx` — упростить до 3 контролов + аккордеон «Эксперт».
- `src/components/workflow-editor/WorkflowMappingEdge.tsx` — стиль по типу (passthrough/approval/branch), убрать «N полей» в простом режиме.
- `src/components/workflow-editor/WorkflowNodeConfigPanel.tsx` + `AgentNodeConfig.tsx` / `InputNodeConfig.tsx` — добавить пресеты результата, спрятать `SchemaEditor` под «Дополнительно».
- `src/components/workflow-editor/AddNodeMenu.tsx` — добавить пункт «+ Этап».
- `src/components/workflow-editor/WorkflowCanvas.tsx` — drag-into-group → автоустановка `stage_group` через `onNodeDragStop`.
- Новый `src/components/workflow-editor/StepMentionInsert.tsx` — поповер «@шаг» для промптов.
- `src/lib/workflowAutoFix.ts` — `DEFAULT_PASSTHROUGH_MAPPING` стал основным; вспомогательная функция `isPassthroughEdge(edge)`.
- `supabase/functions/workflow-step-execute/index.ts` — резолвер чипов `{{step.<id>.text}}` → текст approved_output предыдущего шага.
- `src/pages/WorkflowTemplateEditor.tsx` — переключатель **Карта / Редактор**.

## Технические детали

- Обратная совместимость: существующие шаблоны с ручным маппингом продолжат работать — определяем «простой режим» как `mapping.length === 0 || (mapping.length===1 && sourcePath==='$' && targetPath==='$')`. Иначе авто-открываем «Эксперт».
- Никаких миграций БД: все новые элементы пишутся в существующие JSONB-поля (`schema`, `mapping`, `stage_group`).
- Подсказки/callout — обычные shadcn `HoverCard`/inline блоки, без новых зависимостей.

## Что подтвердить

1. Делаем все 7 пунктов сразу или начинаем с самого болезненного — упрощение `EdgeConfigPanel` + авто-passthrough + визуальные стили рёбер (пп.1–2)?
2. Нужен ли «@шаг»-вставщик в промптах прямо сейчас или сначала только UI редактора?
