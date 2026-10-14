import { useEffect, useState } from "react";
import { loadImageUrl } from "@/lib/images";

export interface PuterImageState {
  /** Displayable URL, or null while loading or when unavailable. */
  src: string | null;
  /** The saved file could not be read. */
  failed: boolean;
}

/**
 * Resolves a saved Puter image path to a displayable URL. Falls back to a
 * legacy `src` (data URI or hosted URL) when there is no path.
 */
export function usePuterImage(path?: string, fallbackSrc?: string): PuterImageState {
  const [state, setState] = useState<PuterImageState>({ src: null, failed: false });

  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState({ src: null, failed: false });
    loadImageUrl(path).then(
      (src) => {
        if (alive) setState({ src, failed: false });
      },
      () => {
        if (alive) setState({ src: null, failed: true });
      }
    );
    return () => {
      alive = false;
    };
  }, [path]);

  if (!path) return { src: fallbackSrc ?? null, failed: false };
  return state;
}
