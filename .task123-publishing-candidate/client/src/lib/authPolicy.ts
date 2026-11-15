export function isPublicRegistrationEnabled(policy: unknown): boolean {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return false;
  }

  const value = policy as Record<string, unknown>;
  return value.adminOnlyMode === false && value.registrationEnabled === true;
}
