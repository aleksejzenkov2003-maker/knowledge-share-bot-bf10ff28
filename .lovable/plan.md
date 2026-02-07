

## Plan: Fix attachment checkboxes and add PII preview in chat

### Issues identified

1. **PII checkbox missing in personal chat**: Both Chat.tsx and DepartmentChat.tsx pass `onToggleAttachmentPii` to `ChatInputEnhanced`, and `ChatInputEnhanced` passes `showPiiOption={true}` to `AttachmentPreview` -- so the PII checkbox should appear in both. Need to verify if there's a rendering issue or if the screenshot is from personal chat specifically.

2. **Knowledge Base bookmark icon disappeared**: `ChatInputEnhanced` renders `AttachmentPreview` (line 326) but does NOT pass `showKnowledgeBaseOption` or `onToggleKnowledgeBase`. The department chat hook (`useOptimizedDepartmentChat`) exports `toggleAttachmentKnowledgeBase` but it's never wired through `DepartmentChat.tsx` -> `ChatInputEnhanced` -> `AttachmentPreview`. The `ChatInputEnhanced` component doesn't even accept these props.

3. **PII preview needed**: When user toggles the PII checkbox on an attachment, show `PiiPreviewDialog` with the document's text content so they can see what will be masked before sending.

### Changes

#### 1. `src/components/chat/ChatInputEnhanced.tsx`

- Add new props: `onToggleAttachmentKnowledgeBase?: (id: string, value: boolean) => void` and `showKnowledgeBaseOption?: boolean`
- Pass these props through to `AttachmentPreview` alongside the existing PII props
- Add new prop: `onPiiPreview?: (attachment: Attachment) => void` -- to trigger PII preview dialog from parent

#### 2. `src/components/chat/AttachmentPreview.tsx`

- Add a "preview" eye icon button next to the PII checkbox
- When PII is toggled ON, show a small eye/preview button that triggers `onPiiPreview` callback
- This allows the parent to open `PiiPreviewDialog`

#### 3. `src/pages/DepartmentChat.tsx`

- Wire `toggleAttachmentKnowledgeBase` from hook to `ChatInputEnhanced` via new props `onToggleAttachmentKnowledgeBase` and `showKnowledgeBaseOption={true}`
- Add PII preview state: `piiPreviewOpen`, `piiPreviewText`, `piiPreviewFileName`
- Add handler that extracts text from the attachment file (PDF via pdfjs-dist, or plain text) and opens `PiiPreviewDialog`
- Render `PiiPreviewDialog` component

#### 4. `src/pages/Chat.tsx`

- Add PII preview state and handler (same as DepartmentChat)
- Render `PiiPreviewDialog`
- Pass `onPiiPreview` to `ChatInputEnhanced`

#### 5. Text extraction for PII preview

- Reuse the existing client-side text extraction logic (PDF via `pdfjs-dist`, DOCX via `jszip`) already used in the documents section
- For PDF: use `pdfjs-dist` to extract text page by page
- For CSV/XLS: read as text directly
- For images: skip preview (no text to mask)
- Extract first ~3000 chars and pass to `PiiPreviewDialog` which calls `pii-mask` edge function in preview mode

### Result

- Both personal and department chats will show the knowledge base bookmark checkbox on attachments
- Both chats will show the PII shield checkbox
- When PII is toggled on, user can preview what data will be masked via the existing `PiiPreviewDialog` component
