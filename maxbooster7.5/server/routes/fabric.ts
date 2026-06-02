import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  fabricStorage,
  fabricNodeRegistry,
  autoClusterManager,
} from "../pocket-dimension/fabric/index.js";
import { logger } from "../logger.js";

interface AuthenticatedRequest extends Request {
  user?: { id: string; role?: string };
}

const router = Router();

function sanitizeError(err: unknown): string {
  if (process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT) {
    return err instanceof Error ? err.message : String(err);
  }
  return "Internal server error";
}

router.post(
  "/pockets",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, policy } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });
      const pocket = await fabricStorage.createPocket(
        req.user!.id,
        name,
        policy || {},
      );
      res.status(201).json(pocket);
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] createPocket:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.get(
  "/pockets",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pockets = await fabricStorage.listPockets(req.user!.id);
      res.json(pockets);
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] listPockets:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.get(
  "/pockets/:pocketId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pocket = await fabricStorage.getPocket(req.params.pocketId);
      if (!pocket) return res.status(404).json({ error: "Pocket not found" });
      if (pocket.ownerId !== req.user!.id)
        return res.status(403).json({ error: "Forbidden" });
      res.json(pocket);
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] getPocket:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.post(
  "/pockets/:pocketId/volumes",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pocket = await fabricStorage.getPocket(req.params.pocketId);
      if (!pocket) return res.status(404).json({ error: "Pocket not found" });
      if (pocket.ownerId !== req.user!.id)
        return res.status(403).json({ error: "Forbidden" });
      const { name, type } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });
      const volume = await fabricStorage.createVolume(
        req.params.pocketId,
        name,
        type || "objects",
      );
      res.status(201).json(volume);
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] createVolume:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.get(
  "/pockets/:pocketId/volumes",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pocket = await fabricStorage.getPocket(req.params.pocketId);
      if (!pocket) return res.status(404).json({ error: "Pocket not found" });
      if (pocket.ownerId !== req.user!.id)
        return res.status(403).json({ error: "Forbidden" });
      const volumes = await fabricStorage.listVolumes(req.params.pocketId);
      res.json(volumes);
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] listVolumes:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.put(
  "/pockets/:pocketId/volumes/:volumeId/objects",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pocket = await fabricStorage.getPocket(req.params.pocketId);
      if (!pocket) return res.status(404).json({ error: "Pocket not found" });
      if (pocket.ownerId !== req.user!.id)
        return res.status(403).json({ error: "Forbidden" });

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const data = Buffer.concat(chunks);

      const originalName =
        (req.headers["x-original-name"] as string) || "untitled";
      const contentType =
        req.headers["content-type"] || "application/octet-stream";

      const objectId = await fabricStorage.putObject(
        req.params.pocketId,
        req.params.volumeId,
        data,
        originalName,
        contentType,
      );
      res.status(201).json({ objectId });
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] putObject:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.get(
  "/pockets/:pocketId/volumes/:volumeId/objects",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pocket = await fabricStorage.getPocket(req.params.pocketId);
      if (!pocket) return res.status(404).json({ error: "Pocket not found" });
      if (pocket.ownerId !== req.user!.id)
        return res.status(403).json({ error: "Forbidden" });
      const objects = await fabricStorage.listObjects(req.params.volumeId);
      res.json(objects);
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] listObjects:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.get(
  "/pockets/:pocketId/volumes/:volumeId/objects/:objectId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pocket = await fabricStorage.getPocket(req.params.pocketId);
      if (!pocket) return res.status(404).json({ error: "Pocket not found" });
      if (pocket.ownerId !== req.user!.id)
        return res.status(403).json({ error: "Forbidden" });

      const result = await fabricStorage.getObject(req.params.objectId);
      if (!result) return res.status(404).json({ error: "Object not found" });

      res.setHeader("Content-Type", result.object.contentType);
      res.setHeader("Content-Length", result.data.length);
      res.setHeader("X-Original-Name", result.object.originalName);
      res.send(result.data);
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] getObject:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.delete(
  "/pockets/:pocketId/volumes/:volumeId/objects/:objectId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pocket = await fabricStorage.getPocket(req.params.pocketId);
      if (!pocket) return res.status(404).json({ error: "Pocket not found" });
      if (pocket.ownerId !== req.user!.id)
        return res.status(403).json({ error: "Forbidden" });
      await fabricStorage.deleteObject(req.params.objectId);
      res.status(204).end();
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] deleteObject:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.post(
  "/nodes",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user?.role !== "admin")
        return res.status(403).json({ error: "Admin only" });
      const { region, costTier, backendType, backendConfig, capacityBytes } =
        req.body;
      const node = await fabricNodeRegistry.registerNode({
        region: region || "us-east",
        costTier: costTier || "standard",
        backendType: backendType || "pocket-dimension",
        backendConfig: backendConfig || {},
        capacityBytes: Number(capacityBytes) || 100 * 1024 * 1024 * 1024,
        usedBytes: 0,
        healthy: true,
      });
      res.status(201).json(node);
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] registerNode:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.get(
  "/nodes",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user?.role !== "admin")
        return res.status(403).json({ error: "Admin only" });
      const nodes = await fabricNodeRegistry.listAllNodes();
      res.json(nodes);
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] listNodes:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.get(
  "/stats",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await fabricStorage.getStats();
      res.json(stats);
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] getStats:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.get(
  "/cluster/status",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user?.role !== "admin")
        return res.status(403).json({ error: "Admin only" });
      const nodes = await fabricNodeRegistry.listAllNodes();
      const pdNodes = nodes.filter((n) => n.backendType === "pocket-dimension");
      const status = autoClusterManager.getStatus();
      res.json({
        cluster: {
          totalNodes: pdNodes.length,
          healthyNodes: pdNodes.filter((n) => n.healthy).length,
          nodes: pdNodes.map((n) => ({
            id: n.id,
            pocketName: (n.backendConfig as Record<string, unknown>).pocketName,
            region: n.region,
            healthy: n.healthy,
            utilizationPercent:
              n.capacityBytes > 0
                ? ((n.usedBytes / n.capacityBytes) * 100).toFixed(1)
                : "0.0",
            usedBytes: n.usedBytes,
            capacityBytes: n.capacityBytes,
            lastHeartbeat: n.lastHeartbeat,
          })),
        },
        autoScaler: status,
      });
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] cluster/status:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

router.post(
  "/cluster/evaluate",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user?.role !== "admin")
        return res.status(403).json({ error: "Admin only" });
      logger.info("[FabricRoute] Manual cluster evaluation triggered");
      const result = await autoClusterManager.evaluate();
      res.json({ triggered: true, ...result });
    } catch (err) {
      logger.warn({ err: err }, "[FabricRoute] cluster/evaluate:");
      res.status(500).json({ error: sanitizeError(err) });
    }
  },
);

export default router;
