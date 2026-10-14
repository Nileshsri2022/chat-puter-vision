// `data:` URL helpers shared by the image-attachment and voice-input flows.
//
// Both features hand the Puter API a `data:<mime>;base64,<payload>` string:
// the SDK itself builds one for a `File` media argument, the backend's file
// loader decodes one, and every chat/STT provider accepts one. Bare base64 is
// *not* a URL — sending it makes the provider fail trying to fetch it — so
// every attachment goes out through these helpers.

/** Encode a blob as a data URL. Falls back to `btoa` where FileReader is missing. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const FileReaderCtor = typeof FileReader !== "undefined" ? FileReader : null;
    if (FileReaderCtor) {
      const reader = new FileReaderCtor();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Could not read the file."));
      };
      reader.onerror = () =>
        reject(reader.error ?? new Error("Could not read the file."));
      reader.readAsDataURL(blob);
      return;
    }
    // Environments without FileReader (workers, tests).
    blob
      .arrayBuffer()
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++)
          binary += String.fromCharCode(bytes[i]);
        resolve(
          `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`
        );
      })
      .catch(reject);
  });
}

/** The decoded byte count a data URL carries, without decoding it. */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const payload = dataUrl.slice(comma + 1);
  if (!dataUrl.slice(0, comma).includes(";base64")) {
    // Percent-encoded text payload.
    try {
      return new TextEncoder().encode(decodeURIComponent(payload)).length;
    } catch {
      return payload.length;
    }
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

/** The media type a data URL declares, lowercased, without parameters. */
export function dataUrlMimeType(dataUrl: string): string | null {
  const match = /^data:([^;,]*)/i.exec(dataUrl.trim());
  const mime = match?.[1]?.trim().toLowerCase();
  return mime ? mime : null;
}

/** True for the two image sources the chat API can resolve. */
export function isImageUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    /^https?:\/\//i.test(trimmed) || /^data:image\/[a-z0-9.+-]+[;,]/i.test(trimmed)
  );
}
