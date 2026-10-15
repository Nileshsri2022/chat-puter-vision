// Text artifacts: code blocks and tables collected from assistant answers.
//
// What these pin: the panel lists exactly the blocks the transcript renders
// (same parser, same string), the Phase 1 image collection is untouched by
// the union, extraction never throws during render (#24), and the exported
// formats treat model output as untrusted.

import { test, expect } from "bun:test";
import type { Message } from "../src/lib/backend";
import {
  collectArtifacts,
  collectImageArtifacts,
  countArtifactKinds,
  isImageArtifact,
  type Artifact,
  type CodeArtifact,
  type TableArtifact,
} from "../src/lib/artifacts";
import { BLOCK_HINT, extractTextBlocks, languageName } from "../src/lib/artifactBlocks";
import {
  csvField,
  extensionFor,
  tableToCsv,
  tableToHtml,
  textArtifactFilename,
} from "../src/lib/artifactFormats";
import { splitThinkBlocks } from "../src/lib/streamingHandler";

const code = (artifacts: Artifact[]) => artifacts.filter((a): a is CodeArtifact => a.kind === "code");
const tables = (artifacts: Artifact[]) => artifacts.filter((a): a is TableArtifact => a.kind === "table");

// ---- golden: the union leaves the image collection exactly as it was ----

// The Phase 1 fixture shapes (tests/artifacts.test.ts and the panel test),
// plus one where the same messages also carry code and a table.
const PHASE1_FIXTURES: Message[][] = [
  [
    { role: "user", content: "draw a sunset" },
    { role: "assistant", content: "", imagePath: "freetalk-abc.png", model: "gpt-4o" },
  ],
  [
    {
      role: "user",
      content: "What is in these?\n\n[Images: 2 attached]",
      attachments: [
        { path: "freetalk-upload-1.jpg", name: "receipt.jpg", mimeType: "image/jpeg" },
        { path: "freetalk-upload-2.png", name: "diagram.png" },
      ],
    },
  ],
  [{ role: "user", content: "hi", attachments: [{ path: "freetalk-upload-1.png" }] }],
  [
    { role: "assistant", content: "", image: "data:image/png;base64,AAAA" },
    { role: "assistant", content: "", image: "https://cdn.test/a.png" },
  ],
  [{ role: "assistant", content: "", image: "data:image/png;base64,AAAA", imagePath: "freetalk-abc.png" }],
  [
    { role: "user", content: "first", attachments: [{ path: "u1.png" }] },
    { role: "assistant", content: "no image here" },
    { role: "assistant", content: "", imagePath: "g1.png" },
    { role: "user", content: "two more", attachments: [{ path: "u2.png" }, { path: "u3.png" }] },
  ],
  [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi", model: "gpt-4o" },
  ],
  [
    {
      role: "user",
      content: "x",
      attachments: [{ path: "" }, { noPath: true }, { path: "ok.png" }],
    },
  ] as unknown as Message[],
  [
    { role: "user", content: "And this one?\n\n[Images: 1 attached]" },
    null as unknown as Message,
    { role: "assistant", content: "```py\nprint(1)\n```", imagePath: "g2.png", model: "gpt-4o" },
    { role: "assistant", content: "| a | b |\n| - | - |\n| 1 | 2 |", image: "data:image/png;base64,BBBB" },
  ],
];

test("golden: the images in collectArtifacts are exactly collectImageArtifacts", () => {
  for (const fixture of PHASE1_FIXTURES) {
    expect(collectArtifacts(fixture).filter(isImageArtifact)).toEqual(collectImageArtifacts(fixture));
  }
});

test("a message lists its images first, then its blocks in document order", () => {
  const artifacts = collectArtifacts(PHASE1_FIXTURES[8]);
  expect(artifacts.map((a) => a.id)).toEqual(["2:generated:0", "2:code:0", "3:legacy:0", "3:table:0"]);
  expect(countArtifactKinds(artifacts)).toEqual({ generated: 1, attached: 0, legacy: 1, code: 1, table: 1 });
});

// ---- code ----

test("backtick and tilde fences are both code (#50), with language, label and lines", () => {
  const artifacts = collectArtifacts([
    {
      role: "assistant",
      content: "Two ways:\n\n```python title=rates.py\nimport requests\n\nprint(1)\n```\n\n~~~ts\nconst x = 1;\n~~~",
      model: "gpt-4o",
    },
  ]);
  expect(code(artifacts).map(({ language, lines, label, text }) => ({ language, lines, label, text }))).toEqual([
    { language: "python", lines: 3, label: "Python · 3 lines", text: "import requests\n\nprint(1)" },
    { language: "ts", lines: 1, label: "TypeScript · 1 line", text: "const x = 1;" },
  ]);
  expect(artifacts[0]).toMatchObject({ role: "assistant", messageIndex: 0, model: "gpt-4o" });
});

test("indented code and an unclosed fence are code, as they render", () => {
  const indented = collectArtifacts([{ role: "assistant", content: "Run:\n\n    npm ci\n    npm test\n" }]);
  expect(code(indented).map((a) => [a.text, a.label])).toEqual([["npm ci\nnpm test", "Code · 2 lines"]]);
  // A stopped reply leaves its fence open; it still renders as code to the end.
  const stopped = collectArtifacts([{ role: "assistant", content: "Here:\n\n```js\nconst a = 1;\nconst b =" }]);
  expect(code(stopped).map((a) => [a.text, a.lines])).toEqual([["const a = 1;\nconst b =", 2]]);
});

test("inline code, thinking, user messages and empty fences produce nothing", () => {
  const artifacts = collectArtifacts([
    { role: "user", content: "```js\nmine()\n```" },
    { role: "assistant", content: "<think>```js\nhidden()\n```</think>Use `npm ci`, then:\n\n```\n```" },
  ]);
  expect(artifacts).toEqual([]);
});

test("language labels: known names, a capitalized unknown tag, and Code without one", () => {
  expect(languageName("py")).toBe("Python");
  expect(languageName("TS")).toBe("TypeScript");
  expect(languageName("elixir")).toBe("Elixir");
  expect(languageName(undefined)).toBe("Code");
  expect(languageName("  ")).toBe("Code");
});

test("ids are unique and indices follow the transcript after a deletion", () => {
  const messages: Message[] = [
    { role: "user", content: "q1" },
    { role: "assistant", content: "```a\n1\n```\n\n```b\n2\n```" },
    { role: "user", content: "q2" },
    { role: "assistant", content: "```c\n3\n```" },
  ];
  const before = collectArtifacts(messages);
  expect(new Set(before.map((a) => a.id)).size).toBe(before.length);
  expect(before.map((a) => a.id)).toEqual(["1:code:0", "1:code:1", "3:code:0"]);
  // Deleting splices the array: the cached parse is reused, the index is not.
  const after = collectArtifacts([messages[2], messages[3]]);
  expect(after.map((a) => [a.id, a.messageIndex])).toEqual([["1:code:0", 1]]);
});

// ---- tables ----

const TABLE_ANSWER = [
  "Prices:",
  "",
  "| Item | `Qty` | Price |",
  "| --- | ---: | --- |",
  "| Rice \\| basmati | 2 | ₹120 |",
  "| Dal | 1 |",
  "| Tea | 3 | ₹40 | extra |",
  "",
  "Done.",
].join("\n");

test("a table yields its header, rows and size, normalized to the header width", () => {
  const [table] = tables(collectArtifacts([{ role: "assistant", content: TABLE_ANSWER }]));
  // Inline code and escaped pipes are unwrapped; short rows are padded and
  // long rows cut, exactly as the rendered table shows them.
  expect(table.header).toEqual(["Item", "Qty", "Price"]);
  expect(table.rows).toEqual([
    ["Rice | basmati", "2", "₹120"],
    ["Dal", "1", ""],
    ["Tea", "3", "₹40"],
  ]);
  expect(table.label).toBe("Table · 3 × 3");
});

test("a table's text is the exact Markdown slice at its offset", () => {
  const content = `<think>plan</think>${TABLE_ANSWER}`;
  const [table] = tables(collectArtifacts([{ role: "assistant", content }]));
  const { answer } = splitThinkBlocks(content);
  expect(answer.slice(table.at, table.at + table.text.length)).toBe(table.text);
  expect(table.text.startsWith("| Item |")).toBe(true);
  expect(table.text.endsWith("| Tea | 3 | ₹40 | extra |")).toBe(true);
});

test("a table inside a fence is code, not a table", () => {
  const artifacts = collectArtifacts([{ role: "assistant", content: "```\n| a | b |\n| - | - |\n| 1 | 2 |\n```" }]);
  expect(artifacts.map((a) => a.kind)).toEqual(["code"]);
});

// ---- defensive (#24) and cache ----

test("bad input yields no artifacts and never throws", () => {
  const throwing = {
    role: "assistant",
    get content(): string {
      throw new Error("boom");
    },
  } as unknown as Message;
  const messages = [
    null,
    42,
    { role: "assistant", content: 7 },
    { role: "assistant" },
    throwing,
  ] as unknown as Message[];
  expect(() => collectArtifacts(messages)).not.toThrow();
  expect(collectArtifacts(messages)).toEqual([]);
});

test("each message object is parsed once; a replaced object is parsed again", () => {
  const message: Message = { role: "assistant", content: TABLE_ANSWER };
  const first = extractTextBlocks(message);
  expect(extractTextBlocks(message)).toBe(first);
  // Through the collector too: the second collect reuses the cached cells.
  const [a] = tables(collectArtifacts([message]));
  const [b] = tables(collectArtifacts([message]));
  expect(b.rows).toBe(a.rows);
  // Updates replace message objects, so a copy is a fresh parse.
  const copy = { ...message };
  expect(extractTextBlocks(copy)).not.toBe(first);
  expect(extractTextBlocks(copy)).toEqual(first);
});

test("the prefilter skips plain prose and catches every block form", () => {
  expect(BLOCK_HINT.test("Just prose.\nNo blocks at all, only words.")).toBe(false);
  for (const sample of [
    "```js\nx\n```",
    "~~~\nx\n~~~",
    "text\n\n    indented",
    "- item\n\n      nested in a list",
    "text\n\n\ttab-indented",
    "a | b\n--- | ---\n1 | 2",
  ]) {
    expect(`${JSON.stringify(sample)}: ${BLOCK_HINT.test(sample)}`).toBe(`${JSON.stringify(sample)}: true`);
  }
});

// ---- formats ----

test("CSV fields are quoted per RFC 4180", () => {
  expect(csvField("plain")).toBe("plain");
  expect(csvField("a,b")).toBe('"a,b"');
  expect(csvField('say "hi"')).toBe('"say ""hi"""');
  expect(csvField("two\nlines")).toBe('"two\nlines"');
});

test("CSV neutralizes formulas but leaves plain numbers alone", () => {
  for (const cell of ["=1+1", "+cmd", "-2+3+cmd|' /C calc'!A0", "@SUM(A1)", "\tx", "\rx", "-", "+"]) {
    expect(csvField(cell).replace(/^"/, "").startsWith("'")).toBe(true);
  }
  expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  for (const number of ["-12.5", "+3", "42", "-0.5", ".5", "1.25"]) {
    expect(csvField(number)).toBe(number);
  }
});

test("a CSV file has a BOM, CRLF line ends and keeps ₹ intact", () => {
  const csv = tableToCsv(["Item", "Price"], [["Rice", "₹120"], ["Tea, masala", "-5"]]);
  expect(csv).toBe('\uFEFFItem,Price\r\nRice,₹120\r\n"Tea, masala",-5\r\n');
});

test("the clipboard's HTML table escapes cell text", () => {
  const html = tableToHtml(["<b>a</b>"], [[`x & "y" 'z'`]]);
  expect(html).toBe(
    "<table><thead><tr><th>&lt;b&gt;a&lt;/b&gt;</th></tr></thead>" +
      "<tbody><tr><td>x &amp; &quot;y&quot; &#39;z&#39;</td></tr></tbody></table>"
  );
});

test("download names use the message number, a per-kind count and the language", () => {
  const artifacts = collectArtifacts([
    { role: "user", content: "q" },
    {
      role: "assistant",
      content: "```python\na\n```\n\n```\nb\n```\n\n| a |\n| - |\n| 1 |\n\n| b |\n| - |\n| 2 |",
    },
  ]);
  expect(artifacts.map((a) => textArtifactFilename(a as CodeArtifact | TableArtifact))).toEqual([
    "snippet-2-1.py",
    "snippet-2-2.txt",
    "table-2-1.csv",
    "table-2-2.csv",
  ]);
  expect(["bash", "sh", "shell", "zsh"].map(extensionFor)).toEqual(["sh", "sh", "sh", "sh"]);
  expect(extensionFor("TypeScript")).toBe("ts");
  expect(extensionFor("brainfuck")).toBe("txt");
});
