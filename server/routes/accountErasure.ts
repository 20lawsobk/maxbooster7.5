import { Router } from "express";
import bcrypt from "bcrypt";
import { storage } from "../storage.js";
import { requireAuthOnly } from "../middleware/auth.js";
import { pool } from "../db.js";
import { createErasureRequests } from "../services/accountErasureRequests.js";

const router = Router();
const requests = createErasureRequests(pool);
router.use(["/account", "/account/erasure", "/account/erasure/cancel"], requireAuthOnly);
router.get("/account/erasure", async (req, res, next) => {
  try { res.json({ request: await requests.status(req.user!.id) }); } catch (error) { next(error); }
});
router.post("/account/erasure/cancel", async (req, res, next) => {
  try {
    if (!await requests.cancel(req.user!.id)) return res.status(409).json({ message: "No cancellable request" });
    res.json({ cancelled: true });
  } catch (error) { next(error); }
});
router.delete("/account", async (req, res, next) => {
  try {
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const session = req.session as unknown as { reauthenticatedAt?: number; reauthenticatedUserId?: string };
    // Google callback must stamp only after verified identity + MFA, never on normal session reads.
    const recentOAuth = !user.password && session.reauthenticatedUserId === user.id &&
      typeof session.reauthenticatedAt === "number" && session.reauthenticatedAt <= Date.now() &&
      Date.now() - session.reauthenticatedAt < 5 * 60_000;
    if (!recentOAuth && (!user.password || typeof req.body.password !== "string" ||
        !await bcrypt.compare(req.body.password, user.password))) {
      return res.status(403).json({ message: "Recent authentication required", requiresReauthentication: true });
    }
    const request = await requests.request(user.id);
    await new Promise<void>((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    return res.status(202).json({ accepted: true, erased: false, request,
      message: "Erasure requested. Completion awaits retention review; data has not yet been erased." });
  } catch (error) { next(error); }
});
export default router;