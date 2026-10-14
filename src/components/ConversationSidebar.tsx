import { MessageSquare, Plus, Menu, PanelLeftClose, Trash2, Search, Sparkles, Cloud, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import "./ConversationSidebar.css";

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
    local: { icon: <CloudOff className="sidebar-sync-icon" />, label: "Local only" },
    syncing: { icon: <Loader2 className="sidebar-sync-icon-spin" />, label: "Syncing\u2026" },
    synced: { icon: <Cloud className="sidebar-sync-icon" />, label: "Synced" },
    error: { icon: <CloudOff className="sidebar-sync-icon" />, label: "Sync failed" },
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
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onToggle}
        />
      )}

      <aside
        className={cn("sidebar", isOpen ? "sidebar-open" : "sidebar-closed")}
      >
        {/* Header with logo */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="sidebar-logo">
              <Sparkles className="sidebar-logo-icon" />
            </span>
            <span className="sidebar-brand-text">AI Chat</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="sidebar-close-btn"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="sidebar-close-icon" aria-hidden="true" />
          </Button>
        </div>

        {/* New chat button */}
        <div className="sidebar-newchat-wrap">
          <Button
            onClick={() => {
              onNewConversation();
              if (window.innerWidth < 768) onToggle();
            }}
            className="sidebar-newchat-btn"
            aria-label="Start new chat"
          >
            <Plus className="sidebar-newchat-icon" aria-hidden="true" />
            Start new chat
          </Button>
        </div>

        {/* Search input */}
        <div className="sidebar-search-wrap">
          <div className="sidebar-search-relative">
            <Search className="sidebar-search-icon" aria-hidden="true" />
            <Input
              id="search-conversations"
              name="search"
              aria-label="Search conversations"
              placeholder="Search conversations…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="sidebar-search-input"
            />
          </div>
        </div>

        {/* Sync status */}
        <div className="sidebar-sync">
          {syncMeta.icon}
          <span>{syncMeta.label}</span>
        </div>

        {/* Conversations list */}
        <ScrollArea className="sidebar-scroll">
          <div className="sidebar-list">
            <div className="sidebar-list-heading">
              Recent
            </div>
            {filteredConversations.length === 0 ? (
              <div className="sidebar-empty">
                {searchQuery ? "No conversations found" : "No conversations yet"}
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "conv-row group",
                    currentConversationId === conv.id ? "conv-row-active" : "conv-row-inactive"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectConversation(conv.id);
                      if (window.innerWidth < 768) onToggle();
                    }}
                    className="conv-row-btn"
                    aria-label={`Open conversation: ${conv.title}`}
                  >
                    <MessageSquare className="conv-row-icon" aria-hidden="true" />
                    <span className="conv-row-title">{conv.title}</span>
                  </button>
                  <div className="conv-row-delete-wrap">
                    {confirmId === conv.id ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="conv-row-confirm-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirmTimer.current) clearTimeout(confirmTimer.current);
                          setConfirmId(null);
                          onDeleteConversation(conv.id);
                        }}
                        aria-label="Confirm delete conversation"
                      >
                        Confirm?
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="conv-row-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          armDelete(conv.id);
                        }}
                        title="Delete conversation"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="conv-row-delete-icon" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

      </aside>
    </>
  );
};
