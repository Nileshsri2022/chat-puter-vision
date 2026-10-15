import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { TextArtifact } from "@/lib/artifacts";
import { artifactFileName, tableToCsv, tableToHtml } from "@/lib/artifactFormats";
import { copyToClipboard, downloadBlob } from "@/lib/utils/export";

/** The Nth block of its kind in its message, 1-based. Encoded in the id. */
function ordinalOf(artifact: TextArtifact): number {
  return Number(artifact.id.split(":")[2]) + 1;
}

/**
 * Copy and download for a code or table artifact.
 *
 * Copy is honest (#45): it resolves to what the clipboard actually did, and a
 * refusal shows "Copy failed" rather than a check mark.
 */
async function copyArtifact(artifact: TextArtifact): Promise<boolean> {
  if (artifact.kind === "table") {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard && typeof clipboard.write === "function" && typeof ClipboardItem !== "undefined") {
      try {
        await clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([tableToHtml(artifact.header, artifact.rows)], { type: "text/html" }),
            "text/plain": new Blob([artifact.text], { type: "text/plain" }),
          }),
        ]);
        return true;
      } catch {
        // Rich copy refused: fall through to plain Markdown.
      }
    }
  }
  return copyToClipboard(artifact.text);
}

export function useTextArtifactActions(artifact: TextArtifact) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileName = artifactFileName(
    artifact.kind,
    artifact.messageIndex + 1,
    ordinalOf(artifact),
    artifact.kind === "code" ? artifact.language : undefined
  );

  const copy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await copyArtifact(artifact);
      if (!ok) {
        toast({
          title: "Copy failed",
          description: "The clipboard rejected the request.",
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      toast({ title: artifact.kind === "table" ? "Table copied" : "Code copied", duration: 2000 });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const isTable = artifact.kind === "table";
    const content = isTable ? tableToCsv(artifact.header, artifact.rows) : artifact.text;
    const type = isTable ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
    downloadBlob(fileName, new Blob([content], { type }));
    toast({ title: "Downloaded", description: fileName, duration: 2000 });
  };

  return { copy, download, copied, busy, fileName };
}
