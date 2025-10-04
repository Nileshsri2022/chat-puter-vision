import { MessageSquare, Plus, Menu, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ClaudeLogo } from "./ClaudeLogo";

interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const ConversationSidebar = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  isOpen,
  onToggle,
}: ConversationSidebarProps) => {
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
            <ClaudeLogo className="w-6 h-6 text-primary" />
            <span className="font-semibold text-sidebar-foreground">Claude</span>
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
            onClick={onNewConversation}
            className="w-full justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-10 font-medium"
          >
            <Plus className="w-4 h-4" />
            Start new chat
          </Button>
        </div>

        {/* Conversations list */}
        <ScrollArea className="flex-1">
          <div className="px-2 pb-2 space-y-1">
            <div className="text-xs font-semibold text-muted-foreground px-3 py-2">
              Recent
            </div>
            {conversations.map((conv) => (
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
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-60" />
                  <span className="truncate">{conv.title}</span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>
    </>
  );
};
