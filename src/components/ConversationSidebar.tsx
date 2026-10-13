import { MessageSquare, Plus, Menu, PanelLeftClose, Trash2, Search, Sparkles, Cloud, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
  messages?: Array<{ role: string; content: string }>;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  syncStatus?: "local" | "syncing" | "synced" | "error";
}

export const ConversationSidebar = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  isOpen,
  onToggle,
  onDeleteConversation,
  syncStatus = "local",
}: ConversationSidebarProps) => {
  const syncMeta = {
    local: { icon: <CloudOff className="h-3 w-3" />, label: "Local only" },
    syncing: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Syncing\u2026" },
    synced: { icon: <Cloud className="h-3 w-3" />, label: "Synced" },
    error: { icon: <CloudOff className="h-3 w-3" />, label: "Sync failed" },
  }[syncStatus];
  const [searchQuery, setSearchQuery] = useState("");

  // Two-step delete: first click arms, second click confirms. Disarms after 3s.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);
  const armDelete = (id: string) => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmId(id);
    confirmTimer.current = setTimeout(() => setConfirmId(null), 3000);
  };

  // Filter conversations based on search query
  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (conv.messages?.some(msg =>
      msg.content.toLowerCase().includes(searchQuery.toLowerCase())
    ) ?? false)
  );
  return (
    <>
      {/* Mobile menu button (only visible when sidebar is closed) */}
      {!isOpen && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="fixed top-3 left-3 z-50 md:hidden rounded-lg bg-background/80 backdrop-blur-sm border shadow-sm"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </Button>
      )}

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 md:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border transition-transform duration-300 z-40",
          "w-64 flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header with logo */}
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="font-semibold text-sidebar-foreground">AI Chat</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="flex h-8 w-8"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>

        {/* New chat button */}
        <div className="p-3">
          <Button
            onClick={() => {
              onNewConversation();
              if (window.innerWidth < 768) onToggle();
            }}
            className="w-full justify-start gap-2 rounded-lg h-10 font-medium"
          >
            <Plus className="w-4 h-4" />
            Start new chat
          </Button>
        </div>

        {/* Search input */}
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="search-conversations"
              name="search"
              placeholder="Search conversations…"
              aria-label="Search conversations"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-sidebar-accent/50 border-sidebar-border"
            />
          </div>
        </div>

        {/* Sync status */}
        <div className="flex items-center gap-1.5 px-6 pb-2 text-[11px] text-muted-foreground">
          {syncMeta.icon}
          <span>{syncMeta.label}</span>
        </div>

        {/* Conversations list */}
        <ScrollArea className="flex-1 overflow-x-hidden">
          <div className="px-2 pb-2 space-y-1">
            <div className="text-xs font-semibold text-muted-foreground px-3 py-2">
              Recent
            </div>
            {filteredConversations.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">
                {searchQuery ? "No conversations found" : "No conversations yet"}
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "group flex items-center justify-between gap-1 w-full rounded-lg px-2 py-1 transition-colors text-sm",
                    currentConversationId === conv.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/70"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectConversation(conv.id);
                      if (window.innerWidth < 768) onToggle();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left py-1.5 px-1 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={`Select conversation: ${conv.title}`}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                    <span className="truncate">{conv.title}</span>
                  </button>
                  {confirmId === conv.id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs font-medium text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirmTimer.current) clearTimeout(confirmTimer.current);
                        setConfirmId(null);
                        onDeleteConversation(conv.id);
                      }}
                    >
                      Confirm?
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => armDelete(conv.id)}
                      title="Delete conversation"
                      aria-label={`Delete conversation ${conv.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>


      </aside>
    </>
  );
};
