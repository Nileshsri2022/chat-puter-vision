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
  type ImageArtifact,
  type TextArtifact,
} from "@/lib/artifacts";
import "./ArtifactsPanel.css";

/** Options for locating an artifact. `at` targets a block within the message. */
export interface LocateOptions {
  at?: number;
}

/** Chips fold `legacy` into `attached`, as Phase 1 did. */
type ChipKind = "generated" | "attached" | "code" | "table";
type Filter = "all" | ChipKind;

interface ArtifactsPanelProps {
  /** Every artifact in the open conversation, in transcript order. */
  artifacts: Artifact[];
  /** Attachments claimed by a legacy marker whose bytes were never stored. */
  unsavedAttachments: number;
  /** A `txt2img` call is in flight; the panel shows a pending tile. */
  isGeneratingImage?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  /** Scroll the transcript to a message (or a block in it) and flash it. */
  onLocate: (messageIndex: number, opts?: LocateOptions) => void;
}

/** Chip order follows the spec: Generated · Attached · Code · Tables. */
const CHIPS: { id: ChipKind; label: string }[] = [
  { id: "generated", label: "Generated" },
  { id: "attached", label: "Attached" },
  { id: "code", label: "Code" },
  { id: "table", label: "Tables" },
];

/** Legacy images are attachments, as they were in Phase 1. */
const chipOf = (a: Artifact): ChipKind => (a.kind === "legacy" ? "attached" : a.kind);

const GROUP_TITLE = { images: "Images", code: "Code", table: "Tables" } as const;

/**
 * The artifacts index for the open conversation: images, code blocks and
 * tables from assistant answers.
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
  const chipCounts: Record<ChipKind, number> = {
    generated: kinds.generated,
    attached: kinds.attached + kinds.legacy,
    code: kinds.code,
    table: kinds.table,
  };
  // Chips only earn their row when there is something to choose between: a
  // single chip next to "All" is noise.
  const chips = CHIPS.filter((c) => chipCounts[c.id] > 0);
  const showFilters = chips.length >= 2;
  // A stale filter, left over from a transcript that had that kind, shows all.
  const active: Filter = showFilters && chips.some((c) => c.id === filter) ? filter : "all";

  const visible = useMemo(
    () => (active === "all" ? artifacts : artifacts.filter((a) => chipOf(a) === active)),
    [artifacts, active]
  );

  const images = visible.filter(isImageArtifact);
  const texts = visible.filter((a): a is TextArtifact => !isImageArtifact(a));
  const codes = texts.filter((a) => a.kind === "code");
  const tables = texts.filter((a) => a.kind === "table");
  const showPending = Boolean(isGeneratingImage) && (active === "all" || active === "generated");

  // The pending tile is an image, so it belongs to the Images group.
  const groups = [
    { id: "images" as const, items: images, pending: showPending },
    { id: "code" as const, items: codes, pending: false },
    { id: "table" as const, items: tables, pending: false },
  ].filter((g) => g.items.length > 0 || g.pending);
  // Headings only when two or more groups exist, so an image-only chat looks
  // exactly like the Phase 1 grid.
  const headed = active === "all" && groups.length >= 2;
  const nothingToShow = visible.length === 0 && !showPending;

  const renderImages = (items: ImageArtifact[], pending: boolean) => (
    <div className="artifacts-grid">
      {items.map((artifact) => (
        <ArtifactTile
          key={artifact.id}
          artifact={artifact}
          position={`message ${artifact.messageIndex + 1}`}
          onLocate={() => onLocate(artifact.messageIndex)}
          onPreview={(src) => setPreview({ src, label: artifact.label })}
        />
      ))}
      {pending && (
        <div className="artifacts-tile artifacts-tile-pending" role="status">
          <span className="artifacts-tile-missing">
            <span className="artifacts-tile-spinner" aria-hidden="true" />
            <span className="artifacts-tile-missing-text">Generating…</span>
          </span>
        </div>
      )}
    </div>
  );

  const renderRows = (items: TextArtifact[]) => (
    <div className="artifacts-rows">
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

        {showFilters && (
          <div className="artifacts-filters" role="group" aria-label="Filter artifacts">
            {[
              { id: "all" as Filter, label: "All", count: artifacts.length },
              ...chips.map((c) => ({ id: c.id as Filter, label: c.label, count: chipCounts[c.id] })),
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={cn("artifacts-filter", active === f.id && "artifacts-filter-active")}
                onClick={() => setFilter(f.id)}
                aria-pressed={active === f.id}
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
          {nothingToShow ? (
            <div className="artifacts-empty">
              <span className="artifacts-empty-badge">
                <Layers className="artifacts-empty-icon" aria-hidden="true" />
              </span>
              <p className="artifacts-empty-title">Nothing collected in this chat yet</p>
              <p className="artifacts-empty-sub">
                Images, code blocks, tables and text you extract from images collect here.
              </p>
            </div>
          ) : (
            <div className="artifacts-body">
              {groups.map((group) => (
                <section key={group.id} className="artifacts-group">
                  {headed && <h3 className="artifacts-group-title">{GROUP_TITLE[group.id]}</h3>}
                  {group.id === "images"
                    ? renderImages(group.items as ImageArtifact[], group.pending)
                    : renderRows(group.items as TextArtifact[])}
                </section>
              ))}
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
      {textPreview && (
        <TextPreviewDialog artifact={textPreview} onClose={() => setTextPreview(null)} />
      )}
    </>
  );
};
