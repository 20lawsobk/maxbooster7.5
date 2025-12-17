import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * TODO: Add function documentation
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
