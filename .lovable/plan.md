

# Аудит системы Workflow — найденные проблемы и план исправления

## Обнаруженные проблемы

### 1. `prompt_override` НЕ передаётся агенту (критическая ошибка)
Edge function `workflow-step-execute` загружает `agent_id` и передаёт `role_id` в `chat-stream`, но **полностью игнорирует** поле `prompt_override` из `workflow_template_steps`. Пользователь прописывает промпт в визуальном редакторе, но он никогда не доходит до AI.

**Решение**: 
- Добавить в `chat-stream` поддержку параметра `system_prompt_append` — текст, который конкатенируется к системному промпту агента.
- В `workflow-step-execute`: загружать `prompt_override` из `template_step` и передавать его в `chat-stream` через этот новый параметр.

### 2. `node_type` НЕ используется при исполнении
Шаг с `node_type = 'input'` или `'output'` обрабатывается так же, как `'agent'`. Нет логики, которая пропускает вызов AI для input-шагов.

**Решение**: В `workflow-step-execute` проверять `node_type` template step:
- `input` → не вызывать AI, просто сохранить input_data как output_data
- `output` → собирать результаты всех предыдущих шагов в финальный документ

### 3. Тип `WorkflowTemplateStep` не содержит новых полей
Поля `prompt_override`, `node_type`, `position_x`, `position_y` отсутствуют в TypeScript-типе `WorkflowTemplateStep`. Код обращается к ним через `(step as any)`, что ведёт к потере типизации и потенциальным ошибкам.

**Решение**: Обновить `src/types/workflow.ts` — добавить недостающие поля.

### 4. Нет передачи `input_schema` / `output_schema` в промпт агента
Если в шаблоне прописана JSON-схема входов/выходов, она не влияет на промпт. Агент не знает, в каком формате отдавать результат.

**Решение**: Формировать из `output_schema` инструкцию для агента: «Верни результат в формате JSON со следующей структурой: ...».

### 5. `auto_run` не реализован
Поле `auto_run` хранится и отображается, но после подтверждения шага следующий шаг с `auto_run: true` **не запускается автоматически**.

**Решение**: В `confirmStep` проверять `auto_run` следующего шага и вызывать `executeStep` если `true`.

### 6. Нет возможности добавлять готовые скрипты (PDF-анализ и т.д.)
Сейчас ноды ограничены тремя типами: input / agent / output. Нет «скриптового» типа, который бы вызывал конкретную функцию (парсинг PDF, поиск по ФИПС, запрос в API репутации).

**Решение**: 
- Добавить `node_type = 'script'` в `AddNodeMenu` и `WorkflowNode`
- Добавить поле `script_config` (jsonb) в `workflow_template_steps` — хранит: имя edge-function, параметры, маппинг входов/выходов
- В `workflow-step-execute`: для `script` — вызывать указанную edge function вместо `chat-stream`
- Реестр доступных скриптов: `process-document`, `fips-parse`, `reputation-api`, `reputation-web-search` и т.д.

## Порядок реализации

1. **Обновить TypeScript типы** — добавить `prompt_override`, `node_type`, `position_x`, `position_y`, `script_config` в `WorkflowTemplateStep`
2. **Миграция БД** — добавить `script_config jsonb` в `workflow_template_steps`
3. **Обновить `chat-stream`** — поддержка `system_prompt_append`
4. **Переработать `workflow-step-execute`** — логика по `node_type` (input/agent/script/output), передача `prompt_override`, передача schema-инструкций
5. **Обновить `confirmStep`** — авто-запуск следующего шага при `auto_run`
6. **Добавить тип ноды «Скрипт»** — UI в `AddNodeMenu`, `WorkflowNode`, поле конфигурации в `WorkflowNodeConfigPanel`
7. **Убрать `(step as any)` касты** — после обновления типов

