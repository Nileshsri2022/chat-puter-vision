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
  for (const cls of [".msg-action-btn", ".composer-tool-btn", ".app-icon-btn"]) {
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