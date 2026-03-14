

# Fix: OpenAI and Qwen providers returning HTTP 500

## Problem
The `getEffectiveApiKey` helper in `chat-stream/index.ts` (line 336-351) has fallback cases for `perplexity`, `anthropic`, `gemini`, and `gigachat` but is **missing** `openai` and `qwen`. When the provider record in the DB has no `api_key` stored (because the keys are configured as environment secrets), the function returns an empty string, which causes the "No AI provider configured or API key missing" error.

## Fix
Add two cases to the `getEffectiveApiKey` switch statement:

```typescript
case 'openai':
  return Deno.env.get('OPENAI_API_KEY') || '';
case 'qwen':
  return Deno.env.get('QWEN_API_KEY') || '';
```

**File:** `supabase/functions/chat-stream/index.ts` (lines 339-350)

This is a one-line-per-case fix. After this, both providers will correctly fall back to the environment secrets `OPENAI_API_KEY` and `QWEN_API_KEY` that are already configured.

