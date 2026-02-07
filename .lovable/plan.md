

## Plan: Keep chat state when toggling fullscreen

### Problem

`/chat` and `/chat-fullscreen` are separate routes. Navigating between them destroys the React component tree, losing all local state: typed text, attached files, checkbox states. File objects cannot be serialized to URLs or sessionStorage.

### Solution

Instead of two separate pages with route navigation, make fullscreen a **layout toggle within a single Chat component**. The Chat page will have an `isFullscreen` state. When toggled:
- **Normal mode**: renders inside `AdminLayout` (sidebar + header + content)
- **Fullscreen mode**: renders as a full-viewport overlay on top, hiding the admin chrome

No route change happens, so all React state (input text, files, checkboxes, conversation) is preserved.

### Changes

#### 1. `src/pages/Chat.tsx`

- Add `isFullscreen` state (boolean, default `false`)
- When `isFullscreen` is `false`: render current layout (fits inside `AdminLayout` as now)
- When `isFullscreen` is `true`: render a full-screen fixed overlay (`position: fixed, inset: 0, z-index: 50`) with the same chat content but using the fullscreen layout (own header with sidebar toggle, no admin header/sidebar visible)
- The "Maximize" button sets `isFullscreen = true`
- The "Minimize" button sets `isFullscreen = false`
- All state (inputValue, attachments, activeConversationId, messages) stays intact since the component never unmounts

#### 2. `src/pages/ChatFullscreen.tsx`

- Remove this file entirely (or keep as a redirect to `/chat?fullscreen=true` for backward compatibility)
- The fullscreen route in `App.tsx` can redirect to `/chat`

#### 3. `src/App.tsx`

- Remove the `/chat-fullscreen` route or change it to a redirect:
  ```tsx
  <Route path="/chat-fullscreen" element={<Navigate to="/chat" />} />
  ```

### Technical detail

The fullscreen overlay approach:

```text
+---------------------------+
| AdminLayout (hidden under)|
|  +---------------------+  |
|  | Chat component      |  |
|  | isFullscreen=true    |  |
|  +---------------------+  |
+---------------------------+
+===========================+ <-- fixed overlay, z-50
| Full-screen chat UI       |
| [sidebar] [messages] etc  |
| All same React state      |
+===========================+
```

When `isFullscreen` is true, render a `<div className="fixed inset-0 z-50 bg-background">` containing the fullscreen layout. When false, render the normal inline layout. Both share the same component instance and state.

### Result

- Toggling fullscreen preserves typed text, attached files, PII/KB checkboxes, and active conversation
- No route navigation occurs, just a CSS layout change
- Simplifies codebase by removing a duplicate page

