import { Conversation } from '@/pages/Index';

const STORAGE_KEY = 'chat-puter-vision-conversations';
const CURRENT_CONVERSATION_KEY = 'chat-puter-vision-current-id';

/**
 * Save conversations to localStorage
 */
export function saveConversations(conversations: Conversation[]): void {
    try {
        const data = JSON.stringify(conversations, (key, value) => {
            // Convert Date objects to ISO strings
            if (value instanceof Date) {
                return value.toISOString();
            }
            return value;
        });
        localStorage.setItem(STORAGE_KEY, data);
    } catch (error) {
        console.error('Failed to save conversations:', error);
        // Handle quota exceeded error
        if (error instanceof Error && error.name === 'QuotaExceededError') {
            console.warn('localStorage quota exceeded. Clearing old conversations...');
            // Keep only the last 10 conversations
            try {
                const limited = conversations.slice(-10);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
            } catch (e) {
                console.error('Failed to save even limited conversations:', e);
            }
        }
    }
}

/**
 * Load conversations from localStorage
 */
export function loadConversations(): Conversation[] {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];

        const parsed = JSON.parse(data);
        // Convert ISO strings back to Date objects
        return parsed.map((conv: Conversation) => ({
            ...conv,
            timestamp: new Date(conv.timestamp)
        }));
    } catch (error) {
        console.error('Failed to load conversations:', error);
        return [];
    }
}

/**
 * Save current conversation ID
 */
export function saveCurrentConversationId(id: string): void {
    try {
        localStorage.setItem(CURRENT_CONVERSATION_KEY, id);
    } catch (error) {
        console.error('Failed to save current conversation ID:', error);
    }
}

/**
 * Load current conversation ID
 */
export function loadCurrentConversationId(): string | null {
    try {
        return localStorage.getItem(CURRENT_CONVERSATION_KEY);
    } catch (error) {
        console.error('Failed to load current conversation ID:', error);
        return null;
    }
}

/**
 * Clear all stored conversations
 */
export function clearConversations(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(CURRENT_CONVERSATION_KEY);
    } catch (error) {
        console.error('Failed to clear conversations:', error);
    }
}
