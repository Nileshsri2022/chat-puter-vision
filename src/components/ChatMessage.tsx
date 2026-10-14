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
      <div className="group/code relative my-4">
        <pre
          ref={preRef}
          className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-sm text-foreground"
        >
          {children}
        </pre>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopyCode}
          title="Copy code"
          className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover/code:opacity-100"
        >
          {codeCopied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    );
  };

  const markdownComponents: Components = {
    h1: ({ children }) => (
      <h1 className="mb-4 mt-5 text-2xl font-bold text-foreground first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-4 mt-5 text-xl font-semibold text-foreground first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-3 mt-4 text-lg font-semibold text-foreground first:mt-0">
        {children}
      </h3>
    ),
    p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
    ul: ({ children }) => (
      <ul className="mb-4 list-disc pl-6">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-4 list-decimal pl-6">{children}</ol>
    ),
    li: ({ children }) => <li className="mb-1">{children}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => <em className="italic text-foreground">{children}</em>,
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline underline-offset-2"
      >
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-4 border-l-4 border-border pl-4 italic text-muted-foreground">
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
          <code className="rounded-md border bg-muted/70 px-2 py-1 font-mono text-sm text-foreground">
            {children}
          </code>
        );
      }
      return (
        <code className="font-mono text-[13px] leading-relaxed">{children}</code>
      );
    },
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-border bg-muted/50 px-3 py-2 text-left font-semibold">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-border px-3 py-2">{children}</td>
    ),
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt ?? ""}
        className="max-w-full rounded-lg border border-border"
      />
    ),
  };

  return (
    <>
      {isUser ? (
        <div className="flex justify-end px-4 py-2">
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-relaxed">
            {content}
          </div>
        </div>
      ) : (
        <div className="group px-4 py-2">
          <div className="mx-auto max-w-3xl">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              {isStreaming ? "Thinking…" : getModelDisplayName(model)}
            </div>
            {image && (
              <img
                src={image}
                alt="Generated image"
                className="mb-3 max-h-96 w-auto rounded-xl border border-border object-cover"
                loading="lazy"
              />
            )}
            {(thinking || thinkingOpen) && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setShowThinking((v) => !v)}
                  aria-expanded={showThinking}
                  aria-label={showThinking ? "Hide thought process" : "Show thought process"}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1 -mx-1"
                >
                  <ThoughtIcon className="h-4 w-4 text-blue-500" />
                  {thinkingOpen
                    ? "Thinking…"
                    : thinkSecs !== null
                      ? `Thought for ${thinkSecs} second${thinkSecs === 1 ? "" : "s"}`
                      : "Thought process"}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${showThinking ? "" : "-rotate-90"}`}
                    aria-hidden="true"
                  />
                </button>
                {showThinking && (
                  <div className="mt-1.5 border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
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
            <div className="break-words text-[15px] leading-relaxed text-foreground">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {answer}
              </ReactMarkdown>
            </div>
            {isStreaming && content.length === 0 && (
              <div className="flex gap-1 py-2" aria-live="polite" aria-label="Thinking">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
              </div>
            )}
            {!isStreaming && (speakable || onCopy || onDelete) && (
              <div className="mt-1 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                {speakable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSpeak}
                    disabled={ttsState === "loading"}
                    className="h-7 px-2 text-xs text-muted-foreground"
                    title={ttsState === "playing" ? "Stop reading" : "Read aloud"}
                    aria-label={ttsState === "playing" ? "Stop reading" : "Read aloud"}
                  >
                    {ttsState === "loading" ? (
                      <div className="mr-1 h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />
                    ) : ttsState === "playing" ? (
                      <Square className="mr-1 h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Volume2 className="mr-1 h-3 w-3" aria-hidden="true" />
                    )}
                    {ttsState === "playing" ? "Stop" : ttsState === "loading" ? "Loading…" : "Read aloud"}
                  </Button>
                )}
                {onCopy && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 px-2 text-xs text-muted-foreground"
                    aria-label={copied ? "Copied" : "Copy message"}
                  >
                    {copied ? <><Check className="mr-1 h-3 w-3" aria-hidden="true" /> Copied</> : <><Copy className="mr-1 h-3 w-3" aria-hidden="true" /> Copy</>}
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDelete}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    aria-label="Delete message"
                  >
                    <Trash2 className="mr-1 h-3 w-3" aria-hidden="true" /> Delete
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
