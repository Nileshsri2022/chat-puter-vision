import { Check, Code2, Copy, Download, Maximize2, Table2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTextArtifactActions } from "@/hooks/useTextArtifactActions";
import { cn } from "@/lib/utils";
import type { TextArtifact } from "@/lib/artifacts";
import "./ArtifactRow.css";

interface ArtifactRowProps {
  artifact: TextArtifact;
  /** "message 4": where the block lives, as the row shows it. */
  position: string;
  onLocate: () => void;
  onPreview: () => void;
  onAddToContext?: () => void;
}

/** The label as a screen reader should hear it: "Python, 24 lines". */
function spokenLabel(artifact: TextArtifact): string {
  if (artifact.kind === "table") {
    const rows = artifact.rows.length;
    const columns = artifact.header.length;
    return `Table, ${rows} row${rows === 1 ? "" : "s"}, ${columns} column${columns === 1 ? "" : "s"}`;
  }
  return artifact.label.replace(/ · /g, ", ");
}

/** A glance, not a read: three non-empty lines of code, or a table's header. */
function previewText(artifact: TextArtifact): string {
  if (artifact.kind === "table") return artifact.header.join(" · ");
  return artifact.text
    .split("\n")
    .filter((line) => line.trim())
    .slice(0, 3)
    .join("\n");
}

/**
 * One code block or table in the artifacts panel. The row itself is the
 * button that locates the block; the actions sit beside it, never inside it.
 */
export const ArtifactRow = ({ artifact, position, onLocate, onPreview, onAddToContext }: ArtifactRowProps) => {
  const { copied, busy, copy, download } = useTextArtifactActions(artifact);
  const isTable = artifact.kind === "table";
  const KindIcon = isTable ? Table2 : Code2;
  const spoken = spokenLabel(artifact);

  return (
    <div className="artifact-row">
      <button
        type="button"
        className="artifact-row-btn"
        onClick={onLocate}
        title={`Show in chat — ${artifact.label}`}
        aria-label={`${spoken}, ${position}. Show in chat.`}
      >
        <span className="artifact-row-head">
          <KindIcon className="artifact-row-icon" aria-hidden="true" />
          <span className="artifact-row-label">{artifact.label}</span>
        </span>
        <span className={cn("artifact-row-preview", isTable && "artifact-row-preview-table")}>
          {previewText(artifact)}
        </span>
        {/* The bottom line: the position on the left, and the actions pill
            (a sibling of this button) over its right end. */}
        <span className="artifact-row-foot">{position}</span>
      </button>
      {/* Visible on touch, hover-revealed for fine pointers only, as on the
          image tile: a hover-only control cannot be reached on a phone. */}
      <div className="artifact-row-actions">
        <Button
          variant="ghost"
          size="icon"
          className="artifact-row-action tap-expand"
          onClick={onPreview}
          title="Open preview"
          aria-label={`Open preview of ${spoken}`}
        >
          <Maximize2 className="artifact-row-action-icon" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="artifact-row-action tap-expand"
          disabled={busy}
          onClick={() => void copy()}
          title={isTable ? "Copy table" : "Copy code"}
          aria-label={`Copy ${spoken}`}
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
          title={isTable ? "Download CSV" : "Download code"}
          aria-label={`Download ${spoken}`}
        >
          <Download className="artifact-row-action-icon" aria-hidden="true" />
        </Button>
        {onAddToContext && (
          <Button
            variant="ghost"
            size="icon"
            className="artifact-row-action tap-expand"
            onClick={onAddToContext}
            title="Add to context"
            aria-label={`Add ${spoken} to context`}
          >
            <FolderPlus className="artifact-row-action-icon" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
};
