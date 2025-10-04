import { User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export const ChatMessage = ({ role, content, isStreaming }: ChatMessageProps) => {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "w-full py-8 px-4 transition-colors",
        isUser ? "bg-[hsl(var(--chat-user-bg))]" : "bg-[hsl(var(--chat-assistant-bg))]"
      )}
    >
      <div className="max-w-3xl mx-auto flex gap-6">
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted"
          )}
        >
          {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        </div>
        <div className="flex-1 space-y-2 pt-1">
          <div className="text-sm font-medium text-foreground">
            {isUser ? "You" : "Claude"}
          </div>
          <div className="text-foreground whitespace-pre-wrap leading-relaxed">
            {content}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
