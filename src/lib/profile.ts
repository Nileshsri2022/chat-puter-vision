// Profile info via puter.auth.getProfile().
// Docs: https://docs.puter.com/Auth/getProfile/ (read 2026-10-13).
// Resolves to { picture, display name, bio } or null when unavailable.

import type { UserProfile } from "./puter";

export interface ProfileInfo {
  name: string | null;
  picture: string | null;
}

/** Display name + picture URL, or null when unavailable. */
export async function getProfileInfo(): Promise<ProfileInfo | null> {
  try {
    const puter = window.puter;
    if (!puter?.auth?.getProfile) return null;
    const p: UserProfile | null = await puter.auth.getProfile();
    if (!p) return null;
    const rawName = p.displayName ?? p.display_name ?? p.name;
    const name = typeof rawName === "string" && rawName ? rawName : null;
    const picture = typeof p.picture === "string" && p.picture ? p.picture : null;
    return { name, picture };
  } catch {
    return null;
  }
}
