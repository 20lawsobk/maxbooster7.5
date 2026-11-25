/** Public launch requires an explicit opt-in; malformed flags fail closed. */
export function isAdminOnlyMode(env = process.env) {
  const privateMode = env.MAXBOOSTER_ADMIN_ONLY_MODE?.trim().toLowerCase();
  const publicLaunch = env.MAXBOOSTER_PUBLIC_LAUNCH_ENABLED?.trim().toLowerCase();
  if (privateMode === "true") return true;
  if (privateMode !== undefined && privateMode !== "false") return true;
  return publicLaunch !== "true";
}

/** Display policy only. The server remains the authorization authority. */
export function shouldBlockNonAdminApp(user, adminOnlyMode) {
  return Boolean(user && user.role !== "admin" && adminOnlyMode !== false);
}
