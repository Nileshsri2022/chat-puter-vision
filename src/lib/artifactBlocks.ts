// Code blocks and tables in an assistant answer, for the artifacts panel.
//
// The transcript renders an answer with react-markdown + remark-gfm. This
// module runs the same micromark + GFM parser over the same string (the
// `answer` half of splitThinkBlocks), so the panel lists exactly what the
// transcript shows: backtick and tilde fences (#50), indented code, an
// unclosed fence from a stopped reply, and a pipe table inside a fence, which
// is code and not a table.
//
// Results carry no message index. They are cached per message object and the
// collector in lib/artifacts.ts stamps indices on every derivation, so
// deleting a message can never leave a cached block aimed at the wrong one.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { Code, Nodes, Table } from "mdast";
import type { Message } from "./backend";
import { splitThinkBlocks } from "./streamingHandler";

export interface CodeBlockData {
  kind: "code";
  /** Offset of the block in the answer: what ChatMessage stamps as `data-artifact-at`. */
  at: number;
  /** The code itself, without its fences. */
  text: string;
  /** First word of the fence's info string, when there is one. */
  language?: string;
  lines: number;
  label: string;
}

export interface TableBlockData {
  kind: "table";
  at: number;
  /** The table's Markdown, sliced from the answer. */
  text: string;
  header: string[];
  /** Body rows, padded or cut to the header's width, as the table renders. */
  rows: string[][];
  label: string;
}

export type TextBlockData = CodeBlockData | TableBlockData;

/**
 * Could this answer hold a code block or a table? A fence, an indented line
 * (four spaces or a tab) or a pipe. Errs wide on purpose: a false positive
 * costs one parse, a false negative would hide a block.
 */
export const BLOCK_HINT = /```|~~~|^(?: {4}|\t)|\|/m;

const LANGUAGE_NAMES: Record<string, string> = {
  bash: "Bash",
  c: "C",
  "c#": "C#",
  "c++": "C++",
  cpp: "C++",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  csv: "CSV",
  dart: "Dart",
  diff: "Diff",
  docker: "Dockerfile",
  dockerfile: "Dockerfile",
  go: "Go",
  golang: "Go",
  graphql: "GraphQL",
  html: "HTML",
  ini: "INI",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  kotlin: "Kotlin",
  kt: "Kotlin",
  lua: "Lua",
  markdown: "Markdown",
  md: "Markdown",
  php: "PHP",
  plaintext: "Text",
  powershell: "PowerShell",
  ps1: "PowerShell",
  py: "Python",
  python: "Python",
  r: "R",
  rb: "Ruby",
  ruby: "Ruby",
  rs: "Rust",
  rust: "Rust",
  scala: "Scala",
  scss: "SCSS",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  text: "Text",
  toml: "TOML",
  ts: "TypeScript",
  tsx: "TSX",
  txt: "Text",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Zsh",
};

/** Display name for a fence's language tag: "py" is "Python", no tag is "Code". */
export function languageName(language?: string | null): string {
  const tag = typeof language === "string" ? language.trim() : "";
  if (!tag) return "Code";
  return LANGUAGE_NAMES[tag.toLowerCase()] ?? tag.charAt(0).toUpperCase() + tag.slice(1);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Python · 24 lines". */
export function codeLabel(language: string | undefined, lines: number): string {
  return `${languageName(language)} · ${plural(lines, "line")}`;
}

/** "Table · 5 × 3": body rows × columns. */
export function tableLabel(rows: number, columns: number): string {
  return `Table · ${rows} × ${columns}`;
}

const createProcessor = () => unified().use(remarkParse).use(remarkGfm).freeze();
let processor: ReturnType<typeof createProcessor> | null = null;

/** Code and table nodes in document order. Nothing nests inside either. */
function collectBlockNodes(node: Nodes, out: Array<Code | Table>): void {
  if (node.type === "code" || node.type === "table") {
    out.push(node);
    return;
  }
  if ("children" in node) {
    for (const child of node.children) collectBlockNodes(child, out);
  }
}

function extractBlocks(answer: string): TextBlockData[] {
  processor ??= createProcessor();
  const nodes: Array<Code | Table> = [];
  collectBlockNodes(processor.parse(answer), nodes);

  const blocks: TextBlockData[] = [];
  for (const node of nodes) {
    const at = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (typeof at !== "number" || typeof end !== "number") continue;

    if (node.type === "code") {
      // An empty fence has nothing to copy, download or reuse.
      if (!node.value.trim()) continue;
      const language = node.lang || undefined;
      const lines = node.value.replace(/\n+$/, "").split("\n").length;
      blocks.push({ kind: "code", at, text: node.value, language, lines, label: codeLabel(language, lines) });
      continue;
    }

    const [head, ...body] = node.children;
    if (!head) continue;
    const header = head.children.map((cell) => toString(cell));
    const width = header.length;
    const rows = body.map((row) =>
      Array.from({ length: width }, (_, i) => (row.children[i] ? toString(row.children[i]) : ""))
    );
    blocks.push({
      kind: "table",
      at,
      text: answer.slice(at, end),
      header,
      rows,
      label: tableLabel(rows.length, width),
    });
  }
  return blocks;
}

// Updates replace message objects rather than mutating them, so identity is a
// safe key: a sync that replaces one conversation re-parses only that one.
const cache = new WeakMap<Message, TextBlockData[]>();

/**
 * Code blocks and tables in an assistant message's answer, in document order.
 *
 * Never throws (#24): the collector runs during render, and a throw there
 * would trip the app-level error boundary. Anything unexpected (a non-string
 * `content`, a parser failure) yields no blocks. Callers must not mutate the
 * returned arrays; they are shared with the cache.
 */
export function extractTextBlocks(message: Message): TextBlockData[] {
  if (!message || typeof message !== "object") return [];
  const hit = cache.get(message);
  if (hit) return hit;
  let blocks: TextBlockData[] = [];
  try {
    if (message.role === "assistant" && typeof message.content === "string") {
      const { answer } = splitThinkBlocks(message.content);
      if (BLOCK_HINT.test(answer)) blocks = extractBlocks(answer);
    }
  } catch {
    blocks = [];
  }
  cache.set(message, blocks);
  return blocks;
}
