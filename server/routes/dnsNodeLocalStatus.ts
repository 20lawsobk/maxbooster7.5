// Backend-only status endpoint for the internal dns-node subsystem
// (server/services/dnsNodeLocalSupervisor.ts). Admin-gated, no client UI.
import { Router, Request, Response } from "express";
import { getDnsNodeLocalStatus } from "../services/dnsNodeLocalSupervisor.js";

const router = Router();

router.get("/status", (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if ((req.user as Record<string, unknown>).role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  res.json({ success: true, ...getDnsNodeLocalStatus() });
});

export default router;
