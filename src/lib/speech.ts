// Speech-to-text via puter.ai.speech2txt.
// Docs: https://docs.puter.com/AI/speech2txt/ (read 2026-10-13).
//
// Accepts a File/Blob directly (the SDK converts it to a data URL itself).
// Resolves to a result object by default, or a plain string when
// `response_format: "text"` is passed.

import type { Speech2TxtResult } from "./puter";

interface SttErrorBody {
  message?: unknown;
  code?: unknown;
}

function friendlyTranscriptionError(error: unknown): Error {
  const body =
    typeof error === "object" && error !== null
      ? (error as SttErrorBody)
      : {};
  const message = typeof body.message === "string" ? body.message : "";
  if (body.code === "insufficient_funds")
    return new Error("Puter credit exhausted for this month.");
  if (body.code === "bad_request")
    return new Error(message || "Transcription was rejected.");
  return new Error(message || "Transcription failed.");
}

/** Transcribe an audio blob; resolves to the transcript text. */
export async function transcribeAudio(audio: Blob): Promise<string> {
  try {
    const puter = window.puter;
    if (!puter?.ai?.speech2txt)
      throw new Error("Transcription is not available.");
    const result: Speech2TxtResult | string =
      await puter.ai.speech2txt(audio);
    const text = typeof result === "string" ? result : result?.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Transcription returned no text.");
    }
    return text.trim();
  } catch (error) {
    throw friendlyTranscriptionError(error);
  }
}
