import { Copy, Trash2, Check, Volume2, Square, ChevronDown, Pencil, Share2, RotateCcw } from "lucide-react";
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
import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from "react";
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
  /** Model state shared with the bottom composer, so edit uses the same selector. */
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  modelCatalog?: ModelCatalog | null;
  onShareExchange?: (format: "md") => void;
  onRetry?: () => void;
  /**
   * Queue a selected text snippet from this message in the composer when the
   * user highlights text and clicks the floating `Ask` button.
   */
  onUseAsContext?: (payload: ContextDropPayload) => void;
  /**
   * Keys (`contextPayloadKey`) of the artifacts already queued in the composer.
   */
  injectedContextKeys?: Set<string>;
  /**
   * Optional initial text selection for testing the floating `Ask` button in
   * server-rendered markup where `window.getSelection` is unavailable.
   */
  selectedText?: string;
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

// Keep ReactMarkdown's component types stable across ChatMessage state updates.
// In particular, updating the selection popup must not replace Markdown text
// nodes: the browser's live Selection is anchored to those nodes while dragging.
const CodeBlock = ({ children, at }: { children?: ReactNode; at?: number }) => {
  const [codeCopied, setCodeCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const { toast } = useToast();

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

  return (
    <div className="msg-codeblock group/code" data-artifact-at={at}>
      <pre ref={preRef} className="msg-codeblock-pre">
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
  h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
  p: ({ children }) => <p className="md-p">{children}</p>,
  ul: ({ children }) => <ul className="md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="md-ol">{children}</ol>,
  li: ({ children }) => <li className="md-li">{children}</li>,
  strong: ({ children }) => <strong className="md-strong">{children}</strong>,
  em: ({ children }) => <em className="md-em">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="md-a">
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ className, children }) => {
    const text = String(children ?? "");
    const isBlock = /language-/.test(className || "") || text.includes("\n");
    return isBlock ? (
      <code className="md-code-block">{children}</code>
    ) : (
      <code className="md-code-inline">{children}</code>
    );
  },
  table: ({ children }) => (
    <div className="md-table-wrap">
      <div className="md-table-scroll">
        <table className="md-table">{children}</table>
      </div>
    </div>
  ),
  th: ({ children }) => <th className="md-th">{children}</th>,
  td: ({ children }) => <td className="md-td">{children}</td>,
  img: ({ src, alt }) => <img src={src} alt={alt ?? ""} className="md-img" />,
};

// Answer artifacts need stable renderer functions too, while carrying source
// offsets so code blocks and tables locate the exact response artifact.
const answerComponents: Components = {
  ...markdownComponents,
  pre: ({ node, children }) => <CodeBlock at={node?.position?.start.offset}>{children}</CodeBlock>,
  table: ({ node, children }) => (
    <div className="md-table-wrap" data-artifact-at={node?.position?.start.offset}>
      <div className="md-table-scroll">
        <table className="md-table">{children}</table>
      </div>
    </div>
  ),
};

export const ChatMessage = ({ role, content, isStreaming, model, image, imagePath, editedFrom, compacted, messageIndex, conversationId, searchMatch, searchActive, onCopy, onDelete, onEdit, selectedModel, onModelChange, modelCatalog, onShareExchange, onRetry, onUseAsContext, selectedText }: ChatMessageProps) => {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ttsState, setTtsState] = useState<"idle" | "loading" | "playing">("idle");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<{
    text: string;
    top: number;
    left: number;
    at?: number;
  } | null>(() =>
    selectedText?.trim()
      ? { text: selectedText.trim(), top: 0, left: 48 }
      : null
  );
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

  const buildTextPayload = (rawText?: string, at?: number): ContextTextPayload | null => {
    const clean = (rawText ?? stripImageMarker(stripThinkBlocks(content))).trim();
    if (!clean) return null;
    const firstLine = clean.split("\n")[0]?.trim().slice(0, 36) || "Message";
    // highlightText must match the *rendered* plain text, not the raw markdown,
    // otherwise locating a bold/list/table snippet would never find its highlight.
    const plainForHighlight = rawText
      ? rawText.trim().slice(0, 120)
      : stripMarkdownForSpeech(clean).trim().slice(0, 120) || clean.slice(0, 120);
    return {
      kind: "text",
      text: clean,
      label: firstLine.length < clean.length ? `${firstLine}…` : firstLine,
      ...(sourceBase
        ? {
            source: {
              ...sourceBase,
              ...(typeof at === "number" ? { at } : {}),
              highlightText: plainForHighlight,
            },
          }
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
   * Text the user has selected inside this message, or `""` when the selection
   * is elsewhere.
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

  /**
   * Update the floating `Ask` button position whenever text is selected inside
   * this message, matching the ChatGPT selection popover flow.
   */
  const updateSelectionPopup = useCallback(() => {
    if (typeof window === "undefined" || !onUseAsContext || isStreaming) {
      setSelectionPopup(null);
      return;
    }
    const root = messageContainerRef.current;
    const selection = window.getSelection?.();
    if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      setSelectionPopup(null);
      return;
    }
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    if (!anchor || !focus || !root.contains(anchor) || !root.contains(focus)) {
      setSelectionPopup(null);
      return;
    }
    const anchorEl = anchor instanceof HTMLElement ? anchor : anchor.parentElement;
    if (anchorEl?.closest("textarea, input, button")) {
      setSelectionPopup(null);
      return;
    }
    const text = selection.toString().trim();
    if (!text) {
      setSelectionPopup(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setSelectionPopup(null);
      return;
    }
    const blockEl = anchorEl?.closest<HTMLElement>("[data-artifact-at]");
    const rawAt = blockEl?.dataset.artifactAt;
    const at = rawAt !== undefined && rawAt !== "" ? Number(rawAt) : undefined;
    const top = Math.max(0, rect.top - rootRect.top - 8);
    const rawLeft = rect.left - rootRect.left + rect.width / 2;
    const left =
      rootRect.width > 0
        ? Math.min(Math.max(36, rawLeft), Math.max(36, rootRect.width - 36))
        : rawLeft;
    setSelectionPopup({
      text,
      top,
      left,
      ...(Number.isFinite(at) ? { at } : {}),
    });
  }, [isStreaming, onUseAsContext]);

  useEffect(() => {
    if (typeof document === "undefined" || !onUseAsContext) return;
    const handleSelectionChange = () => updateSelectionPopup();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [onUseAsContext, updateSelectionPopup]);

  const handleAskSelection = () => {
    if (!selectionPopup || !onUseAsContext) return;
    const payload = buildTextPayload(selectionPopup.text, selectionPopup.at);
    if (payload) {
      onUseAsContext(payload);
    }
    setSelectionPopup(null);
    if (typeof window !== "undefined") {
      window.getSelection?.()?.removeAllRanges();
      document.getElementById("chat-message-input")?.focus();
    }
  };

  /**
   * Native drag of a text selection inside the message: attaches provenance so
   * dropping selected text into the Contexts panel keeps its `→` locate source.
   */
  const handleSelectedTextDragStart = (e: React.DragEvent) => {
    const selected = readSelectedText();
    if (!selected) return;
    const payload = buildTextPayload(selected);
    if (!payload) return;
    e.dataTransfer.setData(CONTEXT_DRAG_MIME, encodeContextDragPayload(payload));
    e.dataTransfer.setData("text/plain", payload.text);
    try {
      e.dataTransfer.effectAllowed = "copy";
    } catch {
      // Ignore browsers that disallow setting effectAllowed.
    }
  };

  const askPopover =
    selectionPopup && onUseAsContext && !isStreaming ? (
      <button
        type="button"
        className="msg-selection-ask-btn"
        style={{
          top: `${selectionPopup.top}px`,
          left: `${selectionPopup.left}px`,
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={handleAskSelection}
        title="Ask about selected text"
        aria-label="Ask about selected text"
      >
        Ask
      </button>
    ) : null;

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
          onMouseUp={updateSelectionPopup}
          onKeyUp={updateSelectionPopup}
          onTouchEnd={updateSelectionPopup}
        >
          {askPopover}
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
                  onDragStart={handleSelectedTextDragStart}
                >
                  {content}
                </div>
              </div>
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
          onMouseUp={updateSelectionPopup}
          onKeyUp={updateSelectionPopup}
          onTouchEnd={updateSelectionPopup}
        >
          {askPopover}
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
            <div
              className="msg-answer"
              data-search-text
              onDragStart={handleSelectedTextDragStart}
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
            {!isStreaming && (
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
