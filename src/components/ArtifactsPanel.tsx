import { useEffect, useMemo, useRef, useState } from "react";
import { X, Images, Maximize2, Copy, Download, Check, Sparkles, Paperclip, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageLightbox } from "@/components/ImageLightbox";
import { usePuterImage } from "@/hooks/usePuterImage";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  basenameOf,
  countByKind,
  KIND_LABEL,
  type Artifact,
  type ArtifactKind,
} from "@/lib/artifacts";
import { loadImageBlob } from "@/lib/images";
import { copyToClipboard, dataUrlToBlob, downloadBlob } from "@/lib/utils/export";
import "./ArtifactsPanel.css";

type Filter = "all" | ArtifactKind;

interface ArtifactsPanelProps {
  /** Images in the open conversation, in transcript order. */
  artifacts: Artifact[];
  /** Attachments claimed by a legacy marker whose bytes were never stored. */
  unsavedAttachments: number;
  /** A `txt2img` call is in flight; the panel shows a pending tile. */
  isGeneratingImage?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  /** Scroll the transcript to this message and flash it. */
  onLocate: (messageIndex: number) => void;
}

/** Kind badge copy. `legacy` reads as an attachment: that is what it was. */
const KIND_BADGE: Record<ArtifactKind, string> = {
  image: "Image",
  code: "Code",
  table: "Table",
  ocr: "OCR Text",
  export: "Export",
};

/** The bytes behind an artifact, for copy and download. Null when unreachable. */
async function resolveBlob(artifact: Artifact): Promise<Blob | null> {
  const path = artifact.data?.image?.path;
  if (path) {
    try {
      return await loadImageBlob(path);
    } catch {
      return null;
    }
  }
  const src = artifact.data?.code?.content || artifact.data?.table?.html || artifact.data?.ocr?.text || artifact.data?.export?.content;
  if (!src) return null;
  if (src.startsWith("data:")) return dataUrlToBlob(src);
  try {
    const response = await fetch(src);
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

function filenameFor(artifact: Artifact): string {
  // `label` is the original file name when the browser gave one.
  const kind = artifact.kind;
  if (kind === "image" && (artifact.label === "Attached" || artifact.label === "Image")) {
    return artifact.path ? basenameOf(artifact.path) : "image.png";
  }
  if (kind === "code" && artifact.label === "Attached") {
    return "code.snippet";
  }
  if (kind === "table" && artifact.label === "Attached") {
    return "table.html";
  }
  if (kind === "ocr" && artifact.label === "Attached") {
    return "ocr-text.txt";
  }
  if (kind === "export" && artifact.label === "Attached") {
    return "export.md";
  }
  return artifact.label || "artifact";
}

/** One thumbnail. Its own component so the image hook runs per tile. */
const ArtifactTile = ({
  artifact,
  position,
  onLocate,
  onPreview,
}: {
  artifact: Artifact;
  position: string;
  onLocate: () => void;
  onPreview: (src: string) => void;
}) => {
  const { src, failed } = usePuterImage(artifact.data?.image?.path || artifact.data?.code?.content || artifact.data?.table?.html || artifact.data?.ocr?.text || artifact.data?.export?.content, undefined);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleCopy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await resolveBlob(artifact);
      const clipboard = navigator.clipboard as Clipboard | undefined;
      if (blob && clipboard && typeof clipboard.write === "function" && typeof ClipboardItem !== "undefined") {
        try {
          await clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
          toast({ title: "Image copied", duration: 2000 });
          return;
        } catch {
          // Bitmap copy refused (permissions or an unsupported container):
          // fall back to the reference instead of reporting a copy that did
          // not happen — see issue #45.
        }
      }
      const text = artifact.path ?? artifact.src ?? "";
      const ok = text ? await copyToClipboard(text) : false;
      if (ok) {
        toast({ title: "Image reference copied", description: "The image itself could not be put on the clipboard.", duration: 3500 });
      } else {
        toast({ title: "Copy failed", description: "The clipboard rejected the request.", variant: "destructive", duration: 5000 });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await resolveBlob(artifact);
      if (!blob) {
        toast({ title: "Download failed", description: "The image could not be read from storage.", variant: "destructive", duration: 5000 });
        return;
      }
      downloadBlob(filenameFor(artifact), blob);
      toast({ title: "Image downloaded", duration: 2000 });
    } finally {
      setBusy(false);
    }
  };

  const KindIcon = artifact.kind === "generated" ? Sparkles : Paperclip;

  return (
    <div className="artifacts-tile group">
      <button
        type="button"
        className="artifacts-tile-btn"
        onClick={onLocate}
        title={`Show in chat — ${artifact.label}`}
        aria-label={`${artifact.label}, ${position}. Show in chat.`}
      >
        {src ? (
          <img src={src} alt={artifact.label} className="artifacts-tile-img" loading="lazy" />
        ) : (
          <span className="artifacts-tile-missing">
            {failed ? <ImageOff className="artifacts-tile-missing-icon" aria-hidden="true" /> : null}
            <span className="artifacts-tile-missing-text">
              {failed ? "Unavailable" : "Loading…"}
            </span>
          </span>
        )}
        <span className="artifacts-tile-badge">
          <KindIcon className="artifacts-tile-badge-icon" aria-hidden="true" />
          {KIND_BADGE[artifact.kind]}
        </span>
      </button>
      {/* Visible on touch, hover-revealed for fine pointers only — a hover-only
          control cannot be reached on a phone. */}
      <div className="artifacts-tile-actions">
        <Button
          variant="ghost"
          size="icon"
          className="artifacts-tile-action tap-expand"
          disabled={!src}
          onClick={() => src && onPreview(src)}
          title="Open preview"
          aria-label={`Open preview of ${artifact.label}`}
        >
          <Maximize2 className="artifacts-tile-action-icon" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="artifacts-tile-action tap-expand"
          disabled={busy}
          onClick={() => void handleCopy()}
          title="Copy image"
          aria-label={`Copy ${artifact.label}`}
        >
          {copied ? (
            <Check className="artifacts-tile-action-icon" aria-hidden="true" />
          ) : (
            <Copy className="artifacts-tile-action-icon" aria-hidden="true" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="artifacts-tile-action tap-expand"
          disabled={busy}
          onClick={() => void handleDownload()}
          title="Download image"
          aria-label={`Download ${artifact.label}`}
        >
          <Download className="artifacts-tile-action-icon" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
};

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
