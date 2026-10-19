// The image index behind the artifacts panel.
//
// What these pin: the panel must list every image a conversation holds, in
// transcript order, and must never claim an image it cannot resolve. Attachments
// are the interesting case — they used to leave nothing behind but the
// "[Images: N attached]" marker, so the collection layer has to tell a stored
// ref from a legacy claim, and the Drive write has to be best-effort so a
// storage failure can never cost the user their message.

import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mockPuter } from "./helpers";
import type { Message } from "../src/lib/backend";
import {
  basenameOf,
  collectImageArtifacts,
  countByKind,
  countUnsavedAttachments,
  reclaimImagePaths,
} from "../src/lib/artifacts";
import {
  deleteImage,
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

// ---- reads versus background writes ----

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("a read waits out an in-flight write instead of racing it", async () => {
  // The panel is open when the message is sent, so its tile reads a path whose
  // upload has not landed yet. Racing it would 404 and stick the tile on
  // "unavailable" for good: nothing re-runs the read after the write succeeds.
  const written: string[] = [];
  mockPuter({
    fs: {
      write: async (path: string) => {
        await delay(20);
        written.push(path);
        return { name: path };
      },
      read: async (path: string) => {
        if (!written.includes(path)) throw new Error("not_found");
        return BLOB;
      },
    },
  });
  const writing = persistAttachment(BLOB, "race.png");
  const blob = await loadImageBlob("race.png");
  expect(blob).toBe(BLOB);
  expect(await writing).toBe(true);
});

test("a write that failed reports storage, and issues no doomed read", async () => {
  let reads = 0;
  mockPuter({
    fs: {
      write: async () => {
        throw { code: "storage_limit_reached" };
      },
      read: async () => {
        reads += 1;
        return BLOB;
      },
    },
  });
  const writing = persistAttachment(BLOB, "failed-write.png");
  await expect(loadImageBlob("failed-write.png")).rejects.toThrow(
    "could not be saved"
  );
  expect(reads).toBe(0);
  expect(await writing).toBe(false);
});

test("a settled write is forgotten, so later reads go to Drive", async () => {
  let reads = 0;
  mockPuter({
    fs: {
      write: async () => ({ name: "settled.png" }),
      read: async () => {
        reads += 1;
        return BLOB;
      },
    },
  });
  await persistAttachment(BLOB, "settled.png");
  expect(await loadImageBlob("settled.png")).toBe(BLOB);
  expect(await loadImageBlob("settled.png")).toBe(BLOB);
  expect(reads).toBe(1); // cached, and no longer blocked on the write
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

// ---- reclaiming stored images ----

const RECLAIM_MESSAGES: Message[] = [
  { role: "user", content: "x", attachments: [{ path: "up-1.png" }, { path: "up-2.jpg" }] },
  { role: "assistant", content: "", imagePath: "gen-1.png" },
  // Neither of these is ours to delete: a data URI is inline in the message and
  // a hosted URL belongs to somebody else's server.
  { role: "assistant", content: "", image: "data:image/png;base64,AAAA" },
  { role: "assistant", content: "", image: "https://cdn.test/a.png" },
  { role: "user", content: "no image at all" },
];

test("reclaim lists only the Drive paths this app wrote", () => {
  expect(reclaimImagePaths(RECLAIM_MESSAGES)).toEqual(["up-1.png", "up-2.jpg", "gen-1.png"]);
});

test("reclaim dedupes and ignores malformed refs", () => {
  const messages = [
    {
      role: "user",
      content: "x",
      attachments: [{ path: "same.png" }, { path: "" }, { nope: true }],
      imagePath: "same.png",
    },
  ] as unknown as Message[];
  expect(reclaimImagePaths(messages)).toEqual(["same.png"]);
});

test("reclaim of a transcript with nothing stored is empty", () => {
  expect(reclaimImagePaths([])).toEqual([]);
  expect(reclaimImagePaths([{ role: "user", content: "hi" }])).toEqual([]);
});

test("deleteImage removes the file and evicts its cached blob", async () => {
  let reads = 0;
  const deleted: string[] = [];
  mockPuter({
    fs: {
      read: async () => {
        reads += 1;
        return BLOB;
      },
      delete: async (path: string) => {
        deleted.push(path);
        return true;
      },
    },
  });
  await loadImageBlob("evict.png");
  await loadImageBlob("evict.png");
  expect(reads).toBe(1); // cached
  expect(await deleteImage("evict.png")).toBe(true);
  expect(deleted).toEqual(["evict.png"]);
  await loadImageBlob("evict.png");
  expect(reads).toBe(2); // cache was dropped, so this is a real read
});

test("deleteImage is a no-op without fs.delete and never throws", async () => {
  // Feature-detected: an SDK that does not expose delete must degrade to "the
  // file stays", not break the delete that triggered it.
  mockPuter({ fs: { read: async () => BLOB } });
  expect(await deleteImage("no-delete-api.png")).toBe(false);
  mockPuter(undefined);
  expect(await deleteImage("no-sdk.png")).toBe(false);
  mockPuter({
    fs: {
      delete: async () => {
        throw new Error("permission_denied");
      },
    },
  });
  expect(await deleteImage("denied.png")).toBe(false);
});

// ---- where reclaim is, and is not, wired ----

const readSrc = (rel: string) => readFileSync(join(import.meta.dir, "..", "src", rel), "utf8");

test("every deliberate delete reclaims the images it drops", () => {
  const page = readSrc("pages/Index.tsx");
  for (const fn of [
    "handleDeleteMessage",
    "handleEditMessage",
    "handleDeleteConversation",
    "handleDeleteConversations",
  ]) {
    const body = new RegExp(`const ${fn} = [\\s\\S]*?^\\s{2}\\};`, "m").exec(page)?.[0] ?? "";
    // The call itself in the message: a whole handler body is unreadable here.
    const call = /reclaimMessages\([^)]*\)/.exec(body)?.[0];
    expect(`${fn} → ${call ?? "no reclaim call"}`).toContain("reclaimMessages(");
  }
  // And the rule itself is written down where the next reader will find it.
  expect(page).toContain("function reclaimMessages(");
  expect(page).toMatch(/quota fallback[\s\S]{0,400}reclaimMessages/);
});

test("a silent drop never deletes files another device may still show", () => {
  // The localStorage quota fallback discards conversations wholesale, and a
  // tombstone arriving over KV discards them from another device's decision.
  // In both cases the conversation may still be alive in KV and on screen
  // elsewhere, so reclaiming there would break images that are still in use.
  for (const file of ["lib/utils/storage.ts", "lib/sync.ts"]) {
    // Named in the assertion message: which file grew a reclaim call matters.
    const src = readSrc(file);
    const found = src.match(/deleteImage|reclaimImagePaths|reclaimMessages/g) ?? [];
    expect(`${file} reclaims via: ${found.join(", ") || "nothing"}`).toBe(
      `${file} reclaims via: nothing`
    );
  }
});

test("reclaim waits for an edit to stick, because a failed reply rolls back", () => {
  const page = readSrc("pages/Index.tsx");
  const edit = /const handleEditMessage[\s\S]*?^\s{2}\};/m.exec(page)?.[0] ?? "";
  // A failed reply restores `messages` refs and all, so deleting their files
  // first would leave the restored message pointing at nothing.
  expect(edit).toMatch(
    /if \(delivered\) reclaimMessages\(messages\.slice\(messageIndex\)\)/
  );

  // Which means the runner has to be able to say what happened: an error rolls
  // back, a user abort keeps whatever streamed and so keeps its refs.
  const runner = /const runAssistantReply[\s\S]*?^\s{2}\};/m.exec(page)?.[0] ?? "";
  expect(runner).toContain("return !failed;");
  expect(runner).toMatch(/const onError = \(error: Error\) => \{\s*failed = true;/);
});

test("a send that rolled back reclaims the attachments it had just stored", () => {
  const page = readSrc("pages/Index.tsx");
  const send = /const handleSendMessage[\s\S]*?^\s{2}\};/m.exec(page)?.[0] ?? "";
  expect(send).toMatch(/if \(!delivered\) \{[\s\S]{0,140}deleteImage\(ref\.path\)/);
  // ...and only a rollback: a stopped reply keeps the message and its images.
  expect(page).toMatch(/a user abort keeps/);
});

test("context images are not recorded as attachments on the user message", () => {
  const page = readSrc("pages/Index.tsx");
  const send = /const handleSendMessage[\s\S]*?^\s{2}\};/m.exec(page)?.[0] ?? "";
  // Injected context images are sent with the prompt, but they are not
  // attachments: the marker (and countUnsavedAttachments) must count only
  // files the user chose, or a context-only turn claims "[Images: 1 attached]".
  expect(send).toMatch(
    /if \(attachmentRefs\.length > 0\) \{\s*messageContent = appendImageMarker\(content, attachmentRefs\.length\)/
  );
  expect(send).not.toMatch(/appendImageMarker\(content, imageUrls\.length\)/);
});
