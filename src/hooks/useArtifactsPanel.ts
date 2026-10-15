import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { collectArtifacts, countUnsavedAttachments } from "@/lib/artifacts";
import { useMediaQuery, ARTIFACTS_DOCK_QUERY } from "@/hooks/useMediaQuery";
import type { Message } from "@/lib/backend";

/**
 * The artifacts panel's state and wiring, moved out of `Index.tsx` (Phase 3,
 * §9.1). Behavior is unchanged: the same open/close persistence, the same
 * derived lists, and the same locate-and-flash.
 */
export function useArtifactsPanel({
  scrollRef,
  conversation,
}: {
  scrollRef: RefObject<HTMLDivElement>;
  conversation: { messages: Message[] } | undefined;
}) {
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

  /**
   * Images in the open conversation, derived on every render. Messages are
   * index-keyed and deleting one splices the array, so a stored pointer would
   * go stale — recomputing is what keeps a tile aimed at the right message.
   */
  const artifacts = useMemo(
    () => collectArtifacts(conversation?.messages ?? []),
    [conversation]
  );
  /** Attachments claimed by a legacy marker whose bytes were never stored. */
  const unsavedAttachments = useMemo(
    () => countUnsavedAttachments(conversation?.messages ?? []),
    [conversation]
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
    (messageIndex: number, opts?: { at?: number }) => {
      if (!artifactsDocked) setArtifactsOpen(false);
      // Next frame, so the panel's own close has been committed first.
      window.setTimeout(() => {
        const root = scrollRef.current;
        // A code block or table is located by its offset in the answer (§6.5).
        // If the block is gone, the message flash is the fallback.
        const block =
          opts?.at === undefined
            ? null
            : root?.querySelector<HTMLElement>(
                `[data-message-index="${messageIndex}"] .msg-answer [data-artifact-at="${opts.at}"]`
              );
        const el =
          block ?? root?.querySelector<HTMLElement>(`[data-message-index="${messageIndex}"]`);
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
    [artifactsDocked, scrollRef]
  );

  return {
    artifactsDocked,
    artifactsOpen,
    setArtifactsOpen,
    artifacts,
    unsavedAttachments,
    locateMessage,
  };
}
