import { ArrowLeft, ArrowRight, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContextItem } from "@/lib/contextGroups";
import "./ContextsPanel.css";

interface ContextItemActionsMenuProps {
  item: ContextItem;
  variant: "image" | "row";
  isInjected?: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onInject?: () => void;
  onLocate?: () => void;
  onRemove: () => void;
}

function injectActionLabel(label: string, active: boolean): string {
  return active ? `Remove ${label} from input context` : `Inject ${label} into input`;
}

export function ContextItemActionsMenu({
  item,
  variant,
  isInjected = false,
  isOpen,
  onOpenChange,
  onInject,
  onLocate,
  onRemove,
}: ContextItemActionsMenuProps) {
  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {variant === "image" ? (
          <button
            type="button"
            className="context-thumb-more tap-expand"
            title={`Actions for ${item.label}`}
            aria-label={`Actions for ${item.label}`}
          >
            <MoreHorizontal className="context-thumb-icon" aria-hidden="true" />
          </button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="context-item-action context-item-more tap-expand"
            title={`Actions for ${item.label}`}
            aria-label={`Actions for ${item.label}`}
          >
            <MoreHorizontal className="context-item-action-icon" aria-hidden="true" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="left"
        sideOffset={8}
        collisionPadding={8}
        className="context-actions-menu"
      >
        {onInject && (
          <DropdownMenuItem
            className={`context-actions-menu-item${isInjected ? " context-actions-menu-item-active" : ""}`}
            aria-label={injectActionLabel(item.label, isInjected)}
            onSelect={onInject}
          >
            <ArrowLeft className="context-actions-menu-icon" aria-hidden="true" />
            <span>{isInjected ? "Remove from input" : "Inject into input"}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="context-actions-menu-item"
          aria-label={`Show ${item.label} in chat`}
          disabled={!onLocate}
          title={!onLocate ? "No source — item was added from outside the chat" : undefined}
          onSelect={() => onLocate?.()}
        >
          <ArrowRight className="context-actions-menu-icon" aria-hidden="true" />
          <span>Show in chat</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="context-actions-menu-separator" />
        <DropdownMenuItem
          className="context-actions-menu-item context-actions-menu-item-danger"
          aria-label={`Remove ${item.label}`}
          onSelect={onRemove}
        >
          <X className="context-actions-menu-icon" aria-hidden="true" />
          <span>Remove from context</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
