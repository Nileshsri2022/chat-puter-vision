// Code blocks and tables from assistant answers (Phase 3a, spec §12).
//
// Kept apart from artifacts.test.ts, which pins the Phase 1 image index: these
// fixtures parse Markdown, and a parser change should not touch the image
// guarantees.

import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectArtifacts,
  collectImageArtifacts,
  countArtifactKinds,
  isImageArtifact,
  type Artifact,
} from "@/lib/artifacts";
import { blocksForMessage, parseAnswerBlocks, languageName } from "@/lib/artifactBlocks";
import { artifactFileName, escapeHtml, extensionFor, tableToCsv, tableToHtml } from "@/lib/artifactFormats";
import type { Message } from "@/lib/backend";

const ANSWER = [
  "Here is the script:",
  "",
  "```python",
  "def fetch_rates(base=\"INR\"):",
  "    return {}",
  "```",
  "",
  "| Item | Price |",
  "|------|-------|",
  "| `tea` | 20 |",
  "| coffee | 45 |",
  "",
  "~~~bash",
  "make build",
  "~~~",
].join("\n");

const assistant = (content: string, extra: Partial<Message> = {}): Message =>
  ({ role: "assistant", content, ...extra }) as Message;

// ---- code ----

test("backtick and tilde fences both become code artifacts with language and lines", () => {
  const found = collectArtifacts([assistant(ANSWER)]).filter((a) => a.kind === "code");
  expect(found.map((a) => a.label)).toEqual(["Python · 2 lines", "Bash · 1 line"]);
  expect(found[0]).toMatchObject({ kind: "code", language: "python", lines: 2 });
  expect(found[0].kind === "code" && found[0].text).toBe('def fetch_rates(base="INR"):\n    return {}');
});

test("indented code and an unclosed fence are found, as the transcript renders them", () => {
  const indented = parseAnswerBlocks("Intro\n\n    x = 1\n    y = 2\n");
  expect(indented).toHaveLength(1);
  expect(indented[0]).toMatchObject({ kind: "code", language: undefined, lines: 2 });

  const unclosed = parseAnswerBlocks("Stopped mid-reply\n\n```ts\nconst a = 1");
  expect(unclosed).toHaveLength(1);
  expect(unclosed[0]).toMatchObject({ kind: "code", language: "ts", lines: 1 });
});

test("inline code, think blocks and user messages produce nothing", () => {
  expect(collectArtifacts([assistant("Use `npm test` to run it.")])).toEqual([]);
  expect(
    collectArtifacts([assistant("<think>```js\nlet a\n```</think>\n\nThe answer is 4.")])
  ).toEqual([]);
  const userCode: Message = { role: "user", content: "```py\nprint(1)\n```" } as Message;
  expect(collectArtifacts([userCode])).toEqual([]);
});

test("a language tag without a known name is capitalized, and no tag reads as Code", () => {
  expect(languageName("elixir")).toBe("Elixir");
  expect(languageName(undefined)).toBe("Code");
  const [block] = collectArtifacts([assistant("```\nhi\n```")]);
  expect(block.kind === "code" && block.label).toBe("Code · 1 line");
});

test("artifact ids are unique and messageIndex follows the transcript", () => {
  const transcript = [
    { role: "user", content: "hi" } as Message,
    assistant(ANSWER),
    assistant("```js\na\n```\n\n```js\nb\n```"),
  ];
  const ids = collectArtifacts(transcript).map((a) => a.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(collectArtifacts(transcript).filter((a) => a.kind !== "generated").map((a) => a.messageIndex))
    .toEqual([1, 1, 1, 2, 2]);
  // Remove the first message: the indices move with the transcript, not stale.
  const shifted = collectArtifacts(transcript.slice(1));
  expect(shifted.map((a) => a.messageIndex)[0]).toBe(0);
});

// ---- tables ----

test("a table gives header, rows and size, and its text is the source slice", () => {
  const table = collectArtifacts([assistant(ANSWER)]).find((a) => a.kind === "table");
  expect(table).toBeDefined();
  if (!table || table.kind !== "table") throw new Error("expected a table");
  expect(table.label).toBe("Table · 2 × 2");
  expect(table.header).toEqual(["Item", "Price"]);
  expect(table.rows).toEqual([
    ["tea", "20"],
    ["coffee", "45"],
  ]);
  expect(table.text).toBe(ANSWER.slice(table.at, table.at + table.text.length));
  expect(table.text.startsWith("| Item | Price |")).toBe(true);
  // Inline code is unwrapped in cells.
  expect(table.rows[0][0]).toBe("tea");
});

test("a pipe table inside a fence is code, not a table", () => {
  const fenced = "```md\n| a | b |\n|---|---|\n| 1 | 2 |\n```";
  const found = collectArtifacts([assistant(fenced)]);
  expect(found.map((a) => a.kind)).toEqual(["code"]);
});

// ---- guards ----

test("the golden test: image artifacts are unchanged by the union", () => {
  const messages: Message[] = [
    { role: "user", content: "look\n\n[Images: 1 attached]", attachments: [{ path: "a.jpg", name: "a.jpg" }] } as Message,
    assistant(ANSWER, { imagePath: "gen.png", model: "m" }),
    { role: "user", content: "and this?\n\n[Images: 1 attached]" } as Message,
    assistant("```js\nx\n```", { image: "data:image/png;base64,AAAA" }),
  ];
  const all: Artifact[] = collectArtifacts(messages);
  expect(all.filter(isImageArtifact)).toEqual(collectImageArtifacts(messages));
  expect(countArtifactKinds(all)).toMatchObject({ generated: 1, attached: 1, legacy: 1, code: 3, table: 1 });
});

test("defensive: null messages, non-string content and odd fields produce no artifacts and no throw", () => {
  const messages = [
    null,
    undefined,
    { role: "assistant", content: 42 },
    { role: "assistant", content: null },
    { role: "assistant" },
    "not a message",
  ] as unknown as Message[];
  expect(() => collectArtifacts(messages)).not.toThrow();
  expect(collectArtifacts(messages)).toEqual([]);
});

test("the cache returns the same parse for the same message object", () => {
  const message = assistant(ANSWER);
  expect(blocksForMessage(message)).toBe(blocksForMessage(message));
  // A replaced message object is parsed afresh.
  expect(blocksForMessage({ ...message })).not.toBe(blocksForMessage(message));
});

test("the prefilter skips prose without a parse", () => {
  expect(parseAnswerBlocks("Quantum computers use qubits.")).toEqual([]);
});

// ---- formats ----

test("CSV quotes fields, uses CRLF and starts with a BOM", () => {
  const csv = tableToCsv(["Name", "Note"], [['Ana "A"', "a, b"], ["x", "line1\nline2"]]);
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv.slice(1)).toBe('Name,Note\r\n"Ana ""A""","a, b"\r\nx,"line1\nline2"\r\n');
});

test("CSV neutralizes formula-looking cells but leaves plain numbers alone", () => {
  const csv = tableToCsv(["v"], [["=SUM(A1)"], ["+3"], ["-12.5"], ["-2+3+cmd|x"], ["@cmd"], ["\tTAB"]]);
  const lines = csv.slice(1).split("\r\n").filter(Boolean);
  expect(lines).toEqual(["v", "'=SUM(A1)", "+3", "-12.5", "'-2+3+cmd|x", "'@cmd", "'\tTAB"]);
});

test("clipboard HTML escapes every cell", () => {
  expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
    "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;"
  );
  const html = tableToHtml(["<b>"], [["<script>"]]);
  expect(html).toContain("<th>&lt;b&gt;</th>");
  expect(html).toContain("<td>&lt;script&gt;</td>");
  expect(html).not.toContain("<script>");
});

test("file names follow the spec and unknown languages get txt", () => {
  expect(artifactFileName("code", 4, 2, "python")).toBe("snippet-4-2.py");
  expect(artifactFileName("code", 1, 1, "TypeScript")).toBe("snippet-1-1.ts");
  expect(artifactFileName("code", 1, 1, "elixir")).toBe("snippet-1-1.txt");
  expect(artifactFileName("code", 1, 1)).toBe("snippet-1-1.txt");
  expect(artifactFileName("table", 6, 1)).toBe("table-6-1.csv");
  expect(extensionFor("bash")).toBe("sh");
});

test("the artifacts reach the same offsets the renderer stamps", () => {
  // Checked against the rendered markup in chatMessage.test.tsx; here the
  // collector's offsets must slice back to the fence and the table source.
  const [code, table] = collectArtifacts([assistant(ANSWER)]);
  expect(ANSWER.slice(code.kind === "code" ? code.at : -1).startsWith("```python")).toBe(true);
  expect(ANSWER.slice(table.kind === "table" ? table.at : -1).startsWith("| Item")).toBe(true);
});

test("the parser module declares its dependencies in package.json", () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"));
  for (const dep of ["unified", "remark-parse", "mdast-util-to-string"]) {
    expect(pkg.dependencies[dep]).toBeDefined();
  }
  expect(pkg.devDependencies["@types/mdast"]).toBeDefined();
  expect(pkg.scripts.typecheck).toContain("tsc --noEmit");
});
