import { useState, useRef, useEffect, useCallback, type SetStateAction } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { AuthButton } from "@/components/AuthButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CreditPill } from "@/components/CreditPill";
import { getProfileInfo, type ProfileInfo } from "@/lib/profile";
import {
  Message,
  checkAuthStatus,
  signOut
} from "@/lib/backend";
import { streamAIResponse, stripThinkBlocks } from "@/lib/streamingHandler";
import { generateImage } from "@/lib/images";
import { syncConversations, recordDelete } from "@/lib/sync";
import {
  getModelCatalog,
  resolveDefaultModel,
  DEFAULT_MODEL_ID,
  type ModelCatalog,
} from "@/lib/models";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Menu, X, Sparkles, RotateCcw, PanelLeftOpen, Share2, LogOut, CircleUserRound, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import "./Index.css";
import { saveConversations, loadConversations, saveCurrentConversationId, loadCurrentConversationId } from "@/lib/utils/storage";
import { exportAsMarkdown, exportAsJSON, downloadFile, copyToClipboard } from "@/lib/utils/export";
import { saveConversationToDrive } from "@/lib/drive";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
  messages: Message[];
  /** Epoch ms of last local mutation. Powers KV last-writer-wins merge. */
  updatedAt?: number;
  /** Pinned conversations sort above time groups in the sidebar. */
  pinned?: boolean;
}

const SUGGESTIONS = [
  "Explain quantum computing in simple terms",
  "Write a haiku about the monsoon",
  "Help me plan a 3-day trip to Goa",
  "Give me tips for better sleep",
];

const Index = () => {
  const [conversations, setConversationsRaw] = useState<Conversation[]>([
    {
      id: "1",
      title: "New Conversation",
      timestamp: new Date(),
      messages: [],
    },
  ]);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  // Stamping wrapper around setConversationsRaw: any conversation whose
  // reference changed (matched by id) gets updatedAt=now. Gives the KV
  // merge a per-conversation last-writer-wins clock with zero call-site
  // changes. Sync itself applies via setConversationsRaw (unstamped).
  const setConversations = useCallback((updater: SetStateAction<Conversation[]>) => {
    setConversationsRaw((prev) => {
      const next =
        typeof updater === "function"
          ? (updater as (p: Conversation[]) => Conversation[])(prev)
          : updater;
      // Fast path: identical length and references -> nothing changed.
      // (Length check matters: filter-removals keep survivor references.)
      if (next.length === prev.length && next.every((c, i) => c === prev[i])) {
        return prev;
      }
      const prevById = new Map(prev.map((c) => [c.id, c]));
      const now = Date.now();
      return next.map((c) =>
        prevById.get(c.id) !== c ? { ...c, updatedAt: now } : c
      );
    });
  }, []);

  const [, setSyncStatus] = useState<"local" | "syncing" | "synced" | "error">("local");
  const syncInflight = useRef(false);
  const syncTimer = useRef<number | null>(null);

  const runSync = useCallback(async () => {
    if (syncInflight.current) return;
    if (!checkAuthStatus()) {
      setSyncStatus("local");
      return;
    }
    syncInflight.current = true;
    setSyncStatus((s) => (s === "synced" ? s : "syncing"));
    try {
      const { doc, changed } = await syncConversations(conversationsRef.current);
      if (changed) {
        if (doc.conversations.length > 0) {
          setConversationsRaw(doc.conversations);
          if (!doc.conversations.some((c) => c.id === currentConversationIdRef.current)) {
            setCurrentConversationId(doc.conversations[0].id);
          }
        } else {
          const fresh: Conversation = {
            id: Date.now().toString(),
            title: "New Conversation",
            timestamp: new Date(),
            messages: [],
            updatedAt: Date.now(),
          };
          setConversationsRaw([fresh]);
          setCurrentConversationId(fresh.id);
        }
      }
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    } finally {
      syncInflight.current = false;
    }
  }, []);

  const scheduleSync = useCallback(() => {
    if (!checkAuthStatus()) return;
    if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      syncTimer.current = null;
      void runSync();
    }, 2000);
  }, [runSync]);
  const [currentConversationId, setCurrentConversationId] = useState("1");
  const currentConversationIdRef = useRef(currentConversationId);
  currentConversationIdRef.current = currentConversationId;
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebar_open");
      if (saved !== null) return saved === "true";
      return window.innerWidth >= 768;
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem("sidebar_open", String(sidebarOpen));
  }, [sidebarOpen]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const currentConversation = conversations.find((c) => c.id === currentConversationId);
  const messages = currentConversation?.messages || [];
  const canRegenerate =
    !isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  useEffect(() => {
    // Documented sign-in check: puter.auth.isSignedIn() (synchronous boolean).
    setIsAuthenticated(checkAuthStatus());
    // Validate the selected model against the live catalog; fall back to the
    // documented default when the stored selection no longer resolves.
    getModelCatalog().then((catalog) => {
      if (!catalog) return;
      setModelCatalog(catalog);
      setSelectedModel((prev) =>
        prev && catalog.ids.has(prev) ? prev : resolveDefaultModel(catalog)
      );
    });
  }, []);

  // Load conversations from localStorage on mount
  useEffect(() => {
    const loaded = loadConversations();
    if (loaded.length > 0) {
      setConversations(loaded);
      const savedId = loadCurrentConversationId();
      if (savedId && loaded.find(c => c.id === savedId)) {
        setCurrentConversationId(savedId);
      } else {
        setCurrentConversationId(loaded[0].id);
      }
    }
  }, []);

  // Auto-save conversations to localStorage whenever they change
  useEffect(() => {
    if (conversations.length > 0) {
      saveConversations(conversations);
    }
    scheduleSync(); // debounced KV push while signed in
  }, [conversations, scheduleSync]);

  // Pull + merge KV state whenever sign-in becomes active.
  useEffect(() => {
    if (isAuthenticated) void runSync();
  }, [isAuthenticated, runSync]);

  // Load profile (avatar + display name) for the account menu.
  useEffect(() => {
    if (!isAuthenticated) {
      setProfile(null);
      return;
    }
    let alive = true;
    getProfileInfo().then((p) => {
      if (alive) setProfile(p);
    });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  // Pull + merge when the tab regains focus (other device may have written).
  useEffect(() => {
    const onFocus = () => void runSync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runSync();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
    };
  }, [runSync]);

  // Save current conversation ID whenever it changes
  useEffect(() => {
    saveCurrentConversationId(currentConversationId);
  }, [currentConversationId]);

  useEffect(() => {
    // Reset streaming content when conversation changes
    setStreamingContent("");
  }, [currentConversationId]);


  const handleSendMessage = async (content: string, model?: string, images?: File[]) => {
    if (!currentConversation) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to use AI models.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    // Use provided model or fallback to selected model
    const selectedModelId = model || selectedModel;

    // Convert images to raw base64 (no data: prefix). The streaming layer
    // wraps them in the SDK's image_url wire form ("b" + base64).
    let imageBase64s: string[] = [];
    if (images && images.length > 0) {
      try {
        const conversionPromises = images.map(file => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                const comma = reader.result.indexOf(',');
                resolve(comma >= 0 ? reader.result.slice(comma + 1) : reader.result);
              } else {
                reject(new Error(`Failed to convert ${file.name} to string`));
              }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
        });

        imageBase64s = await Promise.all(conversionPromises);
      } catch (error) {
        toast({
          title: "Image processing failed",
          description: "Failed to process images. Please try again.",
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
    }

    // Create user message with content and image info if present
    let messageContent = content;
    if (imageBase64s.length > 0) {
      messageContent = `${content}${content ? '\n\n' : ''}[Images: ${imageBase64s.length} attached]`;
    }

    const userMessage: Message = { role: "user", content: messageContent };
    const updatedMessages = [...messages, userMessage];

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === currentConversationId
          ? {
            ...conv,
            messages: updatedMessages,
            title: conv.messages.length === 0 ? truncateTitle(content) : conv.title,
          }
          : conv
      )
    );

    // Prior turns go as conversation history (text only); the current
    // message carries the images via image_url content blocks.
    runAssistantReply({
      baseMessages: updatedMessages,
      rollbackMessages: messages,
      history: messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      prompt: content,
      modelId: selectedModelId,
      imageBase64s: imageBase64s.length > 0 ? imageBase64s : undefined,
    });
  };

  interface ReplyRunnerArgs {
    baseMessages: Message[];
    rollbackMessages: Message[];
    history: { role: "user" | "assistant"; content: string }[];
    prompt: string;
    modelId: string;
    imageBase64s?: string[];
  }

  /** Shared streaming flow for new messages and regenerations. */
  const runAssistantReply = async ({
    baseMessages,
    rollbackMessages,
    history,
    prompt,
    modelId,
    imageBase64s,
  }: ReplyRunnerArgs) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
    setStreamingContent("");

    const resetStreaming = () => {
      setStreamingContent("");
      setIsStreaming(false);
      abortRef.current = null;
    };

    const appendAssistantMessage = (assistantContent: string) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentConversationId
            ? {
              ...conv,
              messages: [
                ...baseMessages,
                { role: "assistant", content: assistantContent, model: modelId },
              ],
            }
            : conv
        )
      );
    };

    const onChunk = (chunk: string) => {
      setStreamingContent((prev) => prev + chunk);
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 10);
    };

    const onComplete = (fullContent: string) => {
      appendAssistantMessage(fullContent);
      resetStreaming();
    };

    const onError = (error: Error) => {
      console.error('Chat error:', error);
      toast({
        title: "Message failed to send",
        description: error.message || "Please check your connection and try again.",
        variant: "destructive",
        duration: 6000,
      });
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentConversationId
            ? { ...conv, messages: rollbackMessages }
            : conv
        )
      );
      resetStreaming();
    };

    const onAbort = (partialContent: string) => {
      // Keep whatever streamed so far, like ChatGPT's stop button.
      if (partialContent) appendAssistantMessage(partialContent);
      resetStreaming();
    };

    try {
      await streamAIResponse(history, prompt, modelId, {
        onChunk,
        onComplete,
        onError,
        onAbort,
      }, imageBase64s, controller.signal);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(`AI request failed: ${(error as Error)?.message || 'Unknown error'}`));
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleRetryMessage = (aiIndex: number) => {
    if (isStreaming || !currentConversation) return;
    const aiMsg = messages[aiIndex];
    if (!aiMsg || aiMsg.role !== "assistant") return;
    let questionIdx = -1;
    for (let i = aiIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") { questionIdx = i; break; }
    }
    if (questionIdx < 0) return;
    // Images aren't stored on messages, so regeneration is text-only; strip
    // the "[Images: N attached]" marker the send flow appends.
    const prompt = messages[questionIdx].content.replace(/\n\n\[Images: \d+ attached\]$/, "");
    const trimmed = messages.slice(0, questionIdx + 1);
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === currentConversationId ? { ...conv, messages: trimmed } : conv
      )
    );
    runAssistantReply({
      baseMessages: trimmed,
      rollbackMessages: trimmed,
      history: trimmed
        .slice(0, -1)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      prompt,
      modelId: selectedModel,
    });
  };

  const handleRegenerate = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") { handleRetryMessage(i); break; }
    }
  };

  const handleGenerateImage = async (prompt: string) => {
    if (!currentConversation) return;
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to generate images.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    const userMessage: Message = { role: "user", content: prompt };
    const withPrompt = [...messages, userMessage];
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === currentConversationId
          ? {
            ...conv,
            messages: withPrompt,
            title: conv.messages.length === 0 ? truncateTitle(prompt) : conv.title,
          }
          : conv
      )
    );
    setIsGeneratingImage(true);
    try {
      const src = await generateImage(prompt);
      const assistantMessage: Message = { role: "assistant", content: "", image: src };
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentConversationId
            ? { ...conv, messages: [...withPrompt, assistantMessage] }
            : conv
        )
      );
    } catch (error) {
      toast({
        title: "Image generation failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
        duration: 6000,
      });
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentConversationId ? { ...conv, messages } : conv
        )
      );
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const truncateTitle = (text: string): string =>
    text.length > 30 ? text.slice(0, 30) + "…" : text || "New Conversation";

  const handleDeleteConversation = (id: string) => {
    recordDelete(id);
    const remaining = conversations.filter((conv) => conv.id !== id);
    if (remaining.length === 0) {
      // If no conversations left, create a new one
      const newConv: Conversation = {
        id: Date.now().toString(),
        title: "New Conversation",
        timestamp: new Date(),
        messages: [],
      };
      setConversations([newConv]);
      setCurrentConversationId(newConv.id);
    } else {
      setConversations(remaining);
      // If the deleted conversation was the current one, select the first available
      if (currentConversationId === id) {
        setCurrentConversationId(remaining[0].id);
      }
    }
  };

  const handleRenameConversation = (id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setConversations((prev) =>
      prev.map((conv) => (conv.id === id ? { ...conv, title: clean } : conv))
    );
  };

  const handleTogglePin = (id: string) => {
    setConversations((prev) =>
      prev.map((conv) => (conv.id === id ? { ...conv, pinned: !conv.pinned } : conv))
    );
  };

  const handleShareConversation = async (id: string) => {
    const conv = conversationsRef.current.find((c) => c.id === id);
    if (!conv) return;
    try {
      await copyToClipboard(exportAsMarkdown(conv));
      toast({ title: "Conversation copied", description: "Markdown is on your clipboard.", duration: 3000 });
    } catch {
      toast({ title: "Could not copy conversation", variant: "destructive", duration: 3000 });
    }
  };

  const handleDeleteConversations = (ids: string[]) => {
    ids.forEach((id) => recordDelete(id));
    const remaining = conversationsRef.current.filter((conv) => !ids.includes(conv.id));
    if (remaining.length === 0) {
      const newConv: Conversation = {
        id: Date.now().toString(),
        title: "New Conversation",
        timestamp: new Date(),
        messages: [],
      };
      setConversations([newConv]);
      setCurrentConversationId(newConv.id);
    } else {
      setConversations(remaining);
      if (currentConversationIdRef.current && ids.includes(currentConversationIdRef.current)) {
        setCurrentConversationId(remaining[0].id);
      }
    }
  };

  const handleEditMessage = (messageIndex: number, newContent: string) => {
    const clean = newContent.trim();
    if (!clean) return;
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === currentConversationIdRef.current
          ? { ...conv, messages: conv.messages.map((m, i) => (i === messageIndex ? { ...m, content: clean } : m)) }
          : conv
      )
    );
  };

  const commitTitle = () => {
    const clean = titleDraft.trim();
    if (clean && currentConversationIdRef.current) {
      handleRenameConversation(currentConversationIdRef.current, clean);
    }
    setEditingTitle(false);
  };

  const openSearch = () => {
    setSidebarOpen(true);
    window.setTimeout(() => {
      document.getElementById("search-conversations")?.focus();
    }, 350);
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

  const handleSignOut = () => {
    signOut();
    setIsAuthenticated(false);
    toast({
      title: "Signed out",
      duration: 2000,
    });
  };

  const handleCopyMessage = async (content: string) => {
    const success = await copyToClipboard(content);
    if (success) {
      toast({
        title: "Copied to clipboard",
        duration: 2000,
      });
    } else {
      toast({
        title: "Failed to copy",
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  const handleDeleteMessage = (messageIndex: number) => {
    setConversations(prev => prev.map(conv =>
      conv.id === currentConversationId
        ? { ...conv, messages: conv.messages.filter((_, i) => i !== messageIndex) }
        : conv
    ));
    toast({
      title: "Message deleted",
      duration: 2000,
    });
  };

  const handleShareExchange = (index: number) => {
    const aiMsg = messages[index];
    if (!aiMsg || aiMsg.role !== "assistant") return;
    let question = "";
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        question = messages[i].content;
        break;
      }
    }
    const model = aiMsg.model ? ` (${aiMsg.model})` : "";
    const md =
      (question ? `**You:**\n\n${question}\n\n---\n\n` : "") +
      `**AI${model}:**\n\n${stripThinkBlocks(aiMsg.content)}\n`;
    const base = (question || aiMsg.content).slice(0, 50).replace(/[^a-z0-9]/gi, "_") || "answer";
    downloadFile(`${base}.md`, md);
    toast({ title: "Answer exported", duration: 2000 });
  };

  const handleExport = (format: 'md' | 'json') => {
    if (!currentConversation) return;

    const content = format === 'md'
      ? exportAsMarkdown(currentConversation)
      : exportAsJSON(currentConversation);

    const ext = format === 'md' ? 'md' : 'json';
    const filename = `${currentConversation.title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    downloadFile(filename, content);

    toast({
      title: `Exported as ${format.toUpperCase()}`,
      duration: 2000,
    });
  };

  const handleSaveToDrive = async () => {
    if (!currentConversation) return;
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to save to Drive.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    try {
      const name = await saveConversationToDrive(
        currentConversation.title,
        exportAsMarkdown(currentConversation)
      );
      toast({ title: "Saved to Drive", description: name, duration: 3000 });
    } catch (error) {
      toast({
        title: "Could not save to Drive",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  return (
    <div className="app-root">
      <ConversationSidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={setCurrentConversationId}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onDeleteConversations={handleDeleteConversations}
        onRenameConversation={handleRenameConversation}
        onTogglePin={handleTogglePin}
        onShareConversation={handleShareConversation}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <main
        className={cn("app-main", sidebarOpen ? "app-main-sidebar-open" : "app-main-sidebar-closed")}
      >
        <header className="app-header">
          <div className="app-header-group">
            {!sidebarOpen && (
              <div className="app-header-pill">
                <Button
                  variant="ghost"
                  size="icon"
                  className="app-icon-btn"
                  onClick={() => setSidebarOpen(true)}
                  title="Open sidebar"
                  aria-label="Open sidebar"
                >
                  <PanelLeftOpen className="app-header-icon" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="app-icon-btn"
                  onClick={openSearch}
                  title="Search conversations"
                  aria-label="Search conversations"
                >
                  <Search className="app-header-icon" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="app-icon-btn"
                  onClick={handleNewConversation}
                  title="New chat"
                  aria-label="New chat"
                >
                  <Plus className="app-header-icon" aria-hidden="true" />
                </Button>
              </div>
            )}
            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="app-icon-btn" title="Export conversation" aria-label="Export conversation">
                    <Share2 className="app-header-icon" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => handleExport('md')}>
                    Export as Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('json')}>
                    Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSaveToDrive}>
                    Save to Drive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {currentConversation &&
            (editingTitle ? (
              <input
                className="app-header-title-input"
                value={titleDraft}
                autoFocus
                aria-label="Rename conversation"
                onFocus={(e) => e.target.select()}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  else if (e.key === "Escape") setEditingTitle(false);
                }}
                onBlur={commitTitle}
              />
            ) : (
              <button
                type="button"
                className="app-header-title"
                title={`${currentConversation.title} (click to rename)`}
                onClick={() => {
                  setTitleDraft(currentConversation.title);
                  setEditingTitle(true);
                }}
              >
                {currentConversation.title}
              </button>
            ))}
          <div className="app-header-group">
            {isAuthenticated && <CreditPill />}
            <ThemeToggle />
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="app-avatar-btn"
                    title={profile?.name ?? "Account"}
                    aria-label={profile?.name ?? "Account"}
                  >
                    {profile?.picture ? (
                      <img
                        src={profile.picture}
                        alt=""
                        className="app-avatar-img"
                      />
                    ) : (
                      <CircleUserRound className="app-avatar-fallback-icon" aria-hidden="true" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="app-account-label">
                    {profile?.name ?? "Account"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="app-menu-icon" aria-hidden="true" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </header>

        {!isAuthenticated ? (
          <div className="app-welcome">
            <div className="app-welcome-card">
              <div className="app-hero-badge">
                <Sparkles className="app-hero-icon" aria-hidden="true" />
              </div>
              <h1 className="app-hero-title">
                Welcome to FreeTalk
              </h1>
              <p className="app-welcome-sub">
                Sign in to start chatting with AI models.
              </p>
              <AuthButton onAuthChange={setIsAuthenticated} />
            </div>
          </div>
        ) : (
          <>
            <ScrollArea className="app-scroll" ref={scrollRef}>
              {messages.length === 0 && !isStreaming ? (
                <div className="app-empty">
                  <div className="app-hero-badge">
                    <Sparkles className="app-hero-icon" aria-hidden="true" />
                  </div>
                  <h1 className="app-empty-title">
                    How can I help you today?
                  </h1>
                  <div className="app-suggestions">
                    {SUGGESTIONS.map((s) => (
                      <Button
                        key={s}
                        variant="outline"
                        className="app-suggestion-btn"
                        onClick={() => handleSendMessage(s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="app-messages">
                  {messages.map((message, index) => (
                    <ChatMessage
                      key={index}
                      role={message.role}
                      content={message.content}
                      model={message.model}
                      image={message.image}
                      onCopy={handleCopyMessage}
                      onDelete={() => handleDeleteMessage(index)}
                      onEdit={message.role === "user" ? (content) => handleEditMessage(index, content) : undefined}
                      onShare={message.role === "assistant" ? () => handleShareExchange(index) : undefined}
                      onRetry={message.role === "assistant" ? () => handleRetryMessage(index) : undefined}
                    />
                  ))}
                  {isStreaming && (
                    <ChatMessage
                      role="assistant"
                      content={streamingContent}
                      isStreaming
                      model={selectedModel}
                    />
                  )}
                </div>
              )}
            </ScrollArea>

            <div className="app-composer-wrap">
              {canRegenerate && (
                <div className="app-regen-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerate}
                    className="app-regen-btn"
                  >
                    <RotateCcw className="app-regen-icon" />
                    Regenerate
                  </Button>
                </div>
              )}
              <ChatInput
                key={currentConversationId}
                onSend={handleSendMessage}
                onStop={handleStop}
                onGenerateImage={handleGenerateImage}
                isGeneratingImage={isGeneratingImage}
                disabled={isStreaming}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                modelCatalog={modelCatalog}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
