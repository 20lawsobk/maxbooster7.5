import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const tokenStore = {
  get: (id: string) => localStorage.getItem(`pdim_token_${id}`),
  set: (id: string, token: string) =>
    localStorage.setItem(`pdim_token_${id}`, token),
  clear: (id: string) => localStorage.removeItem(`pdim_token_${id}`),
};

export function parseCommand(cmdString: string): {
  cmd: string;
  args: string[];
} {
  // Supports double-quoted and single-quoted arguments with spaces,
  // as well as unquoted tokens. E.g.: SET "my key" 'hello world'
  const parts = cmdString.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  if (parts.length === 0) return { cmd: "", args: [] };

  const cmd = parts[0]!.toUpperCase();
  const args = parts
    .slice(1)
    .map((p) => p.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"));
  return { cmd, args };
}

/** Format bytes into a human-readable string (KB, MB, GB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format seconds into a human-readable duration string. */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
