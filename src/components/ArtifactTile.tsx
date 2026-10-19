import { useState } from "react";
import { Maximize2, Copy, Download, Check, Sparkles, Paperclip, ImageOff, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePuterImage } from "@/hooks/usePuterImage";
import { useToast } from "@/hooks/use-toast";
import { basenameOf, KIND_LABEL, type ImageArtifact, type ImageArtifactKind } from "@/lib/artifacts";
import { loadImageBlob } from "@/lib/images";
import { copyToClipboard, dataUrlToBlob, downloadBlob } from "@/lib/utils/export";

// One image in the artifacts panel, with the helpers its copy and download
// share. Styles live in ArtifactsPanel.css, which the panel imports.

/** Kind badge copy. `legacy` reads as an attachment: that is what it was. */
const KIND_BADGE: Record<ImageArtifactKind, string> = {
  generated: "Generated",
  attached: "Attached",
  legacy: "Attached",
};

/** The bytes behind an artifact, for copy and download. Null when unreachable. */
async function resolveBlob(artifact: ImageArtifact): Promise<Blob | null> {
  if (artifact.path) {
    try {
      return await loadImageBlob(artifact.path);
    } catch {
      return null;
    }
  }
  const src = artifact.src;
  if (!src) return null;
  if (src.startsWith("data:")) return dataUrlToBlob(src);
  try {
    const response = await fetch(src);
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

function filenameFor(artifact: ImageArtifact): string {
  // `label` is the original file name when the browser gave one.
  if (artifact.label !== KIND_LABEL.attached && artifact.label !== KIND_LABEL.generated) {
    return artifact.label;
  }
  return artifact.path ? basenameOf(artifact.path) : "image.png";
}

/** One thumbnail. Its own component so the image hook runs per tile. */
export const ArtifactTile = ({
  artifact,
  position,
  onLocate,
  onPreview,
  onAddToContext,
}: {
  artifact: ImageArtifact;
  position: string;
  onLocate: () => void;
  onPreview: (src: string) => void;
  onAddToContext?: () => void;
}) => {
  const { src, failed } = usePuterImage(artifact.path, artifact.src);
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
        {onAddToContext && (
          <Button
            variant="ghost"
            size="icon"
            className="artifacts-tile-action tap-expand"
            onClick={onAddToContext}
            title="Add to context"
            aria-label={`Add ${artifact.label} to context`}
          >
            <FolderPlus className="artifacts-tile-action-icon" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
};
