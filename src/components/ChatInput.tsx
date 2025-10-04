import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto px-4 pb-6">
      <div className="relative flex items-end gap-2 bg-background border-2 border-input rounded-2xl shadow-lg focus-within:border-primary/40 transition-all">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Reply to Claude..."
          disabled={disabled}
          className="flex-1 min-h-[56px] max-h-[200px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent px-5 py-4 text-[15px] placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || disabled}
          className="m-2 rounded-lg bg-primary hover:bg-primary/90 h-9 w-9"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
      <div className="text-xs text-center text-muted-foreground mt-3">
        Claude can make mistakes. Please verify important information.
      </div>
    </form>
  );
};
