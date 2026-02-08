

## Plan: Increase max_tokens across all AI providers

### Problem

Current `max_tokens` values (4096-8192) limit responses to roughly 6000-12000 characters. To support ~50,000 character outputs, we need to increase these limits significantly.

### Token-to-character ratio

Roughly 1 token = 3-4 characters (for Russian text, closer to 2-3). To get 50,000 characters, we need approximately 16,000-25,000 tokens. Setting max_tokens to 16384 should cover most cases.

### Provider limits (max output tokens)

- **Anthropic (Claude Sonnet 4)**: supports up to 64,000 output tokens -- set to **16384**
- **Gemini 2.5 Flash**: supports up to 65,536 output tokens -- set to **16384**
- **GigaChat**: supports up to 32,768 output tokens -- set to **16384**
- **Perplexity (sonar)**: supports up to 12,000 output tokens -- set to **12000** (API limit)
- **OpenAI**: supports up to 16,384 output tokens -- set to **16384**

### Changes

#### 1. `supabase/functions/chat-stream/index.ts`

Update all `max_tokens` / `maxOutputTokens` values:

| Location | Provider | Current | New |
|---|---|---|---|
| Line 1149 | Anthropic | 8192 | 16384 |
| Line 1191 | Gemini | 8192 | 16384 |
| Line 1213 | GigaChat | 8192 | 16384 |
| Line 1234 | Perplexity | 8000 | 12000 |
| Line 1164-1168 | OpenAI | not set | add `max_tokens: 16384` |
| Line 1278 | Gemini fallback | 8192 | 16384 |
| Line 1292 | Anthropic fallback | 8192 | 16384 |

#### 2. `supabase/functions/chat/index.ts` (non-streaming function)

| Location | Provider | Current | New |
|---|---|---|---|
| Line 99 | Anthropic | 4096 | 16384 |
| Line 226 | GigaChat | 8192 | 16384 |

Gemini and Perplexity in this file have no explicit limit set (uses provider default), which is fine. OpenAI also has no limit set.

#### 3. No changes to `process-document` or `rerank-chunks`

These are utility functions with different purposes, not user-facing chat. Their limits are appropriate.

### Result

All chat providers will support generating responses up to ~50,000 characters (16,384 tokens). Perplexity is capped at 12,000 tokens due to API limits but will still produce significantly longer responses than before.
