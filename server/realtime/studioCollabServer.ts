import { WebSocketServer, WebSocket } from "ws";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import {
  REMOTE_YJS_UPDATE_ORIGIN,
  yjsService,
} from "../services/yjsService.js";
import { presenceManager, type CursorPosition, type SelectionState } from "./presenceManager.js";
import { jwtAuthService } from "../services/jwtAuthService.js";
import { storage } from "../storage.js";
import { getStudioProjectAccess } from "../services/studioProjectAccess.js";
import { logger } from "../logger.js";
import { authenticateRealtimeSession } from "./sessionAuth.js";
import { collaborationEventBus } from "../services/collaborationEventBus.js";
import { collaborationRooms } from "@shared/schema";
import { db } from "../db.js";
import {
  CollaborationMediaUnavailableError,
  collaborationMediaPlane,
} from "../services/collaborationMediaPlane.js";
import { collaborationCallRequestSchema } from "../services/collaborationCallContracts.js";

interface CollabClient {
  ws: WebSocket;
  userId: string;
  displayName: string;
  projectId: string;
  roomId: string | null;
  roomGeneration: number | null;
  connectionId: string;
  color: string;
  isAlive: boolean;
  lastPing: number;
  request: IncomingMessage;
  authFingerprint: string;
  inCall: boolean;
  publishingMedia: boolean;
}

interface CollabMessage {
  type: string;
  payload?: unknown;
}

type AuthenticatedRequest =
  | { authenticated: true; userId: string; displayName: string }
  | { authenticated: false };

interface YjsUpdateMessage extends CollabMessage {
  type: "yjs:update";
  payload: {
    update: string;
  };
}

interface CursorUpdateMessage extends CollabMessage {
  type: "cursor:update";
  payload: CursorPosition;
}

interface SelectionUpdateMessage extends CollabMessage {
  type: "selection:update";
  payload: SelectionState | null;
}

interface PresenceUpdateMessage extends CollabMessage {
  type: "presence:update";
  payload: {
    status: "online" | "away" | "editing";
  };
}


type IncomingCollabMessage =
  | YjsUpdateMessage
  | CursorUpdateMessage
  | SelectionUpdateMessage
  | PresenceUpdateMessage
  | { type: "ping" }
  | { type: "sync:request" }
  | (CollabMessage & { requestId?: string });

const PING_INTERVAL_MS = 30000;
const AWARENESS_BROADCAST_INTERVAL_MS = 5000;

// Hard cap on simultaneous studio collaboration connections per process.
// Each WebSocket holds ~50 KB of Yjs document state + OS FD; beyond ~10k
// per process memory pressure grows faster than the linear model.
const MAX_STUDIO_WS_CONNECTIONS = 10_000;
// Max simultaneous collab connections per user (multiple projects / browser tabs)
const MAX_STUDIO_WS_PER_USER = 10;

export class StudioCollabServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<CollabClient>> = new Map();
  private userConnectionCount: Map<string, number> = new Map();
  private documents: Map<string, Y.Doc> = new Map();
  private documentLoads: Map<string, Promise<Y.Doc>> = new Map();
  private eventBusSubscription: Promise<() => void> | null = null;
  private disconnectedClients = new WeakSet<CollabClient>();
  private heartbeatRun: Promise<void> | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private awarenessInterval: NodeJS.Timeout | null = null;

  async initialize(server: Server, path: string = "/ws/studio"): Promise<void> {
    // maxPayload: 1 MB covers the largest Yjs document update chunks produced by
    // the studio editor.  Without this a single malicious frame OOMs the process.
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: 1 * 1024 * 1024,
    });
    if (!this.eventBusSubscription) {
      this.eventBusSubscription = collaborationEventBus
        .subscribe((projectId, event) => {
          if (event.type === "room:closed") {
            this.closeRoomConnections(
              projectId,
              event.payload.roomId,
              event.payload.roomGeneration,
            );
          } else {
            this.broadcastToProject(projectId, event);
          }
        })
        .catch((error) => {
          this.eventBusSubscription = null;
          this.wss?.close();
          this.wss = null;
          throw error;
        });
    }
    await this.eventBusSubscription;
    await collaborationMediaPlane.prepare();

    server?.on("upgrade", async (request, socket, head) => {
      const pathname = new URL(
        request?.url || "/",
        "http://collaboration.local",
      ).pathname;

      if (pathname?.startsWith(path)) {
        try {
          // Global studio WS cap — reject before the expensive auth + Yjs load
          const totalClients = Array.from(this.clients.values()).reduce(
            (sum, set) => sum + set?.size,
            0,
          );
          if (totalClients >= MAX_STUDIO_WS_CONNECTIONS) {
            logger.warn(
              `[StudioCollab] Global connection limit reached (${MAX_STUDIO_WS_CONNECTIONS})`,
            );
            socket?.write(
              "HTTP/1.1 503 Service Unavailable\r\nRetry-After: 30\r\n\r\n",
            );
            socket?.destroy();
            return;
          }

          const authResult = await this.authenticateRequest(request);

          if (!authResult.authenticated) {
            socket?.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket?.destroy();
            return;
          }

          // Per-user studio connection cap
          const userCount =
            this.userConnectionCount.get(authResult.userId) ?? 0;
          if (userCount >= MAX_STUDIO_WS_PER_USER) {
            logger.warn(
              `[StudioCollab] Per-user studio connection limit reached.`,
            );
            socket?.write(
              "HTTP/1.1 429 Too Many Requests\r\nRetry-After: 10\r\n\r\n",
            );
            socket?.destroy();
            return;
          }

          const projectId = this.extractProjectId(request?.url || "");

          if (!projectId) {
            socket?.write("HTTP/1.1 400 Bad Request\r\n\r\n");
            socket?.destroy();
            return;
          }
          const roomId = this.extractRoomId(request?.url || "");
          const roomGeneration = roomId
            ? this.extractRoomGeneration(request?.url || "")
            : null;
          if (
            roomId &&
            (roomGeneration === null ||
              !(await this.isActiveRoom(roomId, projectId, roomGeneration)))
          ) {
            socket?.write("HTTP/1.1 410 Gone\r\n\r\n");
            socket?.destroy();
            return;
          }

          const hasAccess = await this.checkProjectAccess(
            authResult.userId,
            projectId,
          );

          if (!hasAccess) {
            socket?.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket?.destroy();
            return;
          }

          this.wss!.handleUpgrade(request, socket, head, (ws) => {
            this.wss!.emit("connection", ws, request, {
              userId: authResult.userId,
              displayName: authResult.displayName,
              projectId,
              roomId,
              roomGeneration,
              authFingerprint: this.getCredentialFingerprint(request),
            });
          });
        } catch (error) {
          logger.warn({ err: error }, "[StudioCollab] Upgrade error:");
          socket?.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          socket?.destroy();
        }
      }
    });

    this.wss.on(
      "connection",
      async (
        ws: WebSocket,
        request: IncomingMessage,
        context: {
          userId: string;
          displayName: string;
          projectId: string;
          roomId: string | null;
          roomGeneration: number | null;
          authFingerprint: string;
        },
      ) => {
        void this.handleConnection(
          ws,
          context?.userId,
          context?.displayName,
          context?.projectId,
          context?.roomId,
          context?.roomGeneration,
          request,
          context?.authFingerprint,
        ).catch((error) => {
          logger.warn(
            {
              projectId: context?.projectId,
              error: error instanceof Error ? error.message : "unknown",
            },
            "[StudioCollab] Connection setup failed:",
          );
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(1013, "Collaboration synchronization unavailable");
          }
        });
      },
    );

    this.startPingInterval();
    this.startAwarenessBroadcast();

    logger.info(`[StudioCollab] WebSocket server initialized on path: ${path}`);
  }

  private async authenticateRequest(
    request: IncomingMessage,
  ): Promise<AuthenticatedRequest> {
    const authHeader = request?.headers["authorization"];
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader?.substring(7);
      try {
        const decoded = await jwtAuthService?.verifyAccessToken(token);
        if (decoded) {
          const user = await storage.getUser(decoded?.userId);
          if (user) {
            return {
              authenticated: true,
              userId: user.id,
              displayName:
                `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
                user?.email,
            };
          }
        }
      } catch (error) {
        logger.warn({ err: error }, "[StudioCollab] JWT verification failed:");
      }
    }

    try {
      const userId = await authenticateRealtimeSession(request);
      if (userId) {
        const user = await storage.getUser(userId);
        if (user) {
          return {
            authenticated: true,
            userId: user.id,
            displayName:
              `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
              user?.email,
          };
        }
      }
    } catch (error) {
      logger.warn(
        { err: error },
        "[StudioCollab] Session verification failed:",
      );
    }

    const url = new URL(
      request?.url || "/",
      "http://collaboration.local",
    );
    const tokenParam = url.searchParams.get("token");
    if (tokenParam) {
      try {
        const decoded = await jwtAuthService?.verifyAccessToken(tokenParam);
        if (decoded) {
          const user = await storage.getUser(decoded?.userId);
          if (user) {
            return {
              authenticated: true,
              userId: user.id,
              displayName:
                `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
                user?.email,
            };
          }
        }
      } catch (error) {
        logger.warn(
          { err: error },
          "[StudioCollab] Token param verification failed:",
        );
      }
    }

    return { authenticated: false };
  }

  private async isCredentialStillValid(
    request: IncomingMessage,
    expectedUserId: string,
  ): Promise<boolean> {
    const authHeader = request?.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const decoded = await jwtAuthService?.verifyAccessToken(
        authHeader.substring(7),
      );
      return decoded?.userId === expectedUserId;
    }

    if ((await authenticateRealtimeSession(request)) === expectedUserId) {
      return true;
    }

    const url = new URL(
      request?.url || "/",
      "http://collaboration.local",
    );
    const token = url.searchParams.get("token");
    if (typeof token === "string") {
      const decoded = await jwtAuthService?.verifyAccessToken(token);
      return decoded?.userId === expectedUserId;
    }
    return false;
  }

  private extractProjectId(url: string): string | null {
    const parsed = new URL(url || "/", "http://collaboration.local");
    const pathname = parsed.pathname;

    const match = pathname?.match(/\/ws\/studio\/([a-zA-Z0-9-]+)/);
    if (match) {
      return match[1];
    }

    const projectId = parsed.searchParams.get("projectId");
    if (projectId) {
      return projectId;
    }

    return null;
  }

  private extractRoomId(url: string): string | null {
    const parsed = new URL(url || "/", "http://collaboration.local");
    return parsed.searchParams.get("roomId");
  }

  private extractRoomGeneration(url: string): number | null {
    const value = new URL(
      url || "/",
      "http://collaboration.local",
    ).searchParams.get("roomGeneration");
    if (!value || !/^[1-9]\d*$/.test(value)) return null;
    const generation = Number(value);
    return Number.isSafeInteger(generation) ? generation : null;
  }

  private async isActiveRoom(
    roomId: string,
    projectId: string,
    roomGeneration: number,
  ): Promise<boolean> {
    try {
      const [room] = await db
        .select({ id: collaborationRooms.id })
        .from(collaborationRooms)
        .where(
          and(
            eq(collaborationRooms.id, roomId),
            eq(collaborationRooms.projectId, projectId),
            eq(collaborationRooms.state, "active"),
            eq(collaborationRooms.generation, roomGeneration),
          ),
        )
        .limit(1);
      return !!room;
    } catch (error) {
      logger.warn({ projectId, err: error }, "Room lifecycle check failed");
      return false;
    }
  }

  private closeRoomConnections(
    projectId: string,
    roomId: string,
    roomGeneration: number,
  ): void {
    void collaborationMediaPlane.closeRoom(roomId, roomGeneration).catch((error) =>
      logger.warn({ err: error, roomId }, "[StudioCollab] Media room cleanup failed"),
    );
    const clients = this.clients.get(projectId);
    if (!clients) return;
    for (const client of clients) {
      if (
        client.roomId === roomId &&
        client.roomGeneration === roomGeneration
      ) {
        client.ws.close(4001, "Collaboration room ended");
        this.handleDisconnect(client);
      }
    }
  }

  private getCredentialFingerprint(request: IncomingMessage): string {
    const url = new URL(
      request?.url || "/",
      "http://collaboration.local",
    );
    const credential =
      request?.headers.authorization ||
      request?.headers.cookie ||
      `query-token:${url.searchParams.get("token") || ""}`;
    return createHash("sha256").update(String(credential)).digest("base64url");
  }

  private async checkProjectAccess(
    userId: string,
    projectId: string,
    permission: "read" | "write" = "read",
  ): Promise<boolean> {
    try {
      const access = await getStudioProjectAccess(userId, projectId);
      return permission === "write" ? access.write : access.read;
    } catch (error) {
      logger.warn(
        { err: error },
        "[StudioCollab] Project access check failed:",
      );
      return false;
    }
  }

  private async handleConnection(
    ws: WebSocket,
    userId: string,
    displayName: string,
    projectId: string,
    roomId: string | null,
    roomGeneration: number | null,
    request: IncomingMessage,
    authFingerprint: string,
  ): Promise<void> {
    const access = await getStudioProjectAccess(userId, projectId);
    if (!access.read) {
      ws.close(1008, "Project access revoked");
      return;
    }
    const doc = await this.getOrLoadDocument(projectId);

    const presence = await presenceManager?.addCollaborator(
      projectId,
      userId,
      displayName,
    );

    const client: CollabClient = {
      ws,
      userId,
      displayName,
      projectId,
      roomId,
      roomGeneration,
      connectionId: presence.connectionId,
      color: presence.color,
      isAlive: true,
      lastPing: Date.now(),
      request,
      authFingerprint,
      inCall: false,
      publishingMedia: false,
    };

    let projectClients = this.clients.get(projectId);
    if (!projectClients) {
      projectClients = new Set();
      this.clients.set(projectId, projectClients);
    }
    projectClients?.add(client);

    // Track per-user connection count for the upgrade-time limit check
    this.userConnectionCount.set(
      userId,
      (this.userConnectionCount.get(userId) ?? 0) + 1,
    );

    this.sendToClient(ws, {
      type: "connected",
      payload: {
        connectionId: presence.connectionId,
        userId,
        displayName,
        color: presence.color,
        projectId,
        permissions: access,
      },
    });

    const state = Y?.encodeStateAsUpdate(doc);
    this.sendToClient(ws, {
      type: "yjs:sync",
      payload: {
        state: Buffer.from(state).toString("base64"),
        stateVector: Buffer.from(Y.encodeStateVector(doc)).toString("base64"),
      },
    });
    this.sendToClient(ws, {
      type: "call:availability",
      payload: await collaborationMediaPlane.getAvailability(),
    });

    const collaborators = await presenceManager?.getCollaborators(projectId);
    this.sendToClient(ws, {
      type: "awareness:update",
      payload: { collaborators },
    });

    this.broadcastToProject(
      projectId,
      {
        type: "collaborator:joined",
        payload: {
          userId,
          displayName,
          color: presence.color,
        },
      },
      client,
    );

    const updateHandler = async (update: Uint8Array, origin: unknown) => {
      if (origin !== client) {
        if (!(await this.checkProjectAccess(userId, projectId))) {
          ws.close(1008, "Project access revoked");
          return;
        }
        this.sendToClient(ws, {
          type: "yjs:update",
          payload: {
            update: Buffer.from(update).toString("base64"),
          },
        });
      }
    };

    doc?.on("update", updateHandler);

    ws?.on("message", async (data) => {
      try {
        const message: IncomingCollabMessage = JSON.parse(data?.toString());
        await this.handleMessage(client, message, doc!);
      } catch (error) {
        logger.warn({ err: error }, "[StudioCollab] Message handling error:");
      }
    });

    ws?.on("pong", () => {
      client.isAlive = true;
      client.lastPing = Date?.now();
    });

    ws?.on("close", async () => {
      doc!.off("update", updateHandler);
      await this.handleDisconnect(client);
    });

    ws?.on("error", async (error) => {
      logger.warn({ err: error }, "[StudioCollab] WebSocket error:");
      doc!.off("update", updateHandler);
      await this.handleDisconnect(client);
    });

    logger.info(
      `[StudioCollab] Client connected: ${displayName} (${userId}) to project ${projectId}`,
    );
  }

  private async getOrLoadDocument(projectId: string): Promise<Y.Doc> {
    const existing = this.documents.get(projectId);
    if (existing) return existing;

    const inFlight = this.documentLoads.get(projectId);
    if (inFlight) return inFlight;

    const pendingRemoteUpdates: Uint8Array[] = [];
    const receiveRemoteUpdate = (update: Uint8Array) => {
      const loaded = this.documents.get(projectId);
      if (loaded) {
        Y.applyUpdate(loaded, update, REMOTE_YJS_UPDATE_ORIGIN);
      } else {
        pendingRemoteUpdates.push(update);
      }
    };

    const load = (async () => {
      try {
        // Subscribe before reading the cached/persisted snapshot. Updates that
        // arrive during the load are buffered and applied before clients sync.
        await yjsService.subscribeToProjectUpdates(
          projectId,
          receiveRemoteUpdate,
        );
        const doc = await yjsService.loadDocument(projectId);
        this.documents.set(projectId, doc);
        for (const update of pendingRemoteUpdates) {
          Y.applyUpdate(doc, update, REMOTE_YJS_UPDATE_ORIGIN);
        }
        return doc;
      } catch (error) {
        const loaded = this.documents.get(projectId);
        this.documents.delete(projectId);
        await yjsService.unloadDocument(projectId, loaded).catch((unloadError) => {
          logger.warn(
            { projectId, error: unloadError instanceof Error ? unloadError.message : "unknown" },
            "[StudioCollab] Failed to clean up a partial document load:",
          );
        });
        throw error;
      }
    })();

    this.documentLoads.set(projectId, load);
    try {
      return await load;
    } finally {
      if (this.documentLoads.get(projectId) === load) {
        this.documentLoads.delete(projectId);
      }
    }
  }

  private async handleMessage(
    client: CollabClient,
    message: IncomingCollabMessage,
    doc: Y.Doc,
  ): Promise<void> {
    if (!(await this.checkProjectAccess(client.userId, client.projectId))) {
      client.ws.close(1008, "Project access revoked");
      return;
    }
    if (
      client.roomId &&
      (client.roomGeneration === null ||
        !(await this.isActiveRoom(
          client.roomId,
          client.projectId,
          client.roomGeneration,
        )))
    ) {
      client.ws.close(4001, "Collaboration room ended");
      return;
    }
    switch (message?.type) {
      case "yjs:update": {
        // Recheck on each mutation so revocation is not cached for the socket lifetime.
        if (!(await getStudioProjectAccess(client.userId, client.projectId)).write) {
          client.ws.close(1008, "Project write access denied");
          return;
        }
        const updateMsg = message as YjsUpdateMessage;
        const update = Buffer?.from(updateMsg?.payload.update, "base64");
        Y?.applyUpdate(doc, new Uint8Array(update), client);

        // The document update handler distributes exactly once, after a fresh
        // authorization decision for each recipient.
        break;
      }

      case "cursor:update": {
        const cursorMsg = message as CursorUpdateMessage;
        await presenceManager?.updateCursor(
          client?.projectId,
          client?.userId,
          client?.connectionId,
          cursorMsg?.payload,
        );

        this.broadcastToProject(
          client?.projectId,
          {
            type: "cursor:update",
            payload: {
              userId: client.userId,
              cursor: cursorMsg.payload,
            },
          },
          client,
        );
        break;
      }

      case "selection:update": {
        const selectionMsg = message as SelectionUpdateMessage;
        await presenceManager?.updateSelection(
          client?.projectId,
          client?.userId,
          client?.connectionId,
          selectionMsg?.payload,
        );

        this.broadcastToProject(
          client?.projectId,
          {
            type: "selection:update",
            payload: {
              userId: client.userId,
              selection: selectionMsg.payload,
            },
          },
          client,
        );
        break;
      }

      case "presence:update": {
        const presenceMsg = message as PresenceUpdateMessage;
        await presenceManager?.updateStatus(
          client?.projectId,
          client?.userId,
          client?.connectionId,
          presenceMsg?.payload.status,
        );

        this.broadcastToProject(
          client?.projectId,
          {
            type: "presence:update",
            payload: {
              userId: client.userId,
              status: presenceMsg.payload.status,
            },
          },
          client,
        );
        break;
      }

      case "sync:request": {
        const state = Y?.encodeStateAsUpdate(doc);
        this.sendToClient(client?.ws, {
          type: "yjs:sync",
          payload: {
            state: Buffer.from(state).toString("base64"),
            stateVector: Buffer.from(Y.encodeStateVector(doc)).toString("base64"),
          },
        });
        break;
      }

      case "ping": {
        this.sendToClient(client?.ws, { type: "pong" });
        client.isAlive = true;
        client.lastPing = Date?.now();
        break;
      }

      default:
        if ((message as CollabMessage).type.startsWith("call:")) {
          await this.handleCallRequest(client, message as CollabMessage);
        } else {
          logger.warn(
            `[StudioCollab] Unknown message type: ${(message as CollabMessage).type}`,
          );
        }
    }
  }

  private async handleCallRequest(
    client: CollabClient,
    message: CollabMessage,
  ): Promise<void> {
    const candidateRequestId = (message as CollabMessage & { requestId?: unknown })
      .requestId;
    if (
      typeof candidateRequestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        candidateRequestId,
      )
    ) {
      client.ws.close(1008, "Invalid call request");
      return;
    }

    const parsed = collaborationCallRequestSchema.safeParse(message);
    if (!parsed.success) {
      this.sendToClient(client.ws, {
        type: "call:response",
        requestId: candidateRequestId,
        ok: false,
        error: "Invalid call request payload.",
      });
      return;
    }

    try {
      const request = parsed.data;
      if (!client.roomId || client.roomGeneration === null) {
        throw new CollaborationMediaUnavailableError(
          "A collaboration room is required before joining a call.",
        );
      }
      const requiredPermission =
        request.type === "call:produce" ||
        request.type === "call:media-state" ||
        (request.type === "call:create-transport" &&
          request.payload.direction === "send")
          ? "write"
          : "read";
      if (
        request.type !== "call:leave" &&
        !(await this.checkProjectAccess(
          client.userId,
          client.projectId,
          requiredPermission,
        ))
      ) {
        throw new Error(
          requiredPermission === "write"
            ? "Current project write permission is required to publish media."
            : "Current project read permission is required for call access.",
        );
      }

      let result: unknown = {};
      switch (request.type) {
        case "call:join": {
          const [room] = await db
            .select({
              id: collaborationRooms.id,
              generation: collaborationRooms.generation,
              state: collaborationRooms.state,
              mediaRegion: collaborationRooms.mediaRegion,
            })
            .from(collaborationRooms)
            .where(
              and(
                eq(collaborationRooms.id, client.roomId),
                eq(collaborationRooms.projectId, client.projectId),
                eq(collaborationRooms.generation, client.roomGeneration),
                eq(collaborationRooms.state, "active"),
              ),
            )
            .limit(1);
          if (!room) {
            throw new CollaborationMediaUnavailableError(
              "The collaboration room has ended.",
            );
          }
          await collaborationMediaPlane.prepare();
          const availability = await collaborationMediaPlane.getAvailability();
          if (
            !availability.region ||
            !availability.participantLimit ||
            availability.state === "unavailable"
          ) {
            throw new CollaborationMediaUnavailableError(
              availability.reason || "No healthy regional media service is available.",
            );
          }
          if (
            room.mediaRegion &&
            room.mediaRegion !== availability.region
          ) {
            throw new CollaborationMediaUnavailableError(
              `This room is assigned to region ${room.mediaRegion}; this server serves ${availability.region}.`,
            );
          }

          const joined = await collaborationMediaPlane.join({
            roomId: room.id,
            roomGeneration: room.generation,
            userId: client.userId,
            connectionId: client.connectionId,
          });
          const [claimed] = await db
            .update(collaborationRooms)
            .set({
              mediaState: "available",
              mediaRegion: joined.region,
              participantLimit: joined.participantLimit,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(collaborationRooms.id, room.id),
                eq(collaborationRooms.generation, room.generation),
                eq(collaborationRooms.state, "active"),
                room.mediaRegion
                  ? eq(collaborationRooms.mediaRegion, joined.region)
                  : isNull(collaborationRooms.mediaRegion),
              ),
            )
            .returning({ id: collaborationRooms.id });
          const [currentRoom] = claimed
            ? [room]
            : await db
                .select({
                  state: collaborationRooms.state,
                  generation: collaborationRooms.generation,
                  mediaRegion: collaborationRooms.mediaRegion,
                })
                .from(collaborationRooms)
                .where(eq(collaborationRooms.id, room.id))
                .limit(1);
          if (
            !currentRoom ||
            currentRoom.state !== "active" ||
            currentRoom.generation !== room.generation ||
            currentRoom.mediaRegion !== joined.region
          ) {
            await collaborationMediaPlane.leave(client.connectionId);
            throw new CollaborationMediaUnavailableError(
              "A different media region claimed this room; retry through its regional endpoint.",
            );
          }
          client.inCall = true;
          result = joined;
          this.broadcastToCallRoom(
            client.roomId,
            client.roomGeneration,
            {
              type: "call:event",
              payload: {
                event: "participant-joined",
                userId: client.userId,
              },
            },
            client,
          );
          client.publishingMedia = true;
          break;
        }
        case "call:create-transport":
          if (!client.inCall) throw new Error("Join the call first.");
          result = await collaborationMediaPlane.createTransport(
            client.connectionId,
          );
          break;
        case "call:connect-transport":
          if (!client.inCall) throw new Error("Join the call first.");
          await collaborationMediaPlane.connectTransport(
            client.connectionId,
            request.payload.transportId,
            request.payload.dtlsParameters as never,
          );
          break;
        case "call:produce": {
          if (!client.inCall) throw new Error("Join the call first.");
          const producer = await collaborationMediaPlane.produce(
            client.connectionId,
            request.payload.transportId,
            request.payload.kind,
            request.payload.rtpParameters as never,
          );
          result = producer;
          this.broadcastToCallRoom(
            client.roomId,
            client.roomGeneration,
            {
              type: "call:event",
              payload: {
                event: "producer-added",
                producerId: producer.id,
                userId: producer.userId,
                kind: producer.kind,
              },
            },
            client,
          );
          break;
        }
        case "call:consume":
          if (!client.inCall) throw new Error("Join the call first.");
          result = await collaborationMediaPlane.consume(
            client.connectionId,
            request.payload.transportId,
            request.payload.producerId,
            request.payload.rtpCapabilities as never,
          );
          break;
        case "call:resume-consumer":
          if (!client.inCall) throw new Error("Join the call first.");
          await collaborationMediaPlane.resumeConsumer(
            client.connectionId,
            request.payload.consumerId,
          );
          break;
        case "call:media-state":
          if (!client.inCall) throw new Error("Join the call first.");
          this.broadcastToCallRoom(
            client.roomId,
            client.roomGeneration,
            {
              type: "call:event",
              payload: {
                event: "participant-state",
                userId: client.userId,
                audioEnabled: request.payload.audioEnabled,
                videoEnabled: request.payload.videoEnabled,
              },
            },
            client,
          );
          break;
        case "call:leave":
          if (client.inCall) {
            await collaborationMediaPlane.leave(client.connectionId);
            client.inCall = false;
            client.publishingMedia = false;
            this.broadcastToCallRoom(
              client.roomId,
              client.roomGeneration,
              {
                type: "call:event",
                payload: {
                  event: "participant-left",
                  userId: client.userId,
                },
              },
              client,
            );
          }
          break;
      }
      this.sendToClient(client.ws, {
        type: "call:response",
        requestId: candidateRequestId,
        ok: true,
        payload: result,
      });
    } catch (error) {
      this.sendToClient(client.ws, {
        type: "call:response",
        requestId: candidateRequestId,
        ok: false,
        error:
          error instanceof Error
            ? error.message.slice(0, 300)
            : "Call operation failed.",
      });
    }
  }

  private async handleDisconnect(client: CollabClient): Promise<void> {
    if (this.disconnectedClients.has(client)) return;
    this.disconnectedClients.add(client);

    if (client.inCall && client.roomId && client.roomGeneration !== null) {
      this.broadcastToCallRoom(
        client.roomId,
        client.roomGeneration,
        {
          type: "call:event",
          payload: { event: "participant-left", userId: client.userId },
        },
        client,
      );
      await collaborationMediaPlane.leave(client.connectionId).catch((error) =>
        logger.warn(
          { err: error, connectionId: client.connectionId },
          "[StudioCollab] Media participant cleanup failed",
        ),
      );
      client.inCall = false;
    }

    // Decrement per-user connection counter
    const prev = this.userConnectionCount.get(client?.userId) ?? 1;
    if (prev <= 1) {
      this.userConnectionCount.delete(client?.userId);
    } else {
      this.userConnectionCount.set(client?.userId, prev - 1);
    }

    const projectClients = this.clients.get(client?.projectId);
    if (projectClients) {
      projectClients?.delete(client);

      if (projectClients?.size === 0) {
        this.clients.delete(client?.projectId);

        setTimeout(async () => {
          const remainingClients = this.clients.get(client?.projectId);
          if (!remainingClients || remainingClients?.size === 0) {
            const doc = this.documents.get(client?.projectId);
            if (doc) {
              await yjsService?.unloadDocument(client?.projectId, doc);
              this.documents.delete(client?.projectId);
              logger.info(
                `[StudioCollab] Unloaded document for project ${client?.projectId}`,
              );
            }
          }
        }, 60000);
      }
    }

    await presenceManager?.removeCollaborator(
      client?.projectId,
      client?.userId,
      client?.connectionId,
    );

    this.broadcastToProject(client?.projectId, {
      type: "collaborator:left",
      payload: {
        userId: client.userId,
        displayName: client.displayName,
      },
    });

    logger.info(
      `[StudioCollab] Client disconnected: ${client?.displayName} (${client?.userId}) from project ${client?.projectId}`,
    );
  }

  private sendToClient(ws: WebSocket, message: object): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws?.send(JSON.stringify(message));
    }
  }

  private broadcastToProject(
    projectId: string,
    message: object,
    exclude?: CollabClient,
  ): void {
    const projectClients = this.clients.get(projectId);
    if (!projectClients) return;

    const messageStr = JSON.stringify(message);

    for (const client of projectClients) {
      if (client !== exclude && client?.ws.readyState === WebSocket.OPEN) {
        void this.checkProjectAccess(client.userId, projectId).then((allowed) => {
          if (!allowed) client.ws.close(1008, "Project access revoked");
          else if (client.ws.readyState === WebSocket.OPEN) client.ws.send(messageStr);
        });
      }
    }
  }

  private broadcastToCallRoom(
    roomId: string,
    roomGeneration: number,
    message: object,
    exclude?: CollabClient,
  ): void {
    const messageStr = JSON.stringify(message);
    for (const projectClients of this.clients.values()) {
      for (const client of projectClients) {
        if (
          client !== exclude &&
          client.inCall &&
          client.roomId === roomId &&
          client.roomGeneration === roomGeneration &&
          client.ws.readyState === WebSocket.OPEN
        ) {
          void this.checkProjectAccess(client.userId, client.projectId).then(
            (allowed) => {
              if (!allowed) client.ws.close(1008, "Project access revoked");
              else if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(messageStr);
              }
            },
          );
        }
      }
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.heartbeatRun) return;
      this.heartbeatRun = this.refreshActiveConnections()
        .catch((error) => {
          logger.warn(
            { err: error },
            "[StudioCollab] Active session refresh failed",
          );
        })
        .finally(() => {
          this.heartbeatRun = null;
        });
    }, PING_INTERVAL_MS);
  }

  private async refreshActiveConnections(): Promise<void> {
    const clients = Array.from(this.clients.values()).flatMap((items) =>
      Array.from(items),
    );
    const credentials = new Map<
      string,
      { request: IncomingMessage; userId: string }
    >();
    for (const client of clients) {
      if (!credentials.has(client.authFingerprint)) {
        credentials.set(client.authFingerprint, {
          request: client.request,
          userId: client.userId,
        });
      }
    }

    const validity = new Map<string, boolean>();
    const entries = Array.from(credentials.entries());
    for (let offset = 0; offset < entries.length; offset += 50) {
      const batch = entries.slice(offset, offset + 50);
      const results = await Promise.all(
        batch.map(async ([fingerprint, credential]) => {
          try {
            return [
              fingerprint,
              await this.isCredentialStillValid(
                credential.request,
                credential.userId,
              ),
            ] as const;
          } catch (error) {
            logger.warn(
              { err: error },
              "[StudioCollab] Active credential check failed",
            );
            return [fingerprint, false] as const;
          }
        }),
      );
      for (const [fingerprint, isValid] of results) {
        validity.set(fingerprint, isValid);
      }
    }

    const accessChecks = new Map<
      string,
      { userId: string; projectId: string; permission: "read" | "write" }
    >();
    for (const client of clients) {
      const permission =
        client.inCall && client.publishingMedia ? "write" : "read";
      const key = `${client.userId}\u0000${client.projectId}\u0000${permission}`;
      if (!accessChecks.has(key)) {
        accessChecks.set(key, {
          userId: client.userId,
          projectId: client.projectId,
          permission,
        });
      }
    }
    const projectAccess = new Map<string, boolean>();
    const accessEntries = Array.from(accessChecks.entries());
    for (let offset = 0; offset < accessEntries.length; offset += 50) {
      const batch = accessEntries.slice(offset, offset + 50);
      const results = await Promise.all(
        batch.map(async ([key, access]) => [
          key,
          await this.checkProjectAccess(
            access.userId,
            access.projectId,
            access.permission,
          ),
        ] as const),
      );
      for (const [key, allowed] of results) {
        projectAccess.set(key, allowed);
      }
    }

    const roomIds = Array.from(
      new Set(
        clients
          .map((client) => client.roomId)
          .filter((roomId): roomId is string => !!roomId),
      ),
    );
    const activeRoomGenerations = new Set<string>();
    let roomStatusAvailable = true;
    if (roomIds.length > 0) {
      try {
        const activeRooms = await db
          .select({
            id: collaborationRooms.id,
            generation: collaborationRooms.generation,
          })
          .from(collaborationRooms)
          .where(
            and(
              inArray(collaborationRooms.id, roomIds),
              eq(collaborationRooms.state, "active"),
            ),
          );
        for (const room of activeRooms) {
          activeRoomGenerations.add(`${room.id}:${room.generation}`);
        }
      } catch (error) {
        roomStatusAvailable = false;
        logger.warn(
          { err: error },
          "[StudioCollab] Active room lifecycle check failed",
        );
        for (const client of clients) {
          if (client.roomId) {
            client.ws.close(1013, "Room status unavailable");
            this.handleDisconnect(client);
          }
        }
      }
    }

    for (const client of clients) {
      if (client.roomId && !roomStatusAvailable) continue;
      if (
        client.roomId &&
        (client.roomGeneration === null ||
          !activeRoomGenerations.has(
            `${client.roomId}:${client.roomGeneration}`,
          ))
      ) {
        client.ws.close(4001, "Collaboration room ended");
        this.handleDisconnect(client);
        continue;
      }
      if (!validity.get(client.authFingerprint)) {
        client.ws.close(1008, "Authentication expired or revoked");
        this.handleDisconnect(client);
        continue;
      }
      const permission =
        client.inCall && client.publishingMedia ? "write" : "read";
      const accessKey = `${client.userId}\u0000${client.projectId}\u0000${permission}`;
      if (!projectAccess.get(accessKey)) {
        client.ws.close(1008, "Project access revoked");
        this.handleDisconnect(client);
        continue;
      }
      if (!client.isAlive) {
        logger.warn(
          "[StudioCollab] Client unresponsive, terminating connection",
        );
        client.ws.terminate();
        this.handleDisconnect(client);
        continue;
      }
      client.isAlive = false;
      if (client.ws.readyState === WebSocket.OPEN) client.ws.ping();
    }
  }

  private startAwarenessBroadcast(): void {
    this.awarenessInterval = setInterval(async () => {
      for (const [projectId, projectClients] of this.clients.entries()) {
        if (projectClients?.size > 0) {
          try {
            const collaborators =
              await presenceManager?.getCollaborators(projectId);
            this.broadcastToProject(projectId, {
              type: "awareness:update",
              payload: { collaborators },
            });
          } catch (error) {
            logger.warn(
              { err: error },
              `[StudioCollab] Awareness broadcast failed for project ${projectId}:`,
            );
          }
        }
      }
    }, AWARENESS_BROADCAST_INTERVAL_MS);
  }

  getConnectedClients(projectId: string): number {
    return this.clients.get(projectId)?.size || 0;
  }

  getAllConnectedProjects(): string[] {
    return Array.from(this.clients.keys());
  }

  getTotalConnections(): number {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients?.size;
    }
    return total;
  }

  async shutdown(): Promise<void> {
    logger.info("[StudioCollab] Shutting down...");

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.awarenessInterval) {
      clearInterval(this.awarenessInterval);
      this.awarenessInterval = null;
    }

    for (const [_projectId, projectClients] of this.clients.entries()) {
      for (const client of projectClients) {
        this.sendToClient(client?.ws, {
          type: "server:shutdown",
          payload: { message: "Server is shutting down" },
        });
        client?.ws.close(1001, "Server shutdown");
      }
    }

    this.clients.clear();

    if (this.eventBusSubscription) {
      try {
        const unsubscribe = await this.eventBusSubscription;
        unsubscribe();
      } catch (error) {
        logger.warn(
          { err: error },
          "[StudioCollab] Failed to unsubscribe from room events during shutdown:",
        );
      }
    }
    this.eventBusSubscription = null;
    await collaborationEventBus.shutdown();

    for (const [projectId, doc] of this.documents.entries()) {
      await yjsService?.unloadDocument(projectId, doc);
    }
    this.documents.clear();
    this.documentLoads.clear();

    await presenceManager?.shutdown();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info("[StudioCollab] Shutdown complete");
  }
}

export const studioCollabServer = new StudioCollabServer();
