// Profile info for the signed-in user.
//
// Two layers, because Puter keeps the account profile itself read-only for
// apps (only the account's own session may change it — the backend rejects
// app tokens on the profile-write route):
//
//   1. The Puter profile, read via puter.auth.getProfile()
//      (https://docs.puter.com/Auth/getProfile/): picture, display name, bio.
//   2. This app's own profile, stored per-user in puter.kv (the same store
//      the conversation sync uses). It holds the name, bio and avatar the
//      user customizes in FreeTalk, syncs across their devices, and
//      overrides layer 1 where set.
//
// The field limits mirror the UserProfile object's documented caps
// (https://docs.puter.com/Objects/userprofile) so an app-profile entry could
// be applied to the account profile verbatim if that ever becomes possible.

import type { UserProfile } from "./backend";
import { checkAuthStatus } from "./backend";
import { blobToDataUrl, dataUrlByteLength, dataUrlMimeType } from "./dataUrl";
import { downscaleImage } from "./utils/imageConversion";

export interface ProfileInfo {
  name: string | null;
  picture: string | null;
  bio: string | null;
}

/** What a custom picture is shrunk to before it goes into storage. */
export const AVATAR_MAX_EDGE = 512;

/** Largest stored avatar, in decoded bytes. KV caps values at 400 KB. */
export const AVATAR_MAX_BYTES = 200 * 1024;

export const DISPLAY_NAME_MAX = 64;
export const BIO_MAX = 280;

/** The app-scoped profile entry stored in puter.kv. */
export interface AppProfile {
  version: 1;
  displayName: string | null;
  bio: string | null;
  /** `data:<image>;base64,…` data URL, or null when unset. */
  picture: string | null;
  /** Epoch ms of the last write; last-writer-wins across devices. */
  updatedAt: number;
}

const APP_PROFILE_KEY = "aichat:profile:v1";
const LOCAL_CACHE_KEY = "chat-puter-vision-app-profile";

/** Display name, picture and bio from the Puter profile, or null. */
export async function getProfileInfo(): Promise<ProfileInfo | null> {
  try {
    const puter = window.puter;
    if (!puter?.auth?.getProfile) return null;
    const p: UserProfile | null = await puter.auth.getProfile();
    if (!p) return null;
    const rawName = p.displayName ?? p.display_name ?? p.name;
    const name = typeof rawName === "string" && rawName ? rawName : null;
    const rawBio = p.bio;
    const bio = typeof rawBio === "string" && rawBio ? rawBio : null;
    const picture = typeof p.picture === "string" && p.picture ? p.picture : null;
    return { name, picture, bio };
  } catch {
    return null;
  }
}

/** Trim to a profile string, mapping empty input to null. */
function cleanField(value: string, max: number): string | null {
  const trimmed = value.trim().slice(0, max);
  return trimmed ? trimmed : null;
}

/** Defensive read of an AppProfile from untrusted JSON. */
function normalizeAppProfile(raw: unknown): AppProfile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  const displayName =
    typeof r.displayName === "string" ? cleanField(r.displayName, DISPLAY_NAME_MAX) : null;
  const bio = typeof r.bio === "string" ? cleanField(r.bio, BIO_MAX) : null;
  const picture =
    typeof r.picture === "string" && /^data:image\//i.test(r.picture) ? r.picture : null;
  const updatedAt = typeof r.updatedAt === "number" ? r.updatedAt : 0;
  return { version: 1, displayName, bio, picture, updatedAt };
}

function readCache(): AppProfile | null {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? normalizeAppProfile(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCache(profile: AppProfile): void {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(profile));
  } catch {
    /* cache is best-effort */
  }
}

/**
 * Load the app profile. KV is the source of truth while signed in (and a
 * newer remote write replaces the cache); the cache serves the offline and
 * signed-out-first-paint cases.
 */
export async function loadAppProfile(): Promise<AppProfile | null> {
  const cached = readCache();
  const kv = typeof window !== "undefined" ? window.puter?.kv : undefined;
  if (!kv || !checkAuthStatus()) return cached;
  try {
    const raw = await kv.get(APP_PROFILE_KEY);
    const remote =
      (typeof raw === "string" ? normalizeAppProfile(JSON.parse(raw)) : null) ??
      normalizeAppProfile(raw);
    if (remote && remote.updatedAt >= (cached?.updatedAt ?? 0)) {
      writeCache(remote);
      return remote;
    }
    return cached ?? remote;
  } catch {
    return cached;
  }
}

/**
 * Persist the app profile. Returns false when the KV write failed (offline,
 * quota): the local cache is still updated, so the change shows on this
 * device and can be re-saved later.
 */
export async function saveAppProfile(profile: AppProfile): Promise<boolean> {
  writeCache(profile);
  const kv = typeof window !== "undefined" ? window.puter?.kv : undefined;
  if (!kv || !checkAuthStatus()) return false;
  const json = JSON.stringify(profile);
  try {
    // Private to this app: no other app may read the entry, even with the
    // user's appData grant (https://docs.puter.com/KV/set/). Older SDK builds
    // don't accept the options object, so fall back to a plain write — the
    // entry is still app-scoped, just without the extra privacy flag.
    return await kv.set(APP_PROFILE_KEY, json, { disableSharing: true });
  } catch {
    try {
      return await kv.set(APP_PROFILE_KEY, json);
    } catch {
      return false;
    }
  }
}

/** Clamp + trim a display-name or bio draft into its stored form. */
export function cleanProfileField(value: string, field: "displayName" | "bio"): string | null {
  return cleanField(value, field === "displayName" ? DISPLAY_NAME_MAX : BIO_MAX);
}

/**
 * Turn a picked image file into a storable avatar data URL: converted when
 * the container is exotic, shrunk to a small square budget, then encoded.
 * Throws a user-facing message when the result would not fit.
 */
export async function prepareAvatarDataUrl(file: File): Promise<string> {
  const shrunk = await downscaleImage(file, {
    maxEdge: AVATAR_MAX_EDGE,
    maxBytes: AVATAR_MAX_BYTES,
  });
  const dataUrl = await blobToDataUrl(shrunk);
  const mime = dataUrlMimeType(dataUrl);
  if (!mime || !mime.startsWith("image/")) {
    throw new Error("That file could not be read as an image.");
  }
  if (dataUrlByteLength(dataUrl) > AVATAR_MAX_BYTES) {
    throw new Error("That image is too large for a profile picture, even after resizing.");
  }
  return dataUrl;
}
