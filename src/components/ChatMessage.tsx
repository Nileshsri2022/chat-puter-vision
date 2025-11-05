import { User, Brain, Wind, Search, MessageSquare, Globe } from "lucide-react"; // Import icons
import { cn } from "@/lib/utils";
import { ClaudeLogo } from "./ClaudeLogo"; // Keep ClaudeLogo for now, might replace with dynamic import or component
import { AIModel, CLAUDE_MODELS, MISTRAL_MODELS, PERPLEXITY_MODELS, GROK_MODELS, OPENROUTER_MODELS } from "./ModelSelector";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  model?: string;
}

export const ChatMessage = ({ role, content, isStreaming, model }: ChatMessageProps) => {
  const isUser = role === "user";

  const allModels: AIModel[] = [...CLAUDE_MODELS, ...MISTRAL_MODELS, ...PERPLEXITY_MODELS, ...GROK_MODELS, ...OPENROUTER_MODELS];

  const getModelDisplayName = (modelId?: string) => {
    const foundModel = allModels.find(m => m.id === modelId);
    return foundModel ? foundModel.name : "AI";
  };

  const getModelIcon = (modelId?: string) => {
    const foundModel = allModels.find(m => m.id === modelId);
    if (foundModel) {
      switch (foundModel.type) {
        case "claude": return <Brain className="w-4 h-4 md:w-5 md:h-5" />;
        case "mistral": return <Wind className="w-4 h-4 md:w-5 md:h-5" />;
        case "perplexity": return <Search className="w-4 h-4 md:w-5 md:h-5" />;
        case "grok": return <MessageSquare className="w-4 h-4 md:w-5 md:h-5" />;
        case "openrouter": return <Globe className="w-4 h-4 md:w-5 md:h-5" />;
        default: return <Brain className="w-4 h-4 md:w-5 md:h-5" />;
      }
    }
    return <Brain className="w-4 h-4 md:w-5 md:h-5" />; // Default AI icon
  };

  // Format content for better display
  const formatContent = (text: string) => {
    if (!text) return "";

    // Handle markdown formatting with better styling
    let formatted = text
      // Headers
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold text-foreground mb-3 mt-4 first:mt-0">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold text-foreground mb-4 mt-5 first:mt-0">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-foreground mb-4 mt-5 first:mt-0">$1</h1>')
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
      // Italic text
      .replace(/\*(.*?)\*/g, '<em class="italic text-foreground">$1</em>')
      // Inline code
      .replace(/`(.*?)`/g, '<code class="bg-muted/70 px-2 py-1 rounded-md text-sm font-mono text-foreground border">$1</code>')
      // Code blocks
      .replace(/```([\s\S]*?)```/g, '<pre class="bg-muted/50 p-4 rounded-lg text-sm font-mono text-foreground border my-4 overflow-x-auto"><code>$1</code></pre>')
      // Lists - improved formatting with proper ul/ol tags
      .replace(/(<li class="mb-2 pl-2">.*<\/li>(?:\s*<li class="mb-2 pl-2">.*<\/li>)*)/g, '<ul class="mb-4">$1</ul>')
      .replace(/<li class="mb-2 pl-2">• (.*$)<\/li>/gim, '<li class="mb-2">• $1</li>')
      .replace(/<li class="mb-2 pl-2">(.*$)<\/li>/gim, '<li class="mb-2">$1</li>')
      // Paragraphs
      .replace(/\n\n+/g, '</p><p class="mb-4 leading-relaxed">')
      .replace(/\n/g, '<br>');

    // Wrap in paragraph if not already wrapped
    if (!formatted.includes('<p>') && !formatted.includes('<h') && !formatted.includes('<pre>') && !formatted.includes('<li>')) {
      formatted = `<p class="mb-4 leading-relaxed">${formatted}</p>`;
    }

    return formatted;
  };

  return (
    <div
      className={cn(
        "w-full py-4 md:py-6 px-3 md:px-4 transition-all duration-300 border-b border-border/50 hover:bg-accent/5",
        isUser ? "bg-background" : "bg-card/30"
      )}
    >
      <div className="max-w-4xl mx-auto flex gap-3 md:gap-4">
        <div
          className={cn(
            "flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center mt-1 transition-all duration-200 hover:scale-110 shadow-sm",
            isUser
              ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
              : "bg-gradient-to-br from-orange-400 to-orange-500 text-white"
          )}
        >
          {isUser ? <User className="w-3.5 h-3.5 md:w-4 md:h-4" /> : getModelIcon(model)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
            <div className="text-sm font-semibold text-foreground">
              {isUser ? "You" : "AI"}
            </div>
            {!isUser && (
              <div className={cn(
                "text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full transition-all duration-200",
                isStreaming && "bg-primary/10 text-primary animate-pulse"
              )}>
                {isStreaming ? "Thinking..." : getModelDisplayName(model)}
              </div>
            )}
          </div>
          <div
            className={cn(
              "prose prose-sm max-w-none text-foreground/95 leading-relaxed",
              "prose-headings:text-foreground prose-headings:font-semibold prose-headings:tracking-tight",
              "prose-p:text-foreground/95 prose-p:leading-relaxed prose-p:mb-4",
              "prose-strong:text-foreground prose-strong:font-semibold",
              "prose-em:text-foreground/90 prose-em:italic",
              "prose-code:text-foreground prose-code:bg-muted/60 prose-code:border prose-code:border-border/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono",
              "prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-lg prose-pre:p-4 prose-pre:overflow-x-auto",
              "prose-li:text-foreground/95 prose-li:leading-relaxed",
              "prose-ul:space-y-2 prose-ol:space-y-2",
              "prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground",
              isStreaming && "animate-pulse"
            )}
            style={{
              wordWrap: "break-word",
              overflowWrap: "break-word",
              lineHeight: "1.6"
            }}
            dangerouslySetInnerHTML={{
              __html: isUser ? content : formatContent(content)
            }}
          />
          {isStreaming && (
            <div className="inline-flex items-center gap-1 mt-2">
              <div className="flex gap-1">
                <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
