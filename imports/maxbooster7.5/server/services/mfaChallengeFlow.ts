import type { Request } from "express";
export type MfaChallenge = { userId: string; generation: string; expiresAt: number };
export interface ChallengeDependencies {
  getUser(id: string): Promise<{ id: string; twoFactorEnabled?: boolean | null; twoFactorSecret?: string | null } | undefined>;
  authority(): Promise<{ validate(id: string, generation: unknown): Promise<boolean> }>;
  verify(token: string, secret: string, userId: string): Promise<boolean> | boolean;
}

/** No userId is present before proof. Preserve the challenged epoch; never mint
 * a fresh epoch that could resurrect a challenge revoked during verification. */
export async function completeMfaChallenge(req: Request, deps: ChallengeDependencies): Promise<boolean> {
  const pending = (req.session as unknown as { pendingMfa?: MfaChallenge }).pendingMfa;
  if (!pending || pending.expiresAt < Date.now()) return false;
  const authority = await deps.authority();
  if (!await authority.validate(pending.userId, pending.generation)) return false;
  const user = await deps.getUser(pending.userId);
  if (!user?.twoFactorEnabled || !user.twoFactorSecret || !/^\d{6}$/.test(req.body.code ?? "") ||
      !await deps.verify(req.body.code, user.twoFactorSecret, user.id)) return false;
  // Re-check after potentially slow user lookup/TOTP work.
  if (!await authority.validate(pending.userId, pending.generation)) return false;
  await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  Object.assign(req.session, { userId: user.id, authGeneration: pending.generation,
    twoFactorVerified: true, reauthenticatedAt: Date.now(), reauthenticatedUserId: user.id });
  await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  return true;
}