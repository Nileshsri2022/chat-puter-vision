import { Conversation } from "@/pages/Index";
import { stripThinkBlocks } from "../streamingHandler";

/**
 * Export conversation as Markdown format
 */
export function exportAsMarkdown(conversation: Conversation): string {
    const header = `# ${conversation.title}\n\n`;
    const timestamp = `*Created: ${conversation.timestamp.toLocaleString()}*\n\n---\n\n`;

    const messages = conversation.messages
        .map(msg => {
            const role = msg.role === 'user' ? '**You**' : '**AI**';
            const model = msg.model ? ` (${msg.model})` : '';
            return `${role}${model}:\n\n${stripThinkBlocks(msg.content)}\n`;
        })
        .join('\n---\n\n');

    return header + timestamp + messages;
}

/**
 * Export conversation as JSON format
 */
export function exportAsJSON(conversation: Conversation): string {
    return JSON.stringify(conversation, null, 2);
}

/**
 * Download file to user's computer
 */
export function downloadFile(filename: string, content: string, mimeType: string = 'text/plain'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Download an existing Blob (a stored image, say) without re-encoding it.
 * `downloadFile` keeps its string signature so its callers are untouched.
 */
export function downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** Turn a `data:` URL back into a Blob; resolves null when it cannot. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
    try {
        const response = await fetch(dataUrl);
        return await response.blob();
    } catch {
        return null;
    }
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
    }
}
