// OCR via puter.ai.img2txt.
// Docs: https://docs.puter.com/AI/img2txt/ (read 2026-10-13).
//
// Resolves to the recognized text string. The default model is AWS Textract
// (single-page images up to 10 MB).

interface OcrErrorBody {
  message?: unknown;
  code?: unknown;
}

function friendlyOcrError(error: unknown): Error {
  const body =
    typeof error === "object" && error !== null
      ? (error as OcrErrorBody)
      : {};
  const message = typeof body.message === "string" ? body.message : "";
  if (body.code === "input_too_large")
    return new Error("Image is too large for OCR (10 MB limit).");
  if (body.code === "insufficient_funds")
    return new Error("Puter credit exhausted for this month.");
  if (body.code === "bad_request")
    return new Error(message || "OCR could not read the image.");
  if (body.code === "source_required" || body.code === "arguments_required")
    return new Error("No image to read.");
  return new Error(message || "Text extraction failed.");
}

/** Extract text from an image file; resolves to the recognized text. */
export async function extractText(image: File | Blob): Promise<string> {
  try {
    const puter = window.puter;
    if (!puter?.ai?.img2txt)
      throw new Error("Text extraction is not available.");
    const text = await puter.ai.img2txt(image);
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("No text found in the image.");
    }
    return text.trim();
  } catch (error) {
    throw friendlyOcrError(error);
  }
}
