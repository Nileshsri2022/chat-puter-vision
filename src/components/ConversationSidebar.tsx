import { Plus, PanelLeftClose, Trash2, Search, MoreHorizontal, Pencil, Pin, Share2, ListChecks, X, CircleUserRound, ChevronsUpDown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProfileInfo } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect, useMemo } from "react";
import { DESKTOP_QUERY } from "@/hooks/useMediaQuery";
import "./ConversationSidebar.css";

interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
  pinned?: boolean;
  messages?: Array<{ role: string; content: string }>;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onDeleteConversations: (ids: string[]) => void;
  onRenameConversation: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onShareConversation: (id: string) => void;
  /** Account block pinned to the bottom of the rail. */
  isAuthenticated: boolean;
  profile: ProfileInfo | null;
  onSignOut: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

const DAY_MS = 86400000;

export const ConversationSidebar = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  isOpen,
  onToggle,
  onDeleteConversation,
  onDeleteConversations,
  onRenameConversation,
  onTogglePin,
  onShareConversation,
  isAuthenticated,
  profile,
  onSignOut,
}: ConversationSidebarProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  // Row "..." menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  // Inline rename
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // Two-step delete inside the menu
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
  // Multi-select mode
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const exitSelect = () => {
    setMultiSelect(false);
    setSelectedIds(new Set());
    setConfirmBulk(false);
  };
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const closeMobile = () => {
    // Only auto-dismiss on the overlay layout. Above `lg` the sidebar is docked
    // and dismissing it would collapse the layout out from under the selection.
    if (window.matchMedia(DESKTOP_QUERY).matches) return;
    onToggle();
  };

  // Filter conversations based on search query
  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (conv.messages?.some(msg =>
      msg.content.toLowerCase().includes(searchQuery.toLowerCase())
    ) ?? false)
  );

  // Time groups, DeepSeek-style
  const groups = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const pinned: Conversation[] = [];
    const today: Conversation[] = [];
    const week: Conversation[] = [];
    const month: Conversation[] = [];
    const older: Conversation[] = [];
    for (const conv of filteredConversations) {
      if (conv.pinned) {
        pinned.push(conv);
        continue;
      }
      const t = new Date(conv.timestamp).getTime();
      if (Number.isNaN(t) || t >= startOfToday) today.push(conv);
      else if (t >= startOfToday - 7 * DAY_MS) week.push(conv);
      else if (t >= startOfToday - 30 * DAY_MS) month.push(conv);
      else older.push(conv);
    }
    return [
      { label: "Pinned", items: pinned },
      { label: "Today", items: today },
      { label: "Previous 7 Days", items: week },
      { label: "Previous 30 Days", items: month },
      { label: "Older", items: older },
    ].filter((g) => g.items.length > 0);
  }, [filteredConversations]);

  const commitRename = (id: string) => {
    onRenameConversation(id, renameDraft);
    setRenameId(null);
    setMenuOpenId(null);
  };

  const renderRow = (conv: Conversation) => {
    const isActive = currentConversationId === conv.id;
    const isRenaming = renameId === conv.id;
    if (multiSelect) {
      const checked = selectedIds.has(conv.id);
      return (
        <div key={conv.id} className={cn("conv-row", checked && "conv-row-selected")}>
          <button
            type="button"
            onClick={() => toggleSelected(conv.id)}
            className="conv-row-btn"
            aria-pressed={checked}
            aria-label={`Select conversation: ${conv.title}`}
          >
            <span className={cn("conv-check", checked && "conv-check-on")} aria-hidden="true" />
            <span className="conv-row-title" title={conv.title}>{conv.title}</span>
          </button>
        </div>
      );
    }
    return (
      <div
        key={conv.id}
        className={cn("conv-row group", isActive ? "conv-row-active" : "conv-row-inactive")}
      >
        {isRenaming ? (
          <input
            className="conv-rename-input"
            value={renameDraft}
            autoFocus
            aria-label="Rename conversation"
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename(conv.id);
              else if (e.key === "Escape") {
                setRenameId(null);
                setMenuOpenId(null);
              }
            }}
            onBlur={() => commitRename(conv.id)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              onSelectConversation(conv.id);
              closeMobile();
            }}
            className="conv-row-btn"
            title={conv.title}
            aria-label={`Open conversation: ${conv.title}`}
          >
            {conv.pinned && <Pin className="conv-pin-icon" aria-hidden="true" />}
            <span className="conv-row-title">{conv.title}</span>
          </button>
        )}
        {!isRenaming && (
          <div className="conv-row-menu-wrap">
            <Button
              variant="ghost"
              size="icon"
              className="conv-row-menu-btn"
              aria-label={`Conversation options: ${conv.title}`}
              aria-expanded={menuOpenId === conv.id}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmId(null);
                setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
              }}
            >
              <MoreHorizontal className="conv-row-menu-icon" aria-hidden="true" />
            </Button>
            {menuOpenId === conv.id && (
              <div className="conv-menu" role="menu">
                <button
                  type="button"
                  className="conv-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setRenameDraft(conv.title);
                    setRenameId(conv.id);
                  }}
                >
                  <Pencil className="conv-menu-icon" aria-hidden="true" />
                  Rename
                </button>
                <button
                  type="button"
                  className="conv-menu-item"
                  role="menuitem"
                  onClick={() => {
                    onTogglePin(conv.id);
                    setMenuOpenId(null);
                  }}
                >
                  <Pin className="conv-menu-icon" aria-hidden="true" />
                  {conv.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  className="conv-menu-item"
                  role="menuitem"
                  onClick={() => {
                    onShareConversation(conv.id);
                    setMenuOpenId(null);
                  }}
                >
                  <Share2 className="conv-menu-icon" aria-hidden="true" />
                  Share
                </button>
                <button
                  type="button"
                  className="conv-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpenId(null);
                    setSelectedIds(new Set([conv.id]));
                    setMultiSelect(true);
                  }}
                >
                  <ListChecks className="conv-menu-icon" aria-hidden="true" />
                  Multi-select
                </button>
                {confirmId === conv.id ? (
                  <button
                    type="button"
                    className="conv-menu-item conv-menu-item-confirm"
                    role="menuitem"
                    onClick={() => {
                      if (confirmTimer.current) clearTimeout(confirmTimer.current);
                      setConfirmId(null);
                      setMenuOpenId(null);
                      onDeleteConversation(conv.id);
                    }}
                  >
                    <Trash2 className="conv-menu-icon" aria-hidden="true" />
                    Click to confirm
                  </button>
                ) : (
                  <button
                    type="button"
                    className="conv-menu-item conv-menu-item-danger"
                    role="menuitem"
                    onClick={() => armDelete(conv.id)}
                  >
                    <Trash2 className="conv-menu-icon" aria-hidden="true" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onToggle}
        />
      )}
      {/* Scrim to close the row menu on outside click */}
      {menuOpenId && (
        <div
          className="conv-menu-scrim"
          onClick={() => {
            setMenuOpenId(null);
            setConfirmId(null);
          }}
        />
      )}

      <aside
        className={cn("sidebar", isOpen ? "sidebar-open" : "sidebar-closed")}
      >
        {/* Header with logo */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="sidebar-brand-text">FreeTalk</span>
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

        {multiSelect ? (
          <div className="sidebar-select-head">
            <span className="sidebar-select-title">Select Chats</span>
            <Button
              variant="ghost"
              size="icon"
              className="sidebar-close-btn"
              onClick={exitSelect}
              title="Exit selection"
              aria-label="Exit selection"
            >
              <X className="sidebar-close-icon" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <>
            {/* New chat button */}
            <div className="sidebar-newchat-wrap">
              <Button
                onClick={() => {
                  onNewConversation();
                  closeMobile();
                }}
                className="sidebar-newchat-btn"
                aria-label="Start new chat"
              >
                <Plus className="sidebar-newchat-icon" aria-hidden="true" />
                New chat
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
          </>
        )}

        {/* Conversations list */}
        <ScrollArea className="sidebar-scroll">
          <div className="sidebar-list">
            {groups.length === 0 ? (
              <div className="sidebar-empty">
                {searchQuery ? "No conversations found" : "No conversations yet"}
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <div className="sidebar-list-heading">
                    {group.label}
                  </div>
                  {group.items.map(renderRow)}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Account — pinned to the bottom of the rail, above the select bar
            when that mode is active. */}
        {isAuthenticated && (
          <div className="sidebar-footer">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="sidebar-account-btn"
                  title={profile?.name ?? "Account"}
                  aria-label={`Account menu: ${profile?.name ?? "Account"}`}
                >
                  {profile?.picture ? (
                    <img src={profile.picture} alt="" className="sidebar-account-img" />
                  ) : (
                    <span className="sidebar-account-avatar" aria-hidden="true">
                      <CircleUserRound className="sidebar-account-avatar-icon" />
                    </span>
                  )}
                  <span className="sidebar-account-name">{profile?.name ?? "Account"}</span>
                  <ChevronsUpDown className="sidebar-account-chevron" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              {/* Opens upward: the trigger sits at the very bottom of the rail. */}
              <DropdownMenuContent align="start" side="top" className="sidebar-account-menu">
                <DropdownMenuLabel className="sidebar-account-label">
                  {profile?.name ?? "Account"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className="gap-2">
                  <LogOut className="sidebar-account-menu-icon" aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Multi-select action bar */}
        {multiSelect && (
          <div className="sidebar-select-bar">
            <Button
              variant="ghost"
              className="sidebar-select-action"
              disabled={selectedIds.size === 0}
              onClick={() => {
                selectedIds.forEach((id) => onTogglePin(id));
                exitSelect();
              }}
            >
              <Pin className="sidebar-select-action-icon" aria-hidden="true" />
              Pin
            </Button>
            {confirmBulk ? (
              <Button
                variant="ghost"
                className="sidebar-select-action sidebar-select-action-confirm"
                onClick={() => {
                  onDeleteConversations([...selectedIds]);
                  exitSelect();
                }}
              >
                <Trash2 className="sidebar-select-action-icon" aria-hidden="true" />
                Confirm?
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="sidebar-select-action"
                disabled={selectedIds.size === 0}
                onClick={() => setConfirmBulk(true)}
              >
                <Trash2 className="sidebar-select-action-icon" aria-hidden="true" />
                Delete
              </Button>
            )}
          </div>
        )}

      </aside>
    </>
  );
};
