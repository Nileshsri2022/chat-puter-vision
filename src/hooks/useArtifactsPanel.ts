// State and derived data behind the artifacts panel.
//
// Moved out of Index.tsx without behaviour changes (Phase 3 spec §9.1): the
// page was far past the 500-line house limit, and the panel's wiring is the
// part Phase 3 grows. Index keeps the header toggle and every handler that
// writes messages; this hook only reads them.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMediaQuery, ARTIFACTS_DOCK_QUERY } from "@/hooks/useMediaQuery";
import { collectArtifacts, countUnsavedAttachments, type LocateOptions } from "@/lib/artifacts";
import type { Conversation } from "@/pages/Index";

interface UseArtifactsPanelOptions {
  /** Root of the transcript's ScrollArea; locate searches inside it. */
  scrollRef: RefObject<HTMLDivElement>;
  /** The open conversation, if any. */
  conversation: Conversation | undefined;
}

export function useArtifactsPanel({ scrollRef, conversation }: UseArtifactsPanelOptions) {
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

  /**
   * Artifacts in the open conversation (images, code blocks, tables), derived
   * on every render. Messages are index-keyed and deleting one splices the
   * array, so a stored pointer would go stale — recomputing is what keeps an
   * entry aimed at the right message. Parses are cached per message object
   * (lib/artifactBlocks.ts), so this stays cheap while a reply streams.
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
  // The element currently flashing, so a second locate inside the 1.4s window
  // can clear it. Otherwise it keeps the attribute, and under reduced motion
  // its outline never goes away.
  const flashed = useRef<HTMLElement | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    []
  );

  /**
   * Scroll the transcript to a message, or to one code block or table in it,
   * and flash it. `scrollIntoView` rather than scrollTop: the scroller is
   * Radix's viewport, not the element the ref is attached to (issue #34) —
   * find-in-chat does the same.
   */
  const locateMessage = useCallback(
    (messageIndex: number, opts?: LocateOptions) => {
      if (!artifactsDocked) setArtifactsOpen(false);
      // Next frame, so the panel's own close has been committed first.
      window.setTimeout(() => {
        const message = scrollRef.current?.querySelector<HTMLElement>(
          `[data-message-index="${messageIndex}"]`
        );
        if (!message) return;
        // A block is looked up inside the answer only: ChatMessage stamps
        // offsets there and nowhere else (thinking renders a different
        // string). A block that is gone falls back to the whole message.
        const block =
          typeof opts?.at === "number"
            ? message.querySelector<HTMLElement>(`.msg-answer [data-artifact-at="${opts.at}"]`)
            : null;
        const el = block ?? message;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        if (flashed.current && flashed.current !== el) {
          flashed.current.removeAttribute("data-artifact-flash");
        }
        // Remove-then-set with a reflow between: locating the same image twice
        // would otherwise leave the one-shot animation finished and invisible.
        el.removeAttribute("data-artifact-flash");
        void el.offsetWidth;
        el.setAttribute("data-artifact-flash", "");
        flashed.current = el;
        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => {
          el.removeAttribute("data-artifact-flash");
          flashTimer.current = null;
          flashed.current = null;
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
