// State and actions behind the right-hand Contexts panel and the composer's
// injected Context Group pill.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMediaQuery, ARTIFACTS_DOCK_QUERY } from "@/hooks/useMediaQuery";
import { useToast } from "@/hooks/use-toast";
import {
  addItemToContextGroup,
  contextItemFromPayload,
  contextItemKey,
  contextItemToPayload,
  contextPayloadKey,
  createContextGroup,
  createContextSelectionGroup,
  loadContextGroups,
  reclaimContextImagePaths,
  removeItemFromContextGroup,
  saveContextGroups,
  MAX_CONTEXT_IMAGES,
  MAX_CONTEXT_TEXT_ITEMS,
  type ContextDropPayload,
  type ContextGroup,
  type ContextItem,
  type ContextSourceRef,
} from "@/lib/contextGroups";
import { prepareImageAttachments } from "@/lib/attachments";
import { deleteImage, newAttachmentPath, persistAttachment } from "@/lib/images";
import {
  clearSearchHighlights,
  collectMatchRanges,
  paintSearchHighlights,
} from "@/lib/utils/highlight";

interface UseContextsPanelOptions {
  /** Root of the transcript's ScrollArea; locate searches inside it. */
  scrollRef: RefObject<HTMLDivElement>;
  /** Currently open conversation id, used for cross-chat locate. */
  currentConversationId: string;
  /** Switch to another conversation when locating an item from another chat. */
  onSelectConversation: (id: string) => void;
  /** True while a reply streams or an image generates. */
  busy?: boolean;
}

export function useContextsPanel({
  scrollRef,
  currentConversationId,
  onSelectConversation,
  busy = false,
}: UseContextsPanelOptions) {
  const contextsDocked = useMediaQuery(ARTIFACTS_DOCK_QUERY);
  const { toast } = useToast();
  const [contextsOpen, setContextsOpen] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("contexts_open") === "true" : false
  );
  useEffect(() => localStorage.setItem("contexts_open", String(contextsOpen)), [contextsOpen]);

  const [contextGroups, setContextGroups] = useState<ContextGroup[]>(() => loadContextGroups());
  useEffect(() => saveContextGroups(contextGroups), [contextGroups]);

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(
    () => loadContextGroups()[0]?.id ?? null
  );
  const [injectedGroupId, setInjectedGroupId] = useState<string | null>(null);
  const [selectionItems, setSelectionItems] = useState<ContextItem[]>([]);

  const injectedContext = useMemo(
    () =>
      selectionItems.length > 0
        ? createContextSelectionGroup(selectionItems)
        : contextGroups.find((g) => g.id === injectedGroupId) ?? null,
    [contextGroups, injectedGroupId, selectionItems]
  );

  const injectedItemKeys = useMemo(() => {
    if (selectionItems.length > 0) return new Set(selectionItems.map(contextItemKey));
    const group = contextGroups.find((g) => g.id === injectedGroupId);
    return new Set((group?.items ?? []).map(contextItemKey));
  }, [contextGroups, injectedGroupId, selectionItems]);

  const createGroup = useCallback((seed?: ContextDropPayload): ContextGroup => {
    const group = createContextGroup(seed);
    setContextGroups((prev) => [group, ...prev]);
    setExpandedGroupId(group.id);
    return group;
  }, []);

  const addItem = useCallback(
    (payload: ContextDropPayload, targetGroupId?: string) => {
      setContextGroups((prev) => {
        const targetId = targetGroupId ?? expandedGroupId ?? prev[0]?.id;
        const target = prev.find((g) => g.id === targetId);
        if (!target) {
          const fresh = createContextGroup(payload);
          setExpandedGroupId(fresh.id);
          toast({
            title: "Added to new context",
            description: fresh.title,
            duration: 2000,
          });
          return [fresh, ...prev];
        }

        const { group: updated, added, reason } = addItemToContextGroup(target, payload);
        if (!added) {
          if (reason === "image_limit") {
            toast({
              title: "Image limit reached",
              description: `A context group can hold up to ${MAX_CONTEXT_IMAGES} images.`,
              variant: "destructive",
              duration: 3000,
            });
          } else if (reason === "text_limit") {
            toast({
              title: "Item limit reached",
              description: `A context group can hold up to ${MAX_CONTEXT_TEXT_ITEMS} text items.`,
              variant: "destructive",
              duration: 3000,
            });
          }
          return prev;
        }

        setExpandedGroupId(target.id);
        toast({
          title: "Added to context",
          description: updated.title,
          duration: 2000,
        });
        return prev.map((g) => (g.id === target.id ? updated : g));
      });
    },
    [expandedGroupId, toast]
  );

  /**
   * Handle OS files dropped or picked into a Context Group (images or text/code files).
   */
  const addFilesToContext = useCallback(
    async (files: File[], targetGroupId?: string) => {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      const textFiles = files.filter(
        (f) =>
          !f.type.startsWith("image/") &&
          (f.type.startsWith("text/") || /\.(txt|md|json|csv|py|ts|tsx|js|jsx|sh|html|css)$/i.test(f.name))
      );

      if (imageFiles.length > 0) {
        try {
          const prepared = await prepareImageAttachments(imageFiles);
          for (const attachment of prepared) {
            const path = newAttachmentPath(attachment.mimeType);
            void persistAttachment(attachment.file, path);
            addItem(
              {
                kind: "image",
                ref: path,
                refKind: "drive",
                origin: "attachment",
                label: attachment.file.name || "Uploaded image",
                ownedPath: true,
              },
              targetGroupId
            );
          }
        } catch (error) {
          toast({
            title: "Could not add image to context",
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
            duration: 4000,
          });
        }
      }

      for (const file of textFiles) {
        try {
          const content = (await file.text()).trim();
          if (!content) continue;
          const isCode = /\.(py|ts|tsx|js|jsx|sh|html|css|json)$/i.test(file.name);
          addItem(
            {
              kind: isCode ? "code" : "text",
              text: content,
              label: isCode ? `</> ${file.name}` : file.name,
            },
            targetGroupId
          );
        } catch {
          // Ignore unreadable file.
        }
      }
    },
    [addItem, toast]
  );

  const removeItem = useCallback((groupId: string, itemId: string) => {
    setContextGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        const { group: updated, removed } = removeItemFromContextGroup(group, itemId);
        if (removed) {
          for (const path of reclaimContextImagePaths([removed])) {
            void deleteImage(path);
          }
        }
        return updated;
      })
    );
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    setContextGroups((prev) => {
      const doomed = prev.find((g) => g.id === groupId);
      if (doomed) {
        for (const path of reclaimContextImagePaths(doomed.items)) {
          void deleteImage(path);
        }
      }
      const next = prev.filter((g) => g.id !== groupId);
      setExpandedGroupId((curr) => (curr === groupId ? (next[0]?.id ?? null) : curr));
      return next;
    });
    setInjectedGroupId((curr) => (curr === groupId ? null : curr));
  }, []);

  const renameGroup = useCallback((groupId: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setContextGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, title: clean, updatedAt: Date.now() } : g
      )
    );
  }, []);

  const injectGroup = useCallback(
    (group: ContextGroup) => {
      if (group.items.length === 0) {
        toast({
          title: "Context is empty",
          description: "Drag or add an image or text into this context first.",
          duration: 3000,
        });
        return;
      }
      setSelectionItems([]);
      setInjectedGroupId(group.id);
      if (!contextsDocked) setContextsOpen(false);
    },
    [contextsDocked, toast]
  );

  /**
   * Left-arrow (`←`) on a single item, and "Use as context" in the transcript:
   * queue exactly that image, text, code block, or table in the composer.
   *
   * Clicking the same item again removes it, and clicking a second item adds
   * to the same selection, so several artifacts can be gathered without first
   * creating a saved Context Group. Injecting a whole group replaces it.
   */
  const injectItem = useCallback(
    (payload: ContextDropPayload) => {
      const key = contextPayloadKey(payload);
      const alreadySelected = selectionItems.some(
        (item) => contextItemKey(item) === key
      );

      if (alreadySelected) {
        setSelectionItems((prev) =>
          prev.filter((item) => contextItemKey(item) !== key)
        );
        toast({
          title: "Removed from input context",
          description: payload.label,
          duration: 1800,
        });
      } else {
        setSelectionItems((prev) => [...prev, contextItemFromPayload(payload)]);
        toast({
          title: "Added to input context",
          description: payload.label,
          duration: 1800,
        });
      }

      // A selected item supersedes a whole-group injection rather than merging
      // with it: the pill must describe exactly what this turn will send.
      setInjectedGroupId(null);
      if (!contextsDocked) setContextsOpen(false);
    },
    [contextsDocked, selectionItems, toast]
  );

  /** `←` inside a saved Context Group, where the item is already an item. */
  const injectContextItem = useCallback(
    (item: ContextItem) => injectItem(contextItemToPayload(item)),
    [injectItem]
  );

  const clearInjectedContext = useCallback(() => {
    setSelectionItems([]);
    setInjectedGroupId(null);
  }, []);

  const removeInjectedItem = useCallback((itemId: string) => {
    setSelectionItems((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

  /**
   * Best-effort provenance for text that arrived without one (a plain-text drop
   * where the browser dropped our custom MIME). Finds the message in the open
   * transcript that contains the snippet, so the new row still gets a working
   * `→` locate button instead of a dead control.
   */
  const resolveTextSource = useCallback(
    (text: string): ContextSourceRef | undefined => {
      const root = scrollRef.current;
      const probe = text.trim().slice(0, 40);
      if (!root || !probe) return undefined;
      for (const el of Array.from(
        root.querySelectorAll<HTMLElement>("[data-message-index]")
      )) {
        if (collectMatchRanges(el, probe).length === 0) continue;
        const index = Number(el.dataset.messageIndex);
        if (!Number.isFinite(index)) continue;
        return {
          conversationId: currentConversationId,
          messageIndex: index,
          highlightText: probe,
        };
      }
      return undefined;
    },
    [currentConversationId, scrollRef]
  );

  const flashTimer = useRef<number | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const flashed = useRef<HTMLElement | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    },
    []
  );

  /**
   * Right-arrow (`→`) action on any image, text, code, or table item inside a
   * Context Group: jumps to the item's source message/block in the chat and
   * highlights it so the user sees where it came from.
   */
  const locateContextItem = useCallback(
    (source: ContextSourceRef) => {
      if (
        source.conversationId &&
        source.conversationId !== currentConversationId
      ) {
        if (busy) {
          toast({
            title: "Available when the reply finishes",
            duration: 2500,
          });
          return;
        }
        onSelectConversation(source.conversationId);
      }

      if (!contextsDocked) setContextsOpen(false);

      const snippetCandidates = (): string[] => {
        const raw = source.highlightText?.trim() ?? "";
        if (!raw) return [];
        // Progressively shorter prefixes: a long snippet may span elements, and
        // the first handful of words is what the user recognises anyway.
        const firstLine = raw.split("\n")[0] ?? raw;
        const list = [firstLine.slice(0, 80), firstLine.slice(0, 50), firstLine.slice(0, 30)];
        const flat = raw.replace(/\s+/g, " ").trim();
        list.push(flat.slice(0, 60), flat.slice(0, 30));
        return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
      };

      /** The message element the item came from, or null. */
      const findMessage = (): HTMLElement | null => {
        const root = scrollRef.current;
        if (!root) return null;
        const byIndex = root.querySelector<HTMLElement>(
          `[data-message-index="${source.messageIndex}"]`
        );
        if (byIndex) return byIndex;
        // Indices go stale (a message was deleted or an edit truncated the
        // tail). Fall back to the text the user actually saved.
        for (const snippet of snippetCandidates()) {
          for (const candidate of Array.from(
            root.querySelectorAll<HTMLElement>("[data-message-index]")
          )) {
            if (collectMatchRanges(candidate, snippet).length > 0) return candidate;
          }
        }
        return null;
      };

      const start = Date.now();
      const attemptLocate = () => {
        const message = findMessage();
        if (!message) {
          // The transcript may still be mounting after a conversation switch.
          if (Date.now() - start < 1200) {
            window.setTimeout(attemptLocate, 60);
          } else {
            toast({
              title: "Could not find that text in this chat",
              description:
                "The message it came from may have been edited or deleted. The saved text is still in the context.",
              duration: 5000,
            });
          }
          return;
        }

        const block =
          typeof source.at === "number"
            ? message.querySelector<HTMLElement>(
                `.msg-answer [data-artifact-at="${source.at}"]`
              )
            : null;
        const imageEl =
          !block && !source.highlightText
            ? message.querySelector<HTMLElement>(".msg-image")
            : null;

        const target = block ?? imageEl ?? message;
        target.scrollIntoView({ block: "center", behavior: "smooth" });

        if (flashed.current && flashed.current !== target) {
          flashed.current.removeAttribute("data-artifact-flash");
        }
        target.removeAttribute("data-artifact-flash");
        void target.offsetWidth;
        target.setAttribute("data-artifact-flash", "");
        flashed.current = target;

        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => {
          target.removeAttribute("data-artifact-flash");
          flashTimer.current = null;
          flashed.current = null;
        }, 1800);

        if (source.highlightText) {
          // Highlight only the saved text itself. The `data-artifact-flash`
          // ring above already marks the message, so the whole message keeps
          // its normal background — no yellow tint behind it.
          let painted = false;
          for (const snippet of snippetCandidates()) {
            const ranges = collectMatchRanges(message, snippet);
            if (ranges.length === 0) continue;
            paintSearchHighlights(ranges, ranges);
            painted = true;
            break;
          }
          if (painted) {
            if (highlightTimer.current !== null) {
              window.clearTimeout(highlightTimer.current);
            }
            highlightTimer.current = window.setTimeout(() => {
              clearSearchHighlights();
              highlightTimer.current = null;
            }, 2200);
          }
        }
      };
      // A short delay lets the panel start its close transition before the
      // transcript scrolls, so the two animations do not fight.
      window.setTimeout(attemptLocate, 30);
    },
    [busy, contextsDocked, currentConversationId, onSelectConversation, scrollRef, toast]
  );

  return {
    contextsDocked, contextsOpen, setContextsOpen, contextGroups,
    expandedGroupId, setExpandedGroupId, injectedContext, createGroup,
    addItem, addFilesToContext, removeItem, deleteGroup, renameGroup,
    injectGroup, injectItem, injectContextItem, injectedItemKeys,
    clearInjectedContext, removeInjectedItem, locateContextItem, resolveTextSource,
  };
}
