/**
 * Convert unsupported image formats (AVIF, HEIC, HEIF) to PNG
 * using the Canvas API for browser compatibility
 */
export async function convertImageToPNG(file: File): Promise<File> {
    const unsupportedFormats = ['image/avif', 'image/heic', 'image/heif'];

    // Return as-is if already supported
    if (!unsupportedFormats.includes(file.type.toLowerCase())) {
        return file;
    }

    try {
        // Create image bitmap from file
        const img = await createImageBitmap(file);

        // Create canvas with same dimensions
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image to canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get canvas context');
        }
        ctx.drawImage(img, 0, 0);

        // Convert canvas to PNG blob
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Failed to convert image to PNG'));
                    return;
                }

                // Create new File object with PNG type
                const newFileName = file.name.replace(/\.\w+$/, '.png');
                const newFile = new File([blob], newFileName, {
                    type: 'image/png',
                    lastModified: Date.now()
                });

                resolve(newFile);
            }, 'image/png', 0.95); // 95% quality
        });
    } catch (error) {
        console.error('Image conversion failed:', error);
        throw new Error(`Failed to convert ${file.type} to PNG: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Convert multiple images to PNG format
 */
export async function convertImagesToPNG(files: File[]): Promise<File[]> {
    const conversionPromises = files.map(file => convertImageToPNG(file));
    return Promise.all(conversionPromises);
}

/**
 * Check if image format is supported by the backend
 */
export function isSupportedImageFormat(type: string): boolean {
    const supported = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    return supported.includes(type.toLowerCase());
}

/**
 * Check if image format needs conversion
 */
export function needsConversion(type: string): boolean {
    const unsupported = ['image/avif', 'image/heic', 'image/heif'];
    return unsupported.includes(type.toLowerCase());
}
