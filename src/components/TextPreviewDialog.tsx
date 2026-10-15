import { useEffect, useRef } from "react";
import { Check, Code2, Copy, Download, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTextArtifactActions } from "@/hooks/useTextArtifactActions";
import type { TextArtifact } from "@/lib/artifacts";
import "./TextPreviewDialog.css";

interface TextPreviewDialogProps {
  artifact: TextArtifact;
  onClose: () => void;
}

/**
 * Full-screen read of a code block or table, with copy and download.
 *
 * Same rules as ImageLightbox: Escape is bound on `document`, not on the
 * dialog, so it still works after a click moves focus (#48); focus moves to
 * Close on mount and back to the trigger on unmount; clicking the scrim
 * closes. Cell and code text render as React text, never as markup.
 */
export const TextPreviewDialog = ({ artifact, onClose }: TextPreviewDialogProps) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);
  const { copied, busy, copy, download } = useTextArtifactActions(artifact);

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

  const isTable = artifact.kind === "table";
  const KindIcon = isTable ? Table2 : Code2;

  return (
    <div
      className="text-preview"
      role="dialog"
      aria-modal="true"
      aria-label={artifact.label}
      onClick={onClose}
    >
      <div className="text-preview-panel" onClick={(e) => e.stopPropagation()}>
        <div className="text-preview-header">
          <KindIcon className="text-preview-title-icon" aria-hidden="true" />
          <h2 className="text-preview-title">{artifact.label}</h2>
          <Button
            variant="ghost"
            size="icon"
            className="text-preview-action tap-expand"
            disabled={busy}
            onClick={() => void copy()}
            title={isTable ? "Copy table" : "Copy code"}
            aria-label={isTable ? "Copy table" : "Copy code"}
          >
            {copied ? (
              <Check className="text-preview-action-icon" aria-hidden="true" />
            ) : (
              <Copy className="text-preview-action-icon" aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-preview-action tap-expand"
            onClick={download}
            title={isTable ? "Download CSV" : "Download code"}
            aria-label={isTable ? "Download CSV" : "Download code"}
          >
            <Download className="text-preview-action-icon" aria-hidden="true" />
          </Button>
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon"
            className="text-preview-action tap-expand"
            onClick={onClose}
            title="Close preview"
            aria-label="Close preview"
          >
            <X className="text-preview-action-icon" aria-hidden="true" />
          </Button>
        </div>
        <div className="text-preview-body">
          {artifact.kind === "table" ? (
            <table className="text-preview-table">
              <thead>
                <tr>
                  {artifact.header.map((cell, i) => (
                    <th key={i}>{cell}</th>
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
