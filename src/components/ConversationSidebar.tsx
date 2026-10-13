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
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className="fixed top-3 left-3 z-50 md:hidden rounded-lg"
      >
        <Menu className="w-5 h-5" />
      </Button>

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
          "w-[260px] flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
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
            className="hidden md:flex h-8 w-8"
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
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
        <ScrollArea className="flex-1">
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
                <button
                  key={conv.id}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    if (window.innerWidth < 768) onToggle();
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg transition-all",
                    "hover:bg-sidebar-accent text-sm group",
                    currentConversationId === conv.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground"
                  )}
                >
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-60" />
                      <span className="truncate">{conv.title}</span>
                    </div>
                    {confirmId === conv.id ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs font-medium text-red-600 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
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
                        className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent selecting conversation
                          armDelete(conv.id);
                        }}
                        title="Delete conversation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Attribution required by the Puter docs */}
        <div className="border-t border-sidebar-border px-4 py-2">
          <a
            href="https://developer.puter.com"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Powered by Puter
          </a>
        </div>
      </aside>
    </>
  );
};
