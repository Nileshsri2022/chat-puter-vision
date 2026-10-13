import { test, expect, beforeEach } from "bun:test";
import { installLocalStorage, mockPuter } from "./helpers";
import {
  mergeDocs,
  syncConversations,
  recordDelete,
  type SyncDoc,
} from "../src/lib/sync";

installLocalStorage();

interface TestConv {
  id: string;
  title: string;
  timestamp: Date;
  messages: unknown[];
  updatedAt: number;
}

const C = (id: string, updatedAt: number, title = id): TestConv => ({
  id,
  title,
  timestamp: new Date(updatedAt),
  messages: [],
  updatedAt,
});

const doc = (
  convs: TestConv[],
  deleted: Record<string, number> = {}
): SyncDoc => ({ version: 1, conversations: convs as never[], deleted });

const NOW = Date.now();
const localStorage = globalThis.localStorage as Storage;

// ---- mergeDocs ----

test("null remote keeps local and marks changed", () => {
  const { doc: d, changed } = mergeDocs(doc([C("a", 100)]), null);
  expect(changed).toBe(true);
  expect(d.conversations).toHaveLength(1);
});

test("remote newcomers land newest-first at the front", () => {
  const { doc: d, changed } = mergeDocs(
    doc([C("a", 100)]),
    doc([C("b", 200), C("c", 300)])
  );
  expect(changed).toBe(true);
  expect(d.conversations.map((c) => (c as TestConv).id)).toEqual([
    "c",
    "b",
    "a",
  ]);
});

test("remote-newer conversation wins the conflict", () => {
  const { doc: d } = mergeDocs(
    doc([C("a", 100, "old")]),
    doc([C("a", 200, "new")])
  );
  expect((d.conversations[0] as TestConv).title).toBe("new");
});

test("local-newer conversation wins without flagging changed", () => {
  const { doc: d, changed } = mergeDocs(
    doc([C("a", 300, "mine")]),
    doc([C("a", 200, "theirs")])
  );
  expect((d.conversations[0] as TestConv).title).toBe("mine");
  expect(changed).toBe(false);
});

test("tombstone drops an older conversation", () => {
  const { doc: d } = mergeDocs(
    doc([C("a", NOW - 5000)]),
    doc([], { a: NOW - 1000 })
  );
  expect(d.conversations).toHaveLength(0);
});

test("tombstone loses to a newer conversation", () => {
  const { doc: d } = mergeDocs(
    doc([C("a", NOW)]),
    doc([], { a: NOW - 5000 })
  );
  expect(d.conversations).toHaveLength(1);
});

test("remote tombstones merge into the result", () => {
  const { doc: d, changed } = mergeDocs(
    doc([C("a", NOW)]),
    doc([C("a", NOW)], { b: NOW - 1000 })
  );
  expect(d.deleted.b).toBe(NOW - 1000);
  expect(changed).toBe(true);
});

test("expired tombstones are pruned", () => {
  const { doc: d, changed } = mergeDocs(
    doc([], { a: NOW - 31 * 864e5 }),
    null
  );
  expect("a" in d.deleted).toBe(false);
  expect(changed).toBe(true);
});

test("corrupt remote conversations are skipped", () => {
  const { doc: d } = mergeDocs(doc([]), {
    version: 1,
    conversations: [{ nope: 1 }, null, C("ok", 50)],
    deleted: {},
  } as unknown as SyncDoc);
  expect(d.conversations).toHaveLength(1);
});

test("local order is preserved when nothing changes", () => {
  const { doc: d } = mergeDocs(
    doc([C("a", 300), C("b", 100)]),
    doc([C("a", 300), C("b", 100)])
  );
  expect(d.conversations.map((c) => (c as TestConv).id)).toEqual(["a", "b"]);
});

// ---- syncConversations (mocked KV) ----

const store = new Map<string, string>();
const KEY = "aichat:conversations:v1";

const mockSignedIn = () =>
  mockPuter({
    auth: { isSignedIn: () => true },
    kv: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => {
        store.set(k, v);
        return true;
      },
      del: async (k: string) => store.delete(k),
      list: async () => [...store.keys()],
    },
  });

beforeEach(() => {
  store.clear();
  localStorage.clear();
  mockSignedIn();
});

test("first sync pushes local conversations", async () => {
  const r = await syncConversations([C("a", NOW)] as never[]);
  expect(r.changed).toBe(true);
  expect(store.has(KEY)).toBe(true);
});

test("second sync is a no-op", async () => {
  await syncConversations([C("a", NOW)] as never[]);
  const r = await syncConversations([C("a", NOW)] as never[]);
  expect(r.changed).toBe(false);
});

test("pulls a newcomer written by another device", async () => {
  await syncConversations([C("a", NOW)] as never[]);
  const remote = JSON.parse(store.get(KEY)!);
  remote.conversations.push({
    id: "b",
    title: "b",
    timestamp: new Date(NOW).toISOString(),
    messages: [],
    updatedAt: NOW,
  });
  store.set(KEY, JSON.stringify(remote));
  const r = await syncConversations([C("a", NOW)] as never[]);
  expect(r.changed).toBe(true);
  expect(r.doc.conversations.some((c) => (c as TestConv).id === "b")).toBe(
    true
  );
});

test("local newer conversation is pushed to KV", async () => {
  await syncConversations([C("a", NOW, "v1")] as never[]);
  const r = await syncConversations([C("a", NOW + 1000, "v2")] as never[]);
  const stored = JSON.parse(store.get(KEY)!);
  expect((stored.conversations[0] as TestConv).title).toBe("v2");
  // Local already holds the content, so no local apply is needed.
  expect(r.changed).toBe(false);
});

test("local-only conversation is pushed to KV", async () => {
  await syncConversations([C("a", NOW)] as never[]);
  await syncConversations([C("a", NOW), C("b", NOW)] as never[]);
  const stored = JSON.parse(store.get(KEY)!);
  expect(
    stored.conversations.some((c: TestConv) => c.id === "b")
  ).toBe(true);
});

test("deletion propagates as a tombstone", async () => {
  await syncConversations(
    [C("a", NOW), C("b", NOW)] as never[]
  );
  recordDelete("b");
  await syncConversations([C("a", NOW)] as never[]);
  const stored = JSON.parse(store.get(KEY)!);
  expect(stored.deleted.b).toBeGreaterThan(0);
  expect(
    stored.conversations.some((c: TestConv) => c.id === "b")
  ).toBe(false);
});

test("deleted conversation is not resurrected by an older remote copy", async () => {
  await syncConversations([C("a", NOW)] as never[]);
  recordDelete("b");
  await syncConversations([C("a", NOW)] as never[]);
  const r = await syncConversations([C("a", NOW)] as never[]);
  expect(r.doc.conversations.some((c) => (c as TestConv).id === "b")).toBe(
    false
  );
});

test("KV outage falls back to local state", async () => {
  mockPuter({
    auth: { isSignedIn: () => true },
    kv: {
      get: async () => {
        throw new Error("down");
      },
      set: async () => true,
    },
  });
  const r = await syncConversations([C("a", NOW)] as never[]);
  expect(r.changed).toBe(false);
  expect(r.doc.conversations).toHaveLength(1);
});

test("signed out is a no-op", async () => {
  mockPuter({
    auth: { isSignedIn: () => false },
    kv: {
      get: async () => "x",
      set: async () => true,
    },
  });
  const r = await syncConversations([C("a", NOW)] as never[]);
  expect(r.changed).toBe(false);
});
