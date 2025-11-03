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


// Grok function calling utilities
export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export async function callGrokWithTools(
  userPrompt: string,
  tools: Tool[],
  availableFunctions: Record<string, Function>,
  onChunk: (text: string) => void,
  onComplete: (fullContent: string) => void,
  onError: (error: Error) => void,
  model: string = "x-ai/grok-4"
) {
  try {
    console.log('Calling Grok with tools:', tools.map(t => t.function.name));

    // First, send the query to Grok with available tools
    const completion = await puter.ai.chat(userPrompt, {
      model: model,
      tools: tools
    });

    console.log('Initial Grok response:', completion);

    let finalResponse = completion;

    // Check if Grok wants to call any functions
    if (completion.message?.tool_calls && completion.message.tool_calls.length > 0) {
      const messages = [
        { role: "user", content: userPrompt },
        completion.message
      ];

      // Execute each function call
      for (const toolCall of completion.message.tool_calls) {
        console.log('Executing tool call:', toolCall.function.name);

        try {
          const args = JSON.parse(toolCall.function.arguments);
          const functionResult = await availableFunctions[toolCall.function.name](args);

          // Add the function result to the conversation
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(functionResult)
          });
        } catch (error) {
          console.error('Error executing function:', toolCall.function.name, error);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: error.message })
          });
        }
      }

      // Get Grok's final response with the function results
      finalResponse = await puter.ai.chat(messages, {
        model: model
      });

      console.log('Final Grok response after tool calls:', finalResponse);
    }

    // Handle the response format
    let responseText = '';
    if (finalResponse?.message?.content?.[0]?.text) {
      responseText = finalResponse.message.content[0].text;
    } else if (finalResponse?.text) {
      responseText = finalResponse.text;
    } else if (typeof finalResponse === 'string') {
      responseText = finalResponse;
    } else {
      responseText = 'Received response but couldn\'t parse it. Check console for details.';
    }

    onComplete(responseText);

  } catch (error: any) {
    console.error('Error in Grok function calling:', error);
    onError(error instanceof Error ? error : new Error(`Grok function calling failed: ${error?.message || 'Unknown error'}`));
  }
}

export async function streamClaudeResponse(
  userPrompt: string,
  onChunk: (text: string) => void,
  onComplete: (fullContent: string) => void,
  onError: (error: Error) => void,
  model: string,
  images?: File[],
  tools?: any[]
) {
    let fullContent = "";

    try {

      // Handle image analysis for Perplexity models
      if (images && images.length > 0 && model.startsWith("perplexity")) {
        try {
          const imageUrl = URL.createObjectURL(images[0]);
          const response = await puter.ai.chat(userPrompt, imageUrl, { model });

          let responseText = '';
          if (typeof response === 'string') {
            responseText = response;
          } else if (response?.text) {
            responseText = response.text;
          } else if (response?.message?.content?.[0]?.text) {
            responseText = response.message.content[0].text;
          } else if (response?.content?.[0]?.text) {
            responseText = response.content[0].text;
          } else if (response?.message?.content) {
            responseText = response.message.content;
          } else {
            responseText = 'Image analysis completed, but response format was different than expected.';
          }

          // Simulate streaming for image analysis
          const words = responseText.split(' ');
          let currentIndex = 0;

          const streamInterval = setInterval(() => {
            if (currentIndex < words.length) {
              const chunk = words.slice(currentIndex, currentIndex + 3).join(' ') + ' ';
              onChunk(chunk);
              currentIndex += 3;
            } else {
              clearInterval(streamInterval);
              onComplete(responseText);
            }
          }, 50);

          return;
        } catch (imageError) {
          throw imageError;
        }
      }

      // Handle Perplexity text chat - simulate streaming
      if (model.startsWith("perplexity")) {
        try {
          const response = await puter.ai.chat(userPrompt, { model });

          let responseText = '';
          if (typeof response === 'string') {
            responseText = response;
          } else if (response?.text) {
            responseText = response.text;
          } else if (response?.message?.content?.[0]?.text) {
            responseText = response.message.content[0].text;
          } else if (response?.content?.[0]?.text) {
            responseText = response.content[0].text;
          } else if (response?.message?.content) {
            responseText = response.message.content;
          } else {
            responseText = 'Response received but format was different than expected.';
          }

          // Simulate streaming by breaking response into chunks
          const words = responseText.split(' ');
          let currentIndex = 0;

          const streamInterval = setInterval(() => {
            if (currentIndex < words.length) {
              const chunk = words.slice(currentIndex, currentIndex + 3).join(' ') + ' ';
              onChunk(chunk);
              currentIndex += 3;
            } else {
              clearInterval(streamInterval);
              onComplete(responseText);
            }
          }, 50); // Stream chunks every 50ms

          return;
        } catch (perplexityError) {
          throw perplexityError;
        }
      }

      // Handle OpenRouter models
      if (model.startsWith("openrouter:")) {
        try {
          const streamingResponse = await puter.ai.chat(userPrompt, {
            model: model,
            stream: true,
          });

          if (streamingResponse && typeof streamingResponse[Symbol.asyncIterator] === 'function') {
            let fullContent = '';
            for await (const part of streamingResponse) {
              let textContent = null;
              if (part?.text) {
                textContent = part.text;
              } else if (part?.message?.content?.[0]?.text) {
                textContent = part.message.content[0].text;
              } else if (typeof part === 'string') {
                textContent = part;
              }

              if (textContent) {
                fullContent += textContent;
                onChunk(textContent);
              }
            }
            onComplete(fullContent);
            return;
          }
        } catch (streamingError) {
          // Fallback to non-streaming
        }

        try {
          const response = await puter.ai.chat(userPrompt, { model });

          let responseText = '';
          if (typeof response === 'string') {
            responseText = response;
          } else if (response?.text) {
            responseText = response.text;
          } else if (response?.message?.content?.[0]?.text) {
            responseText = response.message.content[0].text;
          } else if (response?.content?.[0]?.text) {
            responseText = response.content[0].text;
          } else if (response?.message?.content) {
            responseText = response.message.content;
          } else if (response?.choices?.[0]?.message?.content) {
            responseText = response.choices[0].message.content;
          } else if (response?.choices?.[0]?.text) {
            responseText = response.choices[0].text;
          } else {
            responseText = 'Response received but format was different than expected.';
          }

          // Simulate streaming for OpenRouter non-streaming responses
          const words = responseText.split(' ');
          let currentIndex = 0;

          const streamInterval = setInterval(() => {
            if (currentIndex < words.length) {
              const chunk = words.slice(currentIndex, currentIndex + 3).join(' ') + ' ';
              onChunk(chunk);
              currentIndex += 3;
            } else {
              clearInterval(streamInterval);
              onComplete(responseText);
            }
          }, 50);

          return;
        } catch (openRouterError) {
          throw openRouterError;
        }
      }

      // Regular text chat (streaming for other models)
      const requestOptions: any = {
        model: model,
        stream: true,
      };

      // Add tools for Grok models if provided
      if (tools && tools.length > 0 && model.startsWith("x-ai")) {
        requestOptions.tools = tools;
      }

      const response = await puter.ai.chat(userPrompt, requestOptions);

      for await (const part of response) {
        let textContent = null;
        if (part?.text) {
          textContent = part.text;
        } else if (part?.message?.content?.[0]?.text) {
          textContent = part.message.content[0].text;
        } else if (typeof part === 'string') {
          textContent = part;
        }

        if (textContent) {
          fullContent += textContent;
          onChunk(textContent);
        }
      }

      onComplete(fullContent);
    } catch (error: any) {
      // Try non-streaming fallback
      try {
        const fallbackResponse = await puter.ai.chat(userPrompt, { model });

        let responseText = '';
        if (fallbackResponse?.message?.content?.[0]?.text) {
          responseText = fallbackResponse.message.content[0].text;
        } else if (fallbackResponse?.text) {
          responseText = fallbackResponse.text;
        } else if (typeof fallbackResponse === 'string') {
          responseText = fallbackResponse;
        } else {
          responseText = 'Received response but couldn\'t parse it.';
        }

        // Simulate streaming for fallback responses
        const words = responseText.split(' ');
        let currentIndex = 0;

        const streamInterval = setInterval(() => {
          if (currentIndex < words.length) {
            const chunk = words.slice(currentIndex, currentIndex + 3).join(' ') + ' ';
            onChunk(chunk);
            currentIndex += 3;
          } else {
            clearInterval(streamInterval);
            onComplete(responseText);
          }
        }, 50);

        return;
      } catch (fallbackError: any) {
        // Handle specific error types
        if (error?.message?.includes("Authentication") ||
            error?.message?.includes("authorization") ||
            error?.message?.includes("Not authenticated")) {
          onError(new Error("Authentication required. Please sign in to Puter."));
        } else if (error?.message?.includes("popup") ||
                   error?.message?.includes("blocked")) {
          onError(new Error("Popup blocked. Please allow popups for this site."));
        } else if (error?.message?.includes("network") ||
                   error?.message?.includes("fetch")) {
          onError(new Error("Network error. Please check your connection."));
        } else {
          onError(error instanceof Error ? error : new Error(`Request failed: ${error?.message || 'Unknown error'}`));
        }
      }
    }
}
