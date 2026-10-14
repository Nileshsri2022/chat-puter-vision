import { useEffect, useState } from "react";

/**
 * Subscribes to a CSS media query and re-renders when it flips.
 *
 * The app previously read `window.matchMedia(...)` / `window.innerWidth` once
 * inside a `useState` initialiser, so the layout it derived from froze at the
 * viewport present on first load: rotating a phone or resizing a desktop window
 * left stale responsive state with no way to recover. This hook keeps the
 * value live for the lifetime of the component.
 *
 * The initial value is computed synchronously (client only) so first paint is
 * already correct rather than flashing a mobile layout on desktop.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);

    // Re-sync in case the query changed or the first paint was server-rendered.
    setMatches(mql.matches);

    // Safari < 14 only has the deprecated addListener/removeListener pair.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}

/**
 * Breakpoints used across the app, kept here so the CSS breakpoints and the JS
 * ones cannot drift apart.
 *
 * - `mobile` — below the sidebar-docked breakpoint. The sidebar is an overlay
 *   and takes the full width of a small screen.
 * - `desktop` — the sidebar is docked and pushes the chat column over.
 */
export const DESKTOP_QUERY = "(min-width: 1024px)";
export const MOBILE_QUERY = "(max-width: 1023px)";

/**
 * Width at which the artifacts panel docks instead of overlaying.
 *
 * Deliberately wider than `DESKTOP_QUERY`: with the left rail docked at 260px,
 * a 300px panel at 1024px would leave a ~464px transcript. Below this the panel
 * is an overlay with a scrim, exactly like the sidebar below `lg`. The CSS in
 * ArtifactsPanel.css and Index.css uses the same `xl` breakpoint.
 */
export const ARTIFACTS_DOCK_QUERY = "(min-width: 1280px)";