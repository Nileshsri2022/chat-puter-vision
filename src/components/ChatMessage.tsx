import { Copy, Trash2, Check, Volume2, Square, ChevronDown } from "lucide-react";
import { AIModel, CLAUDE_MODELS, MISTRAL_MODELS, PERPLEXITY_MODELS, GROK_MODELS, KIMI_MODELS, OPENAI_MODELS, OPENROUTER_MODELS } from "./ModelSelector";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { copyToClipboard } from "@/lib/utils/export";
import { checkAuthStatus } from "@/lib/backend";
import { synthesizeSpeech, stripMarkdownForSpeech, stopAllSpeech, setCurrentSpeech } from "@/lib/tts";
import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { splitThinkBlocks, stripThinkBlocks } from "@/lib/streamingHandler";
import "./ChatMessage.css";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  model?: string;
  image?: string;
  onCopy?: (content: string) => void;
  onDelete?: () => void;
}

const ALL_MODELS: AIModel[] = [...CLAUDE_MODELS, ...MISTRAL_MODELS, ...PERPLEXITY_MODELS, ...GROK_MODELS, ...KIMI_MODELS, ...OPENAI_MODELS, ...OPENROUTER_MODELS];

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

export const ChatMessage = ({ role, content, isStreaming, model, image, onCopy, onDelete }: ChatMessageProps) => {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [ttsState, setTtsState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

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

  const allModels: AIModel[] = ALL_MODELS;

  const getModelDisplayName = (modelId?: string) => {
    const foundModel = allModels.find(m => m.id === modelId);
    return foundModel ? foundModel.name : "AI";
  };

  // Markdown rendering via react-markdown + remark-gfm (tables, task lists,
  // nested lists). Raw HTML in model output is escaped by default, so a
  // response can never inject markup/scripts.
  const CodeBlock = ({ children }: { children?: ReactNode }) => {
    const [codeCopied, setCodeCopied] = useState(false);
    const preRef = useRef<HTMLPreElement>(null);

    const handleCopyCode = async () => {
      const text = preRef.current?.querySelector("code")?.innerText ?? "";
      await copyToClipboard(text);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    };

    return (
      <div className="msg-codeblock group/code">
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

  return (
    <>
      {isUser ? (
        <div className="msg-user-row">
          <div className="msg-user-bubble">
            {content}
          </div>
        </div>
      ) : (
        <div className="msg-row group">
          <div className="msg-inner">
            <div className="msg-model-label">
              {isStreaming ? "Thinking…" : getModelDisplayName(model)}
            </div>
            {image && (
              <img
                src={image}
                alt="Generated image"
                className="msg-image"
                loading="lazy"
              />
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
                    className={`msg-think-chevron ${showThinking ? "" : "msg-think-chevron-collapsed"}`}
                    aria-hidden="true"
                  />
                </button>
                {showThinking && (
                  <div className="msg-think-body">
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
            <div className="msg-answer">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {answer}
              </ReactMarkdown>
            </div>
            {isStreaming && content.length === 0 && (
              <div className="msg-typing" aria-live="polite" aria-label="Thinking">
                <div className="msg-typing-dot" />
                <div className="msg-typing-dot" style={{ animationDelay: "150ms" }} />
                <div className="msg-typing-dot" style={{ animationDelay: "300ms" }} />
              </div>
            )}
            {!isStreaming && (speakable || onCopy || onDelete) && (
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
                    {ttsState === "playing" ? "Stop" : ttsState === "loading" ? "Loading…" : "Read aloud"}
                  </Button>
                )}
                {onCopy && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="msg-action-btn"
                    aria-label={copied ? "Copied" : "Copy message"}
                  >
                    {copied ? <><Check className="msg-action-icon" aria-hidden="true" /> Copied</> : <><Copy className="msg-action-icon" aria-hidden="true" /> Copy</>}
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDelete}
                    className="msg-action-btn-danger"
                    aria-label="Delete message"
                  >
                    <Trash2 className="msg-action-icon" aria-hidden="true" /> Delete
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
