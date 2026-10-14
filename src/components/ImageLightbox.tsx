import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import "./ImageLightbox.css";

interface ImageLightboxProps {
  /** Displayable image URL (object URL, data URI or hosted URL). */
  src: string;
  /** Accessible name; also the fallback caption. */
  alt?: string;
  /** Optional caption row under the image (file name, kind). */
  caption?: string;
  onClose: () => void;
}

/**
 * Full-screen image preview.
 *
 * Escape is bound on `document` rather than on the dialog element: a keydown
 * handler on the dialog only fires while that element holds focus, and focus is
 * easy to lose by clicking the image — which is how issue #48 (a preview opened
 * by keyboard cannot be closed) happens. Focus moves into the dialog on mount
 * and back to the trigger on unmount.
 */
export const ImageLightbox = ({ src, alt, caption, onClose }: ImageLightboxProps) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);

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
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image preview"}
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        className="lightbox-close tap-expand"
        onClick={onClose}
        title="Close preview"
        aria-label="Close preview"
      >
        <X className="lightbox-close-icon" aria-hidden="true" />
      </button>
      <figure className="lightbox-figure" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt || "Image preview"} className="lightbox-img" />
        {caption && <figcaption className="lightbox-caption">{caption}</figcaption>}
      </figure>
    </div>
  );
};
