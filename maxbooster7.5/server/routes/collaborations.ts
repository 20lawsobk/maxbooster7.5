import { Router, Request, Response } from "express";
import { collaborationService } from "../services/collaborationService";
import { logger } from "../logger";

const router = Router();

router.get("/connections", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const connections = await collaborationService.getConnections(req.user.id);
    return res.json(connections);
  } catch (error) {
    logger.warn("Error fetching connections:", error);
    return res.status(500).json({ error: "Failed to fetch connections" });
  }
});

router.get("/connections/pending", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const requests = await collaborationService.getPendingRequests(req.user.id);
    return res.json(requests);
  } catch (error) {
    logger.warn("Error fetching pending requests:", error);
    return res.status(500).json({ error: "Failed to fetch pending requests" });
  }
});

router.post("/connect", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const { userId, message } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const connection = await collaborationService.sendConnectionRequest(
      req.user.id,
      userId,
      message,
    );
    return res.json(connection);
  } catch (error) {
    logger.warn("Error sending connection request:", error);
    return res.status(400).json({ error: "Failed to send connection request" });
  }
});

router.post("/accept/:id", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const connection = await collaborationService.acceptConnection(
      req.params.id,
      req.user.id,
    );
    return res.json(connection);
  } catch (error) {
    logger.warn("Error accepting connection:", error);
    return res.status(400).json({ error: "Failed to accept connection" });
  }
});

router.post("/decline/:id", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const connection = await collaborationService.declineConnection(
      req.params.id,
      req.user.id,
    );
    return res.json(connection);
  } catch (error) {
    logger.warn("Error declining connection:", error);
    return res.status(400).json({ error: "Failed to decline connection" });
  }
});

router.delete("/connections/:id", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    await collaborationService.removeConnection(req.params.id, req.user.id);
    return res.json({ success: true });
  } catch (error) {
    logger.warn("Error removing connection:", error);
    return res.status(400).json({ error: "Failed to remove connection" });
  }
});

router.get("/suggestions", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const suggestions = await collaborationService.getSuggestedCollaborators(
      req.user.id,
      limit,
    );
    return res.json(suggestions);
  } catch (error) {
    logger.warn("Error fetching suggestions:", error);
    return res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

router.get("/projects", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const genre = req.query.genre as string | undefined;
    const status = req.query.status as string | undefined;
    const ownOnly = req.query.ownOnly === "true";

    const projects = await collaborationService.getProjects(userId, {
      genre,
      status,
      ownOnly,
    });
    return res.json(projects);
  } catch (error) {
    logger.warn("Error fetching projects:", error);
    return res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.post("/projects", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const { title, description, genre, lookingFor, maxMembers, isPublic } =
      req.body;

    if (!title) {
      return res.status(400).json({ error: "Project title is required" });
    }

    const project = await collaborationService.createProject(req.user.id, {
      title,
      description,
      genre,
      lookingFor,
      maxMembers,
      isPublic,
    });
    return res.json(project);
  } catch (error) {
    logger.warn("Error creating project:", error);
    return res.status(400).json({ error: "Failed to create project" });
  }
});

router.post("/projects/:id/join", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const member = await collaborationService.joinProject(
      req.user.id,
      req.params.id,
      "member",
    );
    return res.json(member);
  } catch (error) {
    logger.warn("Error joining project:", error);
    return res.status(400).json({ error: "Failed to join project" });
  }
});

router.post("/projects/:id/leave", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    await collaborationService.leaveProject(req.user.id, req.params.id);
    return res.json({ success: true });
  } catch (error) {
    logger.warn("Error leaving project:", error);
    return res.status(400).json({ error: "Failed to leave project" });
  }
});

router.get("/search", async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || "";
    const genre = req.query.genre as string | undefined;
    const location = req.query.location as string | undefined;
    const skills = req.query.skills
      ? (req.query.skills as string).split(",")
      : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);

    const artists = await collaborationService.searchArtists(
      query,
      { genre, location, skills },
      limit,
    );
    return res.json(artists);
  } catch (error) {
    logger.warn("Error searching artists:", error);
    return res.status(500).json({ error: "Failed to search artists" });
  }
});

router.get(
  "/connection-status/:userId",
  async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const status = await collaborationService.getConnectionStatus(
        req.user.id,
        req.params.userId,
      );
      return res.json(status);
    } catch (error) {
      logger.warn("Error getting connection status:", error);
      return res.status(500).json({ error: "Failed to get connection status" });
    }
  },
);

export default router;
