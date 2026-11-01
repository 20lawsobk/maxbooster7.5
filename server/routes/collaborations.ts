import { Router, Request, Response } from "express";
import { collaborationService } from "../services/collaborationService";
import { logger } from "../logger";
import { db } from "../db";
import { artistConnections } from "@shared/schema";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";

const router = Router();
const connectionRequestSchema = z.object({
  userId: z.string().min(1).max(255),
  message: z.string().max(5_000).optional(),
});

router.get("/", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const collaborations = await db
      .select()
      .from(artistConnections)
      .where(
        or(
          eq(artistConnections.requesterId, req.user.id),
          eq(artistConnections.receiverId, req.user.id),
        ),
      )
      .orderBy(desc(artistConnections.createdAt));

    return res.json(collaborations);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching collaborations:");
    return res.status(500).json({ error: "Failed to fetch collaborations" });
  }
});

router.get("/connections", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const connections = await collaborationService?.getConnections(req.user.id);
    return res.json(connections);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching connections:");
    return res.status(500).json({ error: "Failed to fetch connections" });
  }
});

router.get("/connections/pending", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const requests = await collaborationService?.getPendingRequests(req.user.id);
    return res.json(requests);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching pending requests:");
    return res.status(500).json({ error: "Failed to fetch pending requests" });
  }
});

router.post("/connect", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const parsed = connectionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid connection request" });
    }

    const connection = await collaborationService?.sendConnectionRequest(
      req.user.id,
      parsed.data.userId,
      parsed.data.message,
    );
    return res.json(connection);
  } catch (error) {
    logger.warn({ err: error }, "Error sending connection request:");
    return res.status(400).json({ error: "Failed to send connection request" });
  }
});

router.post("/accept/:id", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const connection = await collaborationService?.acceptConnection(
      (req.params.id as string),
      req.user.id,
    );
    return res.json(connection);
  } catch (error) {
    logger.warn({ err: error }, "Error accepting connection:");
    return res.status(400).json({ error: "Failed to accept connection" });
  }
});

router.post("/decline/:id", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const connection = await collaborationService?.declineConnection(
      (req.params.id as string),
      req.user.id,
    );
    return res.json(connection);
  } catch (error) {
    logger.warn({ err: error }, "Error declining connection:");
    return res.status(400).json({ error: "Failed to decline connection" });
  }
});

router.delete("/connections/:id", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    await collaborationService?.removeConnection((req.params.id as string), req.user.id);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "Error removing connection:");
    return res.status(400).json({ error: "Failed to remove connection" });
  }
});

router.get("/suggestions", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const suggestions = await collaborationService?.getSuggestedCollaborators(
      req.user.id,
      limit,
    );
    return res.json(suggestions);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching suggestions:");
    return res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

router.get("/projects", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const userId = req.user.id;
    const genre = req.query.genre as string | undefined;
    const status = req.query.status as string | undefined;
    const ownOnly = req.query.ownOnly === "true";

    const projects = await collaborationService?.getProjects(userId, {
      genre,
      status,
      ownOnly,
    });
    // Private projects and their member lists are only visible to their owner
    // or an active member. The service also powers public discovery, so it
    // deliberately returns a broader set than this authenticated endpoint.
    return res.json(
      projects.filter(
        (project) =>
          project.ownerId === userId ||
          project.isPublic ||
          project.members.some((member) => member.userId === userId),
      ),
    );
  } catch (error) {
    logger.warn({ err: error }, "Error fetching projects:");
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

    const project = await collaborationService?.createProject(req.user.id, {
      title,
      description,
      genre,
      lookingFor,
      maxMembers,
      isPublic,
    });
    return res.json(project);
  } catch (error) {
    logger.warn({ err: error }, "Error creating project:");
    return res.status(400).json({ error: "Failed to create project" });
  }
});

router.post("/projects/:id/join", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const member = await collaborationService?.joinProject(
      req.user.id,
      (req.params.id as string),
      "member",
    );
    return res.json(member);
  } catch (error) {
    logger.warn({ err: error }, "Error joining project:");
    return res.status(400).json({ error: "Failed to join project" });
  }
});

router.post("/projects/:id/leave", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    await collaborationService?.leaveProject(req.user.id, (req.params.id as string));
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "Error leaving project:");
    return res.status(400).json({ error: "Failed to leave project" });
  }
});

router.get("/search", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const query = (req.query.q as string) || "";
    const genre = req.query.genre as string | undefined;
    const location = req.query.location as string | undefined;
    const skills = req.query.skills
      ? (req.query.skills as string).split(",")
      : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);

    const artists = await collaborationService?.searchArtists(
      query,
      { genre, location, skills },
      limit,
    );
    return res.json(artists);
  } catch (error) {
    logger.warn({ err: error }, "Error searching artists:");
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
      const status = await collaborationService?.getConnectionStatus(
        req.user.id,
        (req.params.userId as string),
      );
      return res.json(status);
    } catch (error) {
      logger.warn({ err: error }, "Error getting connection status:");
      return res.status(500).json({ error: "Failed to get connection status" });
    }
  },
);

export default router;
