// Cross-device conversation sync via puter.kv.
// Docs: https://docs.puter.com/KV/ (read 2026-10-13).
//
// One JSON document per user: { version, conversations, deleted }.
// Merge is per-conversation last-writer-wins on updatedAt, with tombstones
// for deletes (a delete on one device must not resurrect from another).
// Everything is offline-first: KV failures never break local use.

import type { Conversation } from "@/pages/Index";
import { checkAuthStatus } from "./backend";

export interface SyncDoc {
  version: 1;
  conversations: Conversation[];
  /** id -> deletedAt (epoch ms) */
  deleted: Record<string, number>;
}

const SYNC_KEY = "aichat:conversations:v1";
const LOCAL_TOMBSTONES_KEY = "chat-puter-vision-tombstones";
const TOMBSTONE_TTL_MS = 30 * 24 * 3600 * 1000;

const convTime = (c: Conversation): number =>
  typeof c.updatedAt === "number"
    ? c.updatedAt
    : c.timestamp instanceof Date
      ? c.timestamp.getTime()
      : new Date(c.timestamp).getTime() || 0;

function normalizeConversation(c: unknown): Conversation | null {
  if (typeof c !== "object" || c === null) return null;
  const r = c as Record<string, unknown>;
  if (typeof r.id !== "string" || !Array.isArray(r.messages)) return null;
  const timestamp = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp as string);
  if (isNaN(timestamp.getTime())) return null;
  return {
    id: r.id,
    title: typeof r.title === "string" ? r.title : "New Conversation",
    timestamp,
    messages: r.messages as Conversation["messages"],
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : timestamp.getTime(),
  };
}

function isSyncDoc(raw: unknown): raw is SyncDoc {
  if (typeof raw !== "object" || raw === null) return false;
  const d = raw as Record<string, unknown>;
  return (
    d.version === 1 &&
    Array.isArray(d.conversations) &&
    typeof d.deleted === "object" &&
    d.deleted !== null
  );
}

function readLocalTombstones(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LOCAL_TOMBSTONES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocalTombstones(t: Record<string, number>): void {
  try {
    localStorage.setItem(LOCAL_TOMBSTONES_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

/** Record a local delete so it propagates instead of resurrecting. */
export function recordDelete(id: string): void {
  const t = readLocalTombstones();
  t[id] = Date.now();
  writeLocalTombstones(t);
}

/**
 * Merge two sync docs. Local array order is preserved; conversations only on
 * the remote side are prepended newest-first. Returns whether the merged doc
 * differs from `a` (caller decides whether to apply/push).
 */
export function mergeDocs(
  a: SyncDoc,
  b: SyncDoc | null
): { doc: SyncDoc; changed: boolean } {
  // No remote doc yet: everything local is new -> must push.
  let changed = b === null;

  const deleted: Record<string, number> = { ...a.deleted };
  if (b) {
    for (const [id, t] of Object.entries(b.deleted)) {
      if (typeof t !== "number") continue;
      if (!(id in deleted) || t > deleted[id]) {
        if ((a.deleted[id] ?? -1) !== t) changed = true;
        deleted[id] = Math.max(deleted[id] ?? 0, t);
      }
    }
  }
  const now = Date.now();
  for (const id of Object.keys(deleted)) {
    if (now - deleted[id] > TOMBSTONE_TTL_MS) {
      delete deleted[id];
      changed = true;
    }
  }

  const byId = new Map<string, Conversation>();
  const order: string[] = [];
  for (const c of a.conversations) {
    byId.set(c.id, c);
    order.push(c.id);
  }
  if (b) {
    const newcomers: Conversation[] = [];
    for (const rc of b.conversations) {
      const c = normalizeConversation(rc);
      if (!c) continue;
      const cur = byId.get(c.id);
      if (!cur) {
        newcomers.push(c);
      } else if (convTime(c) > convTime(cur)) {
        byId.set(c.id, c);
        changed = true;
      }
    }
    newcomers.sort((x, y) => convTime(y) - convTime(x));
    for (const c of newcomers) byId.set(c.id, c);
    if (newcomers.length > 0) {
      order.unshift(...newcomers.map((c) => c.id));
      changed = true;
    }
  }
  for (const [id, t] of Object.entries(deleted)) {
    const c = byId.get(id);
    if (c && convTime(c) <= t) {
      byId.delete(id);
      const i = order.indexOf(id);
      if (i >= 0) order.splice(i, 1);
      changed = true;
    }
  }

  const conversations = order
    .map((id) => byId.get(id))
    .filter((c): c is Conversation => !!c);
  return { doc: { version: 1, conversations, deleted }, changed };
}

export interface SyncResult {
  doc: SyncDoc;
  /** True when the merged doc differs from local state — apply it. */
  changed: boolean;
}

/**
 * Pull the remote doc, merge with local, push back when anything changed.
 * Offline-first: returns local untouched when KV/auth is unavailable.
 */
export async function syncConversations(
  local: Conversation[]
): Promise<SyncResult> {
  const base: SyncDoc = {
    version: 1,
    conversations: local,
    deleted: readLocalTombstones(),
  };
  const kv = typeof window !== "undefined" ? window.puter?.kv : undefined;
  if (!kv || !checkAuthStatus()) return { doc: base, changed: false };
  try {
    const raw = await kv.get(SYNC_KEY);
    let remote: SyncDoc | null = null;
    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isSyncDoc(parsed)) remote = parsed;
      } catch {
        /* corrupt remote: treat as absent, we will overwrite */
      }
    } else if (isSyncDoc(raw)) {
      remote = raw;
    }
    const { doc, changed } = mergeDocs(base, remote);
    const mergedJson = JSON.stringify(doc);
    // Push whenever the merged doc differs from what's stored remotely.
    // `changed` only flags "local state must be applied"; it stays false
    // when local is newer than remote or holds conversations remote lacks —
    // both cases still need a push, or edits would never leave the device.
    const remoteJson =
      typeof raw === "string" ? raw : remote ? JSON.stringify(remote) : null;
    if (remoteJson === null || mergedJson !== remoteJson) {
      await kv.set(SYNC_KEY, mergedJson);
    }
    writeLocalTombstones(doc.deleted);
    return { doc, changed };
  } catch {
    return { doc: base, changed: false };
  }
}
