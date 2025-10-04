import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { streamClaudeResponse, Message } from "@/lib/puter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { ClaudeLogo } from "@/components/ClaudeLogo";

interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
  messages: Message[];
}

const Index = () => {
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: "1",
      title: "New Conversation",
      timestamp: new Date(),
      messages: [],
    },
  ]);
  const [currentConversationId, setCurrentConversationId] = useState("1");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const currentConversation = conversations.find((c) => c.id === currentConversationId);
  const messages = currentConversation?.messages || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const handleSendMessage = async (content: string) => {
    if (!currentConversation) return;

    const userMessage: Message = { role: "user", content };
    const updatedMessages = [...messages, userMessage];

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === currentConversationId
          ? {
              ...conv,
              messages: updatedMessages,
              title: conv.messages.length === 0 ? content.slice(0, 30) + "..." : conv.title,
            }
          : conv
      )
    );

    setIsStreaming(true);
    setStreamingContent("");

    // Pass the actual user's prompt to Claude
    await streamClaudeResponse(
      content,
      (chunk) => {
        setStreamingContent((prev) => prev + chunk);
      },
      (fullContent) => {
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === currentConversationId
              ? {
                  ...conv,
                  messages: [
                    ...updatedMessages,
                    { role: "assistant", content: fullContent },
                  ],
                }
              : conv
          )
        );
        setStreamingContent("");
        setIsStreaming(false);
      },
      (error) => {
        toast({
          title: "Authorization Required",
          description: error.message || "Please allow this app to use AI when prompted.",
          variant: "destructive",
          duration: 6000,
        });
        // Remove the user message if auth failed
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === currentConversationId
              ? { ...conv, messages: messages }
              : conv
          )
        );
        setStreamingContent("");
        setIsStreaming(false);
      }
    );
  };

  const handleNewConversation = () => {
    const newConv: Conversation = {
      id: Date.now().toString(),
      title: "New Conversation",
      timestamp: new Date(),
      messages: [],
    };
    setConversations((prev) => [newConv, ...prev]);
    setCurrentConversationId(newConv.id);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ConversationSidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={setCurrentConversationId}
        onNewConversation={handleNewConversation}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <main className="flex-1 flex flex-col md:ml-64">
        <ScrollArea className="flex-1" ref={scrollRef}>
          {messages.length === 0 && !isStreaming && (
            <div className="flex items-center justify-center h-full px-4">
              <div className="text-center space-y-6 max-w-2xl">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-orange-500 text-white mb-4">
                  <ClaudeLogo className="w-10 h-10" />
                </div>
                <h1 className="text-3xl md:text-4xl font-semibold text-foreground leading-tight">
                  How can Claude help you today?
                </h1>
                <p className="text-muted-foreground text-base">
                  I'm Claude, an AI assistant. I'm here to help with analysis, writing, math, coding, and more.
                </p>
              </div>
            </div>
          )}

          <div className="pb-32">
            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                role={message.role}
                content={message.content}
              />
            ))}
            {isStreaming && (
              <ChatMessage
                role="assistant"
                content={streamingContent}
                isStreaming
              />
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border bg-background py-4">
          <ChatInput onSend={handleSendMessage} disabled={isStreaming} />
        </div>
      </main>
    </div>
  );
};

export default Index;
