import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { AuthButton } from "@/components/AuthButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MessageSkeleton, ChatInputSkeleton } from "@/components/SkeletonLoader";
import { streamClaudeResponse, Message, checkAuthStatus, getCurrentUser, resetAuthState } from "@/lib/puter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ClaudeLogo } from "@/components/ClaudeLogo";
import { Menu, X } from "lucide-react";

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
   const [isAuthenticated, setIsAuthenticated] = useState(false);
   const [selectedModel, setSelectedModel] = useState("x-ai/grok-4");
   const [isLoading, setIsLoading] = useState(true);
   const scrollRef = useRef<HTMLDivElement>(null);
   const { toast } = useToast();

  const currentConversation = conversations.find((c) => c.id === currentConversationId);
  const messages = currentConversation?.messages || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  useEffect(() => {
    resetAuthState();
    const authStatus = checkAuthStatus();
    setIsAuthenticated(authStatus && !!getCurrentUser());
    setTimeout(() => setIsLoading(false), 800);
  }, []);


  const handleSendMessage = async (content: string, model?: string, images?: File[]) => {
    if (!currentConversation) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to Puter to use AI models.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    // Use provided model or fallback to selected model
    const selectedModelId = model || selectedModel;

    // Create user message with content and image info if present
    let messageContent = content;
    if (images && images.length > 0) {
      messageContent = `${content}${content ? '\n\n' : ''}[Images: ${images.length} file${images.length > 1 ? 's' : ''} uploaded]`;
    }

    const userMessage: Message = { role: "user", content: messageContent };
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


    await streamClaudeResponse(
      content,
      (chunk) => {
        setStreamingContent((prev) => prev + chunk);
        // Auto-scroll to bottom on each chunk
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 10);
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
        console.error('Chat error:', error);
        toast({
          title: "Message failed to send",
          description: error.message || "Please check your connection and try again.",
          variant: "destructive",
          duration: 6000,
        });
        // Remove the user message if request failed
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === currentConversationId
              ? { ...conv, messages: messages }
              : conv
          )
        );
        setStreamingContent("");
        setIsStreaming(false);
      },
      selectedModelId
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

      <main className="flex-1 flex flex-col md:ml-64 min-w-0">
        {/* Header with theme toggle - only show when authenticated */}
        {isAuthenticated && (
          <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-3">
              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-8 w-8"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
              <h1 className="text-lg font-semibold text-foreground">AI Chat</h1>
            </div>
            <ThemeToggle />
          </header>
        )}

        {!isAuthenticated ? (
          <div className="flex items-center justify-center h-full px-4">
            <div className="text-center space-y-6 max-w-2xl">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-orange-500 text-white mb-4">
                <ClaudeLogo className="w-10 h-10" />
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold text-foreground leading-tight">
                Welcome to AI Chat
              </h1>
              <p className="text-muted-foreground text-base mb-6">
                To start chatting with AI models (Claude, Grok, Mistral, Perplexity), please sign in to Puter first.
              </p>
              <div className="flex flex-col items-center gap-4">
                <AuthButton onAuthChange={setIsAuthenticated} />
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex-1 bg-background">
            <div className="space-y-0">
              <MessageSkeleton />
              <MessageSkeleton />
              <MessageSkeleton />
            </div>
            <ChatInputSkeleton />
          </div>
        ) : (
          <ScrollArea className="flex-1 bg-background" ref={scrollRef}>
            {messages.length === 0 && !isStreaming && (
              <div className="flex items-center justify-center h-full px-4 py-12">
                <div className="text-center space-y-8 max-w-2xl">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg animate-pulse">
                    <ClaudeLogo className="w-12 h-12" />
                  </div>
                  <div className="space-y-4">
                    <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
                      How can I help you today?
                    </h1>
                    <p className="text-muted-foreground text-lg leading-relaxed">
                      Choose from Claude, Grok, Mistral, or Perplexity AI models. Each model offers unique capabilities for your tasks and questions.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="min-h-full">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className="animate-in slide-in-from-bottom-2 duration-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <ChatMessage
                    role={message.role}
                    content={message.content}
                    model={selectedModel}
                  />
                </div>
              ))}
              {isStreaming && (
                <div className="animate-in slide-in-from-bottom-2 duration-300">
                  <ChatMessage
                    role="assistant"
                    content={streamingContent}
                    isStreaming
                    model={selectedModel}
                  />
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {isAuthenticated && (
          <div className="border-t border-border bg-background py-4">
            <ChatInput
              onSend={handleSendMessage}
              disabled={isStreaming}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
