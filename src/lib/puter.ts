// Typed wrapper around the Puter.js SDK (loaded from https://js.puter.com/v2/).
//
// The SDK exposes itself as `window.puter`. Shapes below follow
// https://docs.puter.com/ (Auth + AI/chat sections, read 2026-10-13).
// NOTE: `puter.auth.currentUser` is intentionally absent — it is not a
// documented API. The documented sign-in check is `isSignedIn()`.

export interface PuterUser {
  uuid: string;
  username: string;
  email?: string;
  requires_email_confirmation?: boolean;
  is_temp?: boolean;
}

export interface PuterSignInResult {
  success: boolean;
  token?: string;
  username?: string;
  error?: string;
  msg?: string;
}

export type PuterChatRole = "system" | "user" | "assistant" | "tool";

export interface PuterTextBlock {
  type: "text";
  text: string;
}

export interface PuterImageBlock {
  type: "image_url";
  image_url: { url: string };
}

export type PuterContentBlock = PuterTextBlock | PuterImageBlock;

export interface PuterChatMessage {
  role: PuterChatRole;
  content: string | PuterContentBlock[];
}

export interface PuterChatOptions {
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface PuterStreamPart {
  type?: string;
  text?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export interface PuterModelInfo {
  id: string;
  puterId?: string;
  /** Documented: listModels() objects always contain `id` and `provider`. */
  provider?: string;
  name?: string;
  aliases?: string[];
  modalities?: { input?: string[]; output?: string[] };
  [key: string]: unknown;
}

interface PuterAuth {
  signIn(options?: { attempt_temp_user_creation?: boolean; request_auth?: boolean }): Promise<PuterSignInResult>;
  signOut(): void;
  /** Documented synchronous sign-in check. */
  isSignedIn(): boolean;
  /** Returns a Promise resolving to the User object (or rejects when signed out). */
  getUser(): Promise<PuterUser>;
  /** https://docs.puter.com/Auth/getProfile/ — resolves null when unavailable. */
  getProfile(): Promise<UserProfile | null>;
  /** https://docs.puter.com/Auth/getMonthlyUsage/ */
  getMonthlyUsage(): Promise<MonthlyUsage>;
}

/**
 * https://docs.puter.com/Auth/getProfile/ — picture, display name, bio.
 * Every field present, null where the user set nothing. Field names vary,
 * so consumers should read defensively.
 */
export interface UserProfile {
  picture?: string | null;
  displayName?: string | null;
  display_name?: string | null;
  name?: string | null;
  bio?: string | null;
  [key: string]: unknown;
}

/**
 * https://docs.puter.com/Auth/getMonthlyUsage/ — resources are measured in
 * microcents ($0.50 = 50,000,000).
 */
export interface MonthlyUsage {
  allowanceInfo?: {
    monthUsageAllowance?: number;
    remaining?: number;
  };
  appTotals?: Record<string, { count?: number; total?: number }>;
  usage?: Record<string, { cost?: number; count?: number; units?: number }>;
  [key: string]: unknown;
}

export interface Speech2TxtResult {
  text?: string;
  [key: string]: unknown;
}

interface PuterAI {
  chat(prompt: string, options?: PuterChatOptions): Promise<unknown>;
  chat(prompt: string, media: string | File | Array<string | File>, testMode: boolean, options?: PuterChatOptions): Promise<unknown>;
  chat(messages: PuterChatMessage[], testMode: boolean, options?: PuterChatOptions): Promise<unknown>;
  listModels(provider?: string | null): Promise<PuterModelInfo[]>;
  /** https://docs.puter.com/AI/listModelProviders/ — resolves to string[] */
  listModelProviders(): Promise<string[]>;
  /** https://docs.puter.com/AI/img2txt/ — resolves to the recognized text string */
  img2txt(image: string | File | Blob, options?: Record<string, unknown>): Promise<string>;
  /** https://docs.puter.com/AI/txt2speech/ — resolves to an HTMLAudioElement; call audio.play() */
  txt2speech(text: string, options?: Record<string, unknown>): Promise<HTMLAudioElement>;
  /** https://docs.puter.com/AI/txt2img/ — resolves to one HTMLImageElement in browsers */
  txt2img(prompt: string, options?: Record<string, unknown>): Promise<HTMLImageElement>;
  /** https://docs.puter.com/AI/speech2txt/ — resolves to a result object, or a string with response_format: "text" */
  speech2txt(source: string | File | Blob, options?: Record<string, unknown>): Promise<Speech2TxtResult | string>;
}

interface PuterKV {
  set(key: string, value: string): Promise<boolean>;
  get(key: string): Promise<unknown>;
  del(key: string): Promise<boolean>;
  list(pattern?: string): Promise<string[]>;
}

interface PuterSDK {
  auth: PuterAuth;
  ai: PuterAI;
  kv: PuterKV;
}

declare global {
  interface Window {
    puter?: PuterSDK;
  }
}

function getSDK(): PuterSDK | undefined {
  if (typeof window !== "undefined") return window.puter;
  return undefined;
}

/**
 * Documented way to check sign-in state: `puter.auth.isSignedIn()`
 * returns a synchronous boolean. No exceptions thrown.
 */
export function checkAuthStatus(): boolean {
  try {
    const sdk = getSDK();
    if (sdk?.auth && typeof sdk.auth.isSignedIn === "function") {
      return sdk.auth.isSignedIn() === true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Resolves to the signed-in user, or null when signed out / unavailable. */
export async function getCurrentUser(): Promise<PuterUser | null> {
  try {
    const sdk = getSDK();
    if (!sdk?.auth) return null;
    const user = await sdk.auth.getUser();
    if (user && typeof user.username === "string") return user;
    return null;
  } catch {
    return null;
  }
}

/** Opens the Puter sign-in popup. Must be called from a user gesture. */
export async function signIn(): Promise<PuterSignInResult> {
  const sdk = getSDK();
  if (!sdk?.auth?.signIn) throw new Error("Puter auth not available");
  return sdk.auth.signIn();
}

/** Signs out. Per docs this returns nothing (fire-and-forget). */
export function signOut(): void {
  try {
    getSDK()?.auth?.signOut();
  } catch (error) {
    console.error("Sign out failed:", error);
  }
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
  /** Image src (URL or data URI) for generated-image assistant messages. */
  image?: string;
}
