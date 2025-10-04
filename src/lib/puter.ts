// Initialize Puter SDK
// @ts-ignore - Puter SDK types
const puter = window.puter;

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function streamClaudeResponse(
  messages: Message[],
  onChunk: (text: string) => void,
  onComplete: (fullContent: string) => void,
  onError: (error: Error) => void
) {
  let fullContent = "";
  
  try {
    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    
    const response = await puter.ai.chat(lastMessage.content, {
      model: "claude-3-7-sonnet",
      stream: true,
    });

    for await (const part of response) {
      if (part?.text) {
        fullContent += part.text;
        onChunk(part.text);
      }
    }

    onComplete(fullContent);
  } catch (error) {
    console.error("Error streaming from Puter:", error);
    onError(error instanceof Error ? error : new Error("Unknown error"));
  }
}
