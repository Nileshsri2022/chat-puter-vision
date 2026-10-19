import { Copy, Trash2, Check, Volume2, Square, ChevronDown, Pencil, Share2, RotateCcw, FolderPlus } from "lucide-react";
import { ImageLightbox } from "./ImageLightbox";
import { cn } from "@/lib/utils";
import { ChatInput } from "./ChatInput";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { modelDisplayName } from "./ModelSelector";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { copyToClipboard } from "@/lib/utils/export";
import { checkAuthStatus } from "@/lib/backend";
import { synthesizeSpeech, stripMarkdownForSpeech, stopAllSpeech, setCurrentSpeech } from "@/lib/tts";
import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { usePuterImage } from "@/hooks/usePuterImage";
import type { EditedFrom } from "@/lib/backend";
import type { ModelCatalog } from "@/lib/models";
import { splitThinkBlocks, stripThinkBlocks } from "@/lib/streamingHandler";
import { stripImageMarker } from "@/lib/attachments";
import {
  CONTEXT_DRAG_MIME,
  encodeContextDragPayload,
  type ContextDropPayload,
} from "@/lib/contextGroups";

/** The text-shaped members of a context payload (everything but images). */
type ContextTextPayload = Extract<ContextDropPayload, { text: string }>;
/** The image-shaped member of a context payload. */
type ContextImagePayload = Extract<ContextDropPayload, { kind: "image" }>;
import "./ChatMessage.css";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  model?: string;
  image?: string;
  /** Puter path of a generated image; loaded from Puter storage for display. */
  imagePath?: string;
  /**
   * Set when this image was produced by editing an earlier one. The caption
   * tells the reader the picture is an edit, not a fresh generation.
   */
  editedFrom?: EditedFrom;
  /** The model summarized earlier turns to produce this reply. */
  compacted?: boolean;
  /** Position in the transcript; tags the node for in-conversation search. */
  messageIndex?: number;
  /** Conversation ID for context source provenance (`→` jump to source). */
  conversationId?: string;
  /** In-conversation search: this message contains the query. */
  searchMatch?: boolean;
  /** In-conversation search: this is the match the finder is sitting on. */
  searchActive?: boolean;
  onCopy?: (content: string) => void;
  onDelete?: () => void;
  onEdit?: (content: string, images?: File[], model?: string) => void;
  /** Add this message or image into the active Context Group. */
  onAddToContext?: (payload: ContextDropPayload) => void;
  /** Model state shared with the bottom composer, so edit uses the same selector. */
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  modelCatalog?: ModelCatalog | null;
  onShareExchange?: (format: "md") => void;
  onRetry?: () => void;
}


/** Sparkle-in-rounded-square glyph for the thinking section, DeepSeek-style. */
const ThoughtIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="5.5" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 7.2l1.7 4.1 4.1 1.7-4.1 1.7-1.7 4.1-1.7-4.1-4.1-1.7 4.1-1.7z"
      fill="currentColor"
    />
  </svg>
);

export const ChatMessage = ({ role, content, isStreaming, model, image, imagePath, editedFrom, compacted, messageIndex, conversationId, searchMatch, searchActive, onCopy, onDelete, onEdit, onAddToContext, selectedModel, onModelChange, modelCatalog, onShareExchange, onRetry }: ChatMessageProps) => {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ttsState, setTtsState] = useState<"idle" | "loading" | "playing">("idle");
  const [previewOpen, setPreviewOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();
  const { src: imageSrc, failed: imageFailed } = usePuterImage(imagePath, image);
  const messageContainerRef = useRef<HTMLDivElement>(null);

  const speakable = !isUser && stripMarkdownForSpeech(content).trim().length > 0;

  const resetSpeech = () => {
    audioRef.current = null;
    setCurrentSpeech(null);
    setTtsState("idle");
  };

  const handleSpeak = async () => {
    if (ttsState === "playing") {
      // Reset directly: pause() may not fire onpause when nothing is
      // actually playing (e.g. play() was rejected), so don't rely on it.
      const audio = audioRef.current;
      resetSpeech();
      audio?.pause();
      return;
    }
    if (ttsState === "loading") return;
    if (!checkAuthStatus()) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to use read-aloud.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    stopAllSpeech();
    setTtsState("loading");
    try {
      const audio = await synthesizeSpeech(stripMarkdownForSpeech(content));
      audioRef.current = audio;
      setCurrentSpeech(audio);
      audio.onended = resetSpeech;
      audio.onpause = resetSpeech; // stop() or another message taking over
      setTtsState("playing");
      await audio.play();
    } catch (error) {
      resetSpeech();
      toast({
        title: "Read-aloud failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  // Reasoning models (e.g. DeepSeek R1) wrap chain-of-thought in
  // <think>...</think>; render it as a collapsible section like DeepSeek's app.
  const { thinking, answer, thinkingOpen } = useMemo(
    () => (isUser ? { thinking: "", answer: content, thinkingOpen: false } : splitThinkBlocks(content)),
    [content, isUser]
  );

  // "Thought for N seconds": measure from first thinking chunk to block close.
  const thinkStartRef = useRef<number | null>(null);
  const [thinkSecs, setThinkSecs] = useState<number | null>(null);
  useEffect(() => {
    const hasThinking = thinking.length > 0 || thinkingOpen;
    if (hasThinking && thinkStartRef.current === null) thinkStartRef.current = Date.now();
    if (hasThinking && !thinkingOpen && thinkStartRef.current !== null) {
      setThinkSecs(Math.max(1, Math.round((Date.now() - thinkStartRef.current) / 1000)));
      thinkStartRef.current = null;
    }
  }, [thinking, thinkingOpen]);
  const [showThinking, setShowThinking] = useState(true);

  const handleCopy = async () => {
    if (onCopy) {
      onCopy(stripThinkBlocks(content));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getModelDisplayName = (modelId?: string) => modelDisplayName(modelId);

  const sourceBase =
    conversationId && typeof messageIndex === "number"
      ? { conversationId, messageIndex }
      : undefined;

  const buildTextPayload = (rawText?: string): ContextTextPayload | null => {
    const clean = (rawText ?? stripImageMarker(stripThinkBlocks(content))).trim();
    if (!clean) return null;
    const firstLine = clean.split("\n")[0]?.trim().slice(0, 36) || "Message";
    // highlightText must match the *rendered* plain text, not the raw markdown,
    // otherwise locating a bold/list/table snippet would never find its highlight
    // (for example "**Factoring**" renders as "Factoring", and a list dash
    // before "searching" is not part of the text node).
    const plainForHighlight = rawText
      ? rawText.trim().slice(0, 120)
      : stripMarkdownForSpeech(clean).trim().slice(0, 120) || clean.slice(0, 120);
    return {
      kind: "text",
      text: clean,
      label: firstLine.length < clean.length ? `${firstLine}…` : firstLine,
      ...(sourceBase
        ? { source: { ...sourceBase, highlightText: plainForHighlight } }
        : {}),
    };
  };

  const buildImagePayload = (): ContextImagePayload | null => {
    if (imagePath) {
      return {
        kind: "image",
        ref: imagePath,
        refKind: "drive",
        origin: "generated",
        label: "Generated image",
        ...(sourceBase ? { source: sourceBase } : {}),
      };
    }
    if (image && image.startsWith("data:")) {
      return {
        kind: "image",
        ref: image,
        refKind: "data",
        origin: "generated",
        label: "Generated image",
        ...(sourceBase ? { source: sourceBase } : {}),
      };
    }
    return null;
  };

  /**
   * The part of the current window selection that sits inside this message,
   * or "" when there is none. Used both by the add-to-context button and by
   * its label, so the control tells the user exactly what it will add.
   */
  const selectionInMessage = (): string => {
    const sel = typeof window !== "undefined" ? window.getSelection?.() : null;
    const raw = sel?.toString().trim() ?? "";
    if (!raw) return "";
    const container = messageContainerRef.current;
    if (!container) return "";
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const common = range?.commonAncestorContainer ?? null;
    if (!common) return "";
    let node: Node | null = common;
    while (node) {
      if (node === container) return raw;
      node = node.parentNode;
    }
    // Selection ends outside this message: still accept it when the message
    // visibly contains the highlighted words (a drag can extend a few chars
    // past the bubble without changing what the user meant).
    const probe = raw.slice(0, 40).replace(/\s+/g, " ");
    const visible = (container.textContent ?? "").replace(/\s+/g, " ");
    return probe && visible.includes(probe) ? raw : "";
  };

  // Pressing a button can collapse the selection before `click` runs (Firefox
  // and some Chrome paths do), so snapshot the snippet on mousedown.
  const pendingSelectionRef = useRef("");

  const handleAddMessageToContext = () => {
    if (!onAddToContext) return;
    // A text selection wins: the user highlighted something, so add exactly
    // that snippet (with its source, so → can jump back to it) instead of the
    // whole message.
    const selected = selectionInMessage() || pendingSelectionRef.current;
    pendingSelectionRef.current = "";
    const imgPayload = buildImagePayload();
    if (selected) {
      const selPayload = buildTextPayload(selected);
      if (selPayload) {
        onAddToContext(selPayload);
        // Clear the selection so a second click doesn't re-add the same snippet.
        try {
          window.getSelection?.()?.removeAllRanges();
        } catch {
          // Nothing to clear.
        }
        setSelectionActive(false);
        return;
      }
    }
    if (imgPayload) onAddToContext(imgPayload);
    const txtPayload = buildTextPayload();
    if (txtPayload) onAddToContext(txtPayload);
  };

  // Track whether the live selection is inside this message, so the button can
  // say "Add selected text to context" and light up while it applies.
  const [selectionActive, setSelectionActive] = useState(false);
  const [selectionPreview, setSelectionPreview] = useState("");
  useEffect(() => {
    const read = () => {
      const text = selectionInMessage();
      setSelectionActive(Boolean(text));
      setSelectionPreview(text.split("\n")[0]?.slice(0, 40) ?? "");
    };
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
    // The listener only re-reads the DOM through a stable ref, so mounting it
    // once is correct: a new one per render would churn every message anyway.
  }, []);

  const addToContextLabel = selectionActive
    ? `Add selected text to context${selectionPreview ? `: “${selectionPreview}”` : ""}`
    : "Add message to context";

  // Markdown rendering via react-markdown + remark-gfm (tables, task lists,
  // nested lists). Raw HTML in model output is escaped by default, so a
  // response can never inject markup/scripts.
  // `at`: the block's offset in the answer, stamped for the artifacts panel's
  // block-level locate (see answerComponents below).
  const CodeBlock = ({ children, at }: { children?: ReactNode; at?: number }) => {
    const [codeCopied, setCodeCopied] = useState(false);
    const preRef = useRef<HTMLPreElement>(null);

    // Honest copy (#45): only an accepted write earns the check mark.
    const handleCopyCode = async () => {
      const text = preRef.current?.querySelector("code")?.innerText ?? "";
      if (!(await copyToClipboard(text))) {
        toast({
          title: "Copy failed",
          description: "The clipboard rejected the request.",
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    };

    const handleCodeDragStart = (e: React.DragEvent) => {
      const selected = window.getSelection?.()?.toString().trim() ?? "";
      const raw =
        selected ||
        preRef.current?.querySelector("code")?.innerText ||
        preRef.current?.innerText ||
        "";
      const clean = raw.trim();
      if (!clean) return;
      const firstLine = clean.split("\n")[0]?.trim().slice(0, 36) || "Code";
      // Pull the language from the language-xxx class react-markdown emits.
      let language: string | undefined;
      try {
        const codeEl = preRef.current?.querySelector("code");
        const cls = (codeEl as HTMLElement | null)?.className ?? "";
        const m = /language-([a-z0-9+-]+)/i.exec(cls);
        if (m) language = m[1].toLowerCase();
      } catch {
        // No language class to read; send the code without one.
      }
      const payload: ContextDropPayload = {
        kind: "code",
        text: clean,
        label: `</> ${firstLine}`,
        ...(language ? { language } : {}),
        ...(sourceBase
          ? {
              source: {
                ...sourceBase,
                at,
                highlightText: stripMarkdownForSpeech(clean).slice(0, 80) || clean.slice(0, 80),
              },
            }
          : {}),
      };
      e.dataTransfer.setData(CONTEXT_DRAG_MIME, encodeContextDragPayload(payload));
      e.dataTransfer.setData("text/plain", clean);
      try {
        e.dataTransfer.effectAllowed = "copy";
      } catch {
        // Older browsers can refuse effectAllowed; not worth interrupting the drag.
      }
    };

    return (
      <div
        className="msg-codeblock group/code" data-artifact-at={at}
        draggable={!selectionActive}
        onDragStart={handleCodeDragStart}
      >
        <pre
          ref={preRef}
          className="msg-codeblock-pre"
        >
          {children}
        </pre>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopyCode}
          title="Copy code"
          className="msg-codeblock-copy"
        >
          {codeCopied ? (
            <Check className="msg-codeblock-copy-icon" />
          ) : (
            <Copy className="msg-codeblock-copy-icon" />
          )}
        </Button>
      </div>
    );
  };

  const markdownComponents: Components = {
    h1: ({ children }) => (
      <h1 className="md-h1">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="md-h2">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="md-h3">
        {children}
      </h3>
    ),
    p: ({ children }) => <p className="md-p">{children}</p>,
    ul: ({ children }) => (
      <ul className="md-ul">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="md-ol">{children}</ol>
    ),
    li: ({ children }) => <li className="md-li">{children}</li>,
    strong: ({ children }) => (
      <strong className="md-strong">{children}</strong>
    ),
    em: ({ children }) => <em className="md-em">{children}</em>,
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="md-a"
      >
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="md-blockquote">
        {children}
      </blockquote>
    ),
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    code: ({ className, children }) => {
      const text = String(children ?? "");
      const isBlock =
        /language-/.test(className || "") || text.includes("\n");
      if (!isBlock) {
        return (
          <code className="md-code-inline">
            {children}
          </code>
        );
      }
      return (
        <code className="md-code-block">{children}</code>
      );
    },
    table: ({ children }) => (
      <div className="md-table-wrap">
        <table className="md-table">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="md-th">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="md-td">{children}</td>
    ),
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt ?? ""}
        className="md-img"
      />
    ),
  };

  // Wrap a rendered table so it can be dragged into the Contexts panel as a
  // proper \"table\" item (with source.at for block-level locate). The text we
  // drag is the Markdown the artifacts panel extracts — but for the ad-hoc drag
  // we reconstruct a simple pipe table from the rendered cells; it's enough for
  // context injection and the row preview.
  const TableWrap = ({ at, children }: { at?: number; children: React.ReactNode }) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const handleTableDragStart = (e: React.DragEvent) => {
      const wrap = wrapRef.current;
      let text = "";
      if (wrap) {
        // Rebuild a minimal Markdown table from the rendered DOM so the context
        // keeps the structure (| col | col |) instead of a flat string.
        const table = wrap.querySelector("table");
        if (table) {
          const rows = Array.from(table.querySelectorAll("tr"));
          const mdRows = rows.map((tr) => {
            const cells = Array.from(tr.querySelectorAll("th, td")).map((c) =>
              (c.textContent ?? "").trim().replace(/\|/g, "\\|")
            );
            return `| ${cells.join(" | ")} |`;
          });
          if (mdRows.length >= 1) {
            const header = mdRows[0];
            const cols = header.split("|").length - 2;
            const sep = `| ${Array(cols).fill("---").join(" | ")} |`;
            mdRows.splice(1, 0, sep);
          }
          text = mdRows.join("\n");
        } else {
          text = wrap.innerText.trim();
        }
      }
      const clean = text.trim();
      if (!clean) return;
      const firstLine = clean.split("\n")[0]?.trim().slice(0, 36) || "Table";
      const payload: ContextDropPayload = {
        kind: "table",
        text: clean,
        label: `▦ ${firstLine}`,
        ...(sourceBase
          ? {
              source: {
                ...sourceBase,
                at,
                highlightText: clean.slice(0, 80),
              },
            }
          : {}),
      };
      e.dataTransfer.setData(CONTEXT_DRAG_MIME, encodeContextDragPayload(payload));
      e.dataTransfer.setData("text/plain", clean);
      try {
        e.dataTransfer.effectAllowed = "copy";
      } catch {
        // Older browsers can refuse effectAllowed; not worth interrupting the drag.
      }
    };
    return (
      <div
        ref={wrapRef}
        className="md-table-wrap"
        data-artifact-at={at}
        draggable
        onDragStart={handleTableDragStart}
      >
        <table className="md-table">{children}</table>
      </div>
    );
  };

  // The answer stamps each code block and table with its offset in `answer`
  // (`data-artifact-at`), matching what lib/artifactBlocks.ts computes, so
  // the artifacts panel can locate one block rather than the whole message.
  // Thinking renders a different string through `markdownComponents`, so
  // its offsets would collide; it stays unstamped.
  const answerComponents: Components = {
    ...markdownComponents,
    pre: ({ node, children }) => <CodeBlock at={node?.position?.start.offset}>{children}</CodeBlock>,
    table: ({ node, children }) => (
      <TableWrap at={node?.position?.start.offset}>{children}</TableWrap>
    ),
  };

  return (
    <>
      {isUser ? (
        <div
          ref={messageContainerRef}
          className={cn(
            "msg-user-col",
            searchMatch && "msg-search-match",
            searchActive && "msg-search-match-active"
          )}
          data-message-index={messageIndex}
        >
          {editing ? (
            <ChatInput
              initialValue={stripImageMarker(content)}
              compact
              disabled={isStreaming}
              selectedModel={selectedModel}
              onModelChange={onModelChange}
              modelCatalog={modelCatalog}
              onCancel={() => setEditing(false)}
              onSend={(text, sendModel, images) => {
                if (onEdit) onEdit(text, images, sendModel);
                setEditing(false);
              }}
            />
          ) : (
            <>
              <div className="msg-user-row">
                {/* `data-search-text` tags the regions in-conversation search
                    scans — see lib/utils/highlight.ts. */}
                <div
                  className="msg-user-bubble"
                  data-search-text
                  draggable={!selectionActive}
                  onDragStart={(e) => {
                    const selected = window.getSelection?.()?.toString()?.trim();
                    const payload = buildTextPayload(selected || undefined);
                    if (payload) {
                      e.dataTransfer.setData(
                        CONTEXT_DRAG_MIME,
                        encodeContextDragPayload(payload)
                      );
                      e.dataTransfer.setData("text/plain", payload.text);
                      try {
        e.dataTransfer.effectAllowed = "copy";
      } catch {
        // Older browsers can refuse effectAllowed; not worth interrupting the drag.
      }
                    }
                  }}
                >
                  {content}
                </div>
              </div>
              {(onCopy || onEdit || onAddToContext) && (
                <div className="msg-user-actions">
                  {onCopy && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopy}
                      className="msg-action-btn"
                      title="Copy message"
                      aria-label="Copy message"
                    >
                      <Copy className="msg-action-icon" aria-hidden="true" />
                    </Button>
                  )}
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing(true)}
                      className="msg-action-btn"
                      title="Edit message"
                      aria-label="Edit message"
                    >
                      <Pencil className="msg-action-icon" aria-hidden="true" />
                    </Button>
                  )}
                  {onAddToContext && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleAddMessageToContext}
                      onMouseDown={() => {
                        pendingSelectionRef.current = selectionInMessage();
                      }}
                      className={cn("msg-action-btn", selectionActive && "msg-action-btn-selected")}
                      title={addToContextLabel}
                      aria-label={addToContextLabel}
                    >
                      <FolderPlus className="msg-action-icon" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div
          ref={messageContainerRef}
          className={cn(
            "msg-row group",
            searchMatch && "msg-search-match",
            searchActive && "msg-search-match-active"
          )}
          data-message-index={messageIndex}
        >
          <div className="msg-inner">
            <div className="msg-model-label">
              {isStreaming ? "Thinking…" : getModelDisplayName(model)}
            </div>
            {(imagePath || image) && !imageSrc && (
              <div className="msg-image-status" role="status">
                {imageFailed ? "Image unavailable." : "Loading image…"}
              </div>
            )}
            {imageSrc && (
              <img
                src={imageSrc}
                alt="Generated image"
                className="msg-image"
                loading="lazy"
                draggable
                onDragStart={(e) => {
                  const payload = buildImagePayload();
                  if (payload) {
                    e.dataTransfer.setData(
                      CONTEXT_DRAG_MIME,
                      encodeContextDragPayload(payload)
                    );
                  }
                }}
                role="button"
                tabIndex={0}
                title="Open image preview"
                aria-label="Open image preview"
                onClick={() => setPreviewOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setPreviewOpen(true);
                }}
              />
            )}
            {imageSrc && editedFrom && (
              <div className="msg-image-caption">
                {editedFrom.origin === "attachment"
                  ? "Edited from an attached image"
                  : "Edited from the previous image"}
              </div>
            )}
            {(thinking || thinkingOpen) && (
              <div className="msg-think-wrap">
                <button
                  type="button"
                  onClick={() => setShowThinking((v) => !v)}
                  aria-expanded={showThinking}
                  aria-label={showThinking ? "Hide thought process" : "Show thought process"}
                  className="msg-think-toggle"
                >
                  <ThoughtIcon className="msg-think-icon" />
                  {thinkingOpen
                    ? "Thinking…"
                    : thinkSecs !== null
                      ? `Thought for ${thinkSecs} second${thinkSecs === 1 ? "" : "s"}`
                      : "Thought process"}
                  <ChevronDown
                    className={cn("msg-think-chevron", !showThinking && "msg-think-chevron-collapsed")}
                    aria-hidden="true"
                  />
                </button>
                {showThinking && (
                  <div className="msg-think-body" data-search-text>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {thinking}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}
            <div
              className="msg-answer"
              data-search-text
              draggable={!selectionActive}
              onDragStart={(e) => {
                // Prefer the user's current selection when dragging from the
                // answer; fallback to the whole message (buildTextPayload handles it).
                const selected = window.getSelection?.()?.toString()?.trim();
                const payload = buildTextPayload(selected || undefined);
                if (payload) {
                  e.dataTransfer.setData(
                    CONTEXT_DRAG_MIME,
                    encodeContextDragPayload(payload)
                  );
                  // Also set plain text for external drops (e.g. dragging to
                  // another app) — but keep our custom MIME primary so
                  // ContextsPanel's drop handler can pick up provenance.
                  e.dataTransfer.setData("text/plain", payload.text);
                  // Some browsers (Safari) require effectAllowed to be set.
                  try {
        e.dataTransfer.effectAllowed = "copy";
      } catch {
        // Older browsers can refuse effectAllowed; not worth interrupting the drag.
      }
                }
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={answerComponents}
              >
                {answer}
              </ReactMarkdown>
            </div>
            {compacted && !isStreaming && (
              <div className="msg-compaction-note" role="note">
                Earlier messages in this chat were summarized to keep the model&apos;s memory of the conversation.
              </div>
            )}
            {isStreaming && content.length === 0 && (
              <div className="msg-typing" aria-live="polite" aria-label="Thinking">
                <div className="msg-typing-dot" />
                <div className="msg-typing-dot" style={{ animationDelay: "150ms" }} />
                <div className="msg-typing-dot" style={{ animationDelay: "300ms" }} />
              </div>
            )}
            {!isStreaming && (speakable || onCopy || onDelete || onShareExchange || onRetry || onAddToContext) && (
              <div className="msg-actions">
                {speakable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSpeak}
                    disabled={ttsState === "loading"}
                    className="msg-action-btn"
                    title={ttsState === "playing" ? "Stop reading" : "Read aloud"}
                    aria-label={ttsState === "playing" ? "Stop reading" : "Read aloud"}
                  >
                    {ttsState === "loading" ? (
                      <div className="msg-action-spinner" aria-hidden="true" />
                    ) : ttsState === "playing" ? (
                      <Square className="msg-action-icon" aria-hidden="true" />
                    ) : (
                      <Volume2 className="msg-action-icon" aria-hidden="true" />
                    )}
                  </Button>
                )}
                {onCopy && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="msg-action-btn"
                    title={copied ? "Copied" : "Copy message"}
                    aria-label={copied ? "Copied" : "Copy message"}
                  >
                    {copied ? <Check className="msg-action-icon" aria-hidden="true" /> : <Copy className="msg-action-icon" aria-hidden="true" />}
                  </Button>
                )}
                {onAddToContext && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddMessageToContext}
                    onMouseDown={() => {
                      pendingSelectionRef.current = selectionInMessage();
                    }}
                    className={cn("msg-action-btn", selectionActive && "msg-action-btn-selected")}
                    title={addToContextLabel}
                    aria-label={addToContextLabel}
                  >
                    <FolderPlus className="msg-action-icon" aria-hidden="true" />
                  </Button>
                )}
                {onRetry && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRetry}
                    className="msg-action-btn"
                    title="Retry this answer"
                    aria-label="Retry this answer"
                  >
                    <RotateCcw className="msg-action-icon" aria-hidden="true" />
                  </Button>
                )}
                {onShareExchange && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="msg-action-btn"
                        title="Share this answer"
                        aria-label="Share this answer"
                      >
                        <Share2 className="msg-action-icon" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => onShareExchange("md")}>
                        Export as Markdown
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDelete}
                    className="msg-action-btn-danger"
                    title="Delete message"
                    aria-label="Delete message"
                  >
                    <Trash2 className="msg-action-icon" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Only while open, and only with a URL: `imageSrc` is null until the
          Drive read lands, and rendering the overlay against that null is what
          put a broken "Image preview" over the app on first paint. */}
      {previewOpen && imageSrc && (
        <ImageLightbox
          src={imageSrc}
          alt="Image preview"
          onClose={() => setPreviewOpen(false)}
        />
      )}

    </>
  );
};
