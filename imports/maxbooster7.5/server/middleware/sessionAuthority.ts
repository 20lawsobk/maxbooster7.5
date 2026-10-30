import type { Request, Response, NextFunction } from "express";
import { sessionAuthority } from "../services/sessionAuthority.js";

/** Mount after express-session, before user hydration and all routers. */
export async function validateSessionAuthority(req: Request, res: Response, next: NextFunction) {
  const session = req.session as unknown as { userId?: string; authGeneration?: string };
  if (!session?.userId) return next();
  try {
    if (await (await sessionAuthority()).validate(session.userId, session.authGeneration)) return next();
    await new Promise<void>((resolve, reject) =>
      req.session.destroy(error => error ? reject(error) : resolve()));
    return res.status(401).json({ message: "Session revoked. Please sign in again." });
  } catch (error) {
    // A database outage is not evidence of authentication; do not delete a valid session.
    return res.status(503).json({ message: "Authentication authority temporarily unavailable" });
  }
}