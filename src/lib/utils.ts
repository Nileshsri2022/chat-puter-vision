import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Puter File Upload Utilities

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

/**
 * Upload files to Puter filesystem
 * @param items - Array of File objects, FileList, or InputFileList to upload
 * @param dirPath - Optional directory path to upload to (defaults to app root)
 * @param options - Optional configuration object
 * @returns Promise resolving to FSItem or array of FSItems
 */
export async function uploadFilesToPuter(
  items: File[] | FileList | any,
  dirPath?: string,
  options?: {
    overwrite?: boolean;
    createDir?: boolean;
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
  }
): Promise<any | any[]> {
  try {
    if (typeof window === 'undefined' || !window.puter?.fs?.upload) {
      throw new Error('Puter SDK not available. Make sure to include <script src="https://js.puter.com/v2/"></script> in your HTML');
    }

    console.log('🚀 Starting file upload to Puter...');
    console.log('📁 Items to upload:', items.length || items.size || 'unknown');
    console.log('📂 Target directory:', dirPath || 'app root');

    // Convert FileList/InputFileList to Array if needed
    let filesArray: File[];
    if (items instanceof FileList || (items && typeof items === 'object' && 'length' in items)) {
      filesArray = Array.from(items as any);
    } else if (Array.isArray(items)) {
      filesArray = items;
    } else {
      throw new Error('Invalid items parameter. Expected File[], FileList, or InputFileList');
    }

    if (filesArray.length === 0) {
      throw new Error('No files to upload');
    }

    // Log file details
    filesArray.forEach((file, index) => {
      console.log(`📄 File ${index + 1}: ${file.name} (${file.size} bytes, ${file.type})`);
    });

    // Upload files
    const result = await window.puter.fs.upload(filesArray, dirPath, options);

    // Handle single file vs multiple files response
    if (filesArray.length === 1) {
      console.log('✅ Single file uploaded successfully!');
      console.log('🔗 File URL:', result.path || result.url || 'N/A');
      console.log('📄 File details:', {
        name: result.name,
        path: result.path,
        size: result.size,
        type: result.type,
        id: result.id
      });
      return result;
    } else {
      console.log(`✅ ${filesArray.length} files uploaded successfully!`);
      result.forEach((file: any, index: number) => {
        console.log(`🔗 File ${index + 1} URL:`, file.path || file.url || 'N/A');
      });
      return result;
    }

  } catch (error: any) {
    console.error('❌ File upload failed:', error);
    throw new Error(`Upload failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Upload a single file to Puter filesystem
 * @param file - File object to upload
 * @param dirPath - Optional directory path to upload to
 * @param options - Optional configuration object
 * @returns Promise resolving to FSItem
 */
export async function uploadFileToPuter(
  file: File,
  dirPath?: string,
  options?: {
    overwrite?: boolean;
    createDir?: boolean;
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
  }
): Promise<any> {
  return uploadFilesToPuter([file], dirPath, options);
}

/**
 * Get public URL for a Puter file
 * @param filePath - Path to the file in Puter filesystem
 * @returns Public URL string
 */
export function getPuterFileUrl(filePath: string): string {
  if (typeof window === 'undefined' || !window.puter) {
    throw new Error('Puter SDK not available');
  }

  // Puter files are accessible via their path
  return `https://puter.com/api/files/${filePath}`;
}
