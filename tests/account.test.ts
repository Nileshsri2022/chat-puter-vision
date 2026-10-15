import { test, expect } from "bun:test";
import { mockPuter, installLocalStorage, throwsMsg } from "./helpers";
import { getCreditBalance, formatCredits } from "../src/lib/usage";
import {
  getProfileInfo,
  loadAppProfile,
  saveAppProfile,
  cleanProfileField,
  prepareAvatarDataUrl,
  type AppProfile,
} from "../src/lib/profile";
import { extractText } from "../src/lib/ocr";

// ---- usage ----

test("getCreditBalance converts microcents to dollars", async () => {
  mockPuter({
    auth: {
      getMonthlyUsage: async () => ({
        allowanceInfo: {
          monthUsageAllowance: 100_000_000,
          remaining: 42_500_000,
        },
      }),
    },
  });
  const b = await getCreditBalance();
  expect(b).not.toBeNull();
  expect(b!.allowance).toBe(1);
  expect(b!.remaining).toBeCloseTo(0.425, 9);
});

test("getCreditBalance is null when fields are missing", async () => {
  mockPuter({ auth: { getMonthlyUsage: async () => ({}) } });
  expect(await getCreditBalance()).toBeNull();
});

test("getCreditBalance is null on error", async () => {
  mockPuter({
    auth: {
      getMonthlyUsage: async () => {
        throw new Error("x");
      },
    },
  });
  expect(await getCreditBalance()).toBeNull();
});

test("getCreditBalance is null without the SDK", async () => {
  mockPuter({ auth: {} });
  expect(await getCreditBalance()).toBeNull();
});

test("formatCredits formats dollars", () => {
  expect(formatCredits(4.2)).toBe("$4.20");
  expect(formatCredits(0)).toBe("$0.00");
});

// ---- profile ----

test("getProfileInfo maps picture, display name and bio", async () => {
  mockPuter({
    auth: {
      getProfile: async () => ({
        picture: "https://pic/x.png",
        displayName: "Ada",
        bio: "Mathematician",
      }),
    },
  });
  expect(await getProfileInfo()).toEqual({
    name: "Ada",
    picture: "https://pic/x.png",
    bio: "Mathematician",
  });
});

test("getProfileInfo falls back to display_name", async () => {
  mockPuter({
    auth: { getProfile: async () => ({ display_name: "Grace" }) },
  });
  const p = await getProfileInfo();
  expect(p!.name).toBe("Grace");
  expect(p!.picture).toBeNull();
});

test("getProfileInfo is null when unavailable", async () => {
  mockPuter({ auth: { getProfile: async () => null } });
  expect(await getProfileInfo()).toBeNull();
});

test("getProfileInfo is null without the SDK", async () => {
  mockPuter({ auth: {} });
  expect(await getProfileInfo()).toBeNull();
});

// ---- app profile (this app's KV-backed profile) ----

const sampleProfile = (over: Partial<AppProfile> = {}): AppProfile => ({
  version: 1,
  displayName: "Ada",
  bio: "Mathematician",
  picture: "data:image/png;base64,AAAA",
  updatedAt: 42,
  ...over,
});

/** In-memory KV store shaped like puter.kv (string values). */
function mockKV() {
  const store = new Map<string, string>();
  mockPuter({
    auth: { isSignedIn: () => true },
    kv: {
      get: async (k: string) => (store.has(k) ? store.get(k)! : null),
      set: async (k: string, v: string) => {
        store.set(k, v);
        return true;
      },
    },
  });
  return store;
}

test("app profile round-trips through KV", async () => {
  installLocalStorage();
  mockKV();
  const saved = sampleProfile();
  expect(await saveAppProfile(saved)).toBe(true);
  expect(await loadAppProfile()).toEqual(saved);
});

test("app profile load prefers KV over a stale cache", async () => {
  installLocalStorage();
  const store = mockKV();
  // An old local cache…
  await saveAppProfile(sampleProfile({ displayName: "Old", updatedAt: 1 }));
  // …superseded by a newer remote write from another device.
  const remote = sampleProfile({ displayName: "New", updatedAt: 2 });
  store.forEach((_, k) => store.set(k, JSON.stringify(remote)));
  expect((await loadAppProfile())!.displayName).toBe("New");
});

test("app profile entries of the wrong shape are ignored", async () => {
  installLocalStorage();
  const store = mockKV();
  store.set("aichat:profile:v1", JSON.stringify({ version: 2, displayName: "X" }));
  expect(await loadAppProfile()).toBeNull();
});

test("saveAppProfile falls back to a plain set when the options form rejects", async () => {
  installLocalStorage();
  const store = new Map<string, string>();
  let calls = 0;
  mockPuter({
    auth: { isSignedIn: () => true },
    kv: {
      get: async (k: string) => (store.has(k) ? store.get(k)! : null),
      set: async (k: string, v: string, opts?: unknown) => {
        calls++;
        if (opts !== undefined) throw { code: "bad_request" }; // old SDK build
        store.set(k, v);
        return true;
      },
    },
  });
  expect(await saveAppProfile(sampleProfile())).toBe(true);
  expect(calls).toBe(2);
});

test("saveAppProfile keeps the local cache when KV is unreachable", async () => {
  installLocalStorage();
  mockPuter({
    auth: { isSignedIn: () => true },
    kv: {
      get: async () => null,
      set: async () => {
        throw new Error("offline");
      },
    },
  });
  const saved = sampleProfile();
  expect(await saveAppProfile(saved)).toBe(false);
  // Signed out afterwards, the cache still serves the saved profile.
  mockPuter({ auth: { isSignedIn: () => false } });
  expect(await loadAppProfile()).toEqual(saved);
});

test("cleanProfileField trims, clamps and empties to null", () => {
  expect(cleanProfileField("  Ada Lovelace  ", "displayName")).toBe("Ada Lovelace");
  expect(cleanProfileField("   ", "bio")).toBeNull();
  expect(cleanProfileField("x".repeat(100), "displayName")).toHaveLength(64);
  expect(cleanProfileField("y".repeat(300), "bio")).toHaveLength(280);
});

test("prepareAvatarDataUrl encodes a small image as a data URL", async () => {
  // No `document` here, so downscale is a passthrough; the encoding path is
  // what this covers (the byte cap is exercised via the size check).
  mockPuter({});
  const file = new File([new Uint8Array([1, 2, 3, 4])], "a.png", { type: "image/png" });
  const url = await prepareAvatarDataUrl(file);
  expect(url.startsWith("data:image/png;base64,")).toBe(true);
});

// ---- ocr ----

test("extractText trims the result", async () => {
  mockPuter({ ai: { img2txt: async () => "  Hello\nLine 2  " } });
  expect(await extractText(new Blob())).toBe("Hello\nLine 2");
});

test("extractText rejects empty results", async () => {
  mockPuter({ ai: { img2txt: async () => "   " } });
  expect(await throwsMsg(() => extractText(new Blob()))).toContain(
    "No text found"
  );
});

test("extractText maps input_too_large", async () => {
  mockPuter({
    ai: {
      img2txt: async () => {
        throw { code: "input_too_large" };
      },
    },
  });
  expect(await throwsMsg(() => extractText(new Blob()))).toContain("10 MB");
});

test("extractText maps insufficient_funds", async () => {
  mockPuter({
    ai: {
      img2txt: async () => {
        throw { code: "insufficient_funds" };
      },
    },
  });
  expect(await throwsMsg(() => extractText(new Blob()))).toContain(
    "credit exhausted"
  );
});

test("extractText passes through bad_request messages", async () => {
  mockPuter({
    ai: {
      img2txt: async () => {
        throw { code: "bad_request", message: "nope" };
      },
    },
  });
  expect(await throwsMsg(() => extractText(new Blob()))).toBe("nope");
});

test("extractText without the SDK", async () => {
  mockPuter({ ai: {} });
  expect(await throwsMsg(() => extractText(new Blob()))).toContain(
    "not available"
  );
});
