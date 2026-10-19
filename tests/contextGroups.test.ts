import { test, expect } from "bun:test";
import {
  MAX_CONTEXT_IMAGES,
  addItemToContextGroup,
  artifactToContextPayload,
  combinePromptWithContext,
  contextItemFromPayload,
  contextItemKey,
  contextItemToPayload,
  contextPayloadKey,
  createContextGroup,
  createContextSelectionGroup,
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

test("resolveContextGroupForTask reports the item composition so the model can answer count questions", async () => {
  let group = createContextGroup(undefined, OCT_19);
  group = addItemToContextGroup(
    group,
    {
      kind: "image",
      ref: "freetalk-context-image.png",
      refKind: "drive",
      origin: "generated",
      label: "Generated image",
    },
    OCT_19
  ).group;
  group = addItemToContextGroup(
    group,
    {
      kind: "text",
      text: "A man dancing in water",
      label: "A man dancing in water",
    },
    OCT_19
  ).group;
  const resolved = await resolveContextGroupForTask(
    group,
    async (path) => `data:image/png;base64,${path}`
  );

  expect(resolved.itemSummary).toBe("2 items (1 image, 1 text item)");

  const chatPrompt = combinePromptWithContext(
    "how many in context?",
    group.title,
    resolved.contextText,
    "chat",
    resolved.itemSummary
  );
  expect(chatPrompt).toContain(
    "This context group contains 2 items (1 image, 1 text item)."
  );
  expect(chatPrompt).toContain("A man dancing in water");
  expect(chatPrompt.endsWith("how many in context?")).toBe(true);

  // The image-generation path must not receive the inventory: it is metadata,
  // not scene content.
  const imagePrompt = combinePromptWithContext(
    "make it night",
    group.title,
    resolved.contextText,
    "image",
    resolved.itemSummary
  );
  expect(imagePrompt).not.toContain("This context group contains");
  expect(imagePrompt).toContain("A man dancing in water");
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
  // Only the two sendable images are claimed to the model; the missing one is
  // reported through `missingImages` and the skip toast instead.
  expect(resolved.itemSummary).toBe("2 items (2 images)");
  // Provenance follows the first image that actually resolved.
  expect(resolved.primaryImageBase).toEqual({
    src: "data:image/png;base64,AAAA",
    origin: "generated",
  });
});

// ---- Single-artifact injection (`←`) ----
//
// The composer can queue individual artifacts without first saving them into a
// Context Group. These tests pin the identity used to toggle a queued item and
// the ephemeral group shape the existing send/generate paths consume.

test("context item keys identify the same artifact without relying on generated ids", () => {
  const imageItem = contextItemFromPayload(
    {
      kind: "image",
      ref: "freetalk-gen.png",
      refKind: "drive",
      origin: "generated",
      label: "Generated image",
    },
    OCT_19
  );
  const sameImage = contextItemFromPayload(
    {
      kind: "image",
      ref: "freetalk-gen.png",
      refKind: "drive",
      origin: "generated",
      label: "Generated image",
    },
    OCT_18
  );
  expect(contextItemKey(imageItem)).toBe(contextItemKey(sameImage));
  expect(contextItemKey(imageItem)).toBe("image:drive:freetalk-gen.png");

  const codeItem = contextItemFromPayload(
    { kind: "code", text: "print('hi')", label: "</> Python · hi.py" },
    OCT_19
  );
  expect(contextItemKey(codeItem)).toBe("code:print('hi')");
  // The same text in a different kind is a different artifact.
  expect(contextItemKey(codeItem)).not.toBe(
    contextItemKey(
      contextItemFromPayload(
        { kind: "text", text: "print('hi')", label: "hi" },
        OCT_19
      )
    )
  );
});

test("a payload and the item it becomes share one key, so clicking `←` twice toggles", () => {
  const payload: ContextDropPayload = {
    kind: "table",
    text: "| A | B |\n| - | - |\n| 1 | 2 |",
    label: "▦ Table · specs",
    source: { conversationId: "conv-1", messageIndex: 3, at: 30 },
  };
  const item = contextItemFromPayload(payload, OCT_19);
  expect(contextPayloadKey(payload)).toBe(contextItemKey(item));
  expect(contextItemToPayload(item)).toEqual(payload);
});

test("a selection group carries only hand-picked items, with an item-count title", () => {
  const image = contextItemFromPayload(
    {
      kind: "image",
      ref: "data:image/png;base64,AAAA",
      refKind: "data",
      origin: "generated",
      label: "Generated image",
    },
    OCT_19
  );
  const code = contextItemFromPayload(
    {
      kind: "code",
      text: "pose = 1",
      language: "python",
      label: "</> Python · pose_config.py",
    },
    OCT_19
  );

  const single = createContextSelectionGroup([image], OCT_19);
  expect(single.items).toEqual([image]);
  expect(single.title).toBe("Selection — Generated image");

  const pair = createContextSelectionGroup([image, code], OCT_19);
  expect(pair.title).toBe("Selection — Generated image +1");
  expect(pair.items.map(contextItemKey)).toEqual([
    contextItemKey(image),
    contextItemKey(code),
  ]);
});

test("a selection group resolves through the same chat path as a saved group", async () => {
  const image = contextItemFromPayload(
    {
      kind: "image",
      ref: "freetalk-selected.png",
      refKind: "drive",
      origin: "generated",
      label: "Generated image",
    },
    OCT_19
  );
  const text = contextItemFromPayload(
    { kind: "text", text: "Neon night lighting", label: "Neon night lighting" },
    OCT_19
  );

  const resolved = await resolveContextGroupForTask(
    createContextSelectionGroup([image, text], OCT_19),
    async () => "data:image/png;base64,AAAA"
  );

  expect(resolved.imageDataUrls).toEqual(["data:image/png;base64,AAAA"]);
  expect(resolved.contextText).toBe("Neon night lighting");
  expect(resolved.itemSummary).toBe("2 items (1 image, 1 text item)");
});
