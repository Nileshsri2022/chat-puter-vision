// Speech-to-text via puter.ai.speech2txt.
// Docs: https://docs.puter.com/AI/speech2txt/ (read 2026-10-14).
//
// The SDK accepts a `File`/`Blob`, a `data:` URL or a Puter path. A data URL is
// sent explicitly: it is the one input every SDK build handles the same way,
// and it lets this module control the media type the provider sees (see
// `prepareAudioForTranscription`).

import {
  MAX_TRANSCRIBE_BYTES,
  detectAudioMimeType,
  isAudioMimeType,
  recordingToWav,
  sanitizeAudioMimeType,
} from "./audio";
import { blobToDataUrl } from "./dataUrl";
import type { Speech2TxtResult } from "./backend";

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
    return new Error("Monthly credit exhausted.");
  if (body.code === "input_too_large")
    return new Error("That recording is too long to transcribe (25 MB limit).");
  if (body.code === "audio_required" || body.code === "arguments_required")
    return new Error("No audio was captured. Please record again.");
  if (
    body.code === "unauthorized" ||
    body.code === "token_auth_failed" ||
    body.code === "auth_canceled"
  )
    return new Error("Please sign in to use voice input.");
  if (body.code === "bad_request")
    return new Error(message || "Transcription was rejected.");
  return new Error(message || "Transcription failed.");
}

export interface TranscriptionPayload {
  /** What goes on the wire: `data:<mime>;base64,<payload>`. */
  dataUrl: string;
  /** Container of the prepared audio, e.g. `audio/wav`. */
  mimeType: string;
  /** Decoded size of the audio, in bytes. */
  bytes: number;
  /** True when the recording was re-encoded before upload. */
  transcoded: boolean;
}

/**
 * Turn a fresh recording into something the transcription providers accept.
 *
 * Prefers 16-bit PCM WAV (decoded from the recording with the Web Audio API),
 * falls back to the recorder's own container with the codec parameters
 * stripped, and sniffs the container from the bytes when the recorder reported
 * no usable media type at all.
 */
export async function prepareAudioForTranscription(
  audio: Blob
): Promise<TranscriptionPayload> {
  if (!audio || audio.size === 0)
    throw new Error("No audio was captured. Please record again.");

  const wav = await recordingToWav(audio);
  // PCM is ~8x larger than the compressed recording, so a long clip can pass
  // the 25 MB cap as WAV while the original still fits.
  const source = wav && wav.size <= MAX_TRANSCRIBE_BYTES ? wav : audio;
  const transcoded = source === wav;

  if (source.size > MAX_TRANSCRIBE_BYTES)
    throw new Error("That recording is too long to transcribe (25 MB limit).");

  let mimeType = sanitizeAudioMimeType(source.type);
  if (!isAudioMimeType(source.type)) {
    // An empty recorder mimeType would otherwise upload the audio as
    // `application/octet-stream`, which the provider cannot decode.
    const header = new Uint8Array(await source.slice(0, 16).arrayBuffer());
    mimeType = detectAudioMimeType(header) ?? mimeType;
  }

  const payload = new Blob([source], { type: mimeType });
  return {
    dataUrl: await blobToDataUrl(payload),
    mimeType,
    bytes: payload.size,
    transcoded,
  };
}

/** Transcribe an audio blob; resolves to the transcript text. */
export async function transcribeAudio(audio: Blob): Promise<string> {
  const puter = window.puter;
  if (!puter?.ai?.speech2txt)
    throw new Error("Transcription is not available.");
  try {
    const { dataUrl } = await prepareAudioForTranscription(audio);
    const result: Speech2TxtResult | string =
      await puter.ai.speech2txt(dataUrl);
    const text = typeof result === "string" ? result : result?.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Transcription returned no text.");
    }
    return text.trim();
  } catch (error) {
    throw friendlyTranscriptionError(error);
  }
}
