// Save conversations to the user's Drive via puter.fs.write.
// Docs: https://docs.puter.com/FS/write/ (read 2026-10-13).
//
// Writes "<title>.md" into a "FreeTalk Exports" folder. dedupeName keeps
// repeat saves instead of overwriting; createMissingParents creates the
// folder on first use.

const EXPORTS_DIR = "FreeTalk Exports";

/** Filesystem-safe "<title>.md", matching the local-export naming. */
export function sanitizeFilename(title: string): string {
  const base = title.replace(/[^a-z0-9]/gi, "_").slice(0, 80) || "conversation";
  return `${base}.md`;
}

function friendlyDriveError(error: unknown): Error {
  const body =
    typeof error === "object" && error !== null
      ? (error as { message?: unknown; code?: unknown })
      : {};
  const message = typeof body.message === "string" ? body.message : "";
  if (body.code === "insufficient_funds")
    return new Error("Monthly credit exhausted.");
  if (body.code === "storage_limit_reached")
    return new Error("Drive storage is full.");
  return new Error(message || "Could not save to Drive.");
}

/**
 * Write the conversation markdown to Drive.
 * Resolves to the stored file name (deduplicated when taken).
 */
export async function saveConversationToDrive(
  title: string,
  markdown: string
): Promise<string> {
  const filename = sanitizeFilename(title);
  try {
    const puter = window.puter;
    if (!puter?.fs?.write) throw new Error("Drive is not available.");
    const item = await puter.fs.write(`${EXPORTS_DIR}/${filename}`, markdown, {
      createMissingParents: true,
      dedupeName: true,
    });
    return typeof item?.name === "string" && item.name ? item.name : filename;
  } catch (error) {
    throw friendlyDriveError(error);
  }
}
