# Image Artifacts Panel — Technical Spec

**Status:** approved for implementation · **Owner branch:** `arena/0a9d1982-chat-puter-vision`
**Scope chosen:** current conversation only · images only · locate + copy/download

## 1. Problem

Every image in a conversation lives only inline in the transcript. To find the
picture a model generated twelve turns ago — or the receipt you attached at the
start — you scroll and eyeball. There is no index of "the images in this chat".

Worse, one of the two image sources is not stored at all:

| Source | Created by | Persisted today | Field |
| --- | --- | --- | --- |
| Generated image | `handleGenerateImage` → `generateImage()` → `puter.ai.txt2img(prompt, { puter_output_path })` | ✅ | `Message.imagePath` (Drive path `freetalk-*.png`), `content: ""` |
| Legacy generated image | builds before Drive persistence | ✅ | `Message.image` (data URI or hosted URL) |
| **Attached image** | `handleSendMessage` / `handleEditMessage` → `prepareImageAttachments()` → data URL in an `image_url` block | ❌ | only the text marker `[Images: N attached]` in `content` |

The attachment gap is already visible to users: `handleRetryMessage` has to warn
*"Attachments are not kept in the conversation, so this retry sends the text
only"* (issues #32, #33). An images panel that cannot show attachments would be
half a feature in a vision-first app, so this spec closes that gap as part of
the work.

## 2. Goals

1. A right-hand panel listing **every image in the open conversation**, in
   transcript order, regardless of whether it was generated or attached.
2. **Locate**: clicking a tile scrolls the transcript to the source message and
   flashes it.
3. **Per-image actions**: open a preview, copy the image, download the image.
4. Filter by kind (All / Generated / Attached) and a live count in the header
   toggle.
5. Follow the repo's existing responsive, a11y and persistence conventions —
   including the static guards in `tests/responsive.test.ts`.

## 3. Non-goals (v1)

| Deferred | Why |
| --- | --- |
| Non-image artifacts (code blocks, tables, long answers, OCR text, transcriptions, exports) | Explicitly out of scope for this iteration. The collection layer is shaped so `kind` can grow without a rewrite (§5). |
| A library across **all** conversations | Requires indexing every conversation's messages on load and a Drive-side listing; out of scope. |
| Attaching an artifact into the next prompt | Different feature ("reference as context"), needs composer changes. |
| Images embedded in Markdown answers (`![](...)`) | Model-emitted URLs are usually expired or CORS-blocked, so copy/download cannot be promised. Phase 2 (§11). |
| Deleting Drive files when a message is deleted | `BackendFS` types only `write`/`read`; generated images already leak the same way. Phase 2. |
| Backfilling attachments from existing conversations | The bytes were never stored anywhere. The panel says so instead of silently omitting (§8.4). |

## 4. Data model

### 4.1 Persisted attachment refs

`src/lib/backend.ts` gains one interface and one optional field on `Message`:

```ts
/** A persisted image attachment, kept referenceable after the send. */
export interface AttachmentRef {
  /** Puter Drive path of the *normalized* file that was actually sent. */
  path: string;
  /** Original file name when the browser supplied one. */
  name?: string;
  mimeType?: string;
  /** Decoded size of the normalized file. */
  bytes?: number;
}

export interface Message {
  // …existing fields…
  /** Attachments persisted to Drive so the panel can show them later. */
  attachments?: AttachmentRef[];
}
```

Optional, so every existing persisted conversation and every test fixture
stays valid. `sync.ts::normalizeConversation` copies `messages` through
wholesale, so the new field rides the KV doc with no merge-logic change; a test
asserts that (§10).

### 4.2 Why Drive paths, not data URLs in the conversation

A normalized attachment targets ≈1.2 MB (`TARGET_IMAGE_BYTES`) and a message may
carry four (`MAX_ATTACHMENTS`). Storing those payloads in the conversation would
mean:

- `localStorage` (≈5 MB quota) filled by two image messages — `saveConversations`
  already has a quota-exceeded path that **drops conversations**, so this would
  destroy chat history;
- the single KV sync doc `aichat:conversations:v1` carrying every image of every
  conversation on every debounced push.

Drive paths are ~40 bytes, are the mechanism generated images already use, and
reuse the existing `loadImageUrl` object-URL cache. No new fetch path, no new
cache.

### 4.3 What gets written

The **normalized** file (`prepareImageAttachments` output: converted to a
provider-supported container, long edge ≤ 1568 px, ≈1.2 MB), not the original.
That is exactly what the model saw, so the panel is a faithful record of the
conversation, and it keeps Drive growth bounded. Original-fidelity retention is
a Phase 2 option.

## 5. Collection layer — `src/lib/artifacts.ts` (new, pure)

```ts
export type ImageArtifactKind = "generated" | "attached" | "legacy";

export interface ImageArtifact {
  /** Stable within a render: `${messageIndex}:${kind}:${n}`. */
  id: string;
  kind: ImageArtifactKind;
  /** Transcript position — the value `data-message-index` carries. */
  messageIndex: number;
  role: "user" | "assistant";
  /** Drive path for `generated`/`attached`; direct src for `legacy`. */
  path?: string;
  src?: string;
  /** Original file name, else "Generated image" / "Attached image". */
  label: string;
  model?: string;
}

export function collectImageArtifacts(messages: Message[]): ImageArtifact[];
/** Attachments recorded only as the legacy text marker — not recoverable. */
export function countUnsavedAttachments(messages: Message[]): number;
```

Rules, in order, per message:

1. `message.attachments[]` → one `attached` artifact each (a user message).
2. `message.imagePath` → one `generated` artifact (assistant, `content: ""`).
3. else `message.image` → one `legacy` artifact.
4. A message contributes at most one of (2)/(3): `imagePath` wins, matching
   `usePuterImage`, which only falls back to `image` when there is no path.

**Derived, never stored.** The list is recomputed with `useMemo` from the open
conversation's `messages` on every render. Messages are keyed by array index and
`handleDeleteMessage` splices, so any stored index would go stale after a
delete — deriving makes that class of bug impossible.

`countUnsavedAttachments` counts `[Images: N attached]` markers
(`hasImageMarker`) on messages with no `attachments` refs, summing the Ns, to
drive the honest footnote in §8.4.

## 6. Persistence layer — `src/lib/images.ts` (extended)

```ts
/** Drive path for an uploaded attachment, sibling of newImagePath(). */
export function newAttachmentPath(mimeType?: string): string; // freetalk-upload-<id>.<ext>

/** Best-effort write of one attachment. Resolves false; never throws. */
export function persistAttachment(blob: Blob, path: string): Promise<boolean>;

/** Resolves to the stored Blob (cached per path). */
export function loadImageBlob(path: string): Promise<Blob>;
```

- `newAttachmentPath` mirrors `newImagePath` (time36 + random, no `~/` prefix —
  writing to `~/` targets the user's home folder and is denied). Extension from
  the mime type, defaulting to `.png` because `convertImageToPNG` is the
  fallback container.
- `loadImageUrl` is refactored to build on `loadImageBlob` so path → blob stays
  **one** cache; copy and download need the blob, display needs the URL.
- `loadImageBlob` awaits any in-flight write for the path first (§6.1).
- `persistAttachment` returns a boolean instead of throwing: a Drive failure must
  never fail a send. It registers that promise in `pendingWrites` synchronously
  so `loadImageBlob` can await it rather than race it (§6.1).

### 6.1 Optimistic write, non-blocking send

`prepareImageAttachments` already returns the normalized `File`s. In
`handleSendMessage` / `handleEditMessage`:

```ts
const prepared = await prepareImageAttachments(images);
const imageUrls = prepared.map((a) => a.dataUrl);
const refs = prepared.map((a) => ({
  path: newAttachmentPath(a.mimeType),
  name: a.file.name || undefined,
  mimeType: a.mimeType,
  bytes: a.bytes,
}));
// Append the user message with `attachments: refs` immediately…
refs.forEach((ref, i) => { void persistAttachment(prepared[i].file, ref.path); });
// …then write in the background. The send never waits on Drive.
```

Paths are minted client-side, so the message can carry them before the write
lands.

**Reads wait out writes.** The panel is often open at the moment a message is
sent, so its tile would read a path whose upload has not landed yet. That read
404s, and because `usePuterImage` only re-runs when its `path` prop changes, the
tile would sit on "unavailable" *permanently* — the upload succeeding a second
later changes nothing. So `persistAttachment` registers its promise in a
`pendingWrites` map (synchronously, before its first await) and `loadImageBlob`
awaits any in-flight write for that path before reading. The entry is dropped
once settled, so later reads go straight to Drive.

**A failed write is reported, not guessed at.** When the awaited write resolves
`false`, `loadImageBlob` throws "The image could not be saved to storage"
instead of issuing a read that cannot succeed, and the send path toasts
*"Image not saved to your library — <name> was sent, but could not be stored"*.
The send itself still succeeded: this is a warning, not an error, and it is what
stops a silently missing image from looking like a panel bug.

## 7. Layout

### 7.1 Tokens and breakpoints

`src/index.css` gains a sibling of `--sidebar-w`:

```css
/* Single source of truth for the artifacts panel width. */
--artifacts-w: 300px;
```

`src/hooks/useMediaQuery.ts` gains the JS side, next to `DESKTOP_QUERY`, so CSS
and JS cannot drift (the convention the existing sidebar test enforces):

```ts
/** Width at which the artifacts panel docks instead of overlaying. */
export const ARTIFACTS_DOCK_QUERY = "(min-width: 1280px)";
```

**Why `xl` (1280px) and not the sidebar's `lg` (1024px):** with the left rail
docked at 260px, a 300px right panel at 1024px leaves a 464px transcript — too
narrow to read. Below 1280px the panel is an overlay with a scrim, exactly like
the sidebar is below `lg`.

### 7.2 Main column

`.app-main` already animates `transition-[margin]` for the sidebar; the panel
uses the same mechanism on the other side:

```css
.app-main-artifacts-open { @apply xl:mr-[var(--artifacts-w)]; }
```

### 7.3 Panel chrome — `src/components/ArtifactsPanel.tsx` + `.css` (new)

Mirrors `ConversationSidebar` structure and z-order (overlay `z-30`, panel
`z-40`, lightbox `z-50`):

```css
.artifacts-overlay { @apply fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] xl:hidden; }

.artifacts-panel {
  @apply fixed right-0 top-0 z-40 flex flex-col border-l border-border bg-background
         transition-transform duration-300 ease-in-out;
  width: min(var(--artifacts-w), 88vw);   /* never wider than the screen */
  height: 100vh;                          /* fallback first… */
  height: 100dvh;                         /* …dvh wins (guarded by tests) */
  padding-right: env(safe-area-inset-right, 0px);
}
.artifacts-panel-open   { @apply translate-x-0; }
.artifacts-panel-closed { @apply translate-x-full; }
```

Structure:

```
┌ header ────────────────────────────┐  "Images" + count pill + close (X)
├ filters ───────────────────────────┤  All · Generated · Attached  (segmented,
                                      │  only when both kinds are present)
├ ScrollArea grid ───────────────────┤  2 columns, aspect-square thumbs
│  ┌──────┐ ┌──────┐                 │  badge = kind, overlay actions:
│  │ img  │ │ img  │                 │  preview ⤢ · copy ⧉ · download ⭳
│  └──────┘ └──────┘                 │  whole tile = locate
├ footer note (conditional) ─────────┤  unsaved-legacy attachments
└────────────────────────────────────┘
```

- The filter row renders only when the chat holds both kinds — narrowing "All"
  down to the only kind present is noise, not a control.
- Tile click → `onLocate(messageIndex)`; the three buttons are siblings of the
  tile button, so they never nest inside it.
- Tile actions are visible by default and only hover-revealed behind
  `@media (hover: hover) and (pointer: fine)` — the exact pattern
  `.msg-codeblock-copy` uses, because a hover-only control is unreachable on
  touch and `tests/responsive.test.ts` fails the build on it. Buttons carry
  `tap-expand` for the 44px coarse-pointer target.
- Thumbnails use `loading="lazy"` and `usePuterImage` per tile, so the existing
  per-path object-URL cache is shared with the transcript (an image already
  rendered in the chat costs one `fs.read` total).
- `isGeneratingImage` appends one skeleton tile labelled "Generating…" so the
  panel feels live during `txt2img`.
- Empty state: image icon, "No images in this chat yet", one line explaining
  that generated and attached images collect here.

### 7.4 Header toggle

In `.app-header-group-end`, before the export menu:

```tsx
<Button variant="ghost" size="icon" className="app-icon-btn app-header-artifacts"
        onClick={() => setArtifactsOpen(v => !v)}
        title="Images in this conversation" aria-label="Images in this conversation"
        aria-expanded={artifactsOpen}>
  <Images className="app-header-icon" aria-hidden="true" />
  {artifactCount > 0 && <span className="app-header-artifacts-count">{artifactCount}</span>}
</Button>
```

Rendered whenever authenticated, at every width — the header sheds the *search*
button below 360px, but the export button is guarded as never-hidden, and this
toggle follows that rule (asserted in tests).

### 7.5 Open state

`artifactsOpen` in `Index.tsx`, persisted to `localStorage["artifacts_open"]`
exactly like `sidebar_open`, and **not** reset when crossing the dock
breakpoint: below 1280px it simply becomes an overlay, so the user's choice
survives a resize or a phone rotation. Unlike the find-in-chat bar, the panel is
not closed on conversation switch — its contents re-derive from the newly opened
conversation.

## 8. Interaction detail

### 8.1 Locate

```ts
const el = scrollRef.current?.querySelector<HTMLElement>(
  `[data-message-index="${index}"]`);
el?.scrollIntoView({ block: "center", behavior: "smooth" });
```

`scrollIntoView`, **not** `scrollTop`: issue #34 documents that the scroller is
Radix's viewport, not the element `scrollRef` is attached to — the find-in-chat
code already learned this. Below the dock breakpoint, locating also closes the
overlay so the transcript is actually visible.

### 8.2 Flash

```css
[data-artifact-flash] { animation: artifact-flash 1.4s ease-out; }
@media (prefers-reduced-motion: reduce) {
  [data-artifact-flash] { animation: none; outline: 2px solid hsl(var(--ring)); }
}
```

The attribute is set on locate and removed after 1.4s. Colors come from HSL
tokens (`index.css` requires it). Distinct from the search-match classes so
find-in-chat and locate can coexist.

### 8.3 Copy and download

- **Copy** → `navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])`
  for the bitmap; on rejection, fall back to copying the Drive path as text and
  say so in the toast. Never report success on a rejected clipboard write
  (issue #45 is exactly that bug).
- **Download** → new `downloadBlob(filename, blob)` in `src/lib/utils/export.ts`.
  `downloadFile` keeps its `string` signature untouched so existing callers and
  the Drive-export test baseline (#55) are unaffected. Filename is the original
  attachment name when known, else the Drive basename.
- Legacy artifacts (`Message.image` as a data URI) copy/download from the data
  URI directly; an `http(s)` legacy src downloads via an anchor `href`.

### 8.4 Honest footnote

When `countUnsavedAttachments(messages) > 0`, the panel footer shows:
*"N image(s) attached before this version aren't recoverable."* They were never
stored — inventing a placeholder tile would imply otherwise.

### 8.5 Preview lightbox

`src/components/ImageLightbox.tsx` (new) — `document`-level `keydown` listener
for Escape, focus trapped on mount, scrim click closes. `ChatMessage`'s inline
lightbox stays as-is in this PR (its Escape defect is issue #48); swapping it to
the shared component is a small follow-up that fixes #48 with one diff.

## 9. Accessibility

| Requirement | Implementation |
| --- | --- |
| Discoverability | `title` + `aria-label` on the toggle, `aria-expanded` reflecting state |
| Panel semantics | `<aside aria-label="Images in this conversation">`; the closed panel stays mounted so it can slide, and is marked `inert` — `aria-hidden` alone would leave its buttons focusable while invisible |
| Tiles | `<button>` with `aria-label="Generated image, message 4 — show in chat"` |
| Overlay dismissal | scrim click + Escape close the panel below the dock breakpoint |
| Reduced motion | flash falls back to a static outline (§8.2) |
| Touch targets | every icon button carries `tap-expand` (44px) |
| Live count | count pill is `aria-hidden` (the toggle's label carries the number) |

## 10. Tests

`tests/artifactsPanel.test.tsx` (new) renders the panel with
`react-dom/server` — the repo's other tests are static guards, so nothing else
would catch a hook misordering or a bad prop shape here, and a crash inside the
panel takes the whole shell down through the error boundary. It pins tile order
and accessible names, the filter row's counts, the unsaved-attachment footnote,
the empty and generating states, and that the scrim exists only while open.
No new dependency: `react-dom` is already present.

`tests/artifacts.test.ts` (new, bun, mocked SDK per `tests/helpers.ts`):

- `collectImageArtifacts` — generated (`imagePath` with empty content), legacy
  (`image`), `attachments[]` with several refs, transcript order, correct
  `messageIndex`, `imagePath` preferred over `image`, imageless messages
  skipped, unique ids, empty transcript → `[]`.
- `countUnsavedAttachments` — marker without refs counts N; with refs counts 0;
  no marker counts 0.
- `newAttachmentPath` — unique per call, `freetalk-upload-*.png` shape, never
  starts with `~/`, extension follows the mime type.
- `persistAttachment` — `true` on a successful `fs.write`; `false` when the SDK
  is absent; `false` (does **not** throw) when the write rejects.
- `mergeDocs` round-trip preserves `attachments` on a normalized conversation.

`tests/responsive.test.ts` (extended, house style — static guards):

- add `components/ArtifactsPanel.css` to the `stylesheets` list so the
  hover-only-control guard covers it;
- `--artifacts-w` token exists in `index.css` **and** the panel width is
  `min(var(--artifacts-w), …vw)`;
- `.artifacts-overlay` is `xl:hidden` while `.app-main-artifacts-open` uses
  `xl:mr-` — the docked layout and the overlay must share one breakpoint;
- `.artifacts-panel` has the `100vh` → `100dvh` fallback pair, in that order;
- `safe-area-inset-right` respected;
- `.artifacts-tile-actions` (or equivalent) carries `tap-expand` and the
  `@media (hover: hover) and (pointer: fine)` opacity guard;
- the header toggle is never `hidden` and exposes `aria-expanded`.

Manual matrix: docked at 1440px with the sidebar open; overlay at 1024px and at
390px; delete a message and confirm the panel re-derives without a stale tile;
send 4 attachments and confirm all four tiles appear without waiting on Drive;
sign out and confirm the toggle is gone.

## 11. Phasing

| Phase | Contents |
| --- | --- |
| **1 (this PR)** | `AttachmentRef` + optimistic Drive persistence, `lib/artifacts.ts`, `ArtifactsPanel`, `ImageLightbox`, header toggle, locate + flash, copy/download/preview, tests |
| 2 | Markdown-embedded images; Drive cleanup on message delete; swap `ChatMessage` to the shared lightbox (fixes #48); unblock image-only retries now that attachments are stored (#32, #33) |
| 3 | Non-image artifacts (code, tables, OCR text, exports) behind a `kind` union; cross-conversation library; "attach to next prompt" |

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| Drive storage grows with every attachment | Normalized ≤1.2 MB files, same folder as generated images which already behave this way; Phase 2 adds cleanup. Deleting a message, editing one, or deleting a conversation orphans its files — nothing reclaims them today, and `BackendFS` types only `write`/`read` |
| Uploads now land in the user's Drive | New behaviour: an attachment used to be ephemeral. It is the account's own storage, the same place generated images already go, and it is what makes attachments survive a reload and follow the user to another device — but it is a change worth announcing in release notes |
| A background write fails silently | It does not: reads wait the write out, a failed write throws a storage error rather than 404ing, and the send path toasts (§6.1) |
| A tile reads before the upload lands | `pendingWrites` makes the read wait instead of racing (§6.1) |
| Both panels open squeeze the transcript | Panel docks only ≥1280px; below that it is an overlay |
| KV/localStorage growth | Paths only (~40 bytes per attachment) |
| Index-keyed messages make stored pointers stale | Artifacts are derived per render, never stored (§5) |
| Existing conversations show no attachments | Footnote explains it (§8.4) instead of a misleading placeholder |
