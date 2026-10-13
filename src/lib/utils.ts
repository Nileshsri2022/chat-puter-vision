import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Puter File Upload Utilities - DEPRECATED
// We now use Base64 encoding for image uploads directly in the browser.
// Keeping this file for potential future utility functions.
