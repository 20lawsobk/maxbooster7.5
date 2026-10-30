import { Router, type Request, type Response, type NextFunction } from "express";
import { storage } from "../storage.js";
import { sessionAuthority } from "../services/sessionAuthority.js";
import { twoFactorRateLimiter } from "../middleware/rateLimiter.js";
import { completeMfaChallenge } from "../services/mfaChallengeFlow.js";
import { consumeTotp } from "../services/totpReplay.js";

type Challenge = { userId: string; generation: string; expiresAt: number };
export function challengeSession(req: Request) {
  return req.session as unknown as { pendingMfa?: Challenge };
}
export function createMfaChallengeRouter(deps = {
  getUser: storage.getUser.bind(storage), authority: sessionAuthority,
  verify: (token: string, secret: string, userId: string) => consumeTotp(userId, secret, token),
}) {
  const router = Router();
  router.get("/2fa/challenge", (req, res) => {
    if (!challengeSession(req).pendingMfa) return res.redirect("/login");
    const csrf = (req as unknown as { csrfToken?: string }).csrfToken ?? req.cookies?.["csrf-token"];
    if (typeof csrf !== "string" || !/^[a-f0-9]{64}$/.test(csrf)) {
      return res.status(503).send("Security token unavailable. Please reload.");
    }
    res.setHeader("Cache-Control", "no-store");
    return res.type("html").send(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify sign-in — MaxBooster</title><main><h1>Verify your sign-in</h1><p>Enter the six-digit code from your authenticator app.</p><form method="post" action="/api/auth/2fa/challenge"><input type="hidden" name="_csrf" value="${csrf}"><label>Authenticator code <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus></label><button type="submit">Verify and continue</button></form><a href="/login">Return to sign in</a></main></html>`);
  });
  router.post("/2fa/challenge", twoFactorRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!await completeMfaChallenge(req, deps)) {
        return res.status(400).send("Invalid or expired sign-in challenge. Please retry or sign in again.");
      }
      return res.redirect("/dashboard");
    } catch (error) { next(error); }
  });
  return router;
}