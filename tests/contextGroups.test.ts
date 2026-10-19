import { test, expect } from "bun:test";
import {
  MAX_CONTEXT_IMAGES,
  addItemToContextGroup,
  artifactToContextPayload,
  combinePromptWithContext,
  createContextGroup,
  decodeContextDragPayload,
  encodeContextDragPayload,
  formatContextDatePrefix,
  formatDefaultContextTitle,
  isContextImageItem,
  reclaimContextImagePaths,
  removeItemFromContextGroup,
  resolveContextGroupForTask,
  type ContextDropPayload,
} from "../src/lib/contextGroups";
import { collectArtifacts } from "../src/lib/artifacts";
import type { Message } from "../src/lib/backend";

const OCT_19 = new Date(2026, 9, 19, 12, 0, 0).getTime();
const OCT_18 = new Date(2026, 9, 18, 12, 0, 0).getTime();

test("formatDefaultContextTitle builds date-stamped names for today and earlier days", () => {
  expect(formatContextDatePrefix(OCT_19, OCT_19)).toBe("Today, Oct 19");
  expect(formatContextDatePrefix(OCT_18, OCT_19)).toBe("Oct 18");
  expect(formatDefaultContextTitle(OCT_19, "Boy Dancing Reference", OCT_19)).toBe(
    "Today, Oct 19 — Boy Dancing Reference"
  );
  expect(formatDefaultContextTitle(OCT_18, "Trip Plan & Code", OCT_19)).toBe(
    "Oct 18 — Trip Plan & Code"
  );
});

test("a single Context Group holds up to 10 images and multiple text, code, and table items", () => {
  let group = createContextGroup(undefined, OCT_19);
  expect(group.title).toBe("Today, Oct 19 — New Context");

  // Add 10 images with source provenance
  for (let i = 1; i <= MAX_CONTEXT_IMAGES; i++) {
    const res = addItemToContextGroup(
      group,
      {
        kind: "image",
        ref: `freetalk-img-${i}.png`,
        refKind: "drive",
        origin: "generated",
        label: i === 1 ? "Boy Dancing Reference" : `Image ${i}`,
        source: { conversationId: "conv-1", messageIndex: i },
      },
      OCT_19
    );
    expect(res.added).toBe(true);
    group = res.group;
  }

  // First item auto-names the untitled group
  expect(group.title).toBe("Today, Oct 19 — Boy Dancing Reference");
  expect(group.items.filter(isContextImageItem)).toHaveLength(10);

  // 11th image is rejected at MAX_CONTEXT_IMAGES (10)
  const eleventh = addItemToContextGroup(
    group,
    {
      kind: "image",
      ref: "freetalk-img-11.png",
      refKind: "drive",
      origin: "generated",
      label: "Image 11",
    },
    OCT_19
  );
  expect(eleventh.added).toBe(false);
  expect(eleventh.reason).toBe("image_limit");

  // Multiple text, code, and table items can still be added to the same context
  const text1 = addItemToContextGroup(
    group,
    {
      kind: "text",
      text: "Boy dancing in car with energetic pose",
      label: "Boy dancing in car...",
      source: {
        conversationId: "conv-1",
        messageIndex: 0,
        highlightText: "Boy dancing in car",
      },
    },
    OCT_19
  );
  expect(text1.added).toBe(true);
  group = text1.group;

  const code1 = addItemToContextGroup(
    group,
    {
      kind: "code",
      text: "pose = {'lighting': 'neon'}",
      language: "python",
      label: "</> Python · pose_config.py",
      source: { conversationId: "conv-1", messageIndex: 2, at: 42 },
    },
    OCT_19
  );
  expect(code1.added).toBe(true);
  group = code1.group;

  const table1 = addItemToContextGroup(
    group,
    {
      kind: "table",
      text: "| Scene | Lens |\n| --- | --- |\n| Car | 35mm |",
      label: "▦ Table · Scene & Camera Specs",
      source: { conversationId: "conv-1", messageIndex: 3, at: 10 },
    },
    OCT_19
  );
  expect(table1.added).toBe(true);
  group = table1.group;

  expect(group.items).toHaveLength(13);
});

test("resolveContextGroupForTask resolves all 10 images and formats text, code, and table items", async () => {
  let group = createContextGroup(undefined, OCT_19);
  for (let i = 1; i <= 10; i++) {
    group = addItemToContextGroup(
      group,
      {
        kind: "image",
        ref: `freetalk-img-${i}.png`,
        refKind: "drive",
        origin: i === 1 ? "attachment" : "generated",
        label: `Image ${i}`,
      },
      OCT_19
    ).group;
  }
  group = addItemToContextGroup(
    group,
    { kind: "text", text: "Neon night lighting style", label: "Neon night lighting style" },
    OCT_19
  ).group;
  group = addItemToContextGroup(
    group,
    {
      kind: "code",
      text: "print('hello')",
      language: "python",
      label: "</> Python · 1 line",
    },
    OCT_19
  ).group;

  const resolved = await resolveContextGroupForTask(
    group,
    async (path) => `data:image/png;base64,${path}`
  );

  expect(resolved.imageDataUrls).toHaveLength(10);
  expect(resolved.imageDataUrls[0]).toBe("data:image/png;base64,freetalk-img-1.png");
  expect(resolved.imageDataUrls[9]).toBe("data:image/png;base64,freetalk-img-10.png");
  expect(resolved.primaryImageBase).toEqual({
    src: "freetalk-img-1.png",
    origin: "attachment",
  });
  expect(resolved.contextText).toContain("Neon night lighting style");
  expect(resolved.contextText).toContain("```python\nprint('hello')\n```");

  const chatPrompt = combinePromptWithContext(
    "Explain this setup",
    group.title,
    resolved.contextText,
    "chat"
  );
  expect(chatPrompt).toContain(`[Context: ${group.title}]`);
  expect(chatPrompt).toContain("Explain this setup");
});

test("removeItemFromContextGroup and reclaimContextImagePaths track owned Drive files", () => {
  let group = createContextGroup(
    {
      kind: "image",
      ref: "freetalk-owned-1.png",
      refKind: "drive",
      origin: "attachment",
      label: "Uploaded",
      ownedPath: true,
    },
    OCT_19
  );
  group = addItemToContextGroup(
    group,
    {
      kind: "image",
      ref: "freetalk-shared-msg.png",
      refKind: "drive",
      origin: "generated",
      label: "From chat",
    },
    OCT_19
  ).group;

  // Only paths written specifically for the context group are reclaimed when
  // the context group is deleted — chat message paths belong to their message.
  expect(reclaimContextImagePaths(group.items)).toEqual(["freetalk-owned-1.png"]);

  const { group: afterRemove, removed } = removeItemFromContextGroup(
    group,
    group.items[0].id,
    OCT_19
  );
  expect(afterRemove.items).toHaveLength(1);
  expect(reclaimContextImagePaths(removed ? [removed] : [])).toEqual([
    "freetalk-owned-1.png",
  ]);
});

test("artifactToContextPayload and drag payload round-trip preserve source provenance", () => {
  const messages: Message[] = [
    {
      role: "assistant",
      content: "```python\nx = 1\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |",
      imagePath: "freetalk-gen.png",
    },
  ];
  const artifacts = collectArtifacts(messages);
  expect(artifacts).toHaveLength(3);

  for (const artifact of artifacts) {
    const payload: ContextDropPayload | null = artifactToContextPayload(
      artifact,
      "conv-42"
    );
    expect(payload).not.toBeNull();
    const encoded = encodeContextDragPayload(payload!);
    const decoded = decodeContextDragPayload(encoded);
    expect(decoded).toEqual(payload);
    expect(decoded?.source?.conversationId).toBe("conv-42");
    expect(decoded?.source?.messageIndex).toBe(0);
  }
});

test("resolveContextGroupForTask skips images it cannot make sendable and counts them", async () => {
  let group = createContextGroup(undefined, OCT_19);
  // A live data URL, a Drive path that resolves, and a stale reference whose
  // read fails (e.g. the file was deleted or an older build wrote a bare path
  // with refKind "data").
  group = addItemToContextGroup(
    group,
    {
      kind: "image",
      ref: "data:image/png;base64,AAAA",
      refKind: "data",
      origin: "generated",
      label: "Inline image",
    },
    OCT_19
  ).group;
  group = addItemToContextGroup(
    group,
    {
      kind: "image",
      ref: "freetalk-upload-a.png",
      refKind: "data", // wrong kind, older build: must be repaired by reading Drive
      origin: "attachment",
      label: "Repairable image",
    },
    OCT_19
  ).group;
  group = addItemToContextGroup(
    group,
    {
      kind: "image",
      ref: "freetalk-missing.png",
      refKind: "drive",
      origin: "generated",
      label: "Missing image",
    },
    OCT_19
  ).group;

  const resolved = await resolveContextGroupForTask(group, async (path) => {
    if (path === "freetalk-missing.png") throw new Error("not found");
    return `data:image/png;base64,${path}`;
  });

  expect(resolved.imageDataUrls).toEqual([
    "data:image/png;base64,AAAA",
    "data:image/png;base64,freetalk-upload-a.png",
  ]);
  expect(resolved.missingImages).toBe(1);
  // Provenance follows the first image that actually resolved.
  expect(resolved.primaryImageBase).toEqual({
    src: "data:image/png;base64,AAAA",
    origin: "generated",
  });
});
