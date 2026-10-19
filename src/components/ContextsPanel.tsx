import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ChevronDown, ChevronRight, Code2, FileText,
  Pencil, Plus, Table2, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextItemActionsMenu } from "@/components/ContextItemActionsMenu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePuterImage } from "@/hooks/usePuterImage";
import { cn } from "@/lib/utils";
import {
  CONTEXT_DRAG_MIME, contextItemKey, decodeContextDragPayload,
  isContextImageItem, isContextTextItem,
  type ContextDropPayload, type ContextGroup, type ContextImageItem,
  type ContextItem, type ContextSourceRef,
} from "@/lib/contextGroups";
import "./ContextsPanel.css";

interface ContextsPanelProps {
  contextGroups: ContextGroup[];
  expandedGroupId: string | null;
  injectedGroupId?: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onExpandGroup: (groupId: string | null) => void;
  onCreateGroup: (seed?: ContextDropPayload) => void;
  onAddItem: (payload: ContextDropPayload, targetGroupId?: string) => void;
  onAddFiles?: (files: File[], targetGroupId?: string) => void;
  onRemoveItem: (groupId: string, itemId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, newTitle: string) => void;
  onInjectGroup: (group: ContextGroup) => void;
  /** Left-arrow (`←`) on a single item: queue only that item in the composer. */
  onInjectItem?: (item: ContextItem) => void;
  /** Keys of the items already queued in the composer (from `contextItemKey`). */
  injectedItemKeys?: Set<string>;
  onLocateItem: (source: ContextSourceRef) => void;
  /** Best-effort provenance for a plain-text drop. */
  resolveTextSource?: (text: string) => ContextSourceRef | undefined;
  /** Optional controlled item id whose shared `...` action menu is open. */
  openActionItemId?: string | null;
}

const ContextThumb = ({
  item, isInjected, isMenuOpen, onMenuOpenChange, onInject, onRemove, onLocate,
}: {
  item: ContextImageItem;
  isInjected?: boolean;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onInject?: () => void;
  onRemove: () => void;
  onLocate?: () => void;
}) => {
  const { src, failed } = usePuterImage(
    item.refKind === "drive" ? item.ref : undefined,
    item.refKind === "data" ? item.ref : undefined
  );

  return (
    <div className={cn("context-thumb group", isInjected && "context-thumb-injected")}>
      {src ? (
        <img src={src} alt={item.label} className="context-thumb-img" loading="lazy" />
      ) : (
        <span className="context-thumb-missing">{failed ? "Unavailable" : "Loading…"}</span>
      )}
      <div
        className={cn("context-thumb-actions", isMenuOpen && "context-thumb-actions-open")}
        onClick={(e) => e.stopPropagation()}
      >
        <ContextItemActionsMenu
          item={item}
          variant="image"
          isInjected={Boolean(isInjected)}
          isOpen={isMenuOpen}
          onOpenChange={onMenuOpenChange}
          onInject={onInject}
          onRemove={onRemove}
          onLocate={onLocate}
        />
      </div>
    </div>
  );
};

export const ContextsPanel = ({
  contextGroups, expandedGroupId, injectedGroupId, isOpen, onToggle,
  onExpandGroup, onCreateGroup, onAddItem, onAddFiles, onRemoveItem,
  onDeleteGroup, onRenameGroup, onInjectGroup, onInjectItem, injectedItemKeys,
  onLocateItem, resolveTextSource, openActionItemId,
}: ContextsPanelProps) => {
  const panelRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileTargetGroupId, setFileTargetGroupId] = useState<string | undefined>(undefined);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [internalOpenItemId, setInternalOpenItemId] = useState<string | null>(null);
  const activeMenuItemId = openActionItemId !== undefined ? openActionItemId : internalOpenItemId;

  const setItemMenuOpen = (itemId: string, open: boolean) => {
    if (openActionItemId !== undefined) return;
    setInternalOpenItemId(open ? itemId : null);
  };

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (isOpen) {
      el.removeAttribute("inert");
    } else {
      el.setAttribute("inert", "");
      setInternalOpenItemId(null);
    }
  }, [isOpen]);

  const handleDropData = (e: React.DragEvent, targetGroupId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    const rawContext = e.dataTransfer.getData(CONTEXT_DRAG_MIME);
    if (rawContext) {
      const payload = decodeContextDragPayload(rawContext);
      if (payload) { onAddItem(payload, targetGroupId); return; }
    }

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0 && onAddFiles) { onAddFiles(files, targetGroupId); return; }

    const plainText = e.dataTransfer.getData("text/plain")?.trim();
    if (plainText) {
      const firstLine = plainText.split("\n")[0]?.trim().slice(0, 36) || "Text snippet";
      const source = resolveTextSource?.(plainText);
      onAddItem(
        {
          kind: "text",
          text: plainText,
          label: firstLine.length < plainText.length ? `${firstLine}…` : firstLine,
          ...(source ? { source } : {}),
        },
        targetGroupId
      );
    }
  };

  const commitRename = (groupId: string) => {
    const clean = titleDraft.trim();
    if (clean) onRenameGroup(groupId, clean);
    setEditingGroupId(null);
  };

  return (
    <>
      {isOpen && <div className="contexts-overlay" onClick={onToggle} aria-hidden="true" />}
      <aside
        ref={panelRef}
        className={cn("contexts-panel", isOpen ? "contexts-panel-open" : "contexts-panel-closed")}
        aria-label="Contexts"
      >
        <div className="contexts-header">
          <div className="contexts-title-row">
            <h2 className="contexts-title">contexts</h2>
            {contextGroups.length > 0 && (
              <span className="contexts-count" aria-hidden="true">{contextGroups.length}</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="contexts-close-btn tap-expand"
            onClick={onToggle}
            title="Close contexts panel"
            aria-label="Close contexts panel"
          >
            <X className="contexts-close-icon" aria-hidden="true" />
          </Button>
        </div>

        <div className="contexts-toolbar">
          <button type="button" className="contexts-new-btn" onClick={() => onCreateGroup()}>
            <Plus className="contexts-new-icon" aria-hidden="true" />
            New Context
          </button>
        </div>

        <ScrollArea className="contexts-scroll">
          <div className="contexts-list">
            {contextGroups.length === 0 ? (
              <div className="context-empty">
                <button
                  type="button"
                  className={cn("context-dropzone", dragOverId === "__empty__" && "context-dropzone-active")}
                  onDragOver={(e) => { e.preventDefault(); setDragOverId("__empty__"); }}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={(e) => handleDropData(e, undefined)}
                  onClick={() => { setFileTargetGroupId(undefined); fileInputRef.current?.click(); }}
                >
                  <Plus className="contexts-new-icon" aria-hidden="true" />
                  Drag &amp; drop images or text here
                </button>
                <p className="context-empty-title">No contexts yet</p>
                <p className="context-empty-sub">
                  Drag any image, text selection, code block, or table here to build a reusable context group.
                </p>
              </div>
            ) : (
              contextGroups.map((group) => {
                const isExpanded = expandedGroupId === group.id;
                const isInjected = injectedGroupId === group.id;
                const images = group.items.filter(isContextImageItem);
                const texts = group.items.filter(isContextTextItem);

                return (
                  <div
                    key={group.id}
                    className={cn("context-card", dragOverId === group.id && "context-card-dragover", isInjected && "context-card-injected")}
                    onDragOver={(e) => { e.preventDefault(); setDragOverId(group.id); }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={(e) => handleDropData(e, group.id)}
                  >
                    <div className="context-card-head">
                      {editingGroupId === group.id ? (
                        <input
                          className="context-card-title-input"
                          value={titleDraft}
                          autoFocus
                          aria-label="Rename context"
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(group.id);
                            else if (e.key === "Escape") setEditingGroupId(null);
                          }}
                          onBlur={() => commitRename(group.id)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="context-card-toggle"
                          aria-expanded={isExpanded}
                          onClick={() => onExpandGroup(isExpanded ? null : group.id)}
                        >
                          <span className="context-card-title">{group.title}</span>
                          {isExpanded ? <ChevronDown className="context-card-chevron" aria-hidden="true" /> : <ChevronRight className="context-card-chevron" aria-hidden="true" />}
                        </button>
                      )}

                      {!isExpanded && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="context-card-quick-inject tap-expand"
                          onClick={() => onInjectGroup(group)}
                          title={`Inject ${group.title} into input`}
                          aria-label={`Inject ${group.title} into input`}
                        >
                          <ArrowLeft className="context-item-action-icon" aria-hidden="true" />
                        </Button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="context-card-body">
                        <button
                          type="button"
                          className={cn("context-dropzone", dragOverId === `${group.id}:drop` && "context-dropzone-active")}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverId(`${group.id}:drop`); }}
                          onDragLeave={() => setDragOverId(null)}
                          onDrop={(e) => handleDropData(e, group.id)}
                          onClick={() => { setFileTargetGroupId(group.id); fileInputRef.current?.click(); }}
                        >
                          <Plus className="contexts-new-icon" aria-hidden="true" />
                          Drag &amp; drop images or text here
                        </button>

                        {images.length > 0 && (
                          <div className="context-images-grid">
                            {images.map((img) => (
                              <ContextThumb
                                key={img.id}
                                item={img}
                                isInjected={injectedItemKeys?.has(contextItemKey(img))}
                                isMenuOpen={activeMenuItemId === img.id}
                                onMenuOpenChange={(open) => setItemMenuOpen(img.id, open)}
                                onInject={onInjectItem ? () => onInjectItem(img) : undefined}
                                onRemove={() => onRemoveItem(group.id, img.id)}
                                onLocate={img.source ? () => onLocateItem(img.source!) : undefined}
                              />
                            ))}
                          </div>
                        )}

                        {texts.length > 0 && (
                          <div className="context-items-list">
                            {texts.map((item) => {
                              const KindIcon =
                                item.kind === "code" ? Code2 : item.kind === "table" ? Table2 : FileText;
                              const isItemInjected = injectedItemKeys?.has(contextItemKey(item));
                              const isMenuOpen = activeMenuItemId === item.id;
                              return (
                                <div
                                  key={item.id}
                                  className={cn("context-item-row", isItemInjected && "context-item-row-injected")}
                                >
                                  <KindIcon className="context-item-kind-icon" aria-hidden="true" />
                                  <span className="context-item-label" title={item.text.slice(0, 120)}>
                                    {item.label}
                                  </span>
                                  <div className="context-item-actions" onClick={(e) => e.stopPropagation()}>
                                    <ContextItemActionsMenu
                                      item={item}
                                      variant="row"
                                      isInjected={Boolean(isItemInjected)}
                                      isOpen={isMenuOpen}
                                      onOpenChange={(open) => setItemMenuOpen(item.id, open)}
                                      onInject={onInjectItem ? () => onInjectItem(item) : undefined}
                                      onLocate={item.source ? () => onLocateItem(item.source!) : undefined}
                                      onRemove={() => onRemoveItem(group.id, item.id)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="context-card-footer">
                          <button
                            type="button"
                            className={cn("context-inject-btn", isInjected && "context-inject-btn-active")}
                            onClick={() => onInjectGroup(group)}
                            title={`Inject ${group.title} into input`}
                            aria-label={`Inject ${group.title} into input`}
                          >
                            <ArrowLeft className="context-item-action-icon" aria-hidden="true" />
                            Inject into input
                          </button>
                          <div className="context-item-actions">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="context-card-action tap-expand"
                              onClick={() => { setTitleDraft(group.title); setEditingGroupId(group.id); }}
                              title="Rename context"
                              aria-label={`Rename ${group.title}`}
                            >
                              <Pencil className="context-item-action-icon" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="context-card-action-danger tap-expand"
                              onClick={() => onDeleteGroup(group.id)}
                              title="Delete context"
                              aria-label={`Delete ${group.title}`}
                            >
                              <Trash2 className="context-item-action-icon" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.txt,.md,.json,.csv,.py,.ts,.tsx,.js,.jsx,.sh,.html,.css"
          className="hidden"
          aria-label="Add files to context"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0 && onAddFiles) onAddFiles(files, fileTargetGroupId);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      </aside>
    </>
  );
};
