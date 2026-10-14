import { useState, useRef, useEffect, useCallback, useMemo, type SetStateAction } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ArtifactsPanel } from "@/components/ArtifactsPanel";
import { AuthButton } from "@/components/AuthButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getProfileInfo, type ProfileInfo } from "@/lib/profile";
import {
  Message,
  checkAuthStatus,
  signOut,
  type AttachmentRef,
  type CompactionItem,
} from "@/lib/backend";
import { streamAIResponse, stripThinkBlocks, toHistory } from "@/lib/streamingHandler";
import { generateImage, newAttachmentPath, persistAttachment } from "@/lib/images";
import { collectImageArtifacts, countUnsavedAttachments } from "@/lib/artifacts";
import { appendImageMarker, hasImageMarker, prepareImageAttachments, stripImageMarker } from "@/lib/attachments";
import { syncConversations, recordDelete } from "@/lib/sync";
import {
  getModelCatalog,
  contextPlanFor,
  resolveDefaultModel,
  DEFAULT_MODEL_ID,
  type ModelCatalog,
} from "@/lib/models";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMediaQuery, DESKTOP_QUERY, ARTIFACTS_DOCK_QUERY } from "@/hooks/useMediaQuery";
import { Sparkles, PanelLeftOpen, Share2, Plus, Search, X, ChevronUp, ChevronDown, Images } from "lucide-react";
import { cn } from "@/lib/utils";
import "./Index.css";
import { saveConversations, loadConversations, saveCurrentConversationId, loadCurrentConversationId } from "@/lib/utils/storage";
import { exportAsMarkdown, downloadFile, copyToClipboard } from "@/lib/utils/export";
import { collectMatchRanges, paintSearchHighlights, clearSearchHighlights } from "@/lib/utils/highlight";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

/**
 * Prepare attachments for sending and mint a Drive reference for each, so the
 * images panel can still show them after the send.
 *
 * The write is backgrounded on purpose: paths are minted locally, so the
 * message can carry them immediately, and a Drive failure must never cost the
 * user their message. The tile then shows the same "unavailable" state a
 * generated image shows when its read fails.
 */
async function prepareAndStoreAttachments(
  images: File[]
): Promise<{ dataUrls: string[]; refs: AttachmentRef[] }> {
  const prepared = await prepareImageAttachments(images);
  const refs: AttachmentRef[] = prepared.map((attachment) => ({
    path: newAttachmentPath(attachment.mimeType),
    name: attachment.file.name || undefined,
    mimeType: attachment.mimeType,
    bytes: attachment.bytes,
  }));
  prepared.forEach((attachment, i) => {
    void persistAttachment(attachment.file, refs[i].path);
  });
  return {
    dataUrls: prepared.map((attachment) => attachment.dataUrl),
    refs,
  };
}

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
  // Docked-vs-overlay sidebar. Subscribed rather than sampled once, so rotating
  // a phone or resizing a desktop window re-lays out instead of freezing the
  // decision made at first load.
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebar_open");
      if (saved !== null) return saved === "true";
    }
    return isDesktop;
  });

  useEffect(() => {
    localStorage.setItem("sidebar_open", String(sidebarOpen));
  }, [sidebarOpen]);

  // Crossing the breakpoint snaps to that side's sensible default: a docked
  // rail is wrong on a phone, a collapsed rail is wrong on a desktop.
  const prevIsDesktop = useRef(isDesktop);
  useEffect(() => {
    if (prevIsDesktop.current === isDesktop) return;
    prevIsDesktop.current = isDesktop;
    setSidebarOpen(isDesktop);
  }, [isDesktop]);

  // ---- Artifacts panel: the image index for the open conversation ----
  // Docked at `xl`; below that it overlays the transcript, so locating an image
  // has to dismiss it first or the flash happens behind the panel.
  const artifactsDocked = useMediaQuery(ARTIFACTS_DOCK_QUERY);

  // Off by default: unlike the rail, this panel is a reference tool you open
  // when you need it, and it costs transcript width on mid-size screens.
  const [artifactsOpen, setArtifactsOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("artifacts_open");
      if (saved !== null) return saved === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("artifacts_open", String(artifactsOpen));
  }, [artifactsOpen]);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // In-conversation search ("find in chat"). Deliberately separate from the
  // sidebar's conversation search: this one never touches the rail, it walks
  // the transcript that is on screen.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActiveMatch, setSearchActiveMatch] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentConversation = conversations.find((c) => c.id === currentConversationId);
  const messages = currentConversation?.messages || [];
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  /**
   * Images in the open conversation, derived on every render. Messages are
   * index-keyed and deleting one splices the array, so a stored pointer would
   * go stale — recomputing is what keeps a tile aimed at the right message.
   */
  const imageArtifacts = useMemo(
    () => collectImageArtifacts(currentConversation?.messages ?? []),
    [currentConversation]
  );
  /** Attachments claimed by a legacy marker whose bytes were never stored. */
  const unsavedAttachments = useMemo(
    () => countUnsavedAttachments(currentConversation?.messages ?? []),
    [currentConversation]
  );

  const flashTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    []
  );

  /**
   * Scroll the transcript to a message and flash it. `scrollIntoView` rather
   * than scrollTop: the scroller is Radix's viewport, not the element the ref
   * is attached to (issue #34) — find-in-chat does the same.
   */
  const locateMessage = useCallback(
    (messageIndex: number) => {
      if (!artifactsDocked) setArtifactsOpen(false);
      // Next frame, so the panel's own close has been committed first.
      window.setTimeout(() => {
        const el = scrollRef.current?.querySelector<HTMLElement>(
          `[data-message-index="${messageIndex}"]`
        );
        if (!el) return;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // Remove-then-set with a reflow between: locating the same image twice
        // would otherwise leave the one-shot animation finished and invisible.
        el.removeAttribute("data-artifact-flash");
        void el.offsetWidth;
        el.setAttribute("data-artifact-flash", "");
        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => {
          el.removeAttribute("data-artifact-flash");
          flashTimer.current = null;
        }, 1400);
      }, 0);
    },
    [artifactsDocked]
  );

  const searchTerm = searchQuery.trim().toLowerCase();

  /** Indices of the messages that contain the query, in transcript order. */
  const searchMatches = useMemo(() => {
    if (!searchOpen || !searchTerm) return [];
    const hits: number[] = [];
    (currentConversation?.messages ?? []).forEach((m, i) => {
      if (m.content.toLowerCase().includes(searchTerm)) hits.push(i);
    });
    return hits;
    // `messages` is derived from the conversation on every render, so key the
    // memo on the conversation itself.
  }, [currentConversation, searchOpen, searchTerm]);

  // Clamp rather than reset: deleting a message or narrowing the query should
  // not silently jump the finder back to the first hit.
  const activeMatch = searchMatches.length
    ? Math.min(searchActiveMatch, searchMatches.length - 1)
    : 0;

  const stepMatch = useCallback((delta: number) => {
    setSearchActiveMatch((prev) => {
      const len = searchMatches.length;
      if (len === 0) return 0;
      return (Math.min(prev, len - 1) + delta + len) % len;
    });
  }, [searchMatches.length]);

  const closeChatSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchActiveMatch(0);
  }, []);

  const openChatSearch = useCallback(() => {
    setSearchOpen(true);
    // The field mounts on this render, so focus on the next frame.
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  // A new query starts from the top; a new conversation drops the finder
  // entirely (its results point at messages that are no longer on screen).
  useEffect(() => {
    setSearchActiveMatch(0);
  }, [searchTerm]);

  useEffect(() => {
    closeChatSearch();
  }, [currentConversationId, closeChatSearch]);

  // Bring the active hit into view. `scrollIntoView` rather than scrollTop:
  // the transcript scrolls inside the Radix viewport, not the element the ref
  // is attached to.
  useEffect(() => {
    if (!searchOpen || searchMatches.length === 0) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-message-index="${searchMatches[activeMatch]}"]`
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [searchOpen, searchMatches, activeMatch]);

  // Paint the occurrences inside the rendered markdown. Rebuilt whenever a
  // match or the active hit changes; a no-op on browsers without the CSS
  // Custom Highlight API (the message-level styling above still applies).
  useEffect(() => {
    if (!searchOpen || !searchTerm || searchMatches.length === 0) {
      clearSearchHighlights();
      return;
    }
    const container = scrollRef.current;
    if (!container) return;
    const hits: Range[] = [];
    const active: Range[] = [];
    const activeMessage = searchMatches[activeMatch];
    for (const messageIndex of searchMatches) {
      const el = container.querySelector<HTMLElement>(`[data-message-index="${messageIndex}"]`);
      if (!el) continue;
      const ranges = collectMatchRanges(el, searchTerm);
      hits.push(...ranges);
      if (messageIndex === activeMessage) active.push(...ranges);
    }
    paintSearchHighlights(hits, active);
  }, [searchOpen, searchTerm, searchMatches, activeMatch]);

  useEffect(() => clearSearchHighlights, []);

  useEffect(() => {
    // Documented sign-in check: puter.auth.isSignedIn() (synchronous boolean).
    setIsAuthenticated(checkAuthStatus());
    // Validate the selected model against the live catalog; fall back to the
    // documented default when the stored selection no longer resolves.
    getModelCatalog().then((catalog) => {
      if (!catalog) return;
      setModelCatalog(catalog);
      setSelectedModel((prev) =>
        prev && catalog.ids.has(prev) && !prev.endsWith(":batch")
          ? prev
          : resolveDefaultModel(catalog)
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

    // Prepare the attachments: converted and shrunk where needed, then
    // encoded as the data URLs the image_url blocks carry — and each one gets
    // a Drive reference so it stays visible in the images panel.
    let imageUrls: string[] = [];
    let attachmentRefs: AttachmentRef[] = [];
    if (images && images.length > 0) {
      try {
        ({ dataUrls: imageUrls, refs: attachmentRefs } =
          await prepareAndStoreAttachments(images));
      } catch (error) {
        toast({
          title: "Image processing failed",
          description:
            error instanceof Error
              ? error.message
              : "Failed to process images. Please try again.",
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
    }

    // Create user message with content and image info if present
    let messageContent = content;
    if (imageUrls.length > 0) {
      messageContent = appendImageMarker(content, imageUrls.length);
    }

    const userMessage: Message = {
      role: "user",
      content: messageContent,
      ...(attachmentRefs.length > 0 ? { attachments: attachmentRefs } : {}),
    };
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
      history: toHistory(messages),
      prompt: content,
      modelId: selectedModelId,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    });
  };

  interface ReplyRunnerArgs {
    baseMessages: Message[];
    rollbackMessages: Message[];
    history: { role: "user" | "assistant"; content: string }[];
    prompt: string;
    modelId: string;
    imageUrls?: string[];
    /** When set, the finished answer replaces messages[replaceIndex] in place
        instead of being appended (per-answer retry keeps later messages). */
    replaceIndex?: number;
  }

  /** Shared streaming flow for new messages and regenerations. */
  const runAssistantReply = async ({
    baseMessages,
    rollbackMessages,
    history,
    prompt,
    modelId,
    imageUrls,
    replaceIndex,
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

    const appendAssistantMessage = (assistantContent: string, compaction?: CompactionItem) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentConversationId
            ? {
              ...conv,
              messages:
                replaceIndex !== undefined
                  ? conv.messages.map((m, i) =>
                      i === replaceIndex
                        ? { ...m, content: assistantContent, model: modelId, compaction }
                        : // Summaries made after a regenerated reply covered the old text.
                          i > replaceIndex && m.compaction
                          ? { ...m, compaction: undefined }
                          : m
                    )
                  : [
                      ...baseMessages,
                      {
                        role: "assistant",
                        content: assistantContent,
                        model: modelId,
                        ...(compaction ? { compaction } : {}),
                      },
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

    const onComplete = (fullContent: string, compaction?: CompactionItem) => {
      appendAssistantMessage(fullContent, compaction);
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
      }, imageUrls, controller.signal, contextPlanFor(modelCatalog, modelId));
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
    const rawPrompt = messages[questionIdx].content;
    const hadImages = hasImageMarker(rawPrompt);
    const prompt = stripImageMarker(rawPrompt).trim();
    if (!prompt) {
      // The question *was* the image; retrying would send an empty prompt.
      toast({
        title: "Cannot retry this message",
        description:
          "It was about an attached image, and retries send text only. Attach the image again and resend.",
        variant: "destructive",
        duration: 6000,
      });
      return;
    }
    if (hadImages) {
      toast({
        title: "Retrying without the image",
        description:
          "Retries send text only. The attachment stays in the images panel — re-attach it to include it in a new message.",
        duration: 5000,
      });
    }
    // In-place retry: nothing is removed; the finished answer replaces the
    // old one at aiIndex. History is the conversation up to the question.
    runAssistantReply({
      baseMessages: messages,
      rollbackMessages: messages,
      history: toHistory(messages.slice(0, questionIdx)),
      prompt,
      modelId: selectedModel,
      replaceIndex: aiIndex,
    });
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
      const path = await generateImage(prompt);
      const assistantMessage: Message = { role: "assistant", content: "", imagePath: path };
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

  const handleEditMessage = async (messageIndex: number, newContent: string, images?: File[], model?: string) => {
    if (isStreaming || !currentConversation) return;

    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to use AI models.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    const clean = stripImageMarker(newContent).trim();
    if (!clean && (!images || images.length === 0)) return;

    let imageUrls: string[] = [];
    let attachmentRefs: AttachmentRef[] = [];
    if (images && images.length > 0) {
      try {
        ({ dataUrls: imageUrls, refs: attachmentRefs } =
          await prepareAndStoreAttachments(images));
      } catch (error) {
        toast({
          title: "Image processing failed",
          description:
            error instanceof Error
              ? error.message
              : "Failed to process images. Please try again.",
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
    }

    let messageContent = clean;
    if (imageUrls.length > 0) {
      messageContent = appendImageMarker(clean, imageUrls.length);
    }

    const priorMessages = messages.slice(0, messageIndex);
    const updatedMessages: Message[] = [
      ...priorMessages,
      {
        role: "user",
        content: messageContent,
        ...(attachmentRefs.length > 0 ? { attachments: attachmentRefs } : {}),
      },
    ];

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === currentConversationIdRef.current
          ? {
              ...conv,
              messages: updatedMessages,
              title: messageIndex === 0 ? truncateTitle(clean) : conv.title,
            }
          : conv
      )
    );

    await runAssistantReply({
      baseMessages: updatedMessages,
      rollbackMessages: messages,
      history: toHistory(priorMessages),
      prompt: clean,
      modelId: model || selectedModel,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    });
  };

  const commitTitle = () => {
    const clean = titleDraft.trim();
    if (clean && currentConversationIdRef.current) {
      handleRenameConversation(currentConversationIdRef.current, clean);
    }
    setEditingTitle(false);
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
    // The account menu lives in the rail now: on the overlay layout signing out
    // would otherwise leave the rail covering the sign-in screen.
    if (!isDesktop) setSidebarOpen(false);
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
        ? {
            ...conv,
            // Summaries after the deleted message covered it; drop them.
            messages: conv.messages
              .filter((_, i) => i !== messageIndex)
              .map((m, i) => (i >= messageIndex && m.compaction ? { ...m, compaction: undefined } : m)),
          }
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
    const answer = stripThinkBlocks(aiMsg.content);
    const base = (question || answer).slice(0, 50).replace(/[^a-z0-9]/gi, "_") || "answer";
    const md =
      (question ? `**You:**\n\n${question}\n\n---\n\n` : "") +
      `**AI${model}:**\n\n${answer}\n`;
    downloadFile(`${base}.md`, md);
    toast({ title: "Answer exported", duration: 2000 });
  };

  const handleExport = () => {
    if (!currentConversation) return;

    const filename = `${currentConversation.title.replace(/[^a-z0-9]/gi, '_')}.md`;
    downloadFile(filename, exportAsMarkdown(currentConversation));

    toast({
      title: "Exported as Markdown",
      duration: 2000,
    });
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
        isAuthenticated={isAuthenticated}
        profile={profile}
        onSignOut={handleSignOut}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <main
        className={cn(
          "app-main",
          sidebarOpen ? "app-main-sidebar-open" : "app-main-sidebar-closed",
          artifactsOpen && "app-main-artifacts-open"
        )}
      >
        <header className="app-header">
          <div className="app-header-group app-header-group-start">
            {/* Search finds text in the conversation on screen — it never
                opens the rail. Available docked or collapsed, hence the pill
                only wrapping the rail's own controls. */}
            <div className="app-header-pill">
              {!sidebarOpen && (
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
              )}
              {/* Nothing to search until the transcript exists. */}
              {isAuthenticated && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="app-icon-btn app-header-search-btn"
                  onClick={searchOpen ? closeChatSearch : openChatSearch}
                  title="Search in this conversation"
                  aria-label="Search in this conversation"
                  aria-expanded={searchOpen}
                >
                  <Search className="app-header-icon" aria-hidden="true" />
                </Button>
              )}
              {!sidebarOpen && (
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
              )}
            </div>
          </div>
          {currentConversation &&
            (editingTitle ? (
              <input
                className="app-header-title-input"
                value={titleDraft}
                size={Math.min(Math.max(1, titleDraft.length), 32)}
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
          <div className="app-header-group app-header-group-end">
            {/* Conversation-level actions: the image index, share/export and
                theme. The account lives in the sidebar footer now. */}
            {isAuthenticated && (
              <Button
                variant="ghost"
                size="icon"
                className="app-icon-btn app-header-artifacts"
                onClick={() => setArtifactsOpen((open) => !open)}
                title="Images in this conversation"
                aria-label={`Images in this conversation${
                  imageArtifacts.length > 0 ? ` (${imageArtifacts.length})` : ""
                }`}
                aria-expanded={artifactsOpen}
              >
                <Images className="app-header-icon" aria-hidden="true" />
                {imageArtifacts.length > 0 && (
                  <span className="app-header-artifacts-count" aria-hidden="true">
                    {imageArtifacts.length}
                  </span>
                )}
              </Button>
            )}
            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="app-icon-btn app-header-export" title="Export conversation" aria-label="Export conversation">
                    <Share2 className="app-header-icon" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExport}>
                    Export as Markdown
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <ThemeToggle />
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
            {/* Find-in-conversation. Rendered in the transcript column, above
                the messages it searches — not in the sidebar. */}
            {searchOpen && (
              <div className="app-chat-search" role="search">
                <Search className="app-chat-search-icon" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  name="chat-search"
                  className="app-chat-search-input"
                  placeholder="Search in this conversation…"
                  aria-label="Search in this conversation"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeChatSearch();
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      stepMatch(e.shiftKey ? -1 : 1);
                    }
                  }}
                />
                <span className="app-chat-search-status" aria-live="polite">
                  {searchTerm
                    ? searchMatches.length > 0
                      ? `${activeMatch + 1} / ${searchMatches.length}`
                      : "No results"
                    : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="app-icon-btn"
                  onClick={() => stepMatch(-1)}
                  disabled={searchMatches.length === 0}
                  title="Previous match"
                  aria-label="Previous match"
                >
                  <ChevronUp className="app-header-icon" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="app-icon-btn"
                  onClick={() => stepMatch(1)}
                  disabled={searchMatches.length === 0}
                  title="Next match"
                  aria-label="Next match"
                >
                  <ChevronDown className="app-header-icon" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="app-icon-btn"
                  onClick={closeChatSearch}
                  title="Close search"
                  aria-label="Close search"
                >
                  <X className="app-header-icon" aria-hidden="true" />
                </Button>
              </div>
            )}

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
                      imagePath={message.imagePath}
                      compacted={!!message.compaction}
                      messageIndex={index}
                      searchMatch={searchMatches.includes(index)}
                      searchActive={searchMatches[activeMatch] === index}
                      onCopy={handleCopyMessage}
                      onDelete={() => handleDeleteMessage(index)}
                      onEdit={message.role === "user" ? (content, images, model) => handleEditMessage(index, content, images, model) : undefined}
                      selectedModel={selectedModel}
                      onModelChange={setSelectedModel}
                      modelCatalog={modelCatalog}
                      onShareExchange={
                        message.role === "assistant"
                          ? () => handleShareExchange(index)
                          : undefined
                      }
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

      {/* Image index for the open conversation. Docked at `xl`, an overlay
          below it — the same split the sidebar uses at `lg`. */}
      {isAuthenticated && (
        <ArtifactsPanel
          artifacts={imageArtifacts}
          unsavedAttachments={unsavedAttachments}
          isGeneratingImage={isGeneratingImage}
          isOpen={artifactsOpen}
          onToggle={() => setArtifactsOpen((open) => !open)}
          onLocate={locateMessage}
        />
      )}
    </div>
  );
};

export default Index;
