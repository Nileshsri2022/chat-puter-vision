// File names, CSV and clipboard formats for text artifacts.
//
// Model output is untrusted. CSV cells a spreadsheet would evaluate are
// neutralized, and the clipboard's HTML table is built from escaped text:
// nothing here renders model output as markup.

import type { TextArtifact } from "./artifacts";
import { copyToClipboard, downloadBlob } from "./utils/export";

const EXTENSIONS: Record<string, string> = {
  bash: "sh",
  c: "c",
  "c#": "cs",
  "c++": "cpp",
  cpp: "cpp",
  cs: "cs",
  csharp: "cs",
  css: "css",
  csv: "csv",
  dart: "dart",
  diff: "diff",
  go: "go",
  golang: "go",
  graphql: "graphql",
  html: "html",
  ini: "ini",
  java: "java",
  javascript: "js",
  js: "js",
  json: "json",
  jsx: "jsx",
  kotlin: "kt",
  kt: "kt",
  lua: "lua",
  markdown: "md",
  md: "md",
  php: "php",
  powershell: "ps1",
  ps1: "ps1",
  py: "py",
  python: "py",
  r: "r",
  rb: "rb",
  ruby: "rb",
  rs: "rs",
  rust: "rs",
  scala: "scala",
  scss: "scss",
  sh: "sh",
  shell: "sh",
  sql: "sql",
  swift: "swift",
  toml: "toml",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  xml: "xml",
  yaml: "yaml",
  yml: "yml",
  zsh: "sh",
};

/** File extension for a fence's language tag; anything unknown is `txt`. */
export function extensionFor(language?: string): string {
  const tag = typeof language === "string" ? language.trim().toLowerCase() : "";
  return (tag && EXTENSIONS[tag]) || "txt";
}

/** 1-based position among the message's blocks of the same kind (from the id). */
function ordinalOf(artifact: TextArtifact): number {
  const n = Number(artifact.id.split(":").pop());
  return Number.isInteger(n) && n >= 0 ? n + 1 : 1;
}

/**
 * Download name: `snippet-<msg>-<n>.<ext>` for code, `table-<msg>-<n>.csv` for
 * a table. `<msg>` is the 1-based message number the row shows.
 */
export function textArtifactFilename(artifact: TextArtifact): string {
  const msg = artifact.messageIndex + 1;
  const n = ordinalOf(artifact);
  return artifact.kind === "table"
    ? `table-${msg}-${n}.csv`
    : `snippet-${msg}-${n}.${extensionFor(artifact.language)}`;
}

// A spreadsheet evaluates a cell that starts with one of these (OWASP CSV
// injection). A cell that is entirely a plain number is the only exemption:
// exempting every "-" followed by a digit would let `-2+3+cmd|…` through.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/** One RFC 4180 field: neutralized if a spreadsheet would run it, then quoted if it must be. */
export function csvField(value: string): string {
  const cell = FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** RFC 4180 CSV with CRLF line ends and a UTF-8 BOM, so Excel keeps "₹" intact. */
export function tableToCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvField).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** The `text/html` clipboard flavour of a table, from escaped cell text. */
export function tableToHtml(header: string[], rows: string[][]): string {
  const cells = (row: string[], tag: "th" | "td") =>
    row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join("");
  const body = rows.map((row) => `<tr>${cells(row, "td")}</tr>`).join("");
  return `<table><thead><tr>${cells(header, "th")}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Copy a text artifact. A table goes on the clipboard as an HTML table plus its
 * Markdown in one item, so it pastes as a table into documents and as text
 * into editors; anything else (or a refused rich write) copies `text`.
 * Resolves to whether the clipboard accepted it (#45).
 */
export async function copyTextArtifact(artifact: TextArtifact): Promise<boolean> {
  if (artifact.kind === "table") {
    const clipboard =
      typeof navigator !== "undefined" ? (navigator.clipboard as Clipboard | undefined) : undefined;
    if (clipboard && typeof clipboard.write === "function" && typeof ClipboardItem !== "undefined") {
      try {
        await clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([tableToHtml(artifact.header, artifact.rows)], { type: "text/html" }),
            "text/plain": new Blob([artifact.text], { type: "text/plain" }),
          }),
        ]);
        return true;
      } catch {
        // Rich write refused (permissions, an unsupported flavour): fall back
        // to the Markdown as plain text below.
      }
    }
  }
  return copyToClipboard(artifact.text);
}

/** Download a text artifact: code as a source file, a table as CSV. */
export function downloadTextArtifact(artifact: TextArtifact): void {
  const blob =
    artifact.kind === "table"
      ? new Blob([tableToCsv(artifact.header, artifact.rows)], { type: "text/csv;charset=utf-8" })
      : new Blob([artifact.text], { type: "text/plain;charset=utf-8" });
  downloadBlob(textArtifactFilename(artifact), blob);
}
