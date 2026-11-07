export function isAdminOnlyMode(env?: {
  MAXBOOSTER_ADMIN_ONLY_MODE?: string;
  MAXBOOSTER_PUBLIC_LAUNCH_ENABLED?: string;
}): boolean;
export function shouldBlockNonAdminApp(
  user: { role: string } | null | undefined,
  adminOnlyMode: boolean | null,
): boolean;
