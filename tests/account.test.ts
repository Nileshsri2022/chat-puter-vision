import { test, expect } from "bun:test";
import { mockPuter, throwsMsg } from "./helpers";
import { getCreditBalance, formatCredits } from "../src/lib/usage";
import { getProfileInfo } from "../src/lib/profile";
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

test("getProfileInfo maps picture and display name", async () => {
  mockPuter({
    auth: {
      getProfile: async () => ({
        picture: "https://pic/x.png",
        displayName: "Ada",
        bio: null,
      }),
    },
  });
  expect(await getProfileInfo()).toEqual({
    name: "Ada",
    picture: "https://pic/x.png",
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
