# Image Upload Flow - Technical Documentation

## Overview
This document explains how image attachments work in the AI Chat application.
Each attachment is prepared in the browser (converted when the container is not
one providers decode, shrunk when it is larger than a request should carry) and
sent as a **`data:` URL inside an `image_url` content block** — the same wire
form the Puter.js SDK itself builds when it is handed a `File` media argument
(verified against `@heyputer/puter.js@2.6.4`, `src/modules/ai/chat.js`:
`mediaOrOptions instanceof File` → `utils.blobToDataUri(...)` →
`{ image_url: { url } }`).

> **Correction.** Earlier revisions of this document described a `"b" + base64`
> marker as the SDK's image wire form. That is not an image format at all: the
> `"b" + …` string in the bundled SDK is the **socket.io/Engine.IO binary-packet
> encoder** (`Fn.open = "0" … Fn.noop = "6"`, `FileReader` → `"b" + base64`) used
> for the transport, not for chat content. Sending `url: "b<base64>"` handed the
> provider a string that is neither a URL nor a data URI, so image questions
> failed. Bare base64 is equally unusable — the URL is passed through to the
> provider untouched.

## Image Upload Process

### 1. User Selects Images
- The upload button in `ChatInput.tsx` is shown only when the selected model
  supports vision (per the live model catalog from `puter.ai.listModels()`).
- The file input accepts image files (JPEG, PNG, GIF, WebP — plus HEIC, AVIF,
  BMP, TIFF and SVG, which are converted), max **4**
  (`MAX_ATTACHMENTS` in `src/lib/attachments.ts`).
- Previews are object URLs built in file order, so `preview[i]` is always
  `attachments[i]`: the OCR and remove buttons act on the image they show.
  Object URLs are revoked when an attachment is removed, cleared, or the
  composer unmounts.
- Unsupported containers (AVIF, HEIC/HEIF, BMP, TIFF, SVG…) are converted to
  PNG via canvas (`src/lib/utils/imageConversion.ts`).

### 2. Preparation at Send Time (`src/lib/attachments.ts`)
`handleSendMessage()`/`handleEditMessage()` in `Index.tsx` call
`prepareImageAttachments(files)`, which for each file:

1. converts a container providers reject (delegates to `convertImageToPNG`),
2. shrinks the image with `downscaleImage()` — long edge ≤ **1568 px**
   (`MAX_IMAGE_EDGE`), encoded size aimed at **≈1.2 MB**
   (`TARGET_IMAGE_BYTES`), PNG for sources that may carry transparency and JPEG
   at falling quality otherwise,
3. encodes the result as a data URL (`blobToDataUrl`), and
4. rejects anything still larger than **4 MB** (`MAX_IMAGE_BYTES`) rather than
   sending a request the provider will refuse.

### 3. Pass Data to the AI Model
`src/lib/streamingHandler.ts` builds the messages array. The current user
message carries the images as content blocks alongside the text:

```typescript
// In streamingHandler.ts - buildMessages()
{
  role: "user",
  content: [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: "data:image/png;base64,…" } },
    // … one block per attachment, in attachment order
  ],
}
await puter.ai.chat(messages, false, { model, stream: true });
```

`toImageBlock()` refuses anything that is not a `data:image/…` URI or an
http(s) URL: the backend hands `image_url.url` to the provider as-is, so a bare
base64 payload would be fetched as a URL and fail.

Prior conversation turns are included as `{ role, content }` text messages, so
the model keeps context. Images are sent only with the current turn (storing
data URLs in localStorage would exhaust its quota); history carries the
`[Images: N attached]` marker as text.

The **normalized file is also written to Puter Drive** (`persistAttachment()` in
`src/lib/images.ts`) and the message keeps an `attachments: AttachmentRef[]`
array of `{ path, name, mimeType, bytes }` refs — ~40 bytes each, so the
conversation record stays small while the images panel can show every
attachment again later. The write is fired in the background of a send and
resolves `false` instead of throwing: a Drive failure must never cost the user
their message. Messages sent before this existed carry only the marker, which
`countUnsavedAttachments()` (`src/lib/artifacts.ts`) reports rather than
pretending to resolve. A retry re-reads the refs from Drive and re-sends the
images (see `handleRetryMessage` in `src/pages/Index.tsx`).

Deleting the message, editing it, or deleting the conversation reclaims those
files again (`reclaimImagePaths()` + `deleteImage()`); the two silent drops —
the localStorage quota fallback and a tombstone arriving from another device —
deliberately do not, because the conversation may still be alive elsewhere.

### 4. AI SDK Interaction
- The messages array is passed through to the API as-is.
- Streaming chunks are parsed per the documented shape:
  `{ type: "text", text }` appends; `{ type: "error", message, code }` ends the
  stream and surfaces the error.
- Thrown `{ code: "network_error" }` / `{ code: "request_timeout" }` are mapped
  to user-friendly messages.

### 5. AI Model Analyzes Image
The model receives the text prompt plus the image blocks and responds with
streaming text, rendered with markdown formatting in `ChatMessage.tsx`.

## Supported Models for Image Analysis
Vision support is read from the live `puter.ai.listModels()` catalog
(`modalities.input` includes `"image"`), surfaced via `modelSupportsVision()` in
`src/lib/models.ts`. The keyword heuristic there is only an offline fallback.
The backend enforces the same gate: an image part sent to a catalog entry that
does not advertise image input is rejected with HTTP 400
("Model … does not support image input").

## Size Limits Worth Knowing
| Limit | Value | Where it comes from |
| --- | --- | --- |
| Attachments per message | 4 | composer (`MAX_ATTACHMENTS`) |
| Long edge after resizing | 1568 px | OpenAI vision guidance |
| Attachment size sent | ≤ 4 MB each | provider inline-image cap |
| Request body | 50 MB | backend `express.json({ limit: "50mb" })` |

## Error Handling
### Processing Errors
- Non-image files are filtered out with a toast.
- A file that cannot be decoded or that stays over the size cap aborts the send
  with a destructive toast naming the file.
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
- `src/lib/attachments.ts` — preparation + the attachment contract
- `src/lib/artifacts.ts` — the image index behind the artifacts panel
- `src/lib/images.ts` — Drive persistence + reads for generated and attached images
- `src/lib/utils/imageConversion.ts` — format conversion + downscaling
- `src/lib/streamingHandler.ts` — message building + streaming
- `src/lib/models.ts` — live catalog + vision gating
- `src/components/ChatInput.tsx` — selection, previews, OCR
- `docs/image-artifacts-panel-spec.md` — the images panel that references all of it
- https://docs.puter.com/AI/chat/
