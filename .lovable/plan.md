## Plan: Two-Document Output for the "Итог" Step

### Problem

Currently the "Итог" (final) step produces a single markdown document that mixes client-facing КП content with internal analysis data. The user wants:

1. **Document 1 — КП для клиента**: A professionally formatted commercial proposal following the structure from the uploaded template (cover page, analysis sections 1-4, cost table, info pages)
2. **Document 2 — Отчёт для сотрудника**: An internal report with all raw data, agent outputs, screenshots, and detailed analysis

### Template Structure (from uploaded DOCX)

The client-facing КП follows this exact structure:

1. Cover page with trademark name and section icons
2. Section 1: Анализ охраноспособности (protectability analysis)
3. Section 2: Подбор классов МКТУ (class selection with table)
4. Section 3: Результаты поиска (search results with conflict table + images)
5. Section 4: Детальный расчет затрат (cost breakdown table)
6. Выводы и рекомендации
7. Info pages ("Важное о вашем товарном знаке", порядок регистрации)

### Changes

#### 1. Update the "КП по ТЗ" agent system prompt

Restructure the prompt so the agent outputs TWO clearly separated sections in its markdown response using delimiters:

```
===КП_КЛИЕНТ===
(client-facing КП in the template structure)
===КП_СОТРУДНИК===
(internal report with all raw data)
```

The client КП section must follow the exact structure from the template: numbered sections (1. Анализ охраноспособности, 2. МКТУ, 3. Результаты поиска, 4. Расчет затрат), with tables for conflicts and costs.

#### 2. Update `workflow-step-execute` (output node handling)

After receiving the agent's response, parse the two sections and store them separately:

- `output_data.client_kp` — client-facing document
- `output_data.internal_report` — employee report  
- `human_readable_output.summary` — still shows the client KP for the main view

#### 3. Update `WorkflowStepView.tsx` for the output step

Add two tabs for the final step:

- **"КП для клиента"** tab — renders the client document with DOCX export button
- **"Отчёт для сотрудника"** tab — renders the internal report

#### 4. Add DOCX export for client КП

Create a new edge function `generate-kp-docx` that takes the client КП markdown and generates a professionally formatted DOCX following the template's styling:

- Header/footer with company branding ("РЕГИСТРАЦИЯ ТОВАРНОГО ЗНАКА | ARTPATENT.RU")
- Numbered sections with proper heading styles
- Tables for МКТУ classes, conflicts, and cost breakdown
- Page numbers in footer

#### 5. Update `KpRenderEditorDialog`

Modify to work with the split documents — editor for client КП with both PDF and DOCX export options.

### Technical Details

- **System prompt update**: SQL migration to update the prompt in `system_prompts` table
- **Edge function**: `generate-kp-docx/index.ts` using the `docx` npm package (available in Deno via esm.sh)
- **Delimiter parsing**: Simple string split on `===КП_КЛИЕНТ===` / `===КП_СОТРУДНИК===` markers
- **Fallback**: If agent doesn't produce delimiters, treat entire output as client KP (backward compatible)
- **DOCX generation**: Uses the `docx` library with styles matching the uploaded template (Arial font, black headings, professional tables with borders)

### Files to modify

- `system_prompts` table — update prompt for agent `4e29fe1d`
- `supabase/functions/workflow-step-execute/index.ts` — parse two-section output
- `supabase/functions/generate-kp-docx/index.ts` — new edge function
- `src/components/workflow/WorkflowStepView.tsx` — two-tab view for output step
- `src/components/workflow/KpRenderEditorDialog.tsx` — add DOCX export option

надо взять из документа кп что отправил клент все оформление и делать рендер по шаблону