// The image index behind the artifacts panel.
//
// What these pin: the panel must list every image a conversation holds, in
// transcript order, and must never claim an image it cannot resolve. Attachments
// are the interesting case — they used to leave nothing behind but the
// "[Images: N attached]" marker, so the collection layer has to tell a stored
// ref from a legacy claim, and the Drive write has to be best-effort so a
// storage failure can never cost the user their message.

import { test, expect } from "bun:test";
import { mockPuter } from "./helpers";
import type { Message } from "../src/lib/backend";
import {
  basenameOf,
  collectImageArtifacts,
  countByKind,
  countUnsavedAttachments,
} from "../src/lib/artifacts";
import {
  loadImageBlob,
  newAttachmentPath,
  newImagePath,
  persistAttachment,
} from "../src/lib/images";
import { mergeDocs, type SyncDoc } from "../src/lib/sync";

// ---- collectImageArtifacts ----

test("a generated image is collected even though its message has no text", () => {
  const messages: Message[] = [
    { role: "user", content: "draw a sunset" },
    { role: "assistant", content: "", imagePath: "freetalk-abc.png", model: "gpt-4o" },
  ];
  const artifacts = collectImageArtifacts(messages);
  expect(artifacts).toHaveLength(1);
  expect(artifacts[0]).toMatchObject({
    kind: "generated",
    messageIndex: 1,
    role: "assistant",
    path: "freetalk-abc.png",
    label: "Generated image",
    model: "gpt-4o",
  });
});

test("attachments are collected in the order they were attached", () => {
  const messages: Message[] = [
    {
      role: "user",
      content: "What is in these?\n\n[Images: 2 attached]",
      attachments: [
        { path: "freetalk-upload-1.jpg", name: "receipt.jpg", mimeType: "image/jpeg" },
        { path: "freetalk-upload-2.png", name: "diagram.png" },
      ],
    },
  ];
  const artifacts = collectImageArtifacts(messages);
  expect(artifacts.map((a) => a.path)).toEqual([
    "freetalk-upload-1.jpg",
    "freetalk-upload-2.png",
  ]);
  expect(artifacts.every((a) => a.kind === "attached")).toBe(true);
  expect(artifacts.every((a) => a.messageIndex === 0 && a.role === "user")).toBe(true);
  expect(artifacts.map((a) => a.label)).toEqual(["receipt.jpg", "diagram.png"]);
});

test("an attachment with no recorded file name still gets a label", () => {
  const artifacts = collectImageArtifacts([
    { role: "user", content: "hi", attachments: [{ path: "freetalk-upload-1.png" }] },
  ]);
  expect(artifacts[0].label).toBe("Attached image");
});

test("a legacy image src is collected as legacy", () => {
  const artifacts = collectImageArtifacts([
    { role: "assistant", content: "", image: "data:image/png;base64,AAAA" },
    { role: "assistant", content: "", image: "https://cdn.test/a.png" },
  ]);
  expect(artifacts.map((a) => a.kind)).toEqual(["legacy", "legacy"]);
  expect(artifacts[0].src).toBe("data:image/png;base64,AAAA");
  expect(artifacts[0].path).toBeUndefined();
});

test("imagePath wins over a legacy src, matching usePuterImage's fallback", () => {
  const artifacts = collectImageArtifacts([
    {
      role: "assistant",
      content: "",
      image: "data:image/png;base64,AAAA",
      imagePath: "freetalk-abc.png",
    },
  ]);
  expect(artifacts).toHaveLength(1);
  expect(artifacts[0].kind).toBe("generated");
});

test("artifacts follow transcript order and their ids are unique", () => {
  const messages: Message[] = [
    { role: "user", content: "first", attachments: [{ path: "u1.png" }] },
    { role: "assistant", content: "no image here" },
    { role: "assistant", content: "", imagePath: "g1.png" },
    { role: "user", content: "two more", attachments: [{ path: "u2.png" }, { path: "u3.png" }] },
  ];
  const artifacts = collectImageArtifacts(messages);
  expect(artifacts.map((a) => a.messageIndex)).toEqual([0, 2, 3, 3]);
  expect(artifacts.map((a) => a.path)).toEqual(["u1.png", "g1.png", "u2.png", "u3.png"]);
  expect(new Set(artifacts.map((a) => a.id)).size).toBe(artifacts.length);
});

test("a transcript with no images yields nothing", () => {
  expect(collectImageArtifacts([])).toEqual([]);
  expect(
    collectImageArtifacts([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi", model: "gpt-4o" },
    ])
  ).toEqual([]);
});

test("a malformed attachment ref is skipped instead of rendering an empty tile", () => {
  const messages = [
    {
      role: "user",
      content: "x",
      attachments: [{ path: "" }, { noPath: true }, { path: "ok.png" }],
    },
  ] as unknown as Message[];
  const artifacts = collectImageArtifacts(messages);
  expect(artifacts.map((a) => a.path)).toEqual(["ok.png"]);
});

// ---- countUnsavedAttachments ----

test("a legacy marker with no refs counts every image it claims", () => {
  expect(
    countUnsavedAttachments([
      { role: "user", content: "What is this?\n\n[Images: 3 attached]" },
    ])
  ).toBe(3);
});

test("a marker backed by refs counts nothing", () => {
  expect(
    countUnsavedAttachments([
      {
        role: "user",
        content: "What is this?\n\n[Images: 2 attached]",
        attachments: [{ path: "a.png" }, { path: "b.png" }],
      },
    ])
  ).toBe(0);
});

test("partially stored attachments count only the missing ones", () => {
  expect(
    countUnsavedAttachments([
      {
        role: "user",
        content: "x\n\n[Images: 3 attached]",
        attachments: [{ path: "a.png" }],
      },
    ])
  ).toBe(2);
});

test("no marker, and no over-claim when refs exceed the marker", () => {
  expect(countUnsavedAttachments([{ role: "user", content: "plain text" }])).toBe(0);
  expect(
    countUnsavedAttachments([
      {
        role: "user",
        content: "[Images: 1 attached]",
        attachments: [{ path: "a.png" }, { path: "b.png" }],
      },
    ])
  ).toBe(0);
});

// ---- countByKind / basenameOf ----

test("countByKind tallies each kind for the filter row", () => {
  const counts = countByKind(
    collectImageArtifacts([
      { role: "assistant", content: "", imagePath: "g.png" },
      { role: "user", content: "x", attachments: [{ path: "a.png" }, { path: "b.png" }] },
      { role: "assistant", content: "", image: "data:image/png;base64,AAAA" },
    ])
  );
  expect(counts).toEqual({ generated: 1, attached: 2, legacy: 1 });
});

test("basenameOf reduces a Drive path to a download file name", () => {
  expect(basenameOf("FreeTalk/freetalk-upload-1.png")).toBe("freetalk-upload-1.png");
  expect(basenameOf("image.png")).toBe("image.png");
  expect(basenameOf("")).toBe("image");
});

// ---- newAttachmentPath ----

test("attachment paths are unique, app-scoped and never target the home folder", () => {
  const a = newAttachmentPath("image/png");
  const b = newAttachmentPath("image/png");
  expect(a).toMatch(/^freetalk-upload-[\w-]+\.png$/);
  expect(a).not.toBe(b);
  expect(a.startsWith("~/")).toBe(false);
  // Sibling of, but distinguishable from, a generated image's path.
  expect(newImagePath()).toMatch(/^freetalk-[\w-]+\.png$/);
  expect(newImagePath().startsWith("freetalk-upload-")).toBe(false);
});

test("the extension follows the mime type", () => {
  expect(newAttachmentPath("image/jpeg")).toMatch(/\.jpg$/);
  expect(newAttachmentPath("image/webp")).toMatch(/\.webp$/);
  expect(newAttachmentPath("image/svg+xml")).toMatch(/\.svg$/);
  expect(newAttachmentPath("")).toMatch(/\.png$/);
  expect(newAttachmentPath(undefined)).toMatch(/\.png$/);
  // Anything that would make a hostile file name falls back to png.
  expect(newAttachmentPath("image/../../etc")).toMatch(/\.png$/);
});

// ---- persistAttachment ----

const BLOB = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

test("persistAttachment writes the blob to the given path", async () => {
  let written: { path?: string; data?: unknown } = {};
  mockPuter({
    fs: {
      write: async (path: string, data: unknown) => {
        written = { path, data };
        return { name: path };
      },
    },
  });
  expect(await persistAttachment(BLOB, "freetalk-upload-1.png")).toBe(true);
  expect(written.path).toBe("freetalk-upload-1.png");
  expect(written.data).toBe(BLOB);
});

test("persistAttachment resolves false without an SDK", async () => {
  mockPuter({});
  expect(await persistAttachment(BLOB, "freetalk-upload-1.png")).toBe(false);
  mockPuter(undefined);
  expect(await persistAttachment(BLOB, "freetalk-upload-1.png")).toBe(false);
});

test("a rejected Drive write resolves false rather than throwing", async () => {
  // The send path fires this in the background: a storage failure must never
  // surface as an unhandled rejection or lose the user's message.
  mockPuter({
    fs: {
      write: async () => {
        throw { code: "storage_limit_reached" };
      },
    },
  });
  expect(await persistAttachment(BLOB, "freetalk-upload-1.png")).toBe(false);
});

// ---- loadImageBlob ----

test("loadImageBlob reads a path once and caches it", async () => {
  let reads = 0;
  mockPuter({
    fs: {
      read: async () => {
        reads += 1;
        return BLOB;
      },
    },
  });
  const first = await loadImageBlob("cached.png");
  const second = await loadImageBlob("cached.png");
  expect(first).toBe(BLOB);
  expect(second).toBe(BLOB);
  expect(reads).toBe(1);
});

test("a failed read is evicted so the next render can retry", async () => {
  let reads = 0;
  mockPuter({
    fs: {
      read: async () => {
        reads += 1;
        if (reads === 1) throw new Error("network_error");
        return BLOB;
      },
    },
  });
  await expect(loadImageBlob("retry.png")).rejects.toThrow("network_error");
  expect(await loadImageBlob("retry.png")).toBe(BLOB);
  expect(reads).toBe(2);
});

// ---- sync round-trip ----

interface TestConv {
  id: string;
  title: string;
  timestamp: Date;
  messages: unknown[];
  updatedAt: number;
}

const conv = (id: string, updatedAt: number, messages: unknown[]): TestConv => ({
  id,
  title: id,
  timestamp: new Date(updatedAt),
  messages,
  updatedAt,
});

const doc = (convs: TestConv[]): SyncDoc =>
  ({ version: 1, conversations: convs as never[], deleted: {} }) as SyncDoc;

const ATTACHED: Message = {
  role: "user",
  content: "What is this?\n\n[Images: 1 attached]",
  attachments: [{ path: "freetalk-upload-1.jpg", name: "receipt.jpg", bytes: 2048 }],
};

test("attachment refs survive a local sync untouched", () => {
  const { doc: merged } = mergeDocs(doc([conv("a", 100, [ATTACHED])]), null);
  const messages = (merged.conversations[0] as unknown as TestConv).messages;
  expect(messages[0]).toEqual(ATTACHED);
});

test("attachment refs survive normalization of a remote-newer conversation", () => {
  const { doc: merged } = mergeDocs(
    doc([conv("a", 100, [])]),
    doc([conv("a", 200, [ATTACHED])])
  );
  const messages = (merged.conversations[0] as unknown as TestConv).messages;
  expect((messages[0] as Message).attachments?.[0].path).toBe("freetalk-upload-1.jpg");
  expect((messages[0] as Message).attachments?.[0].name).toBe("receipt.jpg");
});
