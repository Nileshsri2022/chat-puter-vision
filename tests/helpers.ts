// Shared test helpers: localStorage shim (bun has none) and puter SDK mocking.

/** Install a minimal in-memory localStorage on globalThis. */
export function installLocalStorage(): void {
  const m = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    clear: () => m.clear(),
  };
}

/** Replace the global window with a mocked puter SDK. */
export function mockPuter(puter: unknown): void {
  (globalThis as Record<string, unknown>).window = { puter };
}

/** Run fn, expecting it to throw; resolves to the error message. */
export async function throwsMsg(
  fn: () => Promise<unknown>
): Promise<string> {
  try {
    await fn();
    return "NO-THROW";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
