// Unified streaming chat via puter.ai.chat.
//
// Wire format follows the documented API (https://docs.puter.com/AI/chat/,
// read 2026-10-13) and the SDK's own normalization (verified in the
// js.puter.com/v2 bundle):
// - Multi-turn: `chat(messages, false, options)` with {role, content} objects.
// - Images: content blocks `{ type: "image_url", image_url: { url } }` where
//   url is the SDK's base64 marker form "b<base64>" (exactly what the SDK
//   produces internally for a File media arg).
// - Stream chunks: `{ type: "text", text }`; `{ type: "error", message, code }`
//   ends the stream. Network failure mid-stream throws
//   `{ code: "network_error" }`; 15 min idle throws `{ code: "request_timeout" }`.

import type {
  BackendChatMessage,
  ContentBlock,
  Message,
  StreamPart,
} from "./backend";

export interface StreamCallbacks {
  /** Called per text chunk with the new delta; the consumer appends it. */
  onChunk: (text: string) => void;
  onComplete: (fullContent: string) => void;
  onError: (error: Error) => void;
  /** Called when the caller aborts via `signal`; receives streamed-so-far text. */
  onAbort?: (partialContent: string) => void;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/** Keep history bounded so long conversations don't blow the context window. */
const MAX_HISTORY_MESSAGES = 20;

/** Stand-in text for an assistant turn that only holds a generated image. */
export const IMAGE_HISTORY_PLACEHOLDER = "[Generated an image for this prompt.]";

/**
 * Turn the transcript into chat history the model can accept.
 *
 * Generated-image replies are stored with `content: ""` and the picture in
 * `image`. Sending that empty string back as history makes strict providers
 * reject every later request, so those turns become a short text placeholder
 * instead. Any other message with no text is dropped for the same reason.
 */
export function toHistory(messages: Message[]): HistoryMessage[] {
  const history: HistoryMessage[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (m.content.trim()) {
      history.push({ role: m.role, content: m.content });
    } else if (m.role === "assistant" && m.image) {
      history.push({ role: "assistant", content: IMAGE_HISTORY_PLACEHOLDER });
    }
  }
  return history;
}

/** Convert raw base64 (no data: prefix) to the SDK's image wire form. */
function toImageBlock(base64: string): ContentBlock {
  return { type: "image_url", image_url: { url: `b${base64}` } };
}

function buildMessages(
  history: HistoryMessage[],
  prompt: string,
  imageBase64s?: string[]
): BackendChatMessage[] {
  const messages: BackendChatMessage[] = history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));

  if (imageBase64s && imageBase64s.length > 0) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...imageBase64s.map(toImageBlock),
      ],
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }
  return messages;
}

function friendlyError(error: unknown): Error {
  const code =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? String((error as { message?: unknown }).message ?? "Unknown error")
        : "Unknown error";
  if (code === "network_error")
    return new Error("Connection lost mid-response. Please try again.");
  if (code === "request_timeout")
    return new Error("The request timed out. Please try again.");
  if (code === "too_many_requests" || code === "429")
    return new Error("Rate limit reached. Please wait a moment and retry.");
  if (code === "insufficient_funds")
    return new Error("Monthly credit exhausted.");
  return new Error(message || "AI request failed.");
}

export interface SplitThinking {
  /** Combined text of all <think> blocks (reasoning), without the tags. */
  thinking: string;
  /** Message text with all <think> blocks removed. */
  answer: string;
  /** A trailing <think> block hasn't closed yet (still streaming). */
  thinkingOpen: boolean;
}

/**
 * Reasoning models (e.g. DeepSeek R1) emit their chain-of-thought as plain
 * text wrapped in <think>...</think>. Split it out so the UI can render it
 * as a collapsible "Thought for N seconds" section like DeepSeek's own app.
 */
export function splitThinkBlocks(text: string): SplitThinking {
  const parts: string[] = [];
  let thinkingOpen = false;
  const answer = text.replace(
    /<think>([\s\S]*?)(?:<\/think>|$)/g,
    (match, inner: string) => {
      parts.push(inner);
      if (!match.endsWith("</think>")) thinkingOpen = true;
      return "";
    }
  );
  return { thinking: parts.join("\n\n").trim(), answer, thinkingOpen };
}

/** Remove all <think> blocks (complete or trailing) from the text. */
export function stripThinkBlocks(text: string): string {
  return splitThinkBlocks(text).answer;
}

/**
 * Stream a chat completion with conversation history.
 *
 * @param history  prior messages (text only; images are sent with the current turn)
 * @param prompt   the current user message
 * @param model    model ID (must resolve via puter.ai.listModels())
 * @param imageBase64s raw base64 image payloads (no data: prefix), up to a few
 * @param signal   abort signal — checked per chunk; on abort the stream stops
 *                 and `onAbort` fires with the partial content (the SDK's
 *                 stream itself isn't cancellable, so we just stop consuming)
 */
export async function streamAIResponse(
  history: HistoryMessage[],
  prompt: string,
  model: string,
  callbacks: StreamCallbacks,
  imageBase64s?: string[],
  signal?: AbortSignal
): Promise<void> {
  const { onChunk, onComplete, onError, onAbort } = callbacks;

  try {
    const puter = window.puter;
    if (!puter?.ai?.chat) throw new Error("AI is not available");

    const messages = buildMessages(history, prompt, imageBase64s);
    // NOTE: testMode (2nd arg) must be passed explicitly; otherwise the
    // options object would bind to the testMode parameter.
    const response = (await puter.ai.chat(messages, false, {
      model,
      stream: true,
    })) as AsyncIterable<StreamPart>;

    let fullContent = "";
    for await (const part of response) {
      if (signal?.aborted) {
        onAbort?.(fullContent);
        return;
      }
      if (!part) continue;
      if (part.type === "error") {
        throw { message: part.message || "AI request failed", code: part.code };
      }
      if (part.type === "text" && typeof part.text === "string" && part.text) {
        fullContent += part.text;
        onChunk(part.text);
      }
      // Other chunk types (reasoning, usage, etc.) are intentionally ignored.
    }

    onComplete(fullContent);
  } catch (error) {
    console.error("AI streaming error:", error);
    onError(friendlyError(error));
  }
}
