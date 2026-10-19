# Image Edit Context — Technical Spec

**Status:** implemented and verified (2026-10-19) · **Owner branch:** `arena/89c0b6ce-chat-puter-vision`
**Scope chosen:** image-generation turns only · one base image per turn · edits chain from the conversation's current image
**Builds on:** [`image-artifacts-panel-spec.md`](image-artifacts-panel-spec.md) — attachments are already stored in Drive, so an edit base can be read back

## 1. Problem

Attaching an image and then asking for a change to it produces an unrelated
picture.

**Repro.** Attach the arrow image → toggle the ✨ button in the composer → type
*"remove the people from image"* → the app answers with a brand-new landscape
that has nothing to do with the attachment. The attached image is not in the
request at all.

The transcript shows the attachment in the images panel, the prompt in the
chat, and a picture below it — so every part of the UI says "that was an
edit", while the model was asked to draw a scene from a sentence.

### 1.1 Root cause — four independent gaps

**Gap 1 — the generate path never receives the attachments.**
`ChatInput.handleSubmit` in image-generation mode calls `onGenerateImage(message)`
with the text only. `pendingImages` is never read and never cleared, so the
previews stay on screen and look like they were sent. `Index.handleGenerateImage(prompt: string)`
takes a `string`, and `generateImage(prompt)` calls
`puter.ai.txt2img(prompt, { puter_output_path })` — text-to-image, by
definition. The attachment is dropped on the floor one layer before the
request is built.

**Gap 2 — the SDK can edit images; the app never asks it to.**
`puter.ai.txt2img` accepts `input_image` / `input_images` (a public URL, a data
URI, or raw base64) on every provider route
(https://docs.puter.com/AI/txt2img/, read 2026-10-19). That option is the
whole difference between *"draw a picture of X"* and *"change this picture"*.
The app never sets it, so the model has no pixels to anchor to: a prompt like
*"remove the people from image"* is meaningless to a text-to-image model — it
has no "image" — so it invents a scene, usually one containing people.

**Gap 3 — no image context survives a turn.**
Even with gaps 1 and 2 fixed, the *second* prompt would still start from
scratch. *"Now make it night"* has to edit the picture the previous turn
produced. The app keeps no notion of "the current image of a conversation":
the images live in three separate fields (`Message.imagePath`,
`Message.image`, `Message.attachments[]`) and nothing computes the newest one.
`handleGenerateImage` is stateless — it sees only the prompt.

**Gap 4 — the vision gate hides the feature.**
The attach button, the previews and the file input are all gated on
`modelSupportsImages(selectedModel)` — the **chat** model. In image-generation
mode the chat model is irrelevant, because the image is read by the *image*
model. On a text-only chat model the attach button disappears and the whole
feature is unreachable, with no explanation.

### 1.2 What already works (and must keep working)

| Behaviour | Where | Note |
| --- | --- | --- |
| A chat turn with an attachment shows the model the image | `buildMessages` → `image_url` block | Vision analysis is fine. This spec does not touch it. |
| The attachment is stored in Drive and shown in the images panel | `prepareAndStoreAttachments` | Gives the edit base something to read back. |
| A generated image is saved to Drive and shown in the transcript | `generateImage` → `puter_output_path` | Gives the *next* edit something to read back. |

## 2. Goals

1. An image-generation turn **with attachments** edits those attachments —
   the pixels the user attached are the pixels the model receives.
2. An image-generation turn **without attachments** edits the conversation's
   current image, so a follow-up prompt ("now make it night", "remove the
   people") continues the same picture instead of starting over.
3. The composer **says which image will be edited** before the user commits
   credits to the call.
4. The transcript **records the lineage** — which image each generated image
   was produced from.
5. Plain text-to-image is unchanged: no attachment and no conversation image
   sends exactly what it sends today.
6. Nothing breaks for a text-only chat model, a signed-out user, a failed
   Drive write, or a provider that refuses a multi-image request.

## 3. Non-goals (v1)

| Deferred | Why |
| --- | --- |
| An image-model picker (FLUX, GPT Image, Nano Banana, Grok Imagine…) | `txt2img` picks the default route; choosing one is a separate feature with its own catalog, pricing and capability table. |
| Masking / inpainting ("erase this region") | The provider routes that support masks are not reachable through the `input_image` option this app uses. |
| Comparing the before/after side by side | The lineage is recorded (§4.1), so a comparison view is a follow-up that needs no data-model change. |
| Editing an image that is only in the Drive, not in a chat | No conversation to chain from; out of the "image context" scope. |
| Reusing an image from **another** chat | The base is scoped to the open conversation (§5.4). A cross-chat picker is a follow-up (§14.4). |
| Re-generating a *chat* answer as an image | The chat path is for analysis; the ✨ button is the image path. The two stay separate. |
| Multi-image composition as a first-class feature | Multiple references are passed when the user attaches several, but no UI promises a specific composition result. |

## 4. Data model

### 4.1 `Message.editedFrom` (new, optional)

`src/lib/backend.ts` gains one interface and one optional field:

```ts
/** The provenance of an image in a conversation. */
export type ImageOrigin = "attachment" | "generated";

/** The image a generated image was produced from. */
export interface EditedFrom {
  /**
   * The image that was edited: a Drive path, or a self-contained data URI
   * that was sent as-is.
   */
  src: string;
  /** Whether that image was attached by the user or generated by the app. */
  origin: ImageOrigin;
}

export interface Message {
  // …existing fields…
  /**
   * Set when this message's image was produced by editing an earlier image.
   */
  editedFrom?: EditedFrom;
}
```

Optional, so every existing persisted conversation and every test fixture
stays valid. `sync.ts::normalizeConversation` copies `messages` through
wholesale, so the new field rides the KV doc with no merge-logic change.

**Why store the lineage when it can be re-derived?** The base of an edit is
*usually* the newest image in the transcript, but not always: a turn may
attach a new image while an older generated image is still the newest
*result*. Recording the base makes the chain explicit and inspectable, and
gives the follow-up features (comparison view, "edit this image" on a tile)
something to point at. It is ~60 bytes per edited message.

### 4.2 The edit base is **not** stored

The base of the *next* edit is derived, per render, from the transcript
(§5.1) — never written to storage. Storing a pointer to "the current image"
on the conversation would be a second source of truth that the delete, edit
and sync paths would each have to keep correct.

## 5. The edit base — resolution rules

### 5.1 Which image is "the current image"

`src/lib/imageContext.ts` (new, pure) answers exactly one question:

```ts
export interface CurrentImage {
  /**
   * The reference itself: a Drive path to read back, or a self-contained
   * data URI to send as-is.
   */
  ref: string;
  /** How `ref` has to be used. */
  kind: "drive" | "data";
  /** Whether it was attached by the user or generated by the app. */
  origin: ImageOrigin;
  /** Index of the message that holds it. */
  messageIndex: number;
}

/** The newest image the conversation holds, or null when it holds none. */
export function findCurrentImage(messages: Message[]): CurrentImage | null;
```

The rule, in order:

1. Scan the transcript **backwards**.
2. The first message with an `imagePath` is the current image — it is a
   generated result, and a result is what the user is looking at.
3. Otherwise a message with a legacy inline `image` qualifies **only when it
   is a data URI**: a data URI carries its own bytes, while a legacy hosted
   URL may be long gone, and the provider would fail to fetch it.
4. Otherwise the first message with an `attachments[]` entry is the current
   image; within that message the **first** attachment is the base (it is the
   primary subject; the rest are secondary references).
5. No images at all → `null`.

**Why "a result beats the attachments that fed it":** after an edit, the
picture on screen is the result, and the next prompt means *that* picture.
Falling back to the attachment would silently re-anchor the chain one step
back, so "make it night" would edit the original rather than the night-ified
version.

**Why scan backwards rather than keep a pointer:** a delete, an edit or a
conversation switch changes the transcript, and a derived answer cannot go
stale. The same rule the artifacts panel already follows (§"Derived, never
stored" in the phase-1 spec).

### 5.2 Which base a turn uses

| Turn | Base image sent to the model | `editedFrom` recorded |
| --- | --- | --- |
| Attachments on this turn | those attachments (all of them) | the first attachment's path, `origin: "attachment"` |
| No attachment, conversation has a current image | that image (read back from Drive) | its path, `origin: "generated" \| "attachment"` |
| No attachment, no conversation image | none — plain text-to-image | not set |

The turn's own attachments always win: an explicit attachment is a stronger
statement of intent than the implicit "keep editing the last one", and it is
what the user sees in the composer.

### 5.3 Reading the base back

The base is usually a Drive path, and `txt2img` needs a URL or a data URI.
It is read with `loadImageBlob(path)` (the cached read the images panel
already uses) and encoded with `blobToDataUrl` — the same
`data:<mime>;base64,…` form the chat path sends, which every provider route
accepts for `input_image`. A legacy data URI already carries its bytes, so
it is sent as it is.

If the read fails (the file was deleted from Drive, the write never landed),
**the turn is aborted with a toast**. Falling back to text-to-image would
reproduce exactly the bug this spec exists to fix, silently: the user would
pay for an image and receive an unrelated one. The toast says what to do:
attach the image again.

### 5.4 The base is scoped to the open conversation

The current image is looked up in the **open conversation** only. An image
in another chat is not a base: the images panel is per-conversation too (see
the phase-1 spec's scope), and a chat's images are a property of that chat.
Reusing an image across chats is a picker — "edit this image" on a panel
tile — and it is listed as a follow-up in §14.4.

## 6. The wire — `input_image` / `input_images`

`src/lib/images.ts` gains an options object and a pure option builder:

```ts
export interface GenerateImageOptions {
  /** Images the edit is anchored to, as data URIs. Empty = text-to-image. */
  inputImages?: string[];
  /** Image model id, e.g. "gpt-image-2". */
  model?: string;
  /** Provider quality tier ("low" | "medium" | "high"). */
  quality?: string;
}

/** The exact option object handed to puter.ai.txt2img. */
export function buildTxt2ImgOptions(
  outputPath: string,
  options?: GenerateImageOptions
): Record<string, unknown>;
```

The rules, in order:

1. `puter_output_path` is always set — the generated file is saved to Drive
   like every other image in the app.
2. **One** input → `input_image: <data URI>` (the documented single-image
   shorthand).
3. **More than one** input → `input_images: [<data URI>, …]`.
4. `input_image_mime_type` is added when every input shares one media type.
   A data URI carries its own type, so this is a fallback for providers that
   label the upload from the option rather than from the payload
   (Gemini rejects a typeless upload; the others use it to label).

**Provider caps on the number of references** (from the Puter docs, read
2026-10-19): OpenAI GPT Image and Gemini accept several; xAI up to 5;
Replicate up to 10; BytePlus up to 10 (14 for Seedream 5.0 Pro); **Cloudflare
FLUX.2 accepts exactly one** and returns `bad_request` for more. A turn with
several attachments can therefore be rejected outright.

**The fallback.** When a multi-image call comes back `bad_request`, the call
is retried **once** with only the first image. `bad_request` is raised before
any credit is checked, so the retry costs nothing, and a turn with four
attachments still edits *something* on a single-reference route instead of
failing. A failure of the retry surfaces the provider's message as usual.

`generateImage(prompt, options?)` keeps its old single-argument call working
— the second parameter is optional, so every existing caller and test is
unaffected.

## 7. Composer behaviour

`ChatInput` gets three changes.

### 7.1 The gate

```ts
// The chat model reads images in a chat turn; in image-generation mode the
// *image* model reads them, so the chat model's vision support is irrelevant.
const canAttachImages = imageGenerationMode || modelSupportsImages;
```

`canAttachImages` replaces `modelSupportsImages` for the previews, the attach
button and the hidden file input. The effect that drops attachments when the
selected model cannot read images also stops firing in generation mode —
otherwise switching to a text-only chat model would silently throw away the
image the user is about to edit.

### 7.2 The submit path

```ts
if (imageGenerationMode && onGenerateImage) {
  if (!message) return;
  // The attachments are the edit base, not a chat message: they go to the
  // image model, so the chat model's vision gate does not apply.
  const images = pendingImages.map((image) => image.file);
  setInput("");
  clearImages();
  void onGenerateImage(message, images.length > 0 ? images : undefined);
  return;
}
```

The previews are cleared for the first time — leaving them on screen after
the call was the other half of "the attachment was ignored" (the user could
not tell whether it had been sent).

A prompt is still required: `txt2img` rejects a blank prompt with
`prompt_required`, and a blank prompt with an attachment is not an edit
request, it is a missing instruction.

### 7.3 The hint

The composer says which image the call will edit, so the feature is not a
guess:

| State | Hint |
| --- | --- |
| Generation mode, attachments pending | *"N attached image(s) will be edited."* |
| Generation mode, no attachments, conversation has a current image | *"Editing the last image in this chat."* |
| Generation mode, no attachments, no conversation image | *"Describe an image to generate."* (the existing placeholder) |

`Index.tsx` computes the current image with `findCurrentImage` and passes a
label to the composer. The hint is `aria-live="polite"`, because it changes
when an attachment is added or removed — a screen-reader user should hear it
without hunting for it.

## 8. Transcript behaviour

`handleGenerateImage(prompt, images?)` becomes:

1. Auth check (unchanged).
2. Prepare and store the turn's attachments → `dataUrls` + `AttachmentRef[]`
   (the same `prepareAndStoreAttachments` the chat path uses, so the images
   panel shows them and the files are reclaimable).
3. Resolve the base (§5.2) and read it back (§5.3).
4. Append the **user** message: the prompt, plus `attachments[]` and the
   `[Images: N attached]` marker when there were attachments. The marker is
   the text record of what was sent; the refs are the durable record.
5. Call `generateImage(prompt, { inputImages })`.
6. Append the **assistant** message: `content: ""`, `imagePath: <saved path>`,
   and `editedFrom: { path, origin }` when the turn edited something.
7. On failure: toast, roll the transcript back to where it was, and reclaim
   the attachment files that were stored in step 2 — the same rule the chat
   path follows (`handleSendMessage`).

The generated image is the newest image in the transcript, so the *next*
image-generation turn chains from it automatically (§5.1). That is what makes
"give another prompt to generate the edited image" work.

### 8.1 What the user sees in the transcript

The generated image keeps its existing rendering. It gains a one-line caption
when it was an edit — *"Edited image"* — so a chain of edits is legible in
the transcript instead of being a stack of unrelated pictures.

## 9. Error handling

| Failure | Behaviour |
| --- | --- |
| Not signed in | Toast, nothing sent (unchanged). |
| An attachment cannot be decoded or is too large | Toast naming the file; the turn is aborted before the call (unchanged). |
| The base image cannot be read from Drive | Toast: the image could not be read, attach it again. **No** text-to-image fallback. |
| The provider rejects a multi-image call (`bad_request`) | Retried once with the first image only (§6). |
| The provider rejects the call for any other reason | The provider's message, mapped by `friendlyImageError` (unchanged). |
| A Drive write of an attachment fails | The call still happens; the existing "not saved to your library" toast fires (unchanged). |
| The generation fails after the user message was appended | The transcript rolls back and the stored attachments are reclaimed (§8, step 7). |

## 10. Accessibility

| Requirement | Implementation |
| --- | --- |
| The edit base is announced | The hint is `aria-live="polite"`; it names what will be edited. |
| The attach button stays reachable | It is no longer hidden in generation mode (§7.1). |
| The hint is not colour-only | It is text, next to the previews. |
| Touch targets | Unchanged — the attach button keeps `tap-expand`. |
| Reduced motion | Unchanged — no new animation. |

## 11. Tests

`tests/imageContext.test.ts` (new, bun, mocked SDK per `tests/helpers.ts`):

- `findCurrentImage` — a generated result is the current image; a result
  beats the attachments that fed it; the newest message wins; a message with
  several attachments uses the first; a transcript with no images returns
  `null`; a message with an empty `attachments[]` is skipped; the message
  index is reported; a legacy inline image qualifies when it is a data URI
  and does **not** qualify when it is a hosted URL.
- `buildTxt2ImgOptions` — no inputs → only `puter_output_path`; one input →
  `input_image`; several inputs → `input_images`; a shared media type adds
  `input_image_mime_type`; mixed media types do not; `model` and `quality`
  are passed through when set.
- `generateImage` — passes `input_image` to `puter.ai.txt2img`; saves under
  `puter_output_path`; a multi-image `bad_request` is retried once with the
  first image; a retry that also fails surfaces the provider's message; a
  call with no inputs sends no `input_image` at all.

`tests/imageContext.test.ts` also pins the composer contract statically (the
house style of `tests/responsive.test.ts`): the generation-mode submit path
passes the pending attachments to `onGenerateImage`, the attach button is not
gated on the chat model's vision support in generation mode, the page
resolves the base and passes the reference on, and the composer names the
image the call will act on.

Two more tests close the loop the bug was in:

- **the whole chain**, end to end: the transcript's current image → the bytes
  of that image → the reference the provider receives. This is the
  "follow-up prompt edits the previous picture" promise, in one test.
- **the lineage survives a sync** — `editedFrom` rides the KV doc like
  `attachments` does.

## 12. Phasing

| Phase | Contents |
| --- | --- |
| **1 (this PR)** | `input_image` on the generate path · the edit base resolved from the turn's attachments or the conversation's current image · lineage (`editedFrom`) · the composer's gate and hint · the transcript caption · tests |
| 2 | An image-model picker with per-model reference limits; "edit this image" on an artifacts-panel tile; before/after comparison |
| 3 | Masking/inpainting, once a route that accepts a mask is reachable |

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| A provider rejects a multi-reference call | Retried once with the first reference (§6) |
| The base image is huge | It is the *normalized* file the app stored (long edge ≤ 1568 px, ≈1.2 MB), not the original |
| The base image is missing from Drive | The turn is aborted with a clear toast, never silently downgraded to text-to-image (§5.3) |
| The chain drifts to the wrong image | The rule is one sentence and is pinned by tests (§5.1) |
| Credits are spent on an unrelated image | The composer names the base before the call (§7.3) |
| A text-to-image user sees no change | With no attachment and no conversation image, the request is byte-for-byte what it was (§6) |
| The lineage grows the conversation record | ~60 bytes per edited message; the base image is a path, not a payload |

## 14. Implementation — done

**Status: implemented and verified on `arena/89c0b6ce-chat-puter-vision`
(2026-10-19).** Every goal in §2 is met, and every rule in §5 and §6 is
pinned by a test.

### 14.1 What changed

| File | Change |
| --- | --- |
| `src/lib/backend.ts` | `ImageOrigin`, `EditedFrom`, `Message.editedFrom` (§4.1) |
| `src/lib/imageContext.ts` | **new** — `findCurrentImage`, the base-selection rule (§5.1) |
| `src/lib/dataUrl.ts` | `isDataUrl` — a self-contained payload, as opposed to a hosted URL that may expire |
| `src/lib/images.ts` | `GenerateImageOptions`, `buildTxt2ImgOptions`, `generateImage(prompt, options?)`, `loadImageDataUrl` (§5.3, §6) |
| `src/pages/Index.tsx` | `handleGenerateImage(prompt, images?)` — attachments, base resolution, lineage, rollback (§8); the composer's edit-base hint |
| `src/components/ChatInput.tsx` | `canAttachImages` gate, the generation-mode submit path, the edit-base hint (§7) |
| `src/components/ChatInput.css` | `.composer-edit-hint` |
| `src/components/ChatMessage.tsx` | the "Edited image" caption (§8.1) |
| `tests/imageContext.test.ts` | **new** — the rules in §11 |
| `tests/responsive.test.ts` | the two static guards that pinned the old behaviour (the call that dropped the attachments, and the number of send paths that keep the refs) |
| `IMAGE_UPLOAD_FLOW.md`, `README.md` | the new path documented alongside the old ones |

### 14.2 Goals, one by one

| §2 goal | Done |
| --- | --- |
| 1 — attachments are the base of the turn | `handleGenerateImage` prepares and stores them, then sends their data URIs as `input_image` / `input_images` (§6) |
| 2 — a follow-up prompt edits the previous picture | `findCurrentImage` resolves the base and `loadImageDataUrl` reads it back (§5.1, §5.3) |
| 3 — the composer says which image will be edited | the `aria-live` hint (§7.3) |
| 4 — the transcript records the lineage | `Message.editedFrom` + the "Edited image" caption (§4.1, §8.1) |
| 5 — text-to-image is unchanged | `buildTxt2ImgOptions` sends no reference when there is none (§6) |
| 6 — nothing breaks at the edges | the error table in §9; the multi-reference retry (§6) |

### 14.3 Verification

| Check | Result |
| --- | --- |
| `bun test` | 322 pass, 0 fail (28 new in `tests/imageContext.test.ts`) |
| `tsc --noEmit -p tsconfig.app.json` | clean |
| `npm run build` | builds |
| `eslint src tests` | no new findings (one pre-existing error in `components/ui/textarea.tsx`) |

**Still to be checked by hand, on a signed-in account** (the sandbox has no
Puter session, and the provider calls cost credits):

1. Attach an image → ✨ → *"remove the people from image"* → the result
   keeps the picture's composition.
2. The same turn without a new attachment → *"now make it night"* → the
   result edits the previous one.
3. A text-only chat model: the attach button is still there in image mode.
4. A base that was deleted from Drive: the turn is refused with a toast, and
   no credit is spent.

### 14.4 Follow-ups this leaves open

- The images panel does not yet distinguish an edited result from a first
  generation (the `kind` union is frozen by the phase-1 spec); the lineage is
  recorded and ready for it.
- Reusing an image from **another** chat is not supported: the base is the
  open conversation's current image (§5.4). An "edit this image" action on a
  panel tile — with a conversation picker — is the natural way to add it, and
  the lineage (`editedFrom`) is already in place for it.
- `handleRetryMessage` re-sends a *chat* turn, so the retry button on a
  generated image still re-sends its prompt as text. Re-running an *edit* is
  a natural follow-up now that the base is explicit.
- No image-model picker, so the reference count is whatever the default route
  accepts (and the single-reference retry in §6 covers the rest).
