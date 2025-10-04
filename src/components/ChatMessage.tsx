import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClaudeLogo } from "./ClaudeLogo";

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
            "flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center",
            isUser 
              ? "bg-gradient-to-br from-primary to-orange-500 text-primary-foreground" 
              : "bg-transparent text-primary border border-primary/20"
          )}
        >
          {isUser ? <User className="w-5 h-5" /> : <ClaudeLogo className="w-6 h-6" />}
        </div>
        <div className="flex-1 space-y-2 pt-1">
          <div className="text-sm font-semibold text-foreground">
            {isUser ? "You" : "Claude"}
          </div>
          <div className="text-foreground/90 whitespace-pre-wrap leading-relaxed text-[15px]">
            {content}
            {isStreaming && (
              <span className="inline-block w-[3px] h-5 ml-1 bg-primary animate-pulse rounded-sm" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
