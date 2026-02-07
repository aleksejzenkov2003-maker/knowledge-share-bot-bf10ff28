

## Plan: PII checkbox on attachments + automatic masking/unmasking for flagged documents

### What changes

Instead of automatically masking PII in all documents, the user will see a checkbox (shield icon) on each attachment in the chat to mark whether the document contains personal data. Only documents with this flag will go through the PII masking pipeline before being sent to the LLM, and the unmasking will apply to all responses where PII was masked.

### Changes

#### 1. `src/types/chat.ts` -- add `containsPii` field to `Attachment`

Add a new optional field `containsPii?: boolean` to the `Attachment` interface, similar to the existing `addToKnowledgeBase` field. Default will be `false`.

#### 2. `src/components/chat/AttachmentPreview.tsx` -- add PII checkbox

- Add a new prop `onTogglePii?: (id: string, value: boolean) => void`
- Add a new prop `showPiiOption?: boolean`
- Render a second checkbox with a `ShieldAlert` icon next to uploaded attachments when `showPiiOption` is true
- Tooltip: "Документ содержит ПДн (персональные данные)"
- Works identically to the existing knowledge base checkbox pattern

#### 3. `src/hooks/useOptimizedChat.ts` -- add PII toggle handler

- Add `toggleAttachmentPii` callback (same pattern as `toggleAttachmentKnowledgeBase` if present, or add new)
- Pass `containsPii` flag in the attachment data sent to the edge function
- In the request body attachments array, include `contains_pii: boolean` for each attachment

#### 4. `src/hooks/useOptimizedDepartmentChat.ts` -- add PII toggle handler

- Same changes as useOptimizedChat: add `toggleAttachmentPii`, pass `contains_pii` in request body

#### 5. `src/pages/Chat.tsx` / `src/pages/DepartmentChat.tsx` / related chat pages -- wire up PII toggle

- Pass `onTogglePii` and `showPiiOption={true}` to `AttachmentPreview` (or to `ChatInputEnhanced` / `MentionInput` which renders it)

#### 6. `src/components/chat/ChatInputEnhanced.tsx` and `src/components/chat/MentionInput.tsx` -- pass PII props

- Accept and forward `onTogglePii` and `showPiiOption` to `AttachmentPreview`

#### 7. `supabase/functions/chat-stream/index.ts` -- conditional PII masking for attachments

- Add `contains_pii?: boolean` to the `AttachmentInput` interface
- In the attachment processing block (lines ~950-992), check `attachment.contains_pii`
- For text-based attachments (PDF text extraction) marked with `contains_pii: true`, run content through `maskPiiInline` before adding to the prompt
- For image/document attachments marked with PII, add a system note that the document contains PII
- The existing PII masking of the user message text remains as-is (always on)
- The existing stream unmasking buffer logic remains unchanged -- it automatically handles any PII tokens regardless of source

### What stays the same

- The PII masking of the user's text message (always runs if PII_KEY is set)
- The stream unmasking buffer logic (unchanged, handles all tokens)
- The PII audit log, pii-unmask function, PiiIndicator components
- RAG document processing pipeline (separate from chat attachments)

### User experience

1. User drags/attaches a document in chat
2. After upload, a shield icon with checkbox appears next to the file
3. User checks it if the document contains personal data
4. On send: document content is masked before LLM processing
5. LLM response with tokens like `[PERSON_1]` is automatically unmasked back to real values in the stream

