// Copy and download for one code block or table, shared by its row in the
// artifacts panel and by TextPreviewDialog so the two never disagree.

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { TextArtifact } from "@/lib/artifacts";
import { copyTextArtifact, downloadTextArtifact } from "@/lib/artifactFormats";

const NOUN: Record<TextArtifact["kind"], string> = { code: "Code", table: "Table" };

export function useTextArtifactActions(artifact: TextArtifact) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  // Copy is honest (#45): the check mark and the success toast only follow a
  // write the clipboard actually accepted.
  const copy = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await copyTextArtifact(artifact).catch(() => false);
      if (ok) {
        setCopied(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          setCopied(false);
          timer.current = null;
        }, 1500);
        toast({ title: `${NOUN[artifact.kind]} copied`, duration: 2000 });
      } else {
        toast({
          title: "Copy failed",
          description: "The clipboard rejected the request.",
          variant: "destructive",
          duration: 5000,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [artifact, toast]);

  const download = useCallback(() => {
    try {
      downloadTextArtifact(artifact);
      toast({
        title: artifact.kind === "table" ? "Table downloaded as CSV" : "Code downloaded",
        duration: 2000,
      });
    } catch {
      toast({
        title: "Download failed",
        description: "The file could not be created.",
        variant: "destructive",
        duration: 5000,
      });
    }
  }, [artifact, toast]);

  return { copied, busy, copy, download };
}
