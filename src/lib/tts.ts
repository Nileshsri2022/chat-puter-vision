// Text-to-speech via puter.ai.txt2speech.
// Docs: https://docs.puter.com/AI/txt2speech/ (read 2026-10-13).
//
// Resolves to an HTMLAudioElement; call audio.play() to hear it. Text must be
// under 3000 chars — longer input is truncated. Defaults to the AWS Polly
// voice when no options are passed.

/** Max chars the API accepts per call (docs). */
export const TTS_CHAR_LIMIT = 3000;

/**
 * Strip markdown down to speakable plain text. Fenced code blocks become a
 * short placeholder (reading code aloud is useless); inline formatting is
 * removed; links keep their label text.
 */
export function stripMarkdownForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " [code omitted] ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|\W)\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|\W)_([^_\n]+)_/g, "$1$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface TtsErrorBody {
  message?: unknown;
  code?: unknown;
}

function friendlySpeechError(error: unknown): Error {
  const body =
    typeof error === "object" && error !== null
      ? (error as TtsErrorBody)
      : {};
  const message = typeof body.message === "string" ? body.message : "";
  if (body.code === "insufficient_funds")
    return new Error("Puter credit exhausted for this month.");
  if (body.code === "bad_request")
    return new Error(message || "Speech synthesis was rejected.");
  return new Error(message || "Speech synthesis failed.");
}

/**
 * Synthesize text to speech. Resolves to an HTMLAudioElement — call
 * audio.play() to hear it. Only one element plays at a time: starting a new
 * one pauses the previous via stopAllSpeech().
 */
export async function synthesizeSpeech(text: string): Promise<HTMLAudioElement> {
  try {
    const puter = window.puter;
    if (!puter?.ai?.txt2speech)
      throw new Error("Speech synthesis is not available.");
    const input = text.slice(0, TTS_CHAR_LIMIT);
    if (!input.trim()) throw new Error("Nothing to read aloud.");
    return await puter.ai.txt2speech(input);
  } catch (error) {
    throw friendlySpeechError(error);
  }
}

let current: HTMLAudioElement | null = null;

/** Register the element currently speaking (null when done). */
export function setCurrentSpeech(audio: HTMLAudioElement | null): void {
  current = audio;
}

/** Pause whatever is currently speaking, if anything. */
export function stopAllSpeech(): void {
  current?.pause();
  current = null;
}
