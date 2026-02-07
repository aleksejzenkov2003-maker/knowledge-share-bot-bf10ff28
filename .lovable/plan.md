

## Plan: Fix fullscreen chat state preservation and new chat creation

### Root Causes

**Issue 1 - New chat not working in fullscreen:**
In `ChatFullscreen.tsx`, `handleNewChat` (from the hook) sets `activeConversationId` to `null`. But the `useEffect` on line 75 continuously watches for `!activeConversationId` and restores it from the URL param `initialConversationId`. So every time you click "New Chat", the effect immediately puts the old conversation back.

**Issue 2 - Chat disappears on transition to fullscreen:**
The `initialConversationId` is read once from `searchParams` on mount. The restore effect depends on `conversations.length > 0`, which requires the query to load first. During this loading time, messages are empty. This is expected but the effect should reliably restore once loaded.

### Changes

#### 1. `src/pages/ChatFullscreen.tsx`

- Replace the static `searchParams.get('conversationId')` with a mutable ref or state that can be cleared
- Use `setSearchParams` to update the URL when chat changes
- When `handleNewChat` is called, also clear the URL param so the restore effect doesn't fight back
- When `activeConversationId` changes (via sidebar selection), update URL
- Add a wrapper for `handleNewChat` that clears URL params before calling the hook's handler

Specifically:
```typescript
// Track the conversationId in URL as state, not just initial
const [searchParams, setSearchParams] = useSearchParams();

// Restore from URL only on initial load
const hasRestoredRef = useRef(false);

useEffect(() => {
  const urlConvId = searchParams.get('conversationId');
  if (!hasRestoredRef.current && urlConvId && conversations.length > 0) {
    const exists = conversations.find(c => c.id === urlConvId);
    if (exists) {
      setActiveConversationId(urlConvId);
    }
    hasRestoredRef.current = true;
  }
}, [conversations]);

// Sync URL when active conversation changes
useEffect(() => {
  if (activeConversationId) {
    setSearchParams({ conversationId: activeConversationId }, { replace: true });
  } else {
    setSearchParams({}, { replace: true });
  }
}, [activeConversationId]);

// Wrapper for new chat
const handleNewChatFullscreen = useCallback(() => {
  handleNewChat();
  // URL will auto-clear via the activeConversationId sync effect
}, [handleNewChat]);
```

- Update the sidebar's `onNewChat` to use this wrapper
- Update the exit button to use current `activeConversationId` (already done)

### Result

- Navigating to fullscreen preserves the active conversation
- "New Chat" works correctly in fullscreen by clearing the URL param
- Selecting a different chat from the sidebar updates the URL
- Returning to normal view preserves the conversation via URL param

