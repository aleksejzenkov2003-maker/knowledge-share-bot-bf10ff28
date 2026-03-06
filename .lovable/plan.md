

## Plan: Improve Reputation in Chats

The user reports three problems with the Reputation agent in chats:
1. **No company name** in the text response — it says "Компания" instead of the actual name
2. **No internet search** — the Perplexity-based web search (available on the Reputation page's "Интернет" tab) is not available in chats
3. **Incomplete information** — the card doesn't show status (active/liquidated) prominently enough, and the text summary is too minimal

### Root Cause Analysis

In `supabase/functions/chat-stream/index.ts` line 1198, when building the text summary:
```ts
const companyName = ss(d.Name || d.ShortName || d.FullName) || 'Компания';
```
The `normalizeCompanyData` function (line 1007-1008) does set `n.Name` from `ShortName`/`FullName`, but the API card response may return the name in a nested structure that isn't being extracted. Additionally, the text summary (lines 1201-1205) is very brief — just name, INN, address, and "see card below".

### Changes

#### 1. `supabase/functions/chat-stream/index.ts` — Enhance reputation text summary and add web search

**a) Fix company name extraction** — Also try `d.name`, `d.CompanyName`, `d.Title` in the `ss()` call, and merge name from the original search result into `reputationCompanyData`.

**b) Enrich the text summary** — Include status, director, main activity, capital, employees count, and registration date in the markdown text so even without the card UI, the response is informative.

**c) Add internet search via Perplexity** — After fetching the company card, if `PERPLEXITY_API_KEY` is available, call the `reputation-web-search` edge function logic inline (fetch custom prompt from `system_prompts`, call Perplexity sonar-pro, append web research results to the response). This adds a "Информация из интернета" section with citations.

**d) Merge search result name** — When fetching a single company card, copy `firstResult.Name` into `reputationCompanyData.Name` if the card API didn't return it.

#### 2. `src/components/chat/ReputationCompanyCard.tsx` — Add "Search Internet" button

Add a button at the bottom of the card that triggers the `reputation-web-search` edge function, displaying the result inline (similar to the Reputation page's "Интернет" tab). This uses local state within the card component:
- Add a "Найти в интернете" button
- On click, call `supabase.functions.invoke('reputation-web-search', { body: { companyName, inn, ogrn } })`
- Display the markdown result with citations below the button

#### 3. Fix build errors

The build errors appear to be transient/retry issues, not code-related. Will verify after making changes.

### Technical Details

**chat-stream changes (~lines 1126-1205):**
- After `reputationCompanyData = normalizeCompanyData(...)`, add: `if (!reputationCompanyData.Name && firstResult.Name) reputationCompanyData.Name = firstResult.Name;`
- Expand text summary to include: status with emoji (checkmark/cross), director, OKVЭД, capital, employees, registration date
- Add Perplexity web search block: fetch prompt from DB, call sonar-pro, append to `textContent`

**ReputationCompanyCard.tsx changes:**
- Add state: `webResult`, `webLoading`, `webError`
- Add button + result section at card bottom (before closing `</Card>`)
- Import `supabase` client and `MarkdownWithCitations`

