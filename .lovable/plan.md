

## Plan: Workflow UI Overhaul + Quality-Check Agents

### Summary
Streamline the workflow step view by removing clutter, improving button placement, adding file upload per step, and introducing verification agents.

### Changes

#### 1. Remove WorkflowDocumentAssembly block
**File:** `src/components/workflow/WorkflowPanel.tsx`
- Delete the `<WorkflowDocumentAssembly steps={steps} />` line (line 121)
- Remove the import

#### 2. Simplify WorkflowStepView layout — remove horizontal result panel
**File:** `src/components/workflow/WorkflowStepView.tsx`
- Restructure tabs: make **Chat with agent** the default/primary view
- Place the result (markdown) and JSON as a side panel or secondary tab next to chat — not a separate horizontal block above
- Remove the standalone `<WorkflowResultEditor>` that renders outside of tabs (the `hr?.title` block at lines 415-419 can stay as a small summary badge)
- Layout: single column, chat-first, with result/JSON as tabs within the same area

#### 3. Simplify action buttons
**File:** `src/components/workflow/WorkflowStepView.tsx`
- **Remove**: "Сбросить шаг" and "Сбросить отсюда" buttons (lines 377-381)
- **Keep**: "Перезапустить" button
- **Add**: "Пропустить" (Skip) button — calls a new `onSkipStep` callback
- **Move "Запустить"**: Place it prominently inside the main content area (centered or at the bottom of chat), not in the top-right header that scrolls off-screen
- **Move "Подтвердить"**: Place it at the bottom of the chat panel area, near the message input, so it's always visible when the user finishes reviewing

#### 4. Add file upload to each step
**File:** `src/components/workflow/WorkflowStepView.tsx`
- Add a file upload zone (drag-and-drop or button) in each step's chat/input area
- Upload files to Supabase storage bucket `node-artifacts`
- Insert uploaded file reference into the step's `input_data` so the agent can process it
- Especially important for conflict analysis step (trademark search tables)

#### 5. Add `onSkipStep` to the workflow hook
**File:** `src/hooks/useProjectWorkflow.ts`
- Add `skipStep(stepId)` function that sets step status to `skipped` and triggers next step transitions

#### 6. Quality-check agents (verification layer)
**Database migration:** Add a `quality_check_agent_id` column to `workflow_template_steps`
- After each agent step completes, automatically invoke a separate LLM (the "checker") that compares the output against the step's prompt/requirements
- The checker produces a pass/fail verdict + feedback
- If failed, the step goes to `waiting_for_user` with the checker's feedback visible
- Migration: `ALTER TABLE workflow_template_steps ADD COLUMN quality_check_agent_id UUID REFERENCES chat_roles(id)`
- Create a universal "Quality Checker" agent with a system prompt focused on verification
- **Edge function update** (`workflow-step-execute/index.ts`): after agent completion, if `quality_check_agent_id` is set, invoke the checker before marking complete

#### 7. Multi-agent within a node (noted for future)
- Document this as a future enhancement — no implementation now
- Architecture note: each node could have an array of `sub_agents` that execute sequentially or in parallel within the node

### Technical details

**Button layout change (WorkflowStepView):**
```
Before:  Header: [Name] [Status] .................. [Agent] [Run] [Restart] [Reset] [ResetFrom] [Confirm]
After:   Header: [Name] [Status] [Agent] [Restart] [Skip]
         Bottom of chat area: [Run step] [Confirm & continue]
```

**File upload component:**
- Reuse existing attachment patterns from `ChatInput.tsx` / `AttachmentPreview.tsx`
- Store in `node-artifacts` bucket with path `{projectId}/{stepId}/{filename}`
- Save artifact record in `workflow_artifacts` table

**Quality checker prompt template:**
```
You are a quality verification agent. Compare the output against the original task requirements.
Task: {step.prompt_override || step.agent.system_prompt}
Output to verify: {step.output_data}
Verdict: PASS or FAIL with explanation.
```

### Files to modify
- `src/components/workflow/WorkflowPanel.tsx` — remove DocumentAssembly
- `src/components/workflow/WorkflowStepView.tsx` — major restructure
- `src/hooks/useProjectWorkflow.ts` — add skipStep
- `supabase/functions/workflow-step-execute/index.ts` — quality check logic
- New migration — `quality_check_agent_id` column + checker agent record
- New migration — checker system prompt + chat_role

