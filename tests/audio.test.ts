// Recording helpers for the voice-input button: container selection, header
// sniffing, and the PCM WAV re-encode that transcription uploads.

import { test, expect, afterEach } from "bun:test";
import {
  MAX_TRANSCRIBE_BYTES,
  RECORDER_MIME_CANDIDATES,
  detectAudioMimeType,
  encodeWav,
  formatDuration,
  isAudioMimeType,
  mixToMono,
  pickRecorderMimeType,
  recordingToWav,
  resampleLinear,
  sanitizeAudioMimeType,
  type DecodedAudio,
} from "../src/lib/audio";

// ---- media types ----

test("sanitizeAudioMimeType drops codec parameters", () => {
  expect(sanitizeAudioMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
  expect(sanitizeAudioMimeType("audio/ogg; codecs=opus")).toBe("audio/ogg");
  expect(sanitizeAudioMimeType("AUDIO/MP4")).toBe("audio/mp4");
});

test("sanitizeAudioMimeType maps aliases to the extensions providers decode", () => {
  expect(sanitizeAudioMimeType("audio/x-wav")).toBe("audio/wav");
  expect(sanitizeAudioMimeType("audio/wave")).toBe("audio/wav");
  expect(sanitizeAudioMimeType("audio/x-m4a")).toBe("audio/mp4");
  expect(sanitizeAudioMimeType("audio/x-matroska")).toBe("audio/webm");
});

test("sanitizeAudioMimeType falls back for an empty or bogus type", () => {
  expect(sanitizeAudioMimeType("")).toBe("audio/webm");
  expect(sanitizeAudioMimeType(undefined)).toBe("audio/webm");
  expect(sanitizeAudioMimeType("application/octet-stream")).toBe("audio/webm");
  expect(sanitizeAudioMimeType("video/webm")).toBe("audio/webm");
});

test("isAudioMimeType only accepts audio containers", () => {
  expect(isAudioMimeType("audio/webm;codecs=opus")).toBe(true);
  expect(isAudioMimeType("audio/mp4")).toBe(true);
  expect(isAudioMimeType("")).toBe(false);
  expect(isAudioMimeType("application/octet-stream")).toBe(false);
});

// ---- container sniffing ----

test("detectAudioMimeType reads the container from the header bytes", () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
  expect(detectAudioMimeType(webm)).toBe("audio/webm");
  expect(detectAudioMimeType(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3, 4]))).toBe(
    "audio/ogg"
  );
  const wav = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
  ]);
  expect(detectAudioMimeType(wav)).toBe("audio/wav");
  const mp4 = new Uint8Array([
    0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]);
  expect(detectAudioMimeType(mp4)).toBe("audio/mp4");
});

test("detectAudioMimeType returns null for unknown bytes", () => {
  expect(detectAudioMimeType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  expect(detectAudioMimeType(new Uint8Array([1, 2]))).toBeNull();
});

// ---- recorder selection ----

test("pickRecorderMimeType takes the first supported candidate", () => {
  expect(
    pickRecorderMimeType((type) => type === "audio/webm;codecs=opus")
  ).toBe(RECORDER_MIME_CANDIDATES[0]);
  expect(pickRecorderMimeType((type) => type === "audio/mp4")).toBe("audio/mp4");
});

test("pickRecorderMimeType tolerates a throwing isTypeSupported", () => {
  expect(
    pickRecorderMimeType((type) => {
      if (type.startsWith("audio/webm")) throw new Error("nope");
      return type === "audio/ogg;codecs=opus";
    })
  ).toBe("audio/ogg;codecs=opus");
});

test("pickRecorderMimeType returns undefined when nothing is supported", () => {
  expect(pickRecorderMimeType(() => false)).toBeUndefined();
});

// ---- PCM helpers ----

test("mixToMono averages the channels", () => {
  const buffer: DecodedAudio = {
    numberOfChannels: 2,
    length: 2,
    sampleRate: 48000,
    getChannelData: (channel: number) =>
      channel === 0 ? new Float32Array([1, 0]) : new Float32Array([0, 1]),
  };
  expect(Array.from(mixToMono(buffer))).toEqual([0.5, 0.5]);
});

test("mixToMono passes a mono buffer straight through", () => {
  const samples = new Float32Array([0.25, -0.25]);
  const buffer: DecodedAudio = {
    numberOfChannels: 1,
    length: 2,
    sampleRate: 16000,
    getChannelData: () => samples,
  };
  expect(mixToMono(buffer)).toBe(samples);
});

test("resampleLinear halves a 32 kHz track to 16 kHz", () => {
  const source = new Float32Array([0, 1, 0, 1, 0, 1, 0, 1]);
  const resampled = resampleLinear(source, 32000, 16000);
  expect(resampled.length).toBe(4);
  expect(Array.from(resampled)).toEqual([0, 0, 0, 0]);
});

test("resampleLinear is a no-op when the rate already matches", () => {
  const source = new Float32Array([1, 2, 3]);
  expect(resampleLinear(source, 16000, 16000)).toBe(source);
});

test("encodeWav writes a 16-bit PCM RIFF header", async () => {
  const blob = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 16000);
  expect(blob.type).toBe("audio/wav");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  expect(ascii(0, 4)).toBe("RIFF");
  expect(ascii(8, 4)).toBe("WAVE");
  expect(ascii(12, 4)).toBe("fmt ");
  expect(ascii(36, 4)).toBe("data");
  const view = new DataView(bytes.buffer);
  expect(view.getUint16(20, true)).toBe(1); // PCM
  expect(view.getUint16(22, true)).toBe(1); // mono
  expect(view.getUint32(24, true)).toBe(16000); // sample rate
  expect(view.getUint16(34, true)).toBe(16); // bits per sample
  expect(view.getUint32(40, true)).toBe(4 * 2); // data length
  expect(bytes.length).toBe(44 + 8);
  expect(view.getInt16(44, true)).toBe(0);
  // Positive samples scale by 0x7fff, negative ones by 0x8000 (16-bit range).
  expect(view.getInt16(46, true)).toBe(Math.trunc(0.5 * 0x7fff));
  expect(view.getInt16(48, true)).toBe(-0.5 * 0x8000);
  expect(view.getInt16(50, true)).toBe(0x7fff);
});

test("encodeWav clamps samples outside [-1, 1]", () => {
  const blob = encodeWav(new Float32Array([5, -5]), 16000);
  return blob.arrayBuffer().then((buffer) => {
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});

// ---- decoding a recording ----

const originalAudioContext = (globalThis as Record<string, unknown>).AudioContext;

afterEach(() => {
  const scope = globalThis as Record<string, unknown>;
  if (originalAudioContext === undefined) delete scope.AudioContext;
  else scope.AudioContext = originalAudioContext;
});

function installAudioContext(decoded: DecodedAudio | Error) {
  (globalThis as Record<string, unknown>).AudioContext = class {
    decodeAudioData() {
      return decoded instanceof Error
        ? Promise.reject(decoded)
        : Promise.resolve(decoded);
    }
    close() {
      return Promise.resolve();
    }
  };
}

const FAKE_RECORDING = new Blob([new Uint8Array([1, 2, 3, 4])], {
  type: "audio/webm;codecs=opus",
});

test("recordingToWav re-encodes a decoded recording as 16 kHz mono WAV", async () => {
  installAudioContext({
    numberOfChannels: 2,
    length: 4,
    sampleRate: 32000,
    getChannelData: (channel: number) =>
      channel === 0 ? new Float32Array([0, 1, 0, 1]) : new Float32Array([0, 1, 0, 1]),
  });
  const wav = await recordingToWav(FAKE_RECORDING);
  expect(wav).not.toBeNull();
  expect(wav!.type).toBe("audio/wav");
  const view = new DataView(await wav!.arrayBuffer());
  expect(view.getUint32(24, true)).toBe(16000);
});

test("recordingToWav keeps the source rate when it is already low", async () => {
  installAudioContext({
    numberOfChannels: 1,
    length: 3,
    sampleRate: 8000,
    getChannelData: () => new Float32Array([0.1, 0.2, 0.3]),
  });
  const wav = await recordingToWav(FAKE_RECORDING);
  const view = new DataView(await wav!.arrayBuffer());
  expect(view.getUint32(24, true)).toBe(8000);
});

test("recordingToWav returns null when decoding fails", async () => {
  installAudioContext(new Error("cannot decode"));
  expect(await recordingToWav(FAKE_RECORDING)).toBeNull();
});

test("recordingToWav returns null when the browser has no AudioContext", async () => {
  delete (globalThis as Record<string, unknown>).AudioContext;
  expect(await recordingToWav(FAKE_RECORDING)).toBeNull();
});

test("recordingToWav ignores an empty recording", async () => {
  installAudioContext({
    numberOfChannels: 1,
    length: 0,
    sampleRate: 16000,
    getChannelData: () => new Float32Array(),
  });
  expect(await recordingToWav(new Blob())).toBeNull();
});

// ---- misc ----

test("formatDuration renders m:ss", () => {
  expect(formatDuration(0)).toBe("0:00");
  expect(formatDuration(7)).toBe("0:07");
  expect(formatDuration(65)).toBe("1:05");
  expect(formatDuration(600)).toBe("10:00");
});

test("the STT input cap matches the documented 25 MB limit", () => {
  expect(MAX_TRANSCRIBE_BYTES).toBe(25 * 1024 * 1024);
});
