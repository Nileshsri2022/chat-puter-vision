import { ArrowLeft, Copy, Trash2, Check, Volume2, Square, ChevronDown, Pencil, Share2, RotateCcw, GripVertical } from "lucide-react";
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
  contextPayloadKey,
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
  /** Model state shared with the bottom composer, so edit uses the same selector. */
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  modelCatalog?: ModelCatalog | null;
  onShareExchange?: (format: "md") => void;
  onRetry?: () => void;
  /**
   * Queue one artifact from this message — its text, a code block, a table, or
   * the generated image — directly in the composer as input context.
   */
  onUseAsContext?: (payload: ContextDropPayload) => void;
  /**
   * Keys (`contextPayloadKey`) of the artifacts already queued in the composer,
   * so the matching `←` control reads as pressed.
   */
  injectedContextKeys?: Set<string>;
}


/**
 * Grip that drags a message or block into the Contexts panel. The message
 * text itself must stay selectable, so only this handle — never the text —
 * carries the `draggable` attribute. (Making the whole bubble draggable
 * let the browser's drag gesture swallow every press-and-move, which made
 * text impossible to select or highlight.)
 */
const DragHandle = ({ onDragStart, label, className }: { onDragStart: (e: React.DragEvent) => void; label: string; className?: string }) => (
  <Button
    variant="ghost"
    size="sm"
    draggable
    onDragStart={onDragStart}
    className={cn("msg-drag-handle", className)}
    title="Drag to add as context"
    aria-label={`Drag ${label} to contexts panel`}
  >
    <GripVertical className="msg-action-icon" aria-hidden="true" />
  </Button>
);

/**
 * Left-arrow (`←`) artifact action: queue this exact block in the composer as
 * context. Matches the `← Inject into input` affordance in the Contexts panel,
 * and stays visibly pressed while the artifact is queued.
 */
const UseAsContextButton = ({
  active,
  onClick,
  label,
  className,
  iconClassName,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  className?: string;
  iconClassName?: string;
}) => (
  <Button
    variant="ghost"
    size="icon"
    onClick={onClick}
    className={cn(
      "msg-action-btn msg-context-action",
      active && "msg-context-action-active",
      className
    )}
    title={active ? `Remove ${label} from input context` : `Use ${label} as context`}
    aria-label={active ? `Remove ${label} from input context` : `Use ${label} as context`}
    aria-pressed={active}
  >
    <ArrowLeft className={cn("msg-action-icon", iconClassName)} aria-hidden="true" />
  </Button>
);

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

export const ChatMessage = ({ role, content, isStreaming, model, image, imagePath, editedFrom, compacted, messageIndex, conversationId, searchMatch, searchActive, onCopy, onDelete, onEdit, selectedModel, onModelChange, modelCatalog, onShareExchange, onRetry, onUseAsContext, injectedContextKeys }: ChatMessageProps) => {
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

  /** True when this artifact is already queued in the composer. */
  const isQueued = (payload: ContextDropPayload | null): boolean =>
    Boolean(payload && injectedContextKeys?.has(contextPayloadKey(payload)));

  // Payloads for the message-level and image-level `←` actions. `buildTextPayload`
  // strips thinking and attachment markers, so the button never queues metadata.
  // Skipped entirely when nothing can consume them (e.g. the streaming reply).
  const messagePayload = onUseAsContext ? buildTextPayload() : null;
  const messageQueued = isQueued(messagePayload);
  const imagePayload = onUseAsContext ? buildImagePayload() : null;
  const imageQueued = isQueued(imagePayload);

  /**
   * Text the user has selected inside this message, or `""` when the selection
   * is elsewhere. The message-level `←` queues exactly that snippet, so
   * "select text as context" does not silently send the whole answer.
   */
  const readSelectedText = (): string => {
    if (typeof window === "undefined") return "";
    const root = messageContainerRef.current;
    if (!root) return "";
    const selection = window.getSelection?.();
    const anchor = selection?.anchorNode ?? null;
    if (!selection || !anchor || !root.contains(anchor)) return "";
    return selection.toString().trim();
  };

  /** Message text, narrowed to the user's selection when there is one. */
  const readMessagePayloadForAction = (): ContextTextPayload | null => {
    const selected = readSelectedText();
    return buildTextPayload(selected || undefined) ?? messagePayload;
  };

  /**
   * Code as context: a selection inside the block when there is one, otherwise
   * the whole block. Shared by the drag handle and the `←` button so both send
   * the same text and provenance (`at` keeps the block locatable).
   */
  const readCodePayload = (
    pre: HTMLPreElement | null,
    at?: number
  ): ContextTextPayload | null => {
    if (!pre) return null;
    const codeEl = pre.querySelector("code");
    let selected = "";
    if (typeof window !== "undefined") {
      const selection = window.getSelection?.();
      const anchor = selection?.anchorNode ?? null;
      // Only our own selection counts; text selected elsewhere on the page
      // must not silently replace the block the user clicked.
      if (selection && anchor && pre.contains(anchor)) {
        selected = selection.toString().trim();
      }
    }
    const raw = selected || codeEl?.innerText || pre.innerText || "";
    const clean = raw.trim();
    if (!clean) return null;
    const firstLine = clean.split("\n")[0]?.trim().slice(0, 36) || "Code";
    let language: string | undefined;
    const cls = (codeEl as HTMLElement | null)?.className ?? "";
    const match = /language-([a-z0-9+-]+)/i.exec(cls);
    if (match) language = match[1].toLowerCase();
    return {
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
  };

  /**
   * Fills a drag event's payload for a context-drag handle. The custom
   * MIME type carries provenance for the Contexts panel; text/plain
   * serves drops into external apps.
   */
  const setContextDragData = (e: React.DragEvent, payload: ContextTextPayload) => {
    e.dataTransfer.setData(CONTEXT_DRAG_MIME, encodeContextDragPayload(payload));
    e.dataTransfer.setData("text/plain", payload.text);
    // Some browsers (Safari) require effectAllowed to be set.
    try {
      e.dataTransfer.effectAllowed = "copy";
    } catch {
      // Older browsers can refuse effectAllowed; not worth interrupting the drag.
    }
  };

  // Drag affordances live on the grip handles (DragHandle), never on
  // the text itself, so text stays selectable and highlightable.
  const handleMessageDragStart = (e: React.DragEvent) => {
    const payload = buildTextPayload();
    if (payload) setContextDragData(e, payload);
  };

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
      const payload = readCodePayload(preRef.current, at);
      if (payload) setContextDragData(e, payload);
    };

    // Read during render only when something is queued, so the arrow reflects
    // an existing selection; otherwise there is no DOM work to do.
    const codePayload = injectedContextKeys?.size
      ? readCodePayload(preRef.current, at)
      : null;
    const codeQueued = isQueued(codePayload);

    const handleUseCodeAsContext = () => {
      if (!onUseAsContext) return;
      const payload = readCodePayload(preRef.current, at);
      if (payload) onUseAsContext(payload);
    };

    return (
      <div className="msg-codeblock group/code" data-artifact-at={at}>
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
        {onUseAsContext && (
          <UseAsContextButton
            active={codeQueued}
            onClick={handleUseCodeAsContext}
            label="code block"
            className="msg-codeblock-context"
            iconClassName="msg-codeblock-copy-icon"
          />
        )}
        <DragHandle onDragStart={handleCodeDragStart} label="code block" className="msg-codeblock-drag" />
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
        <div className="md-table-scroll">
          <table className="md-table">{children}</table>
        </div>
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
  // context injection.
  const TableWrap = ({ at, children }: { at?: number; children: React.ReactNode }) => {
    const wrapRef = useRef<HTMLDivElement>(null);

    /** Rebuild a minimal Markdown table (keeping its pipe structure). */
    const readTablePayload = (): ContextTextPayload | null => {
      const wrap = wrapRef.current;
      if (!wrap) return null;
      let text = "";
      // Rebuild from the rendered DOM so the context keeps the structure
      // (| col | col |) instead of a flat string.
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
      const clean = text.trim();
      if (!clean) return null;
      const firstLine = clean.split("\n")[0]?.trim().slice(0, 36) || "Table";
      return {
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
    };

    const handleTableDragStart = (e: React.DragEvent) => {
      const payload = readTablePayload();
      if (payload) setContextDragData(e, payload);
    };

    const tablePayload = injectedContextKeys?.size ? readTablePayload() : null;
    const tableQueued = isQueued(tablePayload);

    const handleUseTableAsContext = () => {
      if (!onUseAsContext) return;
      const payload = readTablePayload();
      if (payload) onUseAsContext(payload);
    };

    const tableActionLabel = tableQueued
      ? "Remove table from input context"
      : "Use table as context";

    return (
      <div
        ref={wrapRef}
        className="md-table-wrap"
        data-artifact-at={at}
      >
        <div className="md-table-bar">
          <DragHandle onDragStart={handleTableDragStart} label="table" />
          {onUseAsContext ? (
            <button
              type="button"
              className={cn(
                "md-table-context-btn",
                tableQueued && "md-table-context-btn-active"
              )}
              onClick={handleUseTableAsContext}
              title={tableActionLabel}
              aria-label={tableActionLabel}
              aria-pressed={tableQueued}
            >
              <ArrowLeft className="md-table-context-icon" aria-hidden="true" />
              {tableQueued ? "In input context" : "Use as context"}
            </button>
          ) : (
            <span>Drag to add as context</span>
          )}
        </div>
        <div className="md-table-scroll">
          <table className="md-table">{children}</table>
        </div>
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
                <div className="msg-user-bubble" data-search-text>
                  {content}
                </div>
              </div>
              <div className="msg-user-actions">
                <DragHandle onDragStart={handleMessageDragStart} label="message" />
                {onUseAsContext && messagePayload && (
                  <UseAsContextButton
                    active={messageQueued}
                    onClick={() => {
                      const payload = readMessagePayloadForAction();
                      if (payload) onUseAsContext(payload);
                    }}
                    label="message"
                  />
                )}
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
              </div>
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
              <div className="msg-image-wrap">
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
                {/* `←` on the image itself: queue it as the next turn's input
                    context without opening the Contexts panel. */}
                {onUseAsContext && imagePayload && (
                  <UseAsContextButton
                    active={imageQueued}
                    onClick={() => {
                      const payload = buildImagePayload();
                      if (payload) onUseAsContext(payload);
                    }}
                    label="image"
                    className="msg-image-context"
                  />
                )}
              </div>
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
            <div className="msg-answer" data-search-text>
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
            {!isStreaming && (
              <div className="msg-actions">
                <DragHandle onDragStart={handleMessageDragStart} label="answer" />
                {onUseAsContext && messagePayload && (
                  <UseAsContextButton
                    active={messageQueued}
                    onClick={() => {
                      const payload = readMessagePayloadForAction();
                      if (payload) onUseAsContext(payload);
                    }}
                    label="answer"
                  />
                )}
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
