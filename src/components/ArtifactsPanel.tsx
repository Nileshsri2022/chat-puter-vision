import { useEffect, useMemo, useRef, useState } from "react";
import { X, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ArtifactTile } from "@/components/ArtifactTile";
import { cn } from "@/lib/utils";
import { countByKind, type ImageArtifact, type ImageArtifactKind } from "@/lib/artifacts";
import "./ArtifactsPanel.css";

type Filter = "all" | ImageArtifactKind;

interface ArtifactsPanelProps {
  /** Images in the open conversation, in transcript order. */
  artifacts: ImageArtifact[];
  /** Attachments claimed by a legacy marker whose bytes were never stored. */
  unsavedAttachments: number;
  /** A `txt2img` call is in flight; the panel shows a pending tile. */
  isGeneratingImage?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  /** Scroll the transcript to this message and flash it. */
  onLocate: (messageIndex: number) => void;
}

/**
 * The right-hand image index for the open conversation.
 *
 * Docked at `xl` and an overlay below it (see ARTIFACTS_DOCK_QUERY). Contents
 * are derived from the transcript on every render, so deleting a message can
 * never leave a tile pointing at the wrong one.
 */
export const ArtifactsPanel = ({
  artifacts,
  unsavedAttachments,
  isGeneratingImage,
  isOpen,
  onToggle,
  onLocate,
}: ArtifactsPanelProps) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [preview, setPreview] = useState<{ src: string; label: string } | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  // A closed panel is translated off-screen but still mounted (that is what
  // makes it slide). `inert` takes it out of the tab order and the a11y tree,
  // which `aria-hidden` alone cannot do while it holds focusable buttons.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (isOpen) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [isOpen]);

  const kinds = useMemo(() => countByKind(artifacts), [artifacts]);
  // "attached" also covers legacy attachments, which is what `legacy` is.
  const attachedCount = kinds.attached + kinds.legacy;
  // Filters only earn their row when there is something to choose between:
  // narrowing "All" down to the only kind present is noise.
  const filters = useMemo(
    () =>
      kinds.generated > 0 && attachedCount > 0
        ? [
            { id: "all" as Filter, label: "All", count: artifacts.length },
            { id: "generated" as Filter, label: "Generated", count: kinds.generated },
            { id: "attached" as Filter, label: "Attached", count: attachedCount },
          ]
        : [],
    [artifacts.length, kinds.generated, attachedCount]
  );

  const visible = useMemo(() => {
    // With nothing to choose between (or a stale filter left over from a
    // transcript that did have both kinds) every image is shown.
    if (filters.length === 0 || filter === "all") return artifacts;
    return filter === "generated"
      ? artifacts.filter((a) => a.kind === "generated")
      : artifacts.filter((a) => a.kind !== "generated");
  }, [artifacts, filter, filters.length]);

  return (
    <>
      {isOpen && <div className="artifacts-overlay" onClick={onToggle} aria-hidden="true" />}
      <aside
        ref={panelRef}
        className={cn("artifacts-panel", isOpen ? "artifacts-panel-open" : "artifacts-panel-closed")}
        aria-label="Images in this conversation"
      >
        <div className="artifacts-header">
          <div className="artifacts-title-row">
            <Images className="artifacts-title-icon" aria-hidden="true" />
            <h2 className="artifacts-title">Images</h2>
            {artifacts.length > 0 && (
              <span className="artifacts-count" aria-hidden="true">
                {artifacts.length}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="artifacts-close-btn tap-expand"
            onClick={onToggle}
            title="Close images panel"
            aria-label="Close images panel"
          >
            <X className="artifacts-close-icon" aria-hidden="true" />
          </Button>
        </div>

        {filters.length > 0 && (
          <div className="artifacts-filters" role="group" aria-label="Filter images">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                className={cn("artifacts-filter", filter === f.id && "artifacts-filter-active")}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
              >
                {f.label}
                <span className="artifacts-filter-count" aria-hidden="true">
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        )}

        <ScrollArea className="artifacts-scroll">
          {visible.length === 0 && !isGeneratingImage ? (
            <div className="artifacts-empty">
              <span className="artifacts-empty-badge">
                <Images className="artifacts-empty-icon" aria-hidden="true" />
              </span>
              <p className="artifacts-empty-title">No images in this chat yet</p>
              <p className="artifacts-empty-sub">
                Images you attach and images the model generates are collected
                here so you can jump back to them.
              </p>
            </div>
          ) : (
            <div className="artifacts-grid">
              {visible.map((artifact) => (
                <ArtifactTile
                  key={artifact.id}
                  artifact={artifact}
                  position={`message ${artifact.messageIndex + 1}`}
                  onLocate={() => onLocate(artifact.messageIndex)}
                  onPreview={(src) => setPreview({ src, label: artifact.label })}
                />
              ))}
              {isGeneratingImage && (
                <div className="artifacts-tile artifacts-tile-pending" role="status">
                  <span className="artifacts-tile-missing">
                    <span className="artifacts-tile-spinner" aria-hidden="true" />
                    <span className="artifacts-tile-missing-text">Generating…</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {unsavedAttachments > 0 && (
          <p className="artifacts-note">
            {unsavedAttachments} image{unsavedAttachments === 1 ? "" : "s"} attached
            before this version {unsavedAttachments === 1 ? "isn't" : "aren't"} recoverable.
          </p>
        )}
      </aside>

      {preview && (
        <ImageLightbox
          src={preview.src}
          alt={preview.label}
          caption={preview.label}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
};
