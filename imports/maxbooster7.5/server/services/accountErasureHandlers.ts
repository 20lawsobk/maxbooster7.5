import type { RequestHandler } from "express";
import type { createErasureRequests } from "./accountErasureRequests.js";

export interface ErasureHandlerDependencies {
  requests: ReturnType<typeof createErasureRequests>;
  getUser(id: string): Promise<{ id: string; password: string | null } | undefined>;
  comparePassword(password: string, hash: string): Promise<boolean>;
  now?: () => number;
}

/** Mounted behind requireAuthOnly (including MFA) and global CSRF.
 * Subject identity comes exclusively from the authenticated principal.
 */
export function createErasureHandlers(deps: ErasureHandlerDependencies): Record<
  "status" | "cancel" | "request", RequestHandler
> {
  const now = deps.now ?? Date.now;
  return {
    status: async (req, res, next) => {
      try {
        if (!req.user?.id) { res.status(401).json({ message: "Not authenticated" }); return; }
        res.json({ request: await deps.requests.status(req.user.id) });
      } catch (error) { next(error); }
    },
    cancel: async (req, res, next) => {
      try {
        if (!req.user?.id) { res.status(401).json({ message: "Not authenticated" }); return; }
        if (!await deps.requests.cancel(req.user.id)) {
          res.status(409).json({ message: "No cancellable request" }); return;
        }
        res.json({ cancelled: true });
      } catch (error) { next(error); }
    },
    request: async (req, res, next) => {
      try {
        if (!req.user?.id) { res.status(401).json({ message: "Not authenticated" }); return; }
        const user = await deps.getUser(req.user.id);
        if (!user || user.id !== req.user.id) {
          res.status(401).json({ message: "Not authenticated" }); return;
        }
        const session = req.session as unknown as {
          reauthenticatedAt?: number; reauthenticatedUserId?: string;
        } | undefined;
        const at = now();
        const recentOAuth = !user.password && session?.reauthenticatedUserId === user.id &&
          typeof session.reauthenticatedAt === "number" && session.reauthenticatedAt <= at &&
          at - session.reauthenticatedAt < 5 * 60_000;
        if (!recentOAuth && (!user.password || typeof req.body?.password !== "string" ||
            !await deps.comparePassword(req.body.password, user.password))) {
          res.status(403).json({ message: "Recent authentication required", requiresReauthentication: true });
          return;
        }
        // Durable request + epoch revocation precede any acknowledgment.
        const request = await deps.requests.request(user.id);
        if (req.session) {
          await new Promise<void>((resolve, reject) =>
            req.session.destroy(error => error ? reject(error) : resolve()));
        }
        res.status(202).json({ accepted: true, erased: false, request,
          message: "Erasure requested. Completion awaits retention review; data has not yet been erased." });
      } catch (error) { next(error); }
    },
  };
}