# Image Upload Flow - Technical Documentation

## Overview
This document explains how image uploads work in the AI Chat application.
Images are converted to base64 in the browser and sent as `image_url` content
blocks inside the chat messages array — the same wire form the Puter.js SDK
itself produces when given a `File` media argument (verified in the
js.puter.com/v2 bundle: a File becomes `"b" + base64`, wrapped as
`{ image_url: { url } }` with `vision: true`).

## Image Upload Process

### 1. User Selects Images
- User clicks the upload button in `ChatInput.tsx` (shown only when the
  selected model supports vision, per the live model catalog)
- File input accepts image files (JPEG, PNG, GIF, etc.), max 4
- Images are previewed locally using the `FileReader` API
- Unsupported formats (AVIF, HEIC/HEIF) are auto-converted to PNG via canvas
  (`src/lib/utils/imageConversion.ts`)

### 2. Client-Side Processing (Base64)
When the user sends a message, `Index.tsx` converts each file to raw base64
(the `data:` prefix is stripped):

```typescript
// In Index.tsx - handleSendMessage()
const reader = new FileReader();
reader.readAsDataURL(file);
// resolve(reader.result.split(",")[1])  ->  "iVBORw0KGgoAAAANSUhEUg..."
```

**Why base64?**
- **Reliability**: Bypasses the need for public file hosting or complex URL generation.
- **Speed**: No intermediate upload step to a server before sending to AI.
- **Wire-compatible**: Matches the SDK's own File handling (`"b" + base64`).

### 3. Pass Data to AI Model
`src/lib/streamingHandler.ts` builds the messages array. The current user
message carries the images as content blocks alongside the text:

```typescript
// In streamingHandler.ts - buildMessages()
{
  role: "user",
  content: [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: "b" + base64 } },
    // ... one block per image
  ],
}
await puter.ai.chat(messages, false, { model, stream: true });
```

Prior conversation turns are included as `{ role, content }` text messages,
so the model keeps context. Images are sent only with the current turn
(storing base64 in localStorage would exhaust its quota).

### 4. AI SDK Interaction
- The messages array is passed through to the API as-is.
- Streaming chunks are parsed per the documented shape:
  `{ type: "text", text }` appends; `{ type: "error", message, code }` ends
  the stream and surfaces the error.
- Thrown `{ code: "network_error" }` / `{ code: "request_timeout" }` are
  mapped to user-friendly messages.

### 5. AI Model Analyzes Image
The model receives the text prompt plus the image blocks and responds with
streaming text, rendered with markdown formatting in `ChatMessage.tsx`.

## Supported Models for Image Analysis
Vision support is read from the live `puter.ai.listModels()` catalog
(`modalities.input` includes `"image"`), surfaced via
`modelSupportsVision()` in `src/lib/models.ts`. The keyword heuristic there
is only an offline fallback.

## Error Handling
### Processing Errors
- Non-image files are filtered out with a toast.
- Failed conversions abort the send with a destructive toast.
### AI Errors
- Error chunks end the stream and show the provider's message.
- Rate limits (`too_many_requests`), exhausted credit (`insufficient_funds`),
  network drops and timeouts each map to a specific message.

## Security & Privacy
- Images never touch our own servers — they go straight from the browser to
  Puter's API inside the chat request.
- Model output is HTML-escaped before markdown rendering, so a malicious
  response cannot inject markup or scripts.

## References
- `src/lib/streamingHandler.ts` — message building + streaming
- `src/lib/models.ts` — live catalog + vision gating
- `src/components/ChatInput.tsx` — selection, conversion, preview
- https://docs.puter.com/AI/chat/
