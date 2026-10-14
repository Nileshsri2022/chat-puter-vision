// Microphone-recording helpers for the voice-input button.
//
// Transcription upstreams are picky about what they receive, and the recorded
// container is not always something they accept:
//
// - Every provider accepts 16-bit PCM WAV, so a recording is decoded with the
//   Web Audio API and re-encoded as WAV where the browser allows it.
// - `MediaRecorder.mimeType` can be empty (older WebViews), which would upload
//   the audio as `application/octet-stream`; the container is then sniffed from
//   the file's own header bytes.
// - A media type carrying codec parameters (`audio/webm;codecs=opus`) is not a
//   valid data-URL type for every parser on the way to the provider, so only
//   the bare container type is ever sent.
//
// https://docs.puter.com/AI/speech2txt/ (read 2026-10-14)

/** Puter's speech-to-text input cap, in bytes. */
export const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;

/** Sample rate sent to the provider: speech models want 16 kHz. */
export const STT_SAMPLE_RATE = 16_000;

/** How long a single recording may run before it is stopped automatically. */
export const MAX_RECORDING_SECONDS = 300;

/**
 * Recorder containers, most-preferred first. The first one the browser reports
 * support for is used, so `recorder.mimeType` is never an empty string.
 */
export const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

/** The audio container in a media type, without codec parameters. */
export function sanitizeAudioMimeType(
  type: string | null | undefined,
  fallback = "audio/webm"
): string {
  const bare = (type ?? "").split(";")[0].trim().toLowerCase();
  if (!/^audio\/[a-z0-9.+-]+$/.test(bare)) return fallback;
  // Aliases providers decode from the *filename*: `input.x-wav` is not a
  // supported extension, `input.wav` is.
  if (bare === "audio/x-wav" || bare === "audio/wave" || bare === "audio/vnd.wave")
    return "audio/wav";
  if (bare === "audio/x-m4a") return "audio/mp4";
  if (bare === "audio/x-matroska") return "audio/webm";
  if (bare === "audio/x-ogg") return "audio/ogg";
  return bare;
}

/** True when the media type names a container (not a codec parameter blob). */
export function isAudioMimeType(type: string | null | undefined): boolean {
  return /^audio\/[a-z0-9.+-]+(;|$)/i.test((type ?? "").trim());
}

/**
 * The container a recording actually is, from its leading bytes: the last
 * resort when the recorder reported no usable media type.
 */
export function detectAudioMimeType(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  // EBML header — WebM and Matroska.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return "audio/webm";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(0, 3) === "ID3") return "audio/mpeg";
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";
  // ISO base media container (MP4/M4A): a brand box after the size field.
  if (bytes.length >= 12 && ascii(4, 4) === "ftyp") return "audio/mp4";
  return null;
}

/** What to record with, or undefined to let the browser pick its own default. */
export function pickRecorderMimeType(
  isTypeSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported(type)
): string | undefined {
  for (const type of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // A throwing isTypeSupported means the candidate is not usable.
    }
  }
  return undefined;
}

/** Resample mono PCM by linear interpolation. Returns the input when rates match. */
export function resampleLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate || samples.length === 0 || fromRate <= 0 || toRate <= 0)
    return samples;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    out[i] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return out;
}

/** The shape of an `AudioBuffer` this module needs — easy to fake in tests. */
export interface DecodedAudio {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

/** Average every channel down to one mono track. */
export function mixToMono(buffer: DecodedAudio): Float32Array {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels <= 1) return buffer.getChannelData(0);
  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numberOfChannels;
  }
  return mono;
}

/** Encode mono PCM as a 16-bit WAV file — the format every provider accepts. */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number = STT_SAMPLE_RATE
): Blob {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += bytesPerSample) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
  }

  return new Blob([buffer], { type: "audio/wav" });
}

interface AudioContextCtor {
  new (): AudioContext;
}

function getAudioContextCtor(): AudioContextCtor | null {
  const globalWithAudio = globalThis as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return (
    globalWithAudio.AudioContext ?? globalWithAudio.webkitAudioContext ?? null
  );
}

/**
 * Decode a recording and re-encode it as 16 kHz mono WAV. Resolves to null
 * when the browser cannot decode it (the caller then sends the raw recording).
 */
export async function recordingToWav(blob: Blob): Promise<Blob | null> {
  if (!blob || blob.size === 0) return null;
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) return null;

  let context: AudioContext | null = null;
  try {
    context = new AudioContextCtor();
    const bytes = await blob.arrayBuffer();
    const decoded = (await context.decodeAudioData(bytes)) as DecodedAudio;
    const mono = mixToMono(decoded);
    if (mono.length === 0 || decoded.sampleRate <= 0) return null;
    const downsample = decoded.sampleRate > STT_SAMPLE_RATE;
    const samples = downsample
      ? resampleLinear(mono, decoded.sampleRate, STT_SAMPLE_RATE)
      : mono;
    return encodeWav(samples, downsample ? STT_SAMPLE_RATE : decoded.sampleRate);
  } catch {
    return null;
  } finally {
    try {
      void context?.close();
    } catch {
      // Closing a context that never started is not an error worth surfacing.
    }
  }
}

/** `m:ss` for the recording timer. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
