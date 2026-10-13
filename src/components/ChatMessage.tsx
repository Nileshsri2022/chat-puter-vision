import { Copy, Trash2, Check, Volume2, Square } from "lucide-react";
import { AIModel, CLAUDE_MODELS, MISTRAL_MODELS, PERPLEXITY_MODELS, GROK_MODELS, KIMI_MODELS, OPENAI_MODELS, OPENROUTER_MODELS } from "./ModelSelector";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { checkAuthStatus } from "@/lib/puter";
import { synthesizeSpeech, stripMarkdownForSpeech, stopAllSpeech, setCurrentSpeech } from "@/lib/tts";
import { useState, useRef } from "react";

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
        description: "Please sign in to Puter to use read-aloud.",
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

  const handleCopy = async () => {
    if (onCopy) {
      onCopy(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const allModels: AIModel[] = ALL_MODELS;

  const getModelDisplayName = (modelId?: string) => {
    const foundModel = allModels.find(m => m.id === modelId);
    return foundModel ? foundModel.name : "AI";
  };

  // Minimal markdown renderer for model output.
  // Model output is untrusted: escape HTML first so a response can never
  // inject markup/scripts, then apply formatting. Fenced code blocks are
  // extracted before inline code so backticks inside fences aren't mangled.
  const formatContent = (text: string) => {
    if (!text) return "";

    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    // Pull fenced code blocks out first, restore at the end.
    const codeBlocks: string[] = [];
    let formatted = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code: string) => {
      codeBlocks.push(
        `<pre class="bg-muted/50 p-4 rounded-lg text-sm font-mono text-foreground border my-4 overflow-x-auto"><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`
      );
      return `\uE000CODEBLOCK${codeBlocks.length - 1}\uE000`;
    });

    formatted = escapeHtml(formatted);

    formatted = formatted
      // Headers
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold text-foreground mb-3 mt-4 first:mt-0">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold text-foreground mb-4 mt-5 first:mt-0">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-foreground mb-4 mt-5 first:mt-0">$1</h1>')
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
      // Italic text
      .replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em class="italic text-foreground">$2</em>')
      // Inline code
      .replace(/`([^`\n]+)`/g, '<code class="bg-muted/70 px-2 py-1 rounded-md text-sm font-mono text-foreground border">$1</code>')
      // Blockquotes
      .replace(/^&gt; (.*$)/gim, '<blockquote class="border-l-4 border-border pl-4 italic text-muted-foreground mb-4">$1</blockquote>')
      // Unordered lists
      .replace(/^\s*[-*] (.*$)/gim, '<li class="mb-2 list-item-u">$1</li>')
      // Ordered lists
      .replace(/^\s*\d+\. (.*$)/gim, '<li class="mb-2 list-item-o">$1</li>')
      // Paragraphs
      .replace(/\n\n+/g, '</p><p class="mb-4 leading-relaxed">')
      .replace(/\n/g, '<br>');

    // Wrap loose list items
    formatted = formatted
      .replace(/(<li class="mb-2 list-item-u">.*<\/li>(?:\s*<li class="mb-2 list-item-u">.*<\/li>)*)/g, '<ul class="mb-4 list-disc pl-6 space-y-1">$1</ul>')
      .replace(/(<li class="mb-2 list-item-o">.*<\/li>(?:\s*<li class="mb-2 list-item-o">.*<\/li>)*)/g, '<ol class="mb-4 list-decimal pl-6 space-y-1">$1</ol>');

    // Clean marker classes from li
    formatted = formatted.replace(/ class="mb-2 list-item-[uo]"/g, ' class="mb-1.5"');

    // Wrap in paragraph if not already wrapped
    if (
      !formatted.includes('<p>') &&
      !formatted.includes('<h') &&
      !formatted.includes('<pre>') &&
      !formatted.includes('<li>') &&
      !formatted.includes('<blockquote') &&
      !formatted.includes('\uE000CODEBLOCK')
    ) {
      formatted = `<p class="mb-4 leading-relaxed">${formatted}</p>`;
    }

    // Restore code blocks
    formatted = formatted.replace(/\uE000CODEBLOCK(\d+)\uE000/g, (_m, i: string) => codeBlocks[Number(i)]);

    return formatted;
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-2.5 sm:py-3">
      {isUser ? (
        <div className="flex justify-end">
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-relaxed text-foreground shadow-sm">
            {content}
          </div>
        </div>
      ) : (
        <div className="group space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground select-none">
            {isStreaming ? "Thinking…" : getModelDisplayName(model)}
          </div>
          {image && (
            <img
              src={image}
              alt="Generated output"
              className="mb-3 max-h-96 w-auto rounded-xl border border-border object-cover shadow-sm"
              loading="lazy"
            />
          )}
          <div
            className="break-words text-[15px] leading-relaxed text-foreground"
            dangerouslySetInnerHTML={{ __html: formatContent(content) }}
          />
          {isStreaming && content.length === 0 && (
            <div className="flex items-center gap-1.5 py-2" role="status" aria-label="Thinking">
              <div className="h-1.5 w-1.5 motion-safe:animate-bounce rounded-full bg-muted-foreground" />
              <div className="h-1.5 w-1.5 motion-safe:animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
              <div className="h-1.5 w-1.5 motion-safe:animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
              <span className="sr-only">Thinking…</span>
            </div>
          )}
          {!isStreaming && (speakable || onCopy || onDelete) && (
            <div className="pt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {speakable && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSpeak}
                  disabled={ttsState === "loading"}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  title={ttsState === "playing" ? "Stop reading" : "Read aloud"}
                  aria-label={ttsState === "playing" ? "Stop reading aloud" : "Read message aloud"}
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
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  aria-label="Copy message to clipboard"
                >
                  {copied ? <><Check className="mr-1 h-3 w-3 text-emerald-500" aria-hidden="true" /> Copied</> : <><Copy className="mr-1 h-3 w-3" aria-hidden="true" /> Copy</>}
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
      )}
    </div>
  );
};
