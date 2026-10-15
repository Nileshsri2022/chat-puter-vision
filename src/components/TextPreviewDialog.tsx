import { useEffect, useRef } from "react";
import { X, Copy, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTextArtifactActions } from "@/hooks/useTextArtifactActions";
import type { TextArtifact } from "@/lib/artifacts";
import "./TextPreviewDialog.css";

interface TextPreviewDialogProps {
  artifact: TextArtifact;
  onClose: () => void;
}

/**
 * Full preview of a code block or table. Follows the same rules as
 * ImageLightbox (spec §6.4): Escape on `document`, focus in on mount and back
 * to the trigger on unmount, and a scrim click closes it.
 */
export const TextPreviewDialog = ({ artifact, onClose }: TextPreviewDialogProps) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);
  const { copy, download, copied, busy } = useTextArtifactActions(artifact);

  useEffect(() => {
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();
    return () => {
      const el = restoreRef.current;
      if (el instanceof HTMLElement) el.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="text-preview"
      role="dialog"
      aria-modal="true"
      aria-label={artifact.label}
      onClick={onClose}
    >
      <div className="text-preview-panel" onClick={(e) => e.stopPropagation()}>
        <header className="text-preview-header">
          <h3 className="text-preview-title">{artifact.label}</h3>
          <div className="text-preview-tools">
            <Button
              variant="ghost"
              size="icon"
              className="text-preview-btn tap-expand"
              disabled={busy}
              onClick={() => void copy()}
              title={artifact.kind === "table" ? "Copy table" : "Copy code"}
              aria-label={`Copy ${artifact.label}`}
            >
              {copied ? <Check className="text-preview-icon" aria-hidden="true" /> : <Copy className="text-preview-icon" aria-hidden="true" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-preview-btn tap-expand"
              onClick={download}
              title="Download"
              aria-label={`Download ${artifact.label}`}
            >
              <Download className="text-preview-icon" aria-hidden="true" />
            </Button>
            <Button
              ref={closeRef}
              variant="ghost"
              size="icon"
              className="text-preview-btn tap-expand"
              onClick={onClose}
              title="Close preview"
              aria-label="Close preview"
            >
              <X className="text-preview-icon" aria-hidden="true" />
            </Button>
          </div>
        </header>
        <div className="text-preview-body">
          {artifact.kind === "table" ? (
            <table className="text-preview-table">
              <thead>
                <tr>
                  {artifact.header.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {artifact.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="text-preview-pre">
              <code>{artifact.text}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
