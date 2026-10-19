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

  const buildTextPayload = (rawText?: string): ContextDropPayload | null => {
    const clean = (rawText ?? stripImageMarker(stripThinkBlocks(content))).trim();
    if (!clean) return null;
    const firstLine = clean.split("\n")[0]?.trim().slice(0, 36) || "Message";
    return {
      kind: "text",
      text: clean,
      label: firstLine.length < clean.length ? `${firstLine}…` : firstLine,
      ...(sourceBase
        ? { source: { ...sourceBase, highlightText: clean.slice(0, 120) } }
        : {}),
    };
  };

  const buildImagePayload = (): ContextDropPayload | null => {
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

  const handleAddMessageToContext = () => {
    if (!onAddToContext) return;
    const imgPayload = buildImagePayload();
    if (imgPayload) onAddToContext(imgPayload);
    const txtPayload = buildTextPayload();
    if (txtPayload) onAddToContext(txtPayload);
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

  // The answer stamps each code block and table with its offset in `answer`
  // (`data-artifact-at`), matching what lib/artifactBlocks.ts computes, so
  // the artifacts panel can locate one block rather than the whole message.
  // Thinking renders a different string through `markdownComponents`, so
  // its offsets would collide; it stays unstamped.
  const answerComponents: Components = {
    ...markdownComponents,
    pre: ({ node, children }) => <CodeBlock at={node?.position?.start.offset}>{children}</CodeBlock>,
    table: ({ node, children }) => (
      <div className="md-table-wrap" data-artifact-at={node?.position?.start.offset}>
        <table className="md-table">{children}</table>
      </div>
    ),
  };

  return (
    <>
      {isUser ? (
        <div
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
                  draggable
                  onDragStart={(e) => {
                    const selected = window.getSelection?.()?.toString()?.trim();
                    const payload = buildTextPayload(selected || undefined);
                    if (payload) {
                      e.dataTransfer.setData(
                        CONTEXT_DRAG_MIME,
                        encodeContextDragPayload(payload)
                      );
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
                      className="msg-action-btn"
                      title="Add to context"
                      aria-label="Add message to context"
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
              onDragStart={(e) => {
                const selected = window.getSelection?.()?.toString()?.trim();
                const payload = buildTextPayload(selected || undefined);
                if (payload) {
                  e.dataTransfer.setData(
                    CONTEXT_DRAG_MIME,
                    encodeContextDragPayload(payload)
                  );
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
                    className="msg-action-btn"
                    title="Add to context"
                    aria-label="Add to context"
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
