

## Plan: Assemble "КП по товарному знаку" Workflow Template

### Summary

The template already exists with 8 steps (6 correct typed + 2 unused script stubs) but lacks proper agent assignments, node_keys, form_config, edges (graph connections), and mappings. The plan is to fix the existing steps, delete the unused ones, wire edges with data mappings, and assign the best real agents.

### Step-by-step architecture

```text
┌─────────────┐
│ 1. Входные  │  node_type=input, form with trademark/description/files
│    данные    │  node_key=input
└──────┬──────┘
       │ edge: trademark, description → mktu
       ▼
┌─────────────┐
│ 2. МКТУ     │  agent: МКТУ-3.2 (9653cfa3)  — best MKTU agent, 5229-char prompt
│             │  node_key=mktu, auto_run=true
└──────┬──────┘
       │ edge: all → protectability
       ▼
┌─────────────┐
│ 3. Охрано-  │  agent: Сходство ТЗ (40d81663) — 8519-char prompt, conflict analysis
│ способность │  node_key=protect, auto_run=true
└──────┬──────┘
       │ edge: all → conflicts
       ▼
┌─────────────┐
│ 4. Конфликты│  agent: Поиск бренда (7a4cb7c9) — Perplexity sonar-pro, web search
│   и угрозы  │  node_key=conflicts, auto_run=true
└──────┬──────┘
       │ edge: all → spy
       ▼
┌─────────────┐
│ 5. ШПИОН    │  node_type=script, function_name=spy-market-scan
│             │  node_key=spy, auto_run=true
└──────┬──────┘
       │ edge: all → result
       ▼
┌─────────────┐
│ 6. Итог     │  agent: КП по ТЗ (4e29fe1d) — 21614-char prompt, final doc assembly
│             │  node_key=result, node_type=output
└─────────────┘
```

### Database Migration (single SQL)

1. **Delete unused steps** (step 7, step 8 — the empty script stubs)
2. **Update step 5** (Шпион): change `node_type` from `agent` to `script`, set `script_config` with `function_name: spy-market-scan`
3. **Update all 6 steps**: assign correct `agent_id`, `node_key`, `form_config` (for input), `auto_run`, positions, `is_user_editable`
4. **Insert 5 edges** connecting steps 1→2→3→4→5→6 with passthrough mappings
5. **Update template schema** with `entryNodeIds`

### Agent Assignments

| Step | Agent | Reason |
|------|-------|--------|
| 1. Входные данные | — (input node) | Form-based data collection |
| 2. МКТУ | МКТУ-3.2 (`9653cfa3`) | Best MKTU agent, 5229-char specialized prompt, Claude Sonnet |
| 3. Охраноспособность | Сходство ТЗ (`40d81663`) | 8519-char prompt specialized in trademark similarity analysis |
| 4. Конфликты | Поиск бренда (`7a4cb7c9`) | Perplexity sonar-pro, web search enabled, 8177-char prompt |
| 5. Шпион | — (script node) | Calls `spy-market-scan` edge function directly |
| 6. Итог | КП по ТЗ (`4e29fe1d`) | 21614-char prompt, full KP assembly logic |

### Input Form Config (Step 1)

Fields: trademark name (text), description (textarea), attached files (file)

### Technical Details

- Single migration with DELETE + UPDATE + INSERT statements
- Edges use passthrough mapping (`sourcePath: ""`, `targetPath: ""`) so each step receives full output of the previous
- Step 5 gets `script_config: { function_name: "spy-market-scan", scriptKey: "spy-market-scan", timeoutSec: 120, retries: 1 }`
- No code file changes needed — this is purely a database configuration update
- Template stays `published` and `version: 1`

