import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper conflict resolution.
 * Replaces the existing `classNames` helper, use `cn` for all new code.
 * Existing `classNames` calls remain untouched for backward compatibility.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
