

# Update AI Provider Model Lists + Add Kimi Provider

## Summary

Update model lists across 4 files (2 UI pages + 2 backend functions), and add Kimi (Moonshot) as a new provider with full backend support.

## Changes

### 1. UI Model Lists (Providers.tsx + ChatRoles.tsx)

Both files have identical `providerModels` maps. Apply same changes to both:

**Anthropic** -- remove 4, add 1:
- Remove: `claude-sonnet-4-5-20250929`, `claude-opus-4-5-20251101`, `claude-sonnet-4-20250514`, `claude-3-5-sonnet-20241022`
- Add: `claude-3-haiku-20240307` (Claude Haiku 3)

**Gemini** -- remove 1, add 1:
- Remove: `gemini-2.0-flash`
- Add: `gemini-2.5-flash-thinking` (Gemini 2.5 Flash Thinking)

**OpenAI** -- remove 4, add 5:
- Remove: `o1`, `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`
- Add: `gpt-5-mini`, `gpt-5.4`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`

**Qwen** -- add 1:
- Add: `qwen3.5-plus` (Qwen3.5 Plus)

**Kimi** -- new provider:
```
kimi: [
  { value: 'kimi-k2.5', label: 'Kimi K2.5' },
  { value: 'kimi-k2.5-agent', label: 'Kimi K2.5 (нативный agentic)' },
  { value: 'kimi-k2.5-vision', label: 'Kimi K2.5 (vision-native)' },
  { value: 'kimi-k2-thinking', label: 'Kimi K2 Thinking' },
]
```

Also add Kimi to:
- `providerLabels` map: `kimi: 'Kimi (Moonshot)'`
- `envConfiguredProviders` array
- Provider type `<SelectItem>` dropdown in Providers.tsx
- ChatRoles.tsx provider select if present

### 2. Backend: chat-stream/index.ts

- **validAnthropicModels** (line ~1909): Remove the 4 old models, add `claude-3-haiku-20240307`
- **getAnthropicMaxTokens** (line ~1927): Add case for `claude-3-haiku` returning 4096
- **getEffectiveApiKey** (line ~336): Add `case 'kimi': return Deno.env.get('KIMI_API_KEY') || '';`
- **Provider routing switch**: Add `case 'kimi'` block using Moonshot API endpoint (`https://api.moonshot.cn/v1/chat/completions`)

### 3. Backend: chat/index.ts

- **getAnthropicMaxTokens** (line ~91): Add `claude-3-haiku` case returning 4096

### 4. Secret

Need to request `KIMI_API_KEY` secret from the user for the Kimi provider.

### Files to modify:
- `src/pages/Providers.tsx`
- `src/pages/ChatRoles.tsx`
- `supabase/functions/chat-stream/index.ts`
- `supabase/functions/chat/index.ts`

