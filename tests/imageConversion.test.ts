// Image preparation: format gating, renaming, and the downscale/re-encode
// ladder. The canvas is stubbed so the real sizing and quality-selection logic
// runs without a browser.

import { test, expect, afterEach } from "bun:test";
import {
  MAX_IMAGE_EDGE,
  convertImageToPNG,
  downscaleImage,
  isSupportedImageFormat,
  needsConversion,
  renameForType,
} from "../src/lib/utils/imageConversion";

const scope = globalThis as Record<string, unknown>;
const originalDocument = scope.document;
const originalCreateImageBitmap = scope.createImageBitmap;

afterEach(() => {
  if (originalDocument === undefined) delete scope.document;
  else scope.document = originalDocument;
  if (originalCreateImageBitmap === undefined) delete scope.createImageBitmap;
  else scope.createImageBitmap = originalCreateImageBitmap;
});

// ---- format gating ----

test("isSupportedImageFormat accepts the containers providers decode", () => {
  for (const type of ["image/jpeg", "image/JPEG", "image/png", "image/gif", "image/webp"])
    expect(isSupportedImageFormat(type)).toBe(true);
});

test("needsConversion is true for everything else", () => {
  for (const type of ["image/heic", "image/heif", "image/avif", "image/bmp", "image/tiff", "image/svg+xml"])
    expect(needsConversion(type)).toBe(true);
  expect(needsConversion("image/png")).toBe(false);
});

test("renameForType keeps the stem and swaps the extension", () => {
  expect(renameForType("holiday.HEIC", "image/png")).toBe("holiday.png");
  expect(renameForType("no-extension", "image/jpeg")).toBe("no-extension.jpg");
  expect(renameForType("", "image/jpeg")).toBe("image.jpg");
  expect(renameForType("photo.webp", "image/webp")).toBe("photo.webp");
});

test("convertImageToPNG leaves an already supported file untouched", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
  expect(await convertImageToPNG(file)).toBe(file);
});

test("convertImageToPNG explains a file it cannot decode", async () => {
  // No canvas and no createImageBitmap: nothing can be decoded here.
  const heic = new File([new Uint8Array([1, 2, 3])], "b.heic", { type: "image/heic" });
  await expect(convertImageToPNG(heic)).rejects.toThrow(/b\.heic/);
});

// ---- downscaling ----

interface StubOptions {
  width?: number;
  height?: number;
  /** Encoded size per "type:quality" attempt. */
  sizes?: Record<string, number>;
  defaultSize?: number;
}

function installCanvasStub({
  width = 4000,
  height = 2000,
  sizes = {},
  defaultSize = 250_000,
}: StubOptions = {}) {
  const drawn: Array<{ width: number; height: number }> = [];
  const attempts: Array<{ type: string; quality: number; size: number }> = [];
  const canvases: Array<{ width: number; height: number }> = [];

  scope.createImageBitmap = async () => ({
    width,
    height,
    close: () => {},
  });

  scope.document = {
    createElement(tag: string) {
      if (tag !== "canvas") throw new Error(`unexpected element: ${tag}`);
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (_source: unknown, _x: number, _y: number, w: number, h: number) =>
            drawn.push({ width: w ?? canvas.width, height: h ?? canvas.height }),
        }),
        toBlob: (callback: (blob: Blob | null) => void, type: string, quality: number) => {
          const size = sizes[`${type}:${quality}`] ?? defaultSize;
          attempts.push({ type, quality, size });
          callback(new Blob([new Uint8Array(size)], { type }));
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };

  return { drawn, attempts, canvases };
}

test("downscaleImage returns a small file untouched", async () => {
  installCanvasStub({ width: 800, height: 600 });
  const file = new File([new Uint8Array(1000)], "small.png", { type: "image/png" });
  expect(await downscaleImage(file)).toBe(file);
});

test("downscaleImage caps the long edge and keeps a PNG source as PNG", async () => {
  const { drawn, attempts } = installCanvasStub({ width: 4000, height: 2000 });
  const file = new File([new Uint8Array(5_000_000)], "big.png", { type: "image/png" });

  const shrunk = await downscaleImage(file, { maxBytes: 1_200_000 });

  expect(shrunk.type).toBe("image/png");
  expect(shrunk.name).toBe("big.png");
  expect(drawn[0]).toEqual({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE / 2 });
  expect(attempts[0]).toEqual({ type: "image/png", quality: 0.9, size: 250_000 });
  expect(shrunk.size).toBeLessThanOrEqual(1_200_000);
});

test("downscaleImage trades quality for size before falling back to JPEG", async () => {
  installCanvasStub({
    sizes: {
      "image/png:0.9": 3_000_000,
      "image/jpeg:0.8": 900_000,
    },
  });
  const file = new File([new Uint8Array(5_000_000)], "screenshot.png", {
    type: "image/png",
  });

  const shrunk = await downscaleImage(file, { maxBytes: 1_200_000 });

  expect(shrunk.type).toBe("image/jpeg");
  expect(shrunk.name).toBe("screenshot.jpg");
  expect(shrunk.size).toBe(900_000);
});

test("downscaleImage re-encodes a JPEG source as JPEG", async () => {
  installCanvasStub({ sizes: { "image/jpeg:0.9": 400_000 } });
  const file = new File([new Uint8Array(3_000_000)], "photo.jpg", {
    type: "image/jpeg",
  });
  const shrunk = await downscaleImage(file, { maxBytes: 1_200_000 });
  expect(shrunk.type).toBe("image/jpeg");
  expect(shrunk.size).toBe(400_000);
});

test("downscaleImage returns the last attempt when nothing fits the budget", async () => {
  installCanvasStub({
    sizes: {
      "image/png:0.9": 9_000_000,
      "image/jpeg:0.8": 8_000_000,
      "image/jpeg:0.6": 6_000_000,
    },
  });
  const file = new File([new Uint8Array(9_000_000)], "huge.png", {
    type: "image/png",
  });
  const shrunk = await downscaleImage(file, { maxBytes: 1_200_000 });
  // The attachment layer checks the hard cap and reports what it cannot send.
  expect(shrunk.size).toBe(6_000_000);
});

test("downscaleImage gives up quietly when the image cannot be decoded", async () => {
  scope.createImageBitmap = async () => {
    throw new Error("unsupported");
  };
  const file = new File([new Uint8Array(5_000_000)], "broken.avif", {
    type: "image/avif",
  });
  expect(await downscaleImage(file)).toBe(file);
});
