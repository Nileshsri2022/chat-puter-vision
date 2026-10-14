import { test, expect } from "bun:test";
import { mockPuter, throwsMsg } from "./helpers";
import {
  sanitizeFilename,
  saveConversationToDrive,
} from "../src/lib/drive";

test("sanitizeFilename replaces unsafe chars", () => {
  expect(sanitizeFilename("My Chat!")).toBe("My_Chat_.md");
});

test("sanitizeFilename falls back for empty titles", () => {
  expect(sanitizeFilename("")).toBe("conversation.md");
});

test("sanitizeFilename caps length at 80 chars + extension", () => {
  expect(sanitizeFilename("a".repeat(200)).length).toBe(83);
});

test("saveConversationToDrive writes to the exports folder", async () => {
  let seen: { path: string; data: string; opts: unknown } | null = null;
  mockPuter({
    fs: {
      write: async (path: string, data: string, opts: unknown) => {
        seen = { path, data, opts };
        return { name: "My_Chat_.md" };
      },
    },
  });
  const name = await saveConversationToDrive("My Chat!", "# hello");
  expect(name).toBe("My_Chat_.md");
  expect(seen!.path).toBe("FreeTalk Exports/My_Chat_.md");
  expect(seen!.data).toBe("# hello");
  expect(seen!.opts).toEqual({
    createMissingParents: true,
    dedupeName: true,
  });
});

test("saveConversationToDrive falls back to the filename", async () => {
  mockPuter({ fs: { write: async () => ({}) } });
  expect(await saveConversationToDrive("X", "y")).toBe("X.md");
});

test("saveConversationToDrive maps insufficient_funds", async () => {
  mockPuter({
    fs: {
      write: async () => {
        throw { code: "insufficient_funds" };
      },
    },
  });
  expect(await throwsMsg(() => saveConversationToDrive("X", "y"))).toContain(
    "credit exhausted"
  );
});

test("saveConversationToDrive maps storage_limit_reached", async () => {
  mockPuter({
    fs: {
      write: async () => {
        throw { code: "storage_limit_reached" };
      },
    },
  });
  expect(await throwsMsg(() => saveConversationToDrive("X", "y"))).toContain(
    "storage is full"
  );
});

test("saveConversationToDrive passes through backend messages", async () => {
  mockPuter({
    fs: {
      write: async () => {
        throw { code: "boom", message: "kaput" };
      },
    },
  });
  expect(await throwsMsg(() => saveConversationToDrive("X", "y"))).toBe(
    "kaput"
  );
});

test("saveConversationToDrive without the SDK", async () => {
  mockPuter({ fs: {} });
  expect(await throwsMsg(() => saveConversationToDrive("X", "y"))).toContain(
    "not available"
  );
});
