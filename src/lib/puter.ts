// Initialize Puter SDK
// @ts-ignore - Puter SDK types
const puter = window.puter;

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Type declaration for Puter SDK
declare global {
  interface Window {
    puter: any;
  }
}

// Initialize Puter when the module loads
if (typeof window !== 'undefined' && !window.puter) {
  console.warn('Puter SDK not loaded. Make sure to include <script src="https://js.puter.com/v2/"></script> in your HTML');
}

export async function streamClaudeResponse(
  userPrompt: string,
  onChunk: (text: string) => void,
  onComplete: (fullContent: string) => void,
  onError: (error: Error) => void
) {
  let fullContent = "";
  
  try {
    // Use the user's actual prompt with Claude Sonnet 4
    const response = await puter.ai.chat(userPrompt, {
      model: "claude-sonnet-4",
      stream: true,
    });

    for await (const part of response) {
      if (part?.text) {
        fullContent += part.text;
        onChunk(part.text);
      }
    }

    onComplete(fullContent);
  } catch (error: any) {
    console.error("Error streaming from Puter:", error);
    
    // Check for permission error
    if (error?.error?.code === "error_400_from_delegate" || 
        error?.error?.message?.includes("Permission denied")) {
      onError(new Error("Please authorize this app to use Puter AI. Click 'Allow' when prompted."));
    } else {
      onError(error instanceof Error ? error : new Error("Failed to connect to Claude AI"));
    }
  }
}
