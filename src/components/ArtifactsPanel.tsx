import { useEffect, useMemo, useRef, useState } from "react";
import { X, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ArtifactTile } from "@/components/ArtifactTile";
import { ArtifactRow } from "@/components/ArtifactRow";
import { TextPreviewDialog } from "@/components/TextPreviewDialog";
import { cn } from "@/lib/utils";
import {
  countArtifactKinds,
  isImageArtifact,
  type Artifact,
  type ArtifactKind,
  type CodeArtifact,
  type LocateOptions,
  type TableArtifact,
  type TextArtifact,
} from "@/lib/artifacts";
import "./ArtifactsPanel.css";

// Legacy images fold into "attached", as in Phase 1: to the user they are
// simply images that were attached.
type Filter = "all" | "generated" | "attached" | "code" | "table";

const CHIPS: { id: Exclude<Filter, "all">; label: string; count: (k: Record<ArtifactKind, number>) => number }[] = [
  { id: "generated", label: "Generated", count: (k) => k.generated },
  { id: "attached", label: "Attached", count: (k) => k.attached + k.legacy },
  { id: "code", label: "Code", count: (k) => k.code },
  { id: "table", label: "Tables", count: (k) => k.table },
];

const matchesFilter = (a: Artifact, filter: Filter): boolean => {
  switch (filter) {
    case "all":
      return true;
    case "attached":
      return a.kind === "attached" || a.kind === "legacy";
    default:
      return a.kind === filter;
  }
};

interface ArtifactsPanelProps {
  /** Artifacts in the open conversation, in transcript order. */
  artifacts: Artifact[];
  /** Attachments claimed by a legacy marker whose bytes were never stored. */
  unsavedAttachments: number;
  /** A `txt2img` call is in flight; the panel shows a pending tile. */
  isGeneratingImage?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  /** Scroll the transcript to this message (or one block in it) and flash it. */
  onLocate: (messageIndex: number, opts?: LocateOptions) => void;
}

const SectionTitle = ({ label, count }: { label: string; count: number }) => (
  <h3 className="artifacts-section-title">
    {label}
    {count > 0 && (
      <span className="artifacts-section-count" aria-hidden="true">
        {count}
      </span>
    )}
  </h3>
);

/**
 * The right-hand index of what the open conversation produced: images, code
 * blocks and tables.
 *
 * Docked at `xl` and an overlay below it (see ARTIFACTS_DOCK_QUERY). Contents
 * are derived from the transcript on every render, so deleting a message can
 * never leave an entry pointing at the wrong one.
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
  const [textPreview, setTextPreview] = useState<TextArtifact | null>(null);
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

  const kinds = useMemo(() => countArtifactKinds(artifacts), [artifacts]);
  // Chips only earn their row when there is something to choose between:
  // narrowing "All" down to the only kind present is noise.
  const filters = useMemo(() => {
    const present = CHIPS.map((chip) => ({ id: chip.id, label: chip.label, count: chip.count(kinds) })).filter(
      (chip) => chip.count > 0
    );
    return present.length >= 2
      ? [{ id: "all" as Filter, label: "All", count: artifacts.length }, ...present]
      : [];
  }, [artifacts.length, kinds]);

  // With nothing to choose between, or a stale filter left over from a
  // transcript that had that kind, everything is shown.
  const activeFilter: Filter = filters.some((f) => f.id === filter) ? filter : "all";

  const groups = useMemo(() => {
    const visible = artifacts.filter((a) => matchesFilter(a, activeFilter));
    return {
      count: visible.length,
      images: visible.filter(isImageArtifact),
      code: visible.filter((a): a is CodeArtifact => a.kind === "code"),
      tables: visible.filter((a): a is TableArtifact => a.kind === "table"),
    };
  }, [artifacts, activeFilter]);

  // The pending tile belongs to the images it will become.
  const showPending = Boolean(isGeneratingImage) && (activeFilter === "all" || activeFilter === "generated");
  const hasImages = groups.images.length > 0 || showPending;
  // Headings only when there is more than one group, so an image-only chat
  // looks exactly like the Phase 1 grid.
  const showHeadings = [hasImages, groups.code.length > 0, groups.tables.length > 0].filter(Boolean).length >= 2;

  const renderRows = (items: TextArtifact[]) => (
    <div className="artifacts-list">
      {items.map((artifact) => (
        <ArtifactRow
          key={artifact.id}
          artifact={artifact}
          position={`message ${artifact.messageIndex + 1}`}
          onLocate={() => onLocate(artifact.messageIndex, { at: artifact.at })}
          onPreview={() => setTextPreview(artifact)}
        />
      ))}
    </div>
  );

  return (
    <>
      {isOpen && <div className="artifacts-overlay" onClick={onToggle} aria-hidden="true" />}
      <aside
        ref={panelRef}
        className={cn("artifacts-panel", isOpen ? "artifacts-panel-open" : "artifacts-panel-closed")}
        aria-label="Artifacts in this conversation"
      >
        <div className="artifacts-header">
          <div className="artifacts-title-row">
            <Layers className="artifacts-title-icon" aria-hidden="true" />
            <h2 className="artifacts-title">Artifacts</h2>
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
            title="Close artifacts panel"
            aria-label="Close artifacts panel"
          >
            <X className="artifacts-close-icon" aria-hidden="true" />
          </Button>
        </div>

        {filters.length > 0 && (
          <div className="artifacts-filters" role="group" aria-label="Filter artifacts">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                className={cn("artifacts-filter", activeFilter === f.id && "artifacts-filter-active")}
                onClick={() => setFilter(f.id)}
                aria-pressed={activeFilter === f.id}
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
          {groups.count === 0 && !showPending ? (
            <div className="artifacts-empty">
              <span className="artifacts-empty-badge">
                <Layers className="artifacts-empty-icon" aria-hidden="true" />
              </span>
              <p className="artifacts-empty-title">Nothing collected in this chat yet</p>
              <p className="artifacts-empty-sub">
                Images, code blocks and tables collect here so you can jump
                back to them.
              </p>
            </div>
          ) : (
            <div className="artifacts-sections">
              {hasImages && (
                <section className="artifacts-section">
                  {showHeadings && <SectionTitle label="Images" count={groups.images.length} />}
                  <div className="artifacts-grid">
                    {groups.images.map((artifact) => (
                      <ArtifactTile
                        key={artifact.id}
                        artifact={artifact}
                        position={`message ${artifact.messageIndex + 1}`}
                        onLocate={() => onLocate(artifact.messageIndex)}
                        onPreview={(src) => setPreview({ src, label: artifact.label })}
                      />
                    ))}
                    {showPending && (
                      <div className="artifacts-tile artifacts-tile-pending" role="status">
                        <span className="artifacts-tile-missing">
                          <span className="artifacts-tile-spinner" aria-hidden="true" />
                          <span className="artifacts-tile-missing-text">Generating…</span>
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {groups.code.length > 0 && (
                <section className="artifacts-section">
                  {showHeadings && <SectionTitle label="Code" count={groups.code.length} />}
                  {renderRows(groups.code)}
                </section>
              )}
              {groups.tables.length > 0 && (
                <section className="artifacts-section">
                  {showHeadings && <SectionTitle label="Tables" count={groups.tables.length} />}
                  {renderRows(groups.tables)}
                </section>
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

      {/* Outside the <aside>: the panel is transformed, and a transformed
          ancestor would confine a fixed-position overlay to the panel. */}
      {preview && (
        <ImageLightbox
          src={preview.src}
          alt={preview.label}
          caption={preview.label}
          onClose={() => setPreview(null)}
        />
      )}
      {textPreview && <TextPreviewDialog artifact={textPreview} onClose={() => setTextPreview(null)} />}
    </>
  );
};
