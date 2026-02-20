

# Two Fixes: Perplexity Citation Links + Department Chat Auto-Titles

## Issue 1: Broken citation links in "Poisk brendov" agent (sonar-pro)

**Root cause**: When Perplexity (sonar-pro) returns a response with `[1]`, `[2]`, etc., these reference web URLs stored in `perplexity_citations` (an array of strings/URLs). However, the `MarkdownWithCitations` component only passes `message.metadata?.citations` (internal document citations) to `CitationLink`. Since there are no matching document citations, clicking `[4]` shows "Источник не найден".

**Fix**:
- Pass `perplexity_citations` (and `web_search_citations`) into `MarkdownWithCitations` as a new prop.
- In `CitationLink`, when no document citation matches, check if there is a Perplexity/web URL at that index (index - 1, since citations are 1-based). If found, open the URL in a new tab instead of showing an error.
- Apply this change in `DepartmentChatMessage.tsx` and all other chat message components that use `MarkdownWithCitations`.

**Files to modify**:
- `src/components/chat/MarkdownWithCitations.tsx` -- add `perplexityCitations` prop, pass to `CitationLink`
- `src/components/chat/CitationLink.tsx` -- accept `perplexityCitations`, open URL when no document citation found
- `src/components/chat/DepartmentChatMessage.tsx` -- pass `perplexity_citations` / `web_search_citations` to `MarkdownWithCitations`
- `src/components/chat/ChatMessage.tsx` -- same
- `src/components/chat/BitrixChatMessage.tsx` -- same
- `src/components/chat/ProjectChatMessage.tsx` -- same (if applicable)

## Issue 2: All department chats show "Новый чат" instead of meaningful titles

**Root cause**: In `useOptimizedDepartmentChat.ts`, when a new chat is created it gets title "Новый чат" (line 92). The auto-title logic (lines 372-385) only runs when the message does NOT have an @agent mention. When an agent IS mentioned (the common case), the title stays "Новый чат" forever.

**Fix**:
- Move the auto-title logic to run for ALL first messages, regardless of whether an agent is mentioned.
- Extract the title from the user's message text (excluding the @agent mention prefix) -- use `cleanText` (the message without the @mention).
- Truncate to 50 characters.

**File to modify**:
- `src/hooks/useOptimizedDepartmentChat.ts` -- move title update logic before the agent check, using `cleanText` for title generation.

## Technical Details

### CitationLink changes (pseudocode):
```
// New prop: perplexityCitations?: string[]
// In handleClick:
if (!citation && perplexityCitations) {
  const url = perplexityCitations[index - 1];
  if (url) {
    window.open(url, '_blank');
    return;
  }
}
```

### Auto-title logic move:
```
// Before the "if (!agentId)" check, update title on first message:
if (localMessages.length === 0) {
  const titleText = cleanText || text;
  const title = titleText.slice(0, 50) + (titleText.length > 50 ? '...' : '');
  await supabase.from('department_chats').update({ title }).eq('id', activeChatId);
}
```

