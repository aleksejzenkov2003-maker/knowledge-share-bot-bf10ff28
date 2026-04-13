

## Plan: Stage Grouping for Workflow Steps

### Concept
Add a `stage_group` (string label) and `stage_order` (number) to each workflow template step. Steps sharing the same `stage_group` value belong to one logical stage. The stepper UI groups steps by stage instead of showing individual nodes.

**Example**: 7 nodes, but "Анализ МКТУ", "Охраноспособность", "Конфликты" all have `stage_group = "Параллельный анализ"` — displayed as one stage with 3 agents inside.

### Changes

#### 1. Database migration
- `ALTER TABLE workflow_template_steps ADD COLUMN stage_group TEXT DEFAULT NULL`
- `ALTER TABLE workflow_template_steps ADD COLUMN stage_order INT DEFAULT 0`
- Steps with the same `stage_group` are treated as one stage; NULL = standalone stage

#### 2. Node config in editor — add Stage field
**File:** `src/components/workflow-editor/AgentNodeConfig.tsx` + `WorkflowNodeConfigPanel.tsx`
- Add a text input "Этап (группа)" where user types stage name (e.g. "Параллельный анализ")
- Add a numeric input "Порядок этапа" for ordering stages in the stepper
- Save to `stage_group` / `stage_order` on the template step

#### 3. WorkflowStepper — group by stage
**File:** `src/components/workflow/WorkflowStepper.tsx`
- Group project steps by their template step's `stage_group`
- Show one stepper item per stage (with combined status: running if any child is running, completed only if all children completed)
- Clicking a stage expands to show its child steps

#### 4. WorkflowPanel — navigate within stages
**File:** `src/components/workflow/WorkflowPanel.tsx`
- When a stage is selected, show all its steps in tabs or a sub-list within the content area
- User can switch between agents within the same stage

#### 5. Type updates
- Add `stage_group` and `stage_order` to `WorkflowTemplateStep` type and `WorkflowNodeData`

### Technical details

**Stage status derivation:**
```text
stage.status =
  any child 'error'          → 'error'
  any child 'running'        → 'running'  
  any child 'waiting_for_user' → 'waiting_for_user'
  all children 'completed'/'skipped' → 'completed'
  else                       → 'pending'
```

**Stepper layout:**
```text
Before: [Входные] → [Досье] → [МКТУ] → [Охрана] → [Конфликты] → [Шпион] → [Итог]
After:  [1. Вход] → [2. Досье] → [3. Анализ (4 агента)] → [4. Итоговое КП]
```

Steps without `stage_group` remain individual stages (backward compatible).

### Files to modify
- New migration — add `stage_group`, `stage_order` columns
- `src/types/workflow.ts` — add fields to `WorkflowTemplateStep`
- `src/hooks/useWorkflowEditor.ts` — include new fields in node data
- `src/components/workflow-editor/WorkflowNodeConfigPanel.tsx` — stage group input
- `src/components/workflow/WorkflowStepper.tsx` — group by stage
- `src/components/workflow/WorkflowPanel.tsx` — multi-step stage view

