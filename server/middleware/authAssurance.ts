import type { Request, Response, NextFunction } from "express";
const verifiedJwtFactors = new WeakMap<Request, string>();
export function markVerifiedJwtFactor(req: Request, userId: string): void {
  verifiedJwtFactors.set(req, userId);
}

/** A challenge-only session never grants application access. JWTs cannot borrow
 * an unrelated browser's assurance. MFA JWT issuance remains a separate gate. */
export function enforceAssurance(req: Request, res: Response): boolean {
  if (req.user?.subscriptionStatus === "suspended" || req.user?.subscriptionStatus === "banned") {
    res.status(403).json({ error: "Account access disabled" });
    return false;
  }
  if (!req.user?.twoFactorEnabled) return true;
  if (verifiedJwtFactors.get(req) === req.user.id) return true;
  const session = req.session as unknown as Record<string, unknown> | undefined;
  if (!req.headers.authorization && session?.userId === req.user.id &&
      session?.twoFactorVerified === true) return true;
  res.status(403).json({ error: "Two-factor authentication required", requiresTwoFactor: true });
  return false;
}

export function requireAssurance(req: Request, res: Response, next: NextFunction) {
  if (enforceAssurance(req, res)) next();
}