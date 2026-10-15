// Export formats for code and table artifacts (Phase 3, spec §6.3). Pure
// functions: the panel decides when to copy or download.

/** UTF-8 byte order mark, so Excel reads "₹" and other non-ASCII text correctly. */
const BOM = "\uFEFF";

/** Extension per fence tag. Anything not listed is `txt`. */
const EXTENSIONS: Record<string, string> = {
  bash: "sh",
  c: "c",
  "c++": "cpp",
  cpp: "cpp",
  cs: "cs",
  csharp: "cs",
  css: "css",
  diff: "diff",
  go: "go",
  html: "html",
  java: "java",
  javascript: "js",
  js: "js",
  json: "json",
  jsx: "jsx",
  kotlin: "kt",
  markdown: "md",
  md: "md",
  php: "php",
  py: "py",
  python: "py",
  rb: "rb",
  ruby: "rb",
  rs: "rs",
  rust: "rs",
  sh: "sh",
  shell: "sh",
  sql: "sql",
  swift: "swift",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "sh",
};

export function extensionFor(language: string | undefined): string {
  if (!language) return "txt";
  return EXTENSIONS[language.toLowerCase()] ?? "txt";
}

/** A cell that is entirely a plain number may start with a sign: "-12.5", "+3". */
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/**
 * Cells that a spreadsheet would run as a formula. Model output is untrusted,
 * so these are prefixed with an apostrophe (OWASP's CSV-injection guidance).
 */
function neutralize(cell: string): string {
  if (PLAIN_NUMBER.test(cell)) return cell;
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}

/** RFC 4180: quote fields with a quote, comma, CR or LF; double inner quotes. */
function csvField(cell: string): string {
  const safe = neutralize(cell);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CRLF line endings and a UTF-8 BOM. */
export function tableToCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvField).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Clipboard `text/html`. Every cell is escaped; model output is never markup. */
export function tableToHtml(header: string[], rows: string[][]): string {
  const cell = (tag: "th" | "td", text: string) => `<${tag}>${escapeHtml(text)}</${tag}>`;
  const head = `<tr>${header.map((h) => cell("th", h)).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c) => cell("td", c)).join("")}</tr>`).join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/** `snippet-<msg>-<n>.<ext>` for code, `table-<msg>-<n>.csv` for tables. */
export function artifactFileName(
  kind: "code" | "table",
  messageNumber: number,
  n: number,
  language?: string
): string {
  if (kind === "table") return `table-${messageNumber}-${n}.csv`;
  return `snippet-${messageNumber}-${n}.${extensionFor(language)}`;
}
