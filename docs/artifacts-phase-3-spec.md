# Artifacts, Phase 3 — Technical Spec

**Status:** draft for review · **Branch:** `arena/d627f263-chat-puter-vision`
**Builds on:** [`image-artifacts-panel-spec.md`](image-artifacts-panel-spec.md) (Phase 1, shipped in #63; Phase 2 items in #64–#66)
**Scope chosen:** code + tables + OCR text (OCR for new messages only) · exports deferred · library as a "This chat / All chats" switch in the existing panel · using a text artifact inserts editable text into the composer

## 1. Problem

Phase 1 answered "where is that image?". In an AI chat, though, people scroll back most for code blocks and tables. Today:

- A code block can only be copied from inside the transcript, and that copy reports success even when the clipboard refuses (#45). Code can't be downloaded.
- A table can't be copied or exported, short of copying the whole answer.
- OCR output is appended to the draft and merges into the message. Once sent, nothing records which text came from which image.
- Everything is per chat. Finding "that regex from last week" means opening chats one by one.
- Reuse means copy and paste. An image can't be attached again without downloading and re-uploading it.

### 1.1 Where Phase 2 left things

| Item | State |
| --- | --- |
| Shared lightbox in `ChatMessage` (#48) | Landed in #64; #66 fixed the lightbox appearing at startup. The issue is still open: verify, then close it. |
| Retries re-send stored attachments (#32, #33) | Landed in #64/#65. #33 is still open: a retry re-sends the images, but also puts the `[Images: N attached]` marker into the prompt text. |
| Markdown-embedded images | Not started. Stays in Phase 2 and outside this spec (§4). |
| Quota-fallback issue | Filed as #13 (P1). |
| The `kind` union | Attempted in #64, reverted in #65. §2 explains why and sets rules that prevent a repeat. |

## 2. Lessons from the first attempt (#64 → #65)

| What #64 did | What broke | Rule in this spec |
| --- | --- | --- |
| Replaced `generated \| attached \| legacy` with a single `image` kind | The Generated/Attached filter, the tile badges and `filenameFor` lost the data they read | **Image kinds are frozen.** `ImageArtifact` and `ImageArtifactKind` keep their exact Phase 1 shape. The union grows around them (§5.1). |
| Deleted the `imagePath`/`image` branches and left a `TODO` | Generated images vanished from the panel | **Golden test:** `collectArtifacts(m).filter(isImageArtifact)` deep-equals `collectImageArtifacts(m)`, and every Phase 1 test passes unedited (§12). |
| Used an `ArtifactData` object whose fields were all optional | Nothing narrowed, so impossible states could be written (an artifact with both `code` and `image`) | **Use a real discriminated union:** one interface per kind, and `switch (a.kind)` with an `assertNever` default. `strict` is off in `tsconfig.app.json`, so `Record<ArtifactKind, …>` tables enforce completeness; TypeScript checks those even with `strict` off. |
| Renamed `collectImageArtifacts` → `collectArtifacts`, migrated only some callers, and declared `KIND_LABEL`/`basenameOf` twice | The Vercel build failed | **Additive only.** No export in `lib/` is renamed, removed or changes its signature. For example, a `toEqual({ generated, attached, legacy })` test pins `countByKind`, so Phase 3 adds `countArtifactKinds` next to it instead of widening it. A component prop may accept a wider type, because `artifacts: ImageArtifact[]` → `Artifact[]` keeps every caller valid, and new props are optional. No prop is renamed or narrowed. |
| Declared `code \| table \| ocr \| export` with no collector for them | The type promised kinds that could never appear | **A kind ships in the same PR as its collector, its row and its tests.** |
| Mixed a refactor and a feature in one diff | The breakage was hard to separate from what the PR meant to do | **Move, then change.** Extracting the panel code from `Index.tsx` (§9.1) is its own commit and changes no behavior. |

Every PR runs `npm run build`, `npx tsc --noEmit -p tsconfig.app.json` and `bun test`, and all three must pass. They all pass at `c8ac46e` (`tsc` reports no errors, and 251 tests pass), so any failure was introduced by the PR. No script or CI job runs `tsc` yet, so 3a should add a `"typecheck"` script to `package.json`.

## 3. Goals

1. Code blocks and tables from assistant answers, and OCR text from new messages, appear in the panel alongside images. Each one can be located, previewed, copied and downloaded.
2. Locate goes to the block itself, not just to its message.
3. Every artifact has a "Use in next message" action. An image becomes a composer attachment; text is inserted into the composer as editable text.
4. A "This chat / All chats" switch turns the panel into a library of every conversation on the device, grouped by chat and searchable.
5. Derived artifacts add zero bytes to localStorage and KV. OCR provenance adds about 40 bytes per extraction.
6. The Phase 1 image index does not regress, and `Index.tsx` gets shorter.

## 4. Non-goals and anti-goals

| Deferred | Why |
| --- | --- |
| Exports as a kind | Nothing is stored that could be listed. Markdown export downloads locally and leaves no trace, and nothing calls `saveConversationToDrive` (`lib/drive.ts`). #46 (exports omit generated images) and #55 should land first. A candidate for Phase 4. |
| Markdown-embedded images | Still in Phase 2, because hosted URLs expire or are blocked by CORS. The parse added here makes it cheap later: the tree already contains `image` nodes. |
| OCR backfill | In existing messages, nothing separates OCR text from typed text. No footnote either: unlike attachments, no marker claims that anything is missing. |
| Voice transcriptions | Would use the same recording mechanism as OCR (§5.3). Out of scope. |
| Code pasted into prompts | User bubbles render plain text, not Markdown, so the transcript shows no code block. Collecting one would break the rule that the panel and the transcript never disagree. |
| Code inside `<think>` reasoning | Scratch work, rendered collapsed. Only the answer counts. |
| Listing Drive files, sweeping orphaned files | The library is built from the conversations on the device. |
| Context chips | Decided against: text is inserted into the composer instead (§8.3). |
| A virtualization dependency | The list renders in batches and images load only near the viewport instead (§7.2, §7.3). |

**Anti-goals.** Phase 3 has failed, even if it works, if it does any of these:

- stores a derived artifact anywhere (no artifact text, list or index in `Message`, localStorage or KV);
- lets two messages point at the same Drive file;
- makes a send wait on anything new;
- changes what `ImageArtifact.kind` means;
- adds a runtime dependency (promoting a package that is already locked is fine; see §5.2);
- makes `Index.tsx` longer.

## 5. Data model and collection

### 5.1 The union — `src/lib/artifacts.ts` (additive)

```ts
// Phase 1, unchanged: ImageArtifactKind, ImageArtifact, KIND_LABEL, basenameOf,
// collectImageArtifacts, countByKind, countUnsavedAttachments, reclaimImagePaths.

export type TextArtifactKind = "code" | "table" | "ocr";
export type ArtifactKind = ImageArtifactKind | TextArtifactKind;

interface TextArtifactBase {
  /** `${messageIndex}:${kind}:${n}`, the Phase 1 id scheme. */
  id: string;
  messageIndex: number;
  role: "user" | "assistant";
  /** "Python · 24 lines", "Table · 5 × 3", "Text from receipt.jpg". */
  label: string;
  /** What copy, download and "use" start from. */
  text: string;
  model?: string;
}
export interface CodeArtifact extends TextArtifactBase {
  kind: "code";
  language?: string;   // mdast `lang`: the fence info string's first word
  lines: number;
  at: number;          // offset of the block in the rendered answer (§6.5)
}
export interface TableArtifact extends TextArtifactBase {
  kind: "table";
  header: string[];
  rows: string[][];    // cell text; `text` holds the Markdown source slice
  at: number;
}
export interface OcrArtifact extends TextArtifactBase {
  kind: "ocr";
  source?: number;     // index into the message's `attachments`
}

export type TextArtifact = CodeArtifact | TableArtifact | OcrArtifact;
export type Artifact = ImageArtifact | TextArtifact;

export function isImageArtifact(a: Artifact): a is ImageArtifact;
export function collectArtifacts(messages: Message[]): Artifact[];
export function countArtifactKinds(artifacts: Artifact[]): Record<ArtifactKind, number>;
```

The discriminant stays `kind`, and the union is flat: `"generated" | "attached" | "legacy" | "code" | "table" | "ocr"`. That is what the Phase 1 spec promised ("`kind` can grow without a rewrite"), and every existing `a.kind === "generated"` check stays correct. TypeScript can narrow on a member whose discriminant is itself a union of literals: `a.kind === "code"` gives `CodeArtifact`, and `a.kind === "attached"` gives `ImageArtifact`.

One catch, which I checked with `tsc` using the repo's settings (`strict` and `strictNullChecks` off): ruling out one image kind doesn't remove the member. After `if (a.kind === "attached") return;`, `a` can still be an `ImageArtifact`, so an `assertNever` default rejects it. Exhaustive code should either test `isImageArtifact(a)` first and then switch over the three text kinds, or list all three image kinds in one `case` group. With that pattern, `assertNever` catches a missing kind, and a `Record<ArtifactKind, …>` missing a key fails to compile.

Each message produces its artifacts in this order: attachments, OCR extractions, the generated or legacy image (Phase 1 precedence), then code and tables in document order. Messages stay in transcript order. As in Phase 1, everything is derived on each render and never stored, and indices are stamped at collect time.

### 5.2 Code and tables: parse what the transcript renders

- **Input.** Assistant messages only, using `splitThinkBlocks(message.content).answer`. That is exactly the string `ChatMessage` passes to `<ReactMarkdown>`. Import the function; never re-implement it.
- **Parser.** `unified().use(remarkParse).use(remarkGfm).parse(answer)`, the same micromark + GFM pipeline that react-markdown runs. Tested against the locked versions:
  - backtick and tilde fences (#50) both produce `code` nodes with `lang`, `meta` and `value`;
  - indented code produces a `code` node with `lang: null`; inline code is ignored;
  - a pipe table inside a fence stays code, and an unclosed fence (from a stopped reply) runs to the end of the answer, exactly as it renders;
  - `table` nodes carry `position` offsets that slice back to the exact Markdown, and `mdast-util-to-string` gives clean cell text.
- **Walk.** A ten-line recursive walk over `children` collects `code` and `table` nodes in document order. No `unist-util-visit`.
- **Dependencies.** Promote `unified@11.0.5`, `remark-parse@11.0.0` and `mdast-util-to-string@4.0.0` to direct dependencies, and `@types/mdast@4.0.4` to a dev dependency, at the versions `package-lock.json` already resolves. `npm ci` downloads nothing new, and the bundle doesn't grow because react-markdown already ships these packages. The set of package versions in the lockfile (what #57 audits) stays the same. Importing them without declaring them is not acceptable: an undeclared dependency breaks on the next lockfile refresh.
- **Cost** (measured on Node 22 after warm-up): about 2 ms for a 1.5K-character answer with two code blocks and two tables, and about 27 ms for 15K characters. Cost tracks length, not the number of blocks: 2.7K characters of plain prose still take about 3 ms. So:
  1. **Prefilter** with `` /```|~~~|^(?: {4}|\t)|\|/m ``. An answer that cannot contain a block skips the parser (about 4 µs). It produced no false negatives across fenced, tilde, indented, list-nested, tab-indented and outer-pipe-less table cases.
  2. **Cache** the parse results, without indices, in a `WeakMap<Message, ParsedBlocks>`. Updates replace message objects rather than mutating them, so object identity is a safe key. A sync that replaces one conversation's objects re-parses only that conversation.
- **Defensive (#24).** A message whose `content` is not a string, or whose parse throws, contributes no text artifacts. The collector never throws. It runs during render, so a throw would trip the app-level `ErrorBoundary` and replace the whole app with its error screen.

**Labels:**

- **Code:** the language's display name plus " · N lines". `py` shows as "Python", `ts` as "TypeScript", an unknown tag is capitalized, and no tag shows "Code".
- **Table:** "Table · R × C" (body rows × columns).
- **OCR:** "Text from <attachment name>", otherwise "Extracted text".

### 5.3 OCR provenance (new messages only)

```ts
/** Where OCR text sits in a user message. Offsets only: the text is already
 *  in `content`, and storing it twice would spend the sync budget (§10). */
export interface ExtractionRef {
  start: number;     // [start, end) UTF-16 offsets into `content`
  end: number;
  source?: number;   // index into `attachments`, when that image was sent
}
export interface Message { /* …Phase 1 fields… */ extractions?: ExtractionRef[] }
```

```ts
/** What the composer reports about the OCR text it inserted. Never stored. */
export interface ExtractedSnippet { text: string; file?: File }
export interface SendExtras { extracted?: ExtractedSnippet[] }

/** Pure: where each snippet sits in `text`. Unfound snippets are dropped. */
export function findExtractions(
  text: string, snippets: ExtractedSnippet[], sentFiles: File[],
): ExtractionRef[];
```

- **Recording.** `ChatInput.extractFromImage` already appends OCR output to the end of the draft. Now it also records `{ text: text.trim(), file }` for each extraction that returned any text, and clears that list along with the draft.
  - The snippet is stored trimmed because submitting trims the message. An untrimmed snippet that ended the draft with a newline would otherwise never match.
  - The composer computes no offsets. It doesn't know the final text: `handleEditMessage` strips the image marker and trims again.
- **Plumbing.** `onSend(message, model, images, extras?: SendExtras)` gains an optional fourth argument. The inline editor passes it on as `onEdit(text, images, model, extras)`, and `Index` forwards it to `handleEditMessage(index, content, images, model, extras)`.
- **Matching.** `Index` runs `findExtractions` against the text it is about to store: `content` in `handleSendMessage`, `clean` in `handleEditMessage`.
  - Each snippet claims its first verbatim occurrence that doesn't overlap a range already claimed, so duplicate snippets map to separate ranges. Results are sorted by `start`.
  - `source` is `sentFiles.indexOf(file)` when it isn't -1. `prepareImageAttachments` keeps that order and throws rather than skipping a file, so the index matches `attachments`. A text-only model sends no files, so its snippets get no `source`.
  - If the user edited a snippet, it won't be found and is dropped: the edited text now belongs to the user.
  - The user message gets `extractions` only when the list is non-empty. `appendImageMarker` adds the marker after the text, so the offsets stay valid in the stored content.
- **Edits.** `handleEditMessage` slices the old message's extracted texts from its content (`old.content.slice(start, end)` for each valid range). It passes them first, without files, followed by the editor's new snippets. The old ones end up without a `source`, which is correct because an edit doesn't carry the old attachments over.
- **Reading.** The collector accepts only integer ranges with `0 ≤ start < end ≤ content.length`, and ignores a `source` outside `attachments`. Anything else is skipped, never thrown (#24).
- **Sync and history.** `extractions` is synced along with `messages`, exactly like `attachments`. A test asserts that it survives `mergeDocs` in both directions. History, retry, export and find-in-chat already see the text, because it lives in `content`.

## 6. The panel: "This chat"

### 6.1 Naming

- **Strings and icon:**
  - The title becomes **Artifacts**.
  - The panel's landmark label and the header toggle (accessible name and `title`) both become "Artifacts in this conversation". The count stays in the accessible name.
  - The `Images` icon becomes `Layers`.
- **Tests:** these assertions pin the old strings. The PR updates them to the new strings instead of deleting them:
  - `tests/artifactsPanel.test.tsx`: "No images in this chat yet" (two assertions), and `aria-label="Images in this conversation"`;
  - `tests/responsive.test.ts` ("the images panel is reachable at every width…"): "Images in this conversation", and its `title=`.
- **Counts:** the toggle's badge shows the open chat's total. The panel's own count shows the total for the current scope.

### 6.2 Layout

```
┌ Artifacts  12                            ✕ ┐
├ [ This chat | All chats ]                  ┤  scope switch (§7.1)
├ All 12 · Generated 2 · Attached 3 · Code 5 ›  chips: one line, scrolls sideways
├────────────────────────────────────────────┤
│ IMAGES                                     │  headings only when ≥2 groups exist
│ ┌──────┐ ┌──────┐                          │  Phase 1 grid, unchanged
│ └──────┘ └──────┘                          │
│ CODE                                       │
│ ┌────────────────────────────────────────┐ │  whole row = locate the block
│ │ </> Python · 24 lines        message 4 │ │
│ │ def fetch_rates(base="INR"):           │ │  3-line monospace preview, faded
│ │     resp = requests.get(URL, …)        │ │
│ │                        ⤢  ⧉  ⭳  ↵      │ │  preview · copy · download · use
│ └────────────────────────────────────────┘ │
│ TABLES                                     │
│ │ ▦ Table · 5 × 3              message 6 │ │  header cells as the preview
│ TEXT FROM IMAGES                           │
│ │ ⌗ Text from receipt.jpg      message 1 │ │
├────────────────────────────────────────────┤
│ footnote: unsaved legacy attachments       │  unchanged
└────────────────────────────────────────────┘
```

- **Groups.** Images (generated, attached and legacy, in the Phase 1 grid), Code, Tables, and Text from images. "All" shows them in that order, each in transcript order. Headings appear only when two or more groups have items, so an image-only chat looks exactly like the Phase 1 grid.
- **Chips.** The chips follow the flat `kind` union, with legacy folded into Attached as in Phase 1: All · Generated · Attached · Code · Tables · OCR.
  - A chip appears only when its kind is present.
  - The row appears only when at least two chips besides All would show. That is the Phase 1 rule, so the Phase 1 filter tests pass as written.
  - The row stays on one line and scrolls sideways (`overflow-x-auto`); it never wraps.
- **Text rows.** Full width. The row itself is a `<button>` that locates; the action buttons sit beside it, never inside it. Actions are visible by default and appear on hover only behind `@media (hover: hover) and (pointer: fine)`. Each carries `tap-expand`. This is the Phase 1 tile rule, and the same guard enforces it.
- **Preview.** The first three non-empty lines in monospace, with `white-space: pre`, clipped with a fade. No syntax highlighting, so no highlighter dependency.
- **Empty state.** "Nothing collected in this chat yet", with the line "Images, code blocks, tables and text you extract from images collect here."
- **Pending tile.** The tile shown while `txt2img` runs stays in the Images group. The group appears for it even before any image exists.

### 6.3 Actions

| Kind | Click | Preview | Copy | Download |
| --- | --- | --- | --- | --- |
| Image | locate the message | `ImageLightbox` | Phase 1 (the bitmap, otherwise its path or URL as text) | Phase 1 |
| Code | locate the block | `TextPreviewDialog` | `text` | `snippet-<msg>-<n>.<ext>` |
| Table | locate the block | `TextPreviewDialog` (rendered table) | `text/html` table plus `text/plain` Markdown in one `ClipboardItem`; falls back to Markdown through `writeText` | `table-<msg>-<n>.csv` |
| OCR | locate the message | `TextPreviewDialog` | `text` | `extracted-text-<msg>.txt` |

Every kind also gets "Use in next message" (§8) in PR 3b.

In file names, `<msg>` is the 1-based message number shown on the row (`messageIndex + 1`, as in Phase 1). `<n>` counts blocks of that kind within the message, starting at 1.

- **Copy is honest (#45).** Wait for the result. If it is `false` or rejected, show the destructive "Copy failed" toast and never a check mark. Phase 3 never reuses the copy in `ChatMessage`'s `CodeBlock`, which ignores the result. Fixing that one call can be included in the same PR.
- **File extensions** come from a small language map (`python` → `py`, `typescript` → `ts`, `bash`/`sh`/`shell` → `sh`, …). Anything unknown gets `txt`.
- **CSV follows RFC 4180.**
  - Quote any field that contains `"`, `,`, CR or LF, and double the quotes inside it.
  - End lines with CRLF and start the file with a UTF-8 BOM, so Excel keeps "₹" intact.
  - Model output is untrusted, so prefix with `'` any cell that starts with `=`, `+`, `-`, `@`, tab or CR. This blocks formula injection (OWASP's CSV-injection guidance). The only exception is a cell that is entirely a plain number, such as `-12.5` or `+3`. Exempting every `-` followed by a digit would let `-2+3+cmd|…` through.
- **Clipboard HTML** is built from escaped cell text. Nothing new renders model output as HTML.

### 6.4 `TextPreviewDialog` (new)

It follows the same rules as `ImageLightbox`:

- Escape is bound on `document`, the lesson from #48.
- Focus moves to the close button on mount and back to the trigger on unmount.
- Clicking the scrim closes it.
- It is `role="dialog" aria-modal="true"`, labelled with the artifact's label.

The body is a `<pre>` with horizontal scroll for code and OCR text, or a plain `<table>` for tables. The header holds Copy, Download and Close. It has its own stylesheet, sits at the lightbox's stacking level (`z-50`) and uses the `100vh` → `100dvh` fallback pair. `ImageLightbox` is not modified.

### 6.5 Block-level locate

- **Stamping.** In `ChatMessage`, the answer's `pre` and `table` renderers read `node?.position?.start.offset` and stamp it as `data-artifact-at` on their outer element. For code that is `CodeBlock`'s `.msg-codeblock` wrapper, passed in as a new `at` prop. For tables it is `.md-table-wrap`. react-markdown v10 passes custom components the hast node with its mdast position. Tested against the locked versions, these offsets match what the collector computes for the same `answer` string, indented code included.
- **Answer only.** The thinking section renders a different string through the same components, so its offsets would collide. Keep `markdownComponents` for thinking, and give the answer `{ ...markdownComponents, pre, table }` with the stamping versions. The thinking render already sits outside `.msg-answer`.
- **Lookup.** `onLocate(messageIndex, opts?: { at?: number; conversationId?: string })` takes an optional second argument; existing callers keep working. With `at`, it queries `[data-message-index="i"] .msg-answer [data-artifact-at="at"]`. If the block is found, it scrolls to it and flashes it with the existing `data-artifact-flash`, including the reduced-motion fallback. Otherwise it falls back to the Phase 1 message flash. OCR text and images locate their message, as before.

## 7. The library: "All chats"

### 7.1 Scope switch and search

- **Switch.** A segmented control with two buttons, "This chat" and "All chats", sits under the header (`role="group"`, buttons with `aria-pressed`). The choice persists in `localStorage["artifacts_scope"]` and defaults to "This chat".
- **Counts and search.** In "All chats", the count is the library total and the chips filter across every chat. A search field appears.
  - It matches labels, text and chat titles, using a case-insensitive `includes` on precomputed lower-case strings.
  - It paints no highlight ranges, so it can't hit #40's crash.
- **Grouping.** Results are grouped by chat under a sticky header (title and count), and the open chat's group is marked "Current chat".
- **Order.** Groups follow the sidebar's order: Pinned, Today, Previous 7 Days, Previous 30 Days, Older.
  - Move the sidebar's `groups` memo into a pure `groupConversations(conversations, now = Date.now())` so both share one implementation. Passing `now` in makes the day boundaries testable.
  - No existing guard reads that code; the sidebar guards check "Sign out", "search-conversations" and `DESKTOP_QUERY`.
- **Inside a group.** The same image grid and text rows, without section headings. The footnote about unsaved attachments shows the total across the library.

### 7.2 Indexing every chat

- **Source.** The `conversations` state: every chat on this device (localStorage plus whatever KV sync merged in). Not Drive.
- **Collector.** Two pure functions in `lib/artifacts.ts`:
  - `collectLibraryGroup(conversation): LibraryGroup`, where `LibraryGroup = { conversationId, title, artifacts }`. It runs `collectArtifacts` on one chat and prefixes ids with `${conversationId}/`.
  - `collectLibrary(conversations): LibraryGroup[]`, which applies it in `groupConversations` order and drops empty groups. Tests use this all-at-once version.
  - The hook builds the same result one conversation at a time, caching groups in a `WeakMap<Conversation, LibraryGroup>`. Conversation objects are replaced when they change, so a rebuild re-collects only the chats that changed. A test checks that the incremental build matches `collectLibrary`.
- **Build in batches.** The prefilter and cache make rebuilds cheap, but the first build parses every answer on the device that contains a block.
  - **Why:** how much there is to parse depends on storage. A synced account's chats must fit in one 400 KB KV value (§10), which parses in well under a second. A local-only account can hold about 5 MB in localStorage, which at 1–2 ms per 1K characters is several seconds.
  - **How:** the open chat is indexed immediately. The rest is indexed in idle slices of about 8 ms (`requestIdleCallback`, with a `setTimeout` fallback), most recent first.
  - **Progress:** results appear as they're ready. An "Indexing older chats…" row (`role="status"`) shows until the build finishes.
  - **When:** indexing runs only while the panel is open on "All chats", and stops when it closes.
- **Render in batches.** Show 60 items, then 60 more each time a sentinel scrolls into view (IntersectionObserver).

### 7.3 Image reads at library scale

Phase 1's `usePuterImage` reads on mount, and its caches never evict. That works for one chat. Across hundreds of images of about 1.2 MB each, it would fire hundreds of Drive reads at once and keep hundreds of megabytes of Blobs in memory.

- **Read near the viewport.** Library tiles start reading only when they come near the viewport, through a new `useInView` hook (IntersectionObserver with `rootMargin: 200px`). `useInView` latches: it turns true the first time the tile comes near the viewport and never turns false again. A fast scroll therefore doesn't cancel a read that has started, and a loaded tile keeps its image after it scrolls away. The tile calls `usePuterImage(seen ? path : undefined, src)`, and `usePuterImage` already does nothing without a path. `loading="lazy"` does not help, because the Drive read happens before the `<img>` exists.
- **Limit concurrent reads.** `loadImageBlob` allows at most 4 reads in flight and queues the rest. It still waits for any in-flight upload (`pendingWrites`) first. The promise is cached as soon as a read is queued, so callers asking for the same path still share one read.
- **Bound the cache.** Today `imageBlobCache` and `imageUrlCache` (`lib/images.ts`) both hold promises and never evict, and nothing calls `URL.revokeObjectURL`. They now share one LRU of 64 paths. Both must be bounded: an object URL keeps its Blob in memory, so evicting only the blob would free nothing.
  - Each object URL tracks how many mounted tiles use it (`retainImageUrl` / `releaseImageUrl`). It is revoked only once it has been evicted and no tile uses it.
  - That keeps Phase 1's promise that a mounted tile keeps showing the image it loaded.
  - `deleteImage` keeps evicting its path.
  - Phase 1's cache tests in `tests/artifacts.test.ts` must pass unedited. These include "reads a path once and caches it", the failed-read retry and the write-then-read race.

### 7.4 Locating in another chat

- **Switch first.** `onLocate(i, { conversationId, at })` first switches chats if needed (`setCurrentConversationId`). The request is held in a ref and runs from an effect once that chat's transcript has rendered, then behaves as in §6.5. Below the dock breakpoint, the overlay closes first (as in Phase 1).
- **Disabled while busy.** It is disabled while a reply streams or an image generates, with the tooltip "Available when the reply finishes". Switching chats mid-stream shows the live reply in the wrong chat (#28), and the panel's pending tile would show in the wrong chat too. The library must not become a new route to that. Locating within the same chat stays enabled.
- **Panel state.** The panel stays open and keeps its scope through the switch (Phase 1 §7.5).

### 7.5 Existing issues the library is exposed to

- **#7** (switching accounts keeps the previous account's cached chats). The library shows exactly what the sidebar shows. That account's images render as "Unavailable", because Drive is per account. This exposes nothing new, but makes the bug more visible. Recommendation: land #7 before 3c; it is not a blocker.
- **#13 and the KV cap (§10).** The library can only be as complete as the conversations on the device.

## 8. Use in next message

### 8.1 Composer handle

- **The handle.** `ChatInput` becomes a `forwardRef` component and exposes:
  ```ts
  export interface ComposerHandle {
    /** Insert at the caret with blank-line padding, then focus the textarea.
     *  False, and no change, while the composer is disabled. */
    insertText(text: string): boolean;
    /** Resolves to how many images were accepted (0 while disabled). */
    addImages(files: File[]): Promise<number>;
  }
  ```
- **One validation path.** The body of `handleImageSelect` becomes `addFiles(files)`, called by both the file input and `addImages`. It handles image types, conversion, `MAX_ATTACHMENTS` and the toasts. A static guard checks that both paths call it.
- **Caret logic.** A pure `insertAtCaret(value, selStart, selEnd, text)` returns `{ value, caret }` and is unit-tested on its own.
- **Which composer.** `Index` holds a ref to the bottom composer only; the inline editor never receives artifacts. `key={currentConversationId}` stays, so "use" always targets the open chat. In the library, using another chat's artifact puts it in the open chat's composer without switching chats; that is the cross-chat reuse this phase is for. Switching chats discards the draft, just as it does for typed text today.
- **Disabled while busy.** The composer locks its textarea and attach button while a reply streams or an image generates (`disabled={isStreaming}`, plus `isGeneratingImage`). "Use" follows that lock: the button is disabled with the tooltip "Available when the reply finishes", and the handle refuses as well. Text written into a locked composer would sit where the user can't edit it.
- **Small screens.** Below the dock breakpoint, "use" closes the overlay so the composer is visible.

### 8.2 Images

- **Bytes.** Reuse the panel's `resolveBlob`, which tries the Drive path, then a `data:` src, then `fetch`, and returns `null` on failure. It moves with the tile into `ArtifactTile.tsx` and is exported there along with `filenameFor`. Wrap the result as `new File([blob], filenameFor(a), { type: blob.type || "image/png" })`. If the result is `null` (for example, an http(s) src blocked by CORS), toast "This image can't be reused — download it and attach the file".
- **When it refuses.**
  - If the selected model can't read images, `addImages` refuses with "Switch to a vision model to attach images".
  - It also refuses once `MAX_ATTACHMENTS` is reached.
  - In image-generation mode, it leaves that mode and shows a toast, because `txt2img` takes no images.
  - The button is disabled while the tile can't be loaded.
- **One file, one owner.**
  - On send, the image goes through `prepareAndStoreAttachments` like any picked file: a new path is created and the file is uploaded again. The new message owns its copy, and deleting the source message or chat reclaims only the source's file.
  - If the new message pointed at the source's path, Phase 1's reclaim (Phase 1 §6.2) would delete a file another message still shows, on this device or on one that hasn't synced yet.
  - The re-upload loses no quality: `downscaleImage` returns an already-normalized file untouched.
- **Optional.** A server-side `puter.fs.copy` instead of the re-upload would save mobile bandwidth. It would be feature-detected like `fs.delete`, still get a new path, and register in `pendingWrites` so reads wait for it. Not required.

### 8.3 Code, tables and OCR text

- **Formatting.** `formatArtifactForPrompt(a)` is a pure function.
  - **Code:** a fenced block tagged with its language. The fence is one backtick longer than the longest run of backticks inside, so code that contains ``` can't break out of it.
  - **Table:** its Markdown source.
  - **OCR text:** the plain text.
- **Insertion.** The result goes in at the caret with blank lines around it. No "from chat X" header is added: the model sees exactly what the user sees, and the user can add context.
- **Size.** When `estimateTokens(text) > 2000`, the confirmation toast gives the size ("about N tokens"). Nothing is truncated.

## 9. Code organization

### 9.1 Move, then change

`Index.tsx` is about 1,420 lines, against a 500-line house limit. Before any Phase 3 behavior lands, the first commit of 3a makes two moves that change no behavior.

**The panel wiring** moves into `src/hooks/useArtifactsPanel.ts`, called as `useArtifactsPanel({ scrollRef, conversation: currentConversation })`. Today that wiring sits in two places in `Index.tsx`:

- `artifactsDocked`, and `artifactsOpen` with its `localStorage["artifacts_open"]` persistence;
- `imageArtifacts`, `unsavedAttachments`, `flashTimer` and `locateMessage`.

The hook returns those same names, so the JSX stays as it is.

**The image tile** moves from `ArtifactsPanel.tsx` into `ArtifactTile.tsx`, unchanged, together with `resolveBlob` and `filenameFor`. Its CSS stays in `ArtifactsPanel.css`.

Three guards read the moved code and are repointed in the same commit, with every assertion kept:

| Guard | Reads today | After the move |
| --- | --- | --- |
| "the artifacts panel docks and overlays at one breakpoint" (`responsive.test.ts`) | `useMediaQuery(ARTIFACTS_DOCK_QUERY)` in `Index.tsx` | the hook |
| "locating an image scrolls the Radix viewport and flashes the message" (`responsive.test.ts`) | `/const locateMessage[\s\S]*?^\s{2}\);/m` in `Index.tsx` | the hook. The same regex matches if the hook body keeps two-space indentation. |
| "the panel never claims an image it cannot resolve" (`responsive.test.ts`) | "Unavailable" in `ArtifactsPanel.tsx` | `ArtifactTile.tsx` ("unsavedAttachments" stays in the panel) |

The header toggle, the send, edit and delete handlers, and the reclaim guards stay in `Index.tsx`. Keep those handler bodies at their current indentation: the reclaim guards find where a handler ends by the first `^\s{2}\};` after it.

### 9.2 Files

| File | Change |
| --- | --- |
| `lib/artifacts.ts` | union, `isImageArtifact`, `collectArtifacts`, `countArtifactKinds`, `collectLibrary`, `findExtractions` |
| `lib/artifactBlocks.ts` (new) | prefilter, parser, cache, code and table extraction, labels |
| `lib/artifactFormats.ts` (new) | CSV, clipboard HTML, file names, `formatArtifactForPrompt` |
| `lib/backend.ts` | `ExtractionRef`, `Message.extractions` |
| `lib/images.ts` | read concurrency, LRU, URL ref-counting (3c) |
| `lib/conversationGroups.ts` (new) | `groupConversations()`, moved out of the sidebar (3c) |
| `hooks/useArtifactsPanel.ts` (new) | §9.1 first; then scope, locate targets and the library build |
| `hooks/useInView.ts` (new) | IntersectionObserver gate (3c) |
| `components/ArtifactsPanel.tsx` | chrome, chips, scope, sections, and the new props below |
| `components/ArtifactTile.tsx` (new) | the Phase 1 tile with `resolveBlob` and `filenameFor`, moved unchanged (§9.1) |
| `components/ArtifactRow.tsx` + `.css` (new) | text rows |
| `components/TextPreviewDialog.tsx` + `.css` (new) | §6.4 |
| `components/ChatMessage.tsx` | answer-only `pre`/`table` overrides; `CodeBlock` gains `at`; `onEdit` passes `extras` on |
| `components/ChatInput.tsx` | `forwardRef`, `ComposerHandle`, `addFiles`, recorded OCR snippets, `extras` on `onSend` |
| `pages/Index.tsx` | gets shorter (§9.1); `findExtractions` in send and edit; composer ref; `onUse`; library props |

```ts
// ArtifactsPanel props after Phase 3. Phase 1 callers stay valid.
interface ArtifactsPanelProps {
  artifacts: Artifact[];                       // was ImageArtifact[]
  unsavedAttachments: number;
  isGeneratingImage?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onLocate: (messageIndex: number, opts?: LocateOptions) => void;
  onUse?: (artifact: Artifact) => void;        // 3b; the button is hidden when absent
  scope?: "chat" | "all";                      // 3c; the switch is hidden when absent
  onScopeChange?: (scope: "chat" | "all") => void;
  library?: { groups: LibraryGroup[]; indexing: boolean };
  /** True while a reply streams or an image generates (§7.4, §8.1). */
  busy?: boolean;
}
export interface LocateOptions { at?: number; conversationId?: string }
```

New files stay under 500 lines. `ChatInput.tsx` (608 lines) should grow by little more than the handle.

## 10. Storage budget

- **Today.** Every conversation syncs through one KV key, `aichat:conversations:v1`. Puter caps a value at 400 KB of JSON-encoded UTF-8, and because the app stores a JSON string, its escaping counts too. Past the cap, `kv.set` rejects and `syncConversations` swallows the error (#22). Sync stops for that account without anyone being told.
- **Out of scope.** This problem predates Phase 3. File it as its own issue.
- **Phase 3's share.** Phase 3 must not push the doc closer to the cap. Derived artifacts add nothing. A ref such as `{"start":1234,"end":1290,"source":0}` is 36 characters, or 42 bytes once the stored JSON string escapes its quotes. On top of that, each message with any extractions pays about 18 bytes for the key. A guard pins it: `Message` gains exactly one field, and `ExtractionRef` holds only numbers.

## 11. Accessibility

| Requirement | Implementation |
| --- | --- |
| Scope switch | `role="group" aria-label="Artifact scope"`, buttons with `aria-pressed` |
| Text rows | The Phase 1 tile's pattern, `${label}, message N. Show in chat.`, with the visible " · " read as a comma: "Python, 24 lines, message 4. Show in chat." In the library: "…, message 4, in Trip planner. Open in chat." |
| Sections | `<h3>` headings; counts are `aria-hidden` where the accessible name already carries them |
| Preview | `TextPreviewDialog` follows the same rules as `ImageLightbox` (§6.4) |
| Progress | "Indexing older chats…" is `role="status"` |
| Disabled while busy (locate in another chat, "use") | `aria-disabled`, plus a title that says why |
| Search | labelled field; Escape clears it |
| Touch | every new icon button carries `tap-expand`; chips stay buttons, reachable by keyboard while scrolled |
| Motion | block flashes reuse the reduced-motion outline |

## 12. Tests

Phase 1 tests pass unedited, with two exceptions: the strings renamed in §6.1, and the three guards repointed in §9.1.

**`tests/artifacts.test.ts`** (extended)

- **Golden:** for every Phase 1 fixture, `collectArtifacts(f).filter(isImageArtifact)` deep-equals `collectImageArtifacts(f)`.
- **Code:**
  - backtick and tilde fences (#50);
  - language, label and line count;
  - indented code and an unclosed fence;
  - inline code, `<think>` blocks and user messages are excluded;
  - ids are unique, and `messageIndex` is still correct after a message is removed.
- **Tables:**
  - header, rows and size;
  - a table inside a fence counts as code;
  - `text` equals the source slice;
  - inline code is unwrapped in cells.
- **OCR:**
  - valid ranges become artifacts labelled from `attachments[source].name`;
  - reversed, out-of-range and non-integer ranges are skipped;
  - a bad `source` is ignored.
- **Defensive (#24):** non-string content, null messages and a throwing parser produce no artifacts and no throw.
- **Cache:** each message object is parsed once across collects, and the prefilter skips answers with no blocks.
- **`findExtractions`:**
  - verbatim matches are found, an edited snippet is dropped, and an empty snippet is skipped;
  - duplicate snippets claim separate ranges, and the results are sorted by `start`;
  - a snippet that ended the draft with a newline still matches the trimmed message;
  - `source` follows the order of the sent files, and a snippet whose file wasn't sent gets no `source`;
  - on an edit, old snippets (without files) and new ones never claim the same range.
- **Sync:** `extractions` survive `mergeDocs`, both when local is newer and when remote is newer.
- **Formats:**
  - CSV quoting, CRLF, the BOM and formula neutralization;
  - escaping in the clipboard HTML;
  - the longer fence in `formatArtifactForPrompt`.
- **Library:**
  - group order matches `groupConversations`;
  - ids are prefixed;
  - empty chats are left out, and the current chat is flagged.
- **Static checks:**
  - "Use" never creates an attachment ref of its own. The existing guard that counts exactly two `attachments: attachmentRefs` in `Index.tsx` keeps passing. New: `useArtifactsPanel.ts`, `ArtifactsPanel.tsx`, `ArtifactTile.tsx` and `ArtifactRow.tsx` never import `newAttachmentPath` or `persistAttachment`.
  - `Message` gains only `extractions`.
  - `handleSendMessage` and `handleEditMessage` both call `findExtractions(`.

**`tests/artifactsPanel.test.tsx`** (extended)

- The Phase 1 fixture renders no section headings.
- A mixed fixture renders Images → Code → Tables → Text from images, with chips only for the kinds present.
- The code row's accessible name, the table's header preview, the OCR label and the empty-state text.
- Library: groups by chat, marks "Current chat" and shows the indexing status row.

**`tests/chatMessage.test.tsx`** (extended)

- The answer's `pre` and `table` carry `data-artifact-at` equal to the collector's `at` for the same message.
- Blocks in the thinking section carry none.

**`tests/responsive.test.ts`** (extended)

- `components/ArtifactRow.css` joins the per-file list in "interactive controls stay visible without a hover-capable pointer".
- The row's action class (for example `.artifact-row-action`) joins two class lists: the affordances that must exist, and "icon buttons expand their touch target on coarse pointers".
- The chip row scrolls sideways instead of wrapping.
- The preview dialog uses the `vh` → `dvh` fallback pair.
- `busy` is derived from `isStreaming || isGeneratingImage`. Locating in another chat and "use" are both blocked while it is true.
- Both the file input and `addImages` call `addFiles(`.

**Image cache** (in `tests/artifacts.test.ts`, next to the Phase 1 cache tests)

- At most four reads run at once, and two requests for the same queued path share one read.
- The LRU evicts the blob and the URL entries together.
- A URL is revoked only once it has been evicted and no tile uses it.
- Every Phase 1 cache test passes unedited.

**Manual checks**

- Docked at 1440 px with the sidebar open, then as an overlay at 1024 px and 390 px, in both themes.
- In a mixed chat, locating code flashes the block, not the whole message.
- With clipboard permission denied, copy shows "Copy failed".
- The CSV opens in Sheets and Excel with "₹" intact.
- "Use" on code puts a fence at the caret.
- "Use" on an image, then deleting the source message: the new message's image still loads.
- OCR, then editing the text before sending: no artifact. Leaving it unedited: an artifact named after the image.
- "All chats" with 100+ images: at most four reads in flight, reads only near the viewport, and steady memory while scrolling.
- While a reply streams, locating in another chat and "use" are both disabled, with a tooltip saying why.
- In "All chats", using another chat's code fills the open chat's composer and doesn't switch chats.

## 13. Delivery

| PR | Contents | Notes |
| --- | --- | --- |
| **3a** | Commit 1 is the §9.1 moves (hook and tile), with the three guards repointed. Then: the `typecheck` script (§2), the union with `code` and `table`, the promoted dependencies, `artifactBlocks`, chips, sections, rows, `TextPreviewDialog`, block-level locate, copy and download, and the rename to "Artifacts" | No data-model change. The riskiest refactor lands on its own, with every check passing. |
| **3b** | `ComposerHandle`, `addFiles`, "Use in next message" for every kind, `formatArtifactForPrompt`; OCR provenance, the `ocr` kind and its row | Both halves are composer work. OCR is the only data-model change. |
| **3c** | Scope switch, `groupConversations`, `collectLibrary` with idle indexing, search, locating in another chat, `useInView`, read concurrency, the bounded cache | Better to land #7 first. |

Each PR updates `README.md` (Features and the test list) and the status line of this spec.

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| A repeat of #64 | §2 rules, the golden test, additive-only exports, move then change |
| The collector and the renderer disagree on offsets | One `splitThinkBlocks` and one parser; a test pins that they agree; the message flash is the fallback |
| Parse cost on long chats | Prefilter, per-message cache, idle slices |
| The library keeps hundreds of MB of Blobs in memory | Reads only near the viewport, at most 4 at once, an LRU, and revoking URLs once no tile uses them |
| A shared Drive file breaks reclaim | One file, one owner; re-upload on send |
| #7 becomes more visible | Land #7 before 3c |
| The KV cap stops sync without telling anyone | Phase 3 doesn't make it worse; file an issue |
| Chips overflow at 320 px | One line that scrolls sideways |
| A CSV runs formulas in Excel | Neutralize risky leading characters |
| No `text/html` clipboard support | Fall back to Markdown through `writeText` |
| Switching chats mid-stream (#28) | Locating in another chat is disabled while busy |

## 15. Decisions

**Made with you in this session**

- **Kinds:** code, tables and OCR text, with OCR for new messages only. Exports are deferred.
- **Library:** a scope switch in the existing panel.
- **Use for text artifacts:** inserts editable text into the composer.

**My calls (please check)**

1. A flat `kind` union, with the image kinds frozen (§5.1).
2. The title "Artifacts" and the `Layers` icon (§6.1).
3. "All" is split into sections (Images, Code, Tables, Text from images), with headings only when two or more groups exist (§6.2).
4. Code and tables come from assistant answers only; pasted code and `<think>` blocks are excluded (§4).
5. "Use" re-uploads images, with `fs.copy` as an optional optimization (§8.2).
6. Inserted text gets no header saying where it came from (§8.3).
7. Three PRs, with OCR in 3b next to the other composer work (§13).
8. Locating in another chat, and "use", are disabled while a reply streams or an image generates (§7.4, §8.1). "Use" follows the composer's existing lock.

**Left to the builder:** how many languages the extension map covers, the exact chip label for OCR, the number of preview lines, the LRU size, and the idle-slice budget.
