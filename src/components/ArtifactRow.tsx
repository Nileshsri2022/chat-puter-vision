import { Code2, Table2, Maximize2, Copy, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTextArtifactActions } from "@/hooks/useTextArtifactActions";
import type { TextArtifact } from "@/lib/artifacts";
import "./ArtifactRow.css";

interface ArtifactRowProps {
  artifact: TextArtifact;
  /** "message 4", the position shown on the row. */
  position: string;
  onLocate: () => void;
  onPreview: () => void;
}

/** First three non-empty lines of code, or the header cells of a table. */
function previewOf(artifact: TextArtifact): string {
  if (artifact.kind === "table") return artifact.header.join(" · ");
  return artifact.text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(0, 3)
    .join("\n");
}

/**
 * A code block or table in the panel. The row itself locates the block; the
 * action buttons sit beside it, never inside it (spec §6.2).
 */
export const ArtifactRow = ({ artifact, position, onLocate, onPreview }: ArtifactRowProps) => {
  const { copy, download, copied, busy } = useTextArtifactActions(artifact);
  const Icon = artifact.kind === "table" ? Table2 : Code2;
  // The visible " · " reads as a comma to assistive tech (spec §11).
  const spoken = artifact.label.replace(" · ", ", ");

  return (
    <div className="artifact-row group">
      <button
        type="button"
        className="artifact-row-main"
        onClick={onLocate}
        title={`Show in chat — ${artifact.label}`}
        aria-label={`${spoken}, ${position}. Show in chat.`}
      >
        <span className="artifact-row-head">
          <Icon className="artifact-row-icon" aria-hidden="true" />
          <span className="artifact-row-label">{artifact.label}</span>
          <span className="artifact-row-position" aria-hidden="true">
            {position}
          </span>
        </span>
        <span className="artifact-row-preview" aria-hidden="true">
          {previewOf(artifact)}
        </span>
      </button>
      <div className="artifact-row-actions">
        <Button
          variant="ghost"
          size="icon"
          className="artifact-row-action tap-expand"
          onClick={onPreview}
          title="Open preview"
          aria-label={`Open preview of ${artifact.label}`}
        >
          <Maximize2 className="artifact-row-action-icon" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="artifact-row-action tap-expand"
          disabled={busy}
          onClick={() => void copy()}
          title={artifact.kind === "table" ? "Copy table" : "Copy code"}
          aria-label={`Copy ${artifact.label}`}
        >
          {copied ? (
            <Check className="artifact-row-action-icon" aria-hidden="true" />
          ) : (
            <Copy className="artifact-row-action-icon" aria-hidden="true" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="artifact-row-action tap-expand"
          onClick={download}
          title="Download"
          aria-label={`Download ${artifact.label}`}
        >
          <Download className="artifact-row-action-icon" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
};
