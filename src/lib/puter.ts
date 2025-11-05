// Initialize Puter SDK
// @ts-ignore - Puter SDK types
const puter = window.puter;

export interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string; // Add model property
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

// Authentication state
let isAuthenticated = false;
let currentUser: any = null;

// Check if user is authenticated
export function checkAuthStatus(): boolean {
  try {
    if (typeof window !== 'undefined' && window.puter?.auth) {
      if (window.puter.auth.getUser) {
        try {
          const user = window.puter.auth.getUser();
          if (user && user.email && user.name && typeof user.email === 'string') {
            isAuthenticated = true;
            currentUser = user;
            return true;
          }
        } catch (e) {
          console.log('getUser() error:', e);
        }
      }

      if (window.puter.auth.currentUser) {
        const user = window.puter.auth.currentUser;
        if (user && user.email && user.name && typeof user.email === 'string') {
          isAuthenticated = true;
          currentUser = user;
          return true;
        }
      }
    }

    isAuthenticated = false;
    currentUser = null;
    return false;
  } catch (error) {
    isAuthenticated = false;
    currentUser = null;
    return false;
  }
}

// Sign in function
export async function signIn(): Promise<any> {
  try {
    if (typeof window !== 'undefined' && window.puter?.auth?.signIn) {
      const result = await window.puter.auth.signIn();
      if (result) {
        isAuthenticated = true;
        currentUser = result;
      }
      return result;
    }
    throw new Error('Puter auth not available');
  } catch (error) {
    console.error('Sign in failed:', error);
    isAuthenticated = false;
    currentUser = null;
    throw error;
  }
}

// Get current user
export function getCurrentUser(): any {
  return currentUser;
}

// Sign out function
export async function signOut(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.puter?.auth?.signOut) {
      await window.puter.auth.signOut();
    }
    isAuthenticated = false;
    currentUser = null;
    // Clear local storage auth token as well
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('puter_auth_token');
    }
  } catch (error) {
    console.error('Sign out failed:', error);
  }
}

// Force reset authentication state
export function resetAuthState(): void {
  isAuthenticated = false;
  currentUser = null;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('puter_auth_token');
  }
}


// AI Model Functions

// Groq streaming response
export async function streamGroqResponse(
  prompt: string,
  onChunk: (text: string) => void,
  onComplete: (fullContent: string) => void,
  onError: (error: Error) => void,
  model: string = 'x-ai/grok-4'
): Promise<void> {
  try {
    const response = await puter.ai.chat(prompt, {
      model: model,
      stream: true
    });

    let fullContent = '';
    for await (const part of response) {
      if (part?.text) {
        fullContent += part.text;
        onChunk(part.text);
      }
    }
    onComplete(fullContent);
  } catch (error: any) {
    onError(error instanceof Error ? error : new Error(`Groq streaming failed: ${error?.message || 'Unknown error'}`));
  }
}

// Claude streaming response
export async function streamClaudeResponse(
  prompt: string,
  onChunk: (text: string) => void,
  onComplete: (fullContent: string) => void,
  onError: (error: Error) => void,
  model: string = 'openrouter:anthropic/claude-sonnet-4'
): Promise<void> {
  try {
    const response = await puter.ai.chat(prompt, {
      model: model,
      stream: true
    });

    let fullContent = '';
    for await (const part of response) {
      if (part?.text) {
        fullContent += part.text;
        onChunk(part.text);
      }
    }
    onComplete(fullContent);
  } catch (error: any) {
    onError(error instanceof Error ? error : new Error(`Claude streaming failed: ${error?.message || 'Unknown error'}`));
  }
}

// Mistral streaming response
export async function streamMistralResponse(
  prompt: string,
  onChunk: (text: string) => void,
  onComplete: (fullContent: string) => void,
  onError: (error: Error) => void,
  model: string = 'mistralai/mistral-large'
): Promise<void> {
  try {
    const response = await puter.ai.chat(prompt, {
      model: model,
      stream: true
    });

    let fullContent = '';
    for await (const part of response) {
      if (part?.text) {
        fullContent += part.text;
        onChunk(part.text);
      }
    }
    onComplete(fullContent);
  } catch (error: any) {
    onError(error instanceof Error ? error : new Error(`Mistral streaming failed: ${error?.message || 'Unknown error'}`));
  }
}

// Perplexity streaming research
export async function streamPerplexityResearch(
  prompt: string,
  onChunk: (text: string) => void,
  onComplete: (fullContent: string) => void,
  onError: (error: Error) => void,
  model: string = 'perplexity/sonar-deep-research'
): Promise<void> {
  try {
    const response = await puter.ai.chat(prompt, {
      stream: true,
      model: model
    });

    let fullContent = '';
    for await (const part of response) {
      if (part?.text) {
        fullContent += part.text;
        onChunk(part.text);
      }
    }
    onComplete(fullContent);
  } catch (error: any) {
    onError(error instanceof Error ? error : new Error(`Perplexity streaming failed: ${error?.message || 'Unknown error'}`));
  }
}

// OpenRouter streaming response
export async function streamOpenRouterResponse(
  prompt: string,
  onChunk: (text: string) => void,
  onComplete: (fullContent: string) => void,
  onError: (error: Error) => void,
  model: string = 'openrouter:anthropic/claude-sonnet-4'
): Promise<void> {
  try {
    const response = await puter.ai.chat(prompt, {
      model: model,
      stream: true
    });

    let fullContent = '';
    for await (const part of response) {
      if (part?.text) {
        fullContent += part.text;
        onChunk(part.text);
      }
    }
    onComplete(fullContent);
  } catch (error: any) {
    onError(error instanceof Error ? error : new Error(`OpenRouter streaming failed: ${error?.message || 'Unknown error'}`));
  }
}

