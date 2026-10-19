// Typed wrapper around the cloud backend SDK (loaded from the vendor CDN).
//
// The SDK exposes itself as `window.puter`. Shapes below follow
// the vendor API docs (Auth + AI/chat sections, read 2026-10-13).
// NOTE: `puter.auth.currentUser` is intentionally absent — it is not a
// documented API. The documented sign-in check is `isSignedIn()`.

/**
 * The user object `getUser()` resolves to. Only `uuid` and `username` are
 * guaranteed; the rest are the optional fields the docs list for `User`
 * (https://docs.puter.com/Objects/user) and arrive only when the backend
 * chooses to include them.
 */
export interface BackendUser {
  uuid: string;
  username: string;
  email?: string;
  requires_email_confirmation?: boolean;
  is_temp?: boolean;
  /** Documented on `User`: whether the email address has been confirmed. */
  email_confirmed?: boolean;
  /** Documented on `User`: account creation, in seconds since the epoch. */
  created_ts?: number;
  /** Documented on `User`: whether the account is on a paid plan. */
  subscribed?: boolean;
}

export interface SignInResult {
  success: boolean;
  token?: string;
  username?: string;
  error?: string;
  msg?: string;
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ImageBlock {
  type: "image_url";
  image_url: { url: string };
}

/**
 * Summary the model returns when compaction fires
 * (https://docs.puter.com/AI/chat/#compaction). Carried back unchanged as the
 * first block of the assistant turn that produced it.
 */
export interface CompactionItem {
  type: "compaction";
  id: string;
  encrypted_content: string;
  [key: string]: unknown;
}

export type ContentBlock = TextBlock | ImageBlock | CompactionItem;

export interface BackendChatMessage {
  role: ChatRole;
  content: string | ContentBlock[];
}

export interface ChatOptions {
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Enables server-side summarization of long conversations. */
  compaction?: boolean | { trigger_tokens: number };
}

export interface StreamPart {
  type?: string;
  text?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export interface ModelInfo {
  id: string;
  puterId?: string;
  /** Documented: listModels() objects always contain `id` and `provider`. */
  provider?: string;
  name?: string;
  aliases?: string[];
  /** Context window and maximum output, in tokens (listModels docs). */
  context?: number;
  max_tokens?: number;
  modalities?: { input?: string[]; output?: string[] };
  [key: string]: unknown;
}

interface BackendAuth {
  signIn(options?: { attempt_temp_user_creation?: boolean; request_auth?: boolean }): Promise<SignInResult>;
  signOut(): void;
  /** Documented synchronous sign-in check. */
  isSignedIn(): boolean;
  /** Returns a Promise resolving to the User object (or rejects when signed out). */
  getUser(): Promise<BackendUser>;
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

interface BackendAI {
  chat(prompt: string, options?: ChatOptions): Promise<unknown>;
  chat(prompt: string, media: string | File | Array<string | File>, testMode: boolean, options?: ChatOptions): Promise<unknown>;
  chat(messages: BackendChatMessage[], testMode: boolean, options?: ChatOptions): Promise<unknown>;
  listModels(provider?: string | null): Promise<ModelInfo[]>;
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

/**
 * https://docs.puter.com/FS/write/ — resolves to the FSItem of the written file.
 * Relative paths resolve against the app's own Drive folder.
 */
export interface FSItem {
  name?: string;
  path?: string;
  [key: string]: unknown;
}

export interface FSWriteOptions {
  overwrite?: boolean;
  dedupeName?: boolean;
  createMissingParents?: boolean;
}

interface BackendFS {
  write(path: string, data?: string | File | Blob | ArrayBuffer, options?: FSWriteOptions): Promise<FSItem>;
  read(path: string): Promise<Blob>;
  /**
   * Optional because it is only used to reclaim images this app wrote, and a
   * missing delete must degrade to "the file stays" rather than break the
   * delete that triggered it. Feature-detected at the call site.
   */
  delete?(path: string): Promise<unknown>;
}

interface BackendKV {
  set(key: string, value: string, options?: { disableSharing?: boolean }): Promise<boolean>;
  get(key: string): Promise<unknown>;
  del(key: string): Promise<boolean>;
  list(pattern?: string): Promise<string[]>;
}

interface BackendSDK {
  auth: BackendAuth;
  ai: BackendAI;
  kv: BackendKV;
  fs: BackendFS;
}

declare global {
  interface Window {
    puter?: BackendSDK;
  }
}

function getSDK(): BackendSDK | undefined {
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
export async function getCurrentUser(): Promise<BackendUser | null> {
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

/** Opens the sign-in popup. Must be called from a user gesture. */
export async function signIn(): Promise<SignInResult> {
  const sdk = getSDK();
  if (!sdk?.auth?.signIn) throw new Error("Sign-in is not available");
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

/**
 * An image attachment persisted to Puter Drive so it stays referenceable after
 * the send. The message keeps this ~40-byte ref instead of the payload: a
 * normalized attachment targets ~1.2 MB (see lib/attachments.ts) and storing
 * those in localStorage would trip the quota path that drops conversations.
 */
export interface AttachmentRef {
  /** Drive path of the normalized file that was actually sent to the model. */
  path: string;
  /** Original file name, when the browser supplied one. */
  name?: string;
  mimeType?: string;
  /** Decoded size of the normalized file, in bytes. */
  bytes?: number;
}

/**
 * The provenance of an image in a conversation: the user attached it, or the
 * app generated it.
 */
export type ImageOrigin = "attachment" | "generated";

/**
 * The image a generated image was produced from. Recorded on the message
 * that holds the result, so an edit chain is legible instead of a stack of
 * unrelated pictures.
 */
export interface EditedFrom {
  /**
   * The image that was edited: a Drive path, or a self-contained data URI
   * that was sent as-is.
   */
  src: string;
  /** Whether that image was attached by the user or generated by the app. */
  origin: ImageOrigin;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
  /** Legacy: image src (URL or data URI) from before images were saved to Puter. */
  image?: string;
  /** Puter Drive path of a generated image (saved via `puter_output_path`). */
  imagePath?: string;
  /** Attachments persisted to Drive, in the order they were attached. */
  attachments?: AttachmentRef[];
  /**
   * Set when this message's image was produced by editing an earlier image.
   * The base of the *next* edit is still derived from the transcript (see
   * `lib/imageContext.ts`); this records where this one came from.
   */
  editedFrom?: EditedFrom;
  /** Compaction summary for this reply; sent back on later turns of the same model. */
  compaction?: CompactionItem;
}
