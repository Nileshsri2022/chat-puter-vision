// Code blocks and tables in assistant answers, parsed the way the transcript
// renders them (Phase 3, spec §5.2).
//
// The parser is the same micromark + GFM pipeline react-markdown runs, fed the
// same string `ChatMessage` passes to <ReactMarkdown>. Offsets therefore line
// up with the `data-artifact-at` values the renderer stamps. Parse results are
// cached per message object; they never leave memory, and nothing here is
// stored on a Message.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString as mdastToString } from "mdast-util-to-string";
import type { Root, RootContent, Table } from "mdast";
import type { Message } from "@/lib/backend";
import { splitThinkBlocks } from "@/lib/streamingHandler";

export interface ParsedCode {
  kind: "code";
  /** The fence info string's first word, or undefined for none. */
  language?: string;
  lines: number;
  /** The code without its fence. */
  value: string;
  /** Start offset of the block in the answer string. */
  at: number;
}

export interface ParsedTable {
  kind: "table";
  header: string[];
  rows: string[][];
  /** The Markdown source slice of the table. */
  source: string;
  at: number;
}

export type ParsedBlock = ParsedCode | ParsedTable;

/**
 * Cheap test that skips the parser for answers that cannot contain a block.
 * A false negative would drop an artifact, so the cases it must cover are
 * fences, tildes, indented code (including inside lists), tab indentation and
 * pipe tables with or without outer pipes.
 */
const MAYBE_BLOCK = /```|~~~|^(?: {4}|\t)|\|/m;

const processor = unified().use(remarkParse).use(remarkGfm);

/** Pure parse of one answer string. Exposed for tests; callers use the cache. */
export function parseAnswerBlocks(answer: string): ParsedBlock[] {
  if (!MAYBE_BLOCK.test(answer)) return [];
  const tree = processor.parse(answer) as Root;
  const found: ParsedBlock[] = [];

  // Depth-first over `children`, which is document order. Tables are leaves
  // for this walk: cells hold phrasing content only, never blocks.
  const walk = (node: RootContent | Root) => {
    if (node.type === "code") {
      found.push({
        kind: "code",
        language: node.lang ? node.lang : undefined,
        lines: node.value ? node.value.split("\n").length : 0,
        value: node.value,
        at: node.position?.start.offset ?? -1,
      });
      return;
    }
    if (node.type === "table") {
      found.push(tableBlock(node, answer));
      return;
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) walk(child as RootContent);
    }
  };
  walk(tree);
  return found.filter((b) => b.at >= 0);
}

function tableBlock(node: Table, answer: string): ParsedTable {
  const cells = (row: Table["children"][number]) =>
    row.children.map((cell) => mdastToString(cell).trim());
  const [head, ...body] = node.children;
  const start = node.position?.start.offset ?? -1;
  const end = node.position?.end.offset ?? start;
  return {
    kind: "table",
    header: head ? cells(head) : [],
    rows: body.map(cells),
    source: start >= 0 ? answer.slice(start, end) : "",
    at: start,
  };
}

// The collector runs during render, so a parser failure must never reach React.
const cache = new WeakMap<Message, ParsedBlock[]>();

/**
 * Blocks in a message's answer. Empty for user messages, non-string content,
 * `<think>`-only answers and anything the parser rejects (#24).
 */
export function blocksForMessage(message: Message): ParsedBlock[] {
  if (!message || typeof message !== "object") return [];
  if (message.role === "user" || typeof message.content !== "string") return [];
  const hit = cache.get(message);
  if (hit) return hit;
  let parsed: ParsedBlock[] = [];
  try {
    // Only the answer counts: `<think>` scratch work is excluded (§4).
    parsed = parseAnswerBlocks(splitThinkBlocks(message.content).answer);
  } catch {
    parsed = [];
  }
  cache.set(message, parsed);
  return parsed;
}

const LANGUAGE_NAMES: Record<string, string> = {
  bash: "Bash",
  c: "C",
  "c#": "C#",
  "c++": "C++",
  cpp: "C++",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  dockerfile: "Dockerfile",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  kotlin: "Kotlin",
  markdown: "Markdown",
  md: "Markdown",
  php: "PHP",
  py: "Python",
  python: "Python",
  r: "R",
  rb: "Ruby",
  ruby: "Ruby",
  rs: "Rust",
  rust: "Rust",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Zsh",
};

/** Display name for a fence tag: a known name, else the tag capitalized. */
export function languageName(language: string | undefined): string {
  if (!language) return "Code";
  const known = LANGUAGE_NAMES[language.toLowerCase()];
  if (known) return known;
  return language.charAt(0).toUpperCase() + language.slice(1);
}

export function codeLabel(block: ParsedCode): string {
  const lines = `${block.lines} ${block.lines === 1 ? "line" : "lines"}`;
  return `${languageName(block.language)} · ${lines}`;
}

export function tableLabel(block: ParsedTable): string {
  return `Table · ${block.rows.length} × ${block.header.length}`;
}
