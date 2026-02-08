

## Plan: Fix invalid Anthropic model name causing 500 errors

### Problem

The model name `claude-sonnet-4-5-20250929` is used in multiple places but does not exist in Anthropic's API, causing 500 errors. The correct model name is `claude-sonnet-4-20250514`.

### Changes

#### 1. Database fix: Update `ai_providers` table

Run a migration to fix the stored default_model:

```sql
UPDATE ai_providers 
SET default_model = 'claude-sonnet-4-20250514' 
WHERE provider_type = 'anthropic' 
AND default_model = 'claude-sonnet-4-5-20250929';
```

#### 2. `supabase/functions/chat-stream/index.ts`

Replace all occurrences of `claude-sonnet-4-5-20250929` with `claude-sonnet-4-20250514`:

- **Line 265** (env fallback): `default_model: 'claude-sonnet-4-20250514'`
- **Line 1123** (valid models list): replace `'claude-sonnet-4-5-20250929'` with `'claude-sonnet-4-20250514'` (note: it's already in the list on line 1124, so just remove the duplicate invalid entry)
- **Line 1131** (fallback on invalid model): `finalModel = 'claude-sonnet-4-20250514'`
- **Line 1256** (Perplexity fallback provider): `model: 'claude-sonnet-4-20250514'`

#### 3. No changes needed in:

- `chat/index.ts` -- already uses correct `claude-sonnet-4-20250514`
- `rerank-chunks/index.ts` -- already correct
- `process-document/index.ts` -- already correct
- Perplexity models (`sonar`, `sonar-pro`) -- valid
- Gemini models (`gemini-2.5-flash`) -- valid

### Result

All Anthropic API calls will use a valid model identifier, eliminating the 500 errors when Anthropic is selected as the provider.

