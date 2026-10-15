import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static guards for the responsive layer.
 *
 * These failures are all invisible in review and only show up on a real phone:
 * a control that can only be reached by hover, a `100vh` shell that overflows
 * behind browser chrome, a header row that collides below ~400px. Each one
 * regressed silently at least once, so they are asserted here instead.
 */

const SRC = join(import.meta.dir, "..", "src");

const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const stylesheets = [
  "index.css",
  "pages/Index.css",
  "components/ChatInput.css",
  "components/ChatMessage.css",
  "components/ConversationSidebar.css",
  "components/ModelSelector.css",
  "components/CreditPill.css",
  "components/ErrorBoundary.css",
  "components/ArtifactsPanel.css",
  "components/ImageLightbox.css",
];

const allCss = stylesheets.map(read).join("\n");

// ---- hover-only affordances ----

test("no control is revealed only on hover", () => {
  // The failure mode is `opacity-0 group-hover:opacity-100` with no
  // non-hover fallback: the control is unreachable on touch entirely.
  const hoverOnly = /opacity-0\s+[^;{}]*group-hover:[^;{}]*opacity-100/;
  for (const sheet of stylesheets) {
    // Strip block comments first: the rules below are documented with the very
    // pattern they forbid, and prose must not trip the guard.
    const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of css.split("}")) {
      // Report the whole chunk: truncating it can hide the offending utility
      // from the matcher and silently turn this guard into a no-op.
      expect(`${sheet}: ${rule.trim()}`).not.toMatch(hoverOnly);
    }
  }
});

test("interactive controls stay visible without a hover-capable pointer", () => {
  // Per file, not across the concatenation: a correct guard in one sheet must
  // not vouch for a control that lost its guard in another.
  for (const file of [
    "components/ConversationSidebar.css",
    "components/ChatInput.css",
    "components/ChatMessage.css",
    "components/ArtifactsPanel.css",
  ]) {
    expect(read(file)).toContain("@media (hover: hover) and (pointer: fine)");
    // The reveal must be re-hidden *inside* that guard, not merely present.
    const guard = /@media \(hover: hover\) and \(pointer: fine\)\s*\{([\s\S]*)\}/.exec(
      read(file),
    )?.[1];
    expect(`${file} guard body: ${guard?.slice(0, 160)}`).toMatch(/opacity:\s*0/);
  }
  // And the removal / OCR / code-copy affordances must exist at all.
  for (const cls of [
    ".conv-row-menu-btn",
    ".composer-preview-remove",
    ".composer-preview-ocr",
    ".msg-codeblock-copy",
    ".artifacts-tile-action",
    ".artifacts-close-btn",
  ]) {
    expect(allCss).toContain(cls);
  }
});

test("icon buttons expand their touch target on coarse pointers", () => {
  // Assert the rule is actually *defined*, not merely referenced by the
  // `@apply tap-expand` lines — otherwise renaming the definition slips past.
  expect(allCss).toMatch(/\.tap-expand\s*\{[^}]*position:\s*relative/);
  expect(allCss).toMatch(
    /@media \(pointer: coarse\)\s*\{\s*\.tap-expand::after\s*\{[^}]*max\(100%,\s*var\(--tap-size/
  );
  // Below the 44px iOS HIG minimum without the expansion.
  for (const cls of [
    ".msg-action-btn",
    ".composer-tool-btn",
    ".app-icon-btn",
    ".artifacts-tile-action",
    ".artifacts-close-btn",
  ]) {
    expect(allCss).toMatch(new RegExp(`${cls.replace(".", "\\.")}\\s*\\{[^}]*tap-expand`));
  }
});

// ---- viewport height ----

test("full-height regions use dvh rather than bare vh", () => {
  // `h-screen` is 100vh: the viewport with browser chrome hidden. Using it for
  // a shell that fills the screen overflows once that chrome is visible.
  expect(allCss).not.toMatch(/@apply[^\n;]*\bh-screen\b/);
  // Checked per rule, not across the concatenated sheet: a `100vh; 100vh` pair
  // in one rule must not be masked by a correct pair in another file.
  for (const [file, rule] of [
    ["pages/Index.css", ".app-root"],
    ["components/ConversationSidebar.css", ".sidebar"],
    ["components/ArtifactsPanel.css", ".artifacts-panel"],
  ] as const) {
    const block = new RegExp(
      `${rule.replace(".", "\\.")}\\s*\\{([^}]*)\\}`,
    ).exec(read(file))?.[1];
    expect(`${file} ${rule}: ${block}`).toBeTruthy();
    // vh is the preceding fallback; dvh must be the one that wins. Comparing
    // positions rather than anchoring to the end of the block, since other
    // declarations may legitimately follow the height pair.
    const vhAt = block!.indexOf("height: 100vh;");
    const dvhAt = block!.indexOf("height: 100dvh;");
    expect(vhAt).toBeGreaterThanOrEqual(0);
    expect(dvhAt).toBeGreaterThan(vhAt);
  }
});

// ---- safe areas ----

test("notch and home-bar insets are respected", () => {
  for (const inset of ["safe-area-inset-top", "safe-area-inset-bottom"]) {
    expect(allCss).toContain(inset);
  }
  // The composer is the bottom-most region, so it must clear the home bar.
  expect(allCss).toMatch(/\.app-composer-wrap[^}]*safe-area-inset-bottom/);
  // The artifacts panel is flush with the right edge: in landscape on a notched
  // phone that edge is inside the notch.
  expect(read("components/ArtifactsPanel.css")).toMatch(
    /\.artifacts-panel\s*\{[^}]*safe-area-inset-right/
  );
});

// ---- header ----

test("header uses a truncating grid instead of an absolutely centred title", () => {
  const css = read("pages/Index.css");
  expect(css).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
  // An absolutely positioned title overlapped the icon groups on narrow screens.
  expect(css).not.toMatch(/\.app-header-title\s*\{[^}]*absolute/);
  // The icon groups must not be squeezed out of existence.
  expect(css).toMatch(/\.app-header-group\s*\{[^}]*min-w-0/);
  // Title button and editable input must hug the text (justify-self-center) and
  // cap at a fixed max width with ellipsis, rather than stretching across the
  // entire 1fr track.
  const titleRule = /\.app-header-title\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  expect(titleRule).toContain("justify-self-center");
  expect(titleRule).toContain("truncate");
  expect(titleRule).toMatch(/max-w-/);
  const inputRule = /\.app-header-title-input\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  expect(inputRule).toContain("justify-self-center");
  expect(inputRule).toContain("truncate");
  expect(inputRule).toMatch(/max-w-/);
  expect(inputRule).toContain("field-sizing: content");
});

test("the header sheds secondary actions before it can overflow", () => {
  const css = read("pages/Index.css");
  // Search still yields below 360px...
  expect(css).toContain(".app-header-search-btn");
  // ...but export can no longer hide behind the account menu, which moved out
  // of the header entirely — it must survive every width on its own.
  const exportRule = /\.app-header-export\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  expect(exportRule).toContain("inline-flex");
  expect(exportRule).not.toContain("hidden");
  expect(read("pages/Index.tsx")).toContain("Export as Markdown");
});

test("the account menu lives in the sidebar, not the header", () => {
  const page = read("pages/Index.tsx");
  // Sign-out is reachable only from the rail's footer now.
  expect(page).not.toContain("Sign out");
  expect(page).toContain("onSignOut={handleSignOut}");
  const sidebar = read("components/ConversationSidebar.tsx");
  expect(sidebar).toContain("Sign out");
  expect(read("components/ConversationSidebar.css")).toContain(".sidebar-footer");
});

test("export offers Markdown only", () => {
  for (const file of ["pages/Index.tsx", "components/ChatMessage.tsx"]) {
    const src = read(file);
    expect(src).toContain("Export as Markdown");
    expect(src).not.toContain("Export as JSON");
    expect(src).not.toContain("Save to Drive");
  }
});

test("search targets the open conversation instead of the sidebar", () => {
  const page = read("pages/Index.tsx");
  // The header button opens an in-conversation finder...
  expect(page).toContain("Search in this conversation");
  // ...and must not be the thing that reveals the rail. (The rail keeps its
  // own conversation search.)
  expect(page).not.toContain("search-conversations");
  expect(read("components/ConversationSidebar.tsx")).toContain("search-conversations");
});

test("credit pill collapses to its icon on narrow headers", () => {
  expect(read("components/CreditPill.css")).toMatch(
    /@media \(max-width: 639px\)[\s\S]*\.credit-pill-value\s*\{\s*display:\s*none/
  );
  // ...but the value stays available to assistive tech.
  expect(read("components/CreditPill.tsx")).toContain("aria-label");
});

// ---- iOS input zoom ----

test("composer text is at least 16px on phones to prevent iOS zoom", () => {
  const css = read("components/ChatInput.css");
  const block = /\.composer-textarea\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  expect(block).toMatch(/font-size:\s*1rem/);
  // It may only drop below 16px once there is room for it.
  expect(css).toMatch(/@media \(min-width: 640px\)\s*\{\s*\.composer-textarea\s*\{\s*font-size:\s*15px/);
});

test("image generation uses the shared composer and keeps its mode active", () => {
  const input = read("components/ChatInput.tsx");
  expect(input).not.toContain("composer-imgprompt");
  expect(input).toContain('aria-label={imageGenerationMode ? "Image prompt" : "Message"}');
  expect(input).toContain('aria-pressed={imageGenerationMode}');
  expect(input).toContain('imageGenerationMode && "composer-tool-btn-active"');
  expect(input).toContain("if (imageGenerationMode && onGenerateImage)");
  expect(input).toContain("void onGenerateImage(message)");
  expect(input).toContain('title={imageGenerationMode ? "Generate image" : "Send message"}');
});

test("inline message edit fills the message column like the bottom composer", () => {
  const css = read("components/ChatInput.css");
  const wrapRule = /\.composer-wrap-compact\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  expect(wrapRule).toContain("w-full");
  expect(wrapRule).not.toContain("w-fit");
  // The edit box reuses the bottom composer's textarea (no compact override).
  expect(css).not.toContain("composer-textarea-compact");
  expect(read("components/ChatInput.tsx")).not.toContain("composer-textarea-compact");

  const page = read("pages/Index.tsx");
  const editFn = /const handleEditMessage[\s\S]*?^\s{2}\};/m.exec(page)?.[0] ?? "";
  expect(editFn).toContain("runAssistantReply(");
});

// ---- sidebar ----

test("sidebar width has a single source of truth and cannot exceed the viewport", () => {
  const tokens = read("index.css");
  expect(tokens).toContain("--sidebar-w");
  // The rail must never be wider than the screen it lives on.
  expect(read("components/ConversationSidebar.css")).toMatch(
    /width:\s*min\(var\(--sidebar-w\),\s*\d+vw\)/
  );
});

test("sidebar conversation rows stay fixed width and truncate overflowing titles", () => {
  const scrollArea = read("components/ui/scroll-area.tsx");
  // Radix's inner `display: table` wrapper expands to fit nowrap text unless
  // forced to block layout.
  expect(scrollArea).toContain("[&>div]:!block");
  const sidebarCss = read("components/ConversationSidebar.css");
  expect(sidebarCss).toMatch(
    /\.sidebar-scroll\s+\[data-radix-scroll-area-viewport\]\s*>\s*div\s*\{[^}]*display:\s*block\s*!important/
  );
  const rowRule = /\.conv-row\s*\{([^}]*)\}/.exec(sidebarCss)?.[1] ?? "";
  expect(rowRule).toContain("min-w-0");
  expect(rowRule).toContain("max-w-full");
  const titleRule = /\.conv-row-title\s*\{([^}]*)\}/.exec(sidebarCss)?.[1] ?? "";
  expect(titleRule).toContain("truncate");
});

test("sidebar docking and its overlay share one breakpoint", () => {
  const page = read("pages/Index.css");
  const sidebar = read("components/ConversationSidebar.css");
  // Docked layout and overlay must agree, or the rail covers the chat while the
  // chat is also offset for it.
  expect(page).toMatch(/\.app-main-sidebar-open\s*\{\s*@apply lg:ml-/);
  expect(sidebar).toMatch(/\.sidebar-overlay\s*\{[^}]*lg:hidden/);
});

// ---- layout logic ----

test("viewport reads are subscribed to, not sampled once", () => {
  // A useState initialiser runs once; rotating the device or resizing the
  // window then leaves stale responsive state.
  for (const file of ["pages/Index.tsx", "components/ModelSelector.tsx"]) {
    const src = read(file);
    // Neither a sampled media query nor a sampled width: any occurrence means
    // some decision is still frozen at first render.
    expect(src).not.toContain("window.innerWidth");
    expect(src).not.toMatch(/useState\(\s*\(\)\s*=>[^)]*matchMedia/);
    // The hook must actually be *called* — importing it while the call site
    // still reads matchMedia inline would otherwise satisfy a contains check.
    expect(src).toMatch(/useMediaQuery\(/);
  }
  const sidebar = read("components/ConversationSidebar.tsx");
  expect(sidebar).not.toContain("window.innerWidth");
  expect(sidebar).toContain("DESKTOP_QUERY");

  const hook = read("hooks/useMediaQuery.ts");
  expect(hook).toContain("addEventListener");
});

test("the shell cannot scroll the document behind itself", () => {
  const tokens = read("index.css");
  expect(tokens).toMatch(/html,\s*\n\s*body,\s*\n\s*#root\s*\{[^}]*overflow:\s*hidden/);
  expect(tokens).toContain("overscroll-behavior");
  // Transcripts must not chain a fling to pull-to-refresh.
  expect(read("components/ui/scroll-area.tsx")).toContain("overscroll-contain");
});

// ---- model picker ----

test("model picker adapts its chrome to the viewport", () => {
  const css = read("components/ModelSelector.css");
  // A 140px trigger label is half the width of a 320px screen.
  expect(css).toMatch(/\.ms-trigger-label\s*\{[\s\S]*?max-width:\s*6\.5rem/);
  // Full-screen modal on a phone wastes the top half behind empty scrim.
  expect(css).toMatch(/align-items:\s*flex-end/);
  expect(css).toContain("dvh");
  // The provider rail must not starve the model list.
  expect(css).toMatch(/width:\s*min\(11rem,\s*38vw\)/);
});
// ---- artifacts panel ----

test("the artifacts panel docks and overlays at one breakpoint", () => {
  const page = read("pages/Index.css");
  const panel = read("components/ArtifactsPanel.css");
  // Docked layout and scrim must agree, or the panel covers the transcript
  // while the transcript is also inset for it — the bug the sidebar guard
  // already catches on the left edge.
  expect(page).toMatch(/\.app-main-artifacts-open\s*\{\s*@apply xl:mr-/);
  expect(panel).toMatch(/\.artifacts-overlay\s*\{[^}]*xl:hidden/);
  // And the JS side of that breakpoint lives beside DESKTOP_QUERY, so the CSS
  // and the "close the overlay before locating" decision cannot drift.
  const hook = read("hooks/useMediaQuery.ts");
  expect(hook).toContain("ARTIFACTS_DOCK_QUERY");
  expect(hook).toMatch(/ARTIFACTS_DOCK_QUERY = "\(min-width: 1280px\)"/);
  // The panel's wiring moved out of Index.tsx (Phase 3 spec §9.1).
  expect(read("hooks/useArtifactsPanel.ts")).toContain("useMediaQuery(ARTIFACTS_DOCK_QUERY)");
});

test("artifacts panel width has a single source of truth and cannot exceed the viewport", () => {
  expect(read("index.css")).toContain("--artifacts-w");
  expect(read("components/ArtifactsPanel.css")).toMatch(
    /width:\s*min\(var\(--artifacts-w\),\s*\d+vw\)/
  );
  // The main column's inset must read the same token, not a hard-coded px value.
  expect(read("pages/Index.css")).toMatch(
    /\.app-main-artifacts-open\s*\{[^}]*var\(--artifacts-w\)/
  );
});

test("the images panel is reachable at every width and announces its state", () => {
  const css = read("pages/Index.css");
  // It is the only way to reach the panel, so it cannot shed like search does.
  const toggleRule = /\.app-header-artifacts\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  expect(toggleRule).toContain("inline-flex");
  expect(toggleRule).not.toContain("hidden");

  const page = read("pages/Index.tsx");
  expect(page).toContain("Images in this conversation");
  expect(page).toContain("aria-expanded={artifactsOpen}");
  expect(page).toContain('title="Images in this conversation"');
  // The count is a badge: the accessible name carries it instead.
  expect(page).toContain('className="app-header-artifacts-count" aria-hidden="true"');
});

test("locating an image scrolls the Radix viewport and flashes the message", () => {
  // Lives in the panel's hook since the Phase 3 move out of Index.tsx.
  const hookSrc = read("hooks/useArtifactsPanel.ts");
  const locate = /const locateMessage[\s\S]*?^\s{2}\);/m.exec(hookSrc)?.[0] ?? "";
  expect(locate).toBeTruthy();
  // `scrollTop` on the ref'd root silently does nothing: the scroller is Radix's
  // viewport (issue #34). Find-in-chat already learned this.
  expect(locate).toContain("scrollIntoView");
  expect(locate).not.toContain("scrollTop");
  expect(locate).toContain('data-message-index');
  expect(locate).toContain('data-artifact-flash');

  const css = read("pages/Index.css");
  expect(css).toMatch(/@keyframes artifact-flash/);
  expect(css).toMatch(/\[data-artifact-flash\]/);
  // A motion-sensitive user still has to be told which message was found.
  expect(css).toMatch(
    /prefers-reduced-motion[\s\S]*?\[data-artifact-flash\]\s*\{[^}]*animation:\s*none/
  );
  expect(css).toMatch(
    /prefers-reduced-motion[\s\S]*?\[data-artifact-flash\]\s*\{[^}]*outline:/
  );
});

test("a closed panel leaves the tab order instead of trapping focus off-screen", () => {
  const panel = read("components/ArtifactsPanel.tsx");
  // The panel stays mounted so it can slide; aria-hidden alone would leave its
  // buttons focusable while invisible.
  expect(panel).toContain('setAttribute("inert"');
  expect(panel).toContain('removeAttribute("inert")');
  expect(panel).not.toContain("aria-hidden={!isOpen}");
});

test("attachments are persisted in the background and never block a send", () => {
  const page = read("pages/Index.tsx");
  const helper = /async function prepareAndStoreAttachments[\s\S]*?\n\}/.exec(page)?.[0] ?? "";
  expect(helper).toBeTruthy();
  expect(helper).toContain("newAttachmentPath(");
  // Fire-and-forget: paths are minted locally, so the message carries them
  // before the write lands, and a Drive failure cannot lose the message.
  expect(helper).toContain("void persistAttachment(");
  expect(helper).not.toMatch(/await persistAttachment/);
  // Both send paths keep the refs, or an edited message loses its images.
  expect(page.match(/attachments: attachmentRefs/g)?.length).toBe(2);
});

test("the panel never claims an image it cannot resolve", () => {
  const artifacts = read("lib/artifacts.ts");
  // A ref without a path would render a tile that can never load.
  expect(artifacts).toContain('typeof ref.path !== "string" || !ref.path');
  // Legacy markers whose bytes were never stored are counted, not tiled.
  expect(artifacts).toContain("countUnsavedAttachments");
  const panel = read("components/ArtifactsPanel.tsx");
  expect(panel).toContain("unsavedAttachments");
  // The tile (and its "Unavailable" state) moved into its own file.
  expect(read("components/ArtifactTile.tsx")).toContain("Unavailable");
});
