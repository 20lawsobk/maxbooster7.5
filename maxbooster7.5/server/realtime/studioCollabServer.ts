import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';
import { parse as parseCookie } from 'cookie';
import * as Y from 'yjs';
import { yjsService } from '../services/yjsService.js';
import { presenceManager, type PresenceState, type CursorPosition, type SelectionState, type CollaboratorInfo } from './presenceManager.js';
import { jwtAuthService } from '../services/jwtAuthService.js';
import { storage } from '../storage.js';
import { getRedisClient } from '../lib/redisConnectionFactory.js';
import { logger } from '../logger.js';

interface CollabClient {
  ws: WebSocket;
  userId: string;
  displayName: string;
  projectId: string;
  connectionId: string;
  color: string;
  isAlive: boolean;
  lastPing: number;
}

interface CollabMessage {
  type: string;
  payload?: unknown;
}

interface YjsUpdateMessage extends CollabMessage {
  type: 'yjs:update';
  payload: {
    update: string;
  };
}

interface CursorUpdateMessage extends CollabMessage {
  type: 'cursor:update';
  payload: CursorPosition;
}

interface SelectionUpdateMessage extends CollabMessage {
  type: 'selection:update';
  payload: SelectionState | null;
}

interface PresenceUpdateMessage extends CollabMessage {
  type: 'presence:update';
  payload: {
    status: 'online' | 'away' | 'editing';
  };
}

interface AwarenessMessage extends CollabMessage {
  type: 'awareness:update';
  payload: {
    collaborators: CollaboratorInfo[];
  };
}

type IncomingCollabMessage =
  | YjsUpdateMessage
  | CursorUpdateMessage
  | SelectionUpdateMessage
  | PresenceUpdateMessage
  | { type: 'ping' }
  | { type: 'sync:request' };

const PING_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 10000;
const AWARENESS_BROADCAST_INTERVAL_MS = 5000;

export class StudioCollabServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<CollabClient>> = new Map();
  private documents: Map<string, Y.Doc> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private awarenessInterval: NodeJS.Timeout | null = null;

  async initialize(server: Server, path: string = '/ws/studio'): Promise<void> {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', async (request, socket, head) => {
      const pathname = parseUrl(request.url || '').pathname;

      if (pathname?.startsWith(path)) {
        try {
          const authResult = await this.authenticateRequest(request);

          if (!authResult.authenticated) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }

          const projectId = this.extractProjectId(request.url || '');

          if (!projectId) {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
            socket.destroy();
            return;
          }

          const hasAccess = await this.checkProjectAccess(authResult.userId!, projectId);

          if (!hasAccess) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
          }

          this.wss!.handleUpgrade(request, socket, head, (ws) => {
            this.wss!.emit('connection', ws, request, {
              userId: authResult.userId!,
              displayName: authResult.displayName!,
              projectId,
            });
          });
        } catch (error) {
          logger.error('[StudioCollab] Upgrade error:', error);
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
        }
      }
    });

    this.wss.on('connection', async (ws: WebSocket, _request: IncomingMessage, context: { userId: string; displayName: string; projectId: string }) => {
      await this.handleConnection(ws, context.userId, context.displayName, context.projectId);
    });

    this.startPingInterval();
    this.startAwarenessBroadcast();

    logger.info(`[StudioCollab] WebSocket server initialized on path: ${path}`);
  }

  private async authenticateRequest(request: IncomingMessage): Promise<{
    authenticated: boolean;
    userId?: string;
    displayName?: string;
  }> {
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = await jwtAuthService.verifyAccessToken(token);
        if (decoded) {
          const user = await storage.getUser(decoded.userId);
          if (user) {
            return {
              authenticated: true,
              userId: user.id,
              displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            };
          }
        }
      } catch (error) {
        logger.error('[StudioCollab] JWT verification failed:', error);
      }
    }

    const cookies = request.headers.cookie;
    if (cookies) {
      const parsed = parseCookie(cookies);
      const sessionId = parsed['connect.sid'] || parsed['sid'];

      if (sessionId) {
        try {
          const redis = await getRedisClient();
          if (redis) {
            const cleanSessionId = sessionId.startsWith('s:')
              ? sessionId.slice(2).split('.')[0]
              : sessionId.split('.')[0];

            const sessionData = await redis.get(`maxbooster:sess:${cleanSessionId}`);

            if (sessionData) {
              const session = JSON.parse(sessionData);
              const userId = session.passport?.user || session.userId;

              if (userId) {
                const user = await storage.getUser(userId);
                if (user) {
                  return {
                    authenticated: true,
                    userId: user.id,
                    displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
                  };
                }
              }
            }
          }
        } catch (error) {
          logger.error('[StudioCollab] Session verification failed:', error);
        }
      }
    }

    const url = parseUrl(request.url || '', true);
    const tokenParam = url.query.token as string;
    if (tokenParam) {
      try {
        const decoded = await jwtAuthService.verifyAccessToken(tokenParam);
        if (decoded) {
          const user = await storage.getUser(decoded.userId);
          if (user) {
            return {
              authenticated: true,
              userId: user.id,
              displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            };
          }
        }
      } catch (error) {
        logger.error('[StudioCollab] Token param verification failed:', error);
      }
    }

    return { authenticated: false };
  }

  private extractProjectId(url: string): string | null {
    const parsed = parseUrl(url, true);
    const pathname = parsed.pathname || '';

    const match = pathname.match(/\/ws\/studio\/([a-zA-Z0-9-]+)/);
    if (match) {
      return match[1];
    }

    const projectId = parsed.query.projectId as string;
    if (projectId) {
      return projectId;
    }

    return null;
  }

  private async checkProjectAccess(userId: string, projectId: string): Promise<boolean> {
    try {
      const project = await storage.getStudioProject(projectId);
      if (!project) {
        return false;
      }

      if (project.userId === userId) {
        return true;
      }

      const collaborators = await storage.getProjectCollaborators?.(projectId);
      if (collaborators?.some((c: { userId: string }) => c.userId === userId)) {
        return true;
      }

      if ((project as { isPublic?: boolean }).isPublic) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error('[StudioCollab] Project access check failed:', error);
      return false;
    }
  }

  private async handleConnection(
    ws: WebSocket,
    userId: string,
    displayName: string,
    projectId: string
  ): Promise<void> {
    let doc = this.documents.get(projectId);
    if (!doc) {
      doc = await yjsService.loadDocument(projectId);
      this.documents.set(projectId, doc);
    }

    const presence = await presenceManager.addCollaborator(projectId, userId, displayName);

    const client: CollabClient = {
      ws,
      userId,
      displayName,
      projectId,
      connectionId: presence.connectionId,
      color: presence.color,
      isAlive: true,
      lastPing: Date.now(),
    };

    let projectClients = this.clients.get(projectId);
    if (!projectClients) {
      projectClients = new Set();
      this.clients.set(projectId, projectClients);
    }
    projectClients.add(client);

    this.sendToClient(ws, {
      type: 'connected',
      payload: {
        connectionId: presence.connectionId,
        userId,
        displayName,
        color: presence.color,
        projectId,
      },
    });

    const state = Y.encodeStateAsUpdate(doc);
    this.sendToClient(ws, {
      type: 'yjs:sync',
      payload: {
        state: Buffer.from(state).toString('base64'),
      },
    });

    const collaborators = await presenceManager.getCollaborators(projectId);
    this.sendToClient(ws, {
      type: 'awareness:update',
      payload: { collaborators },
    });

    this.broadcastToProject(projectId, {
      type: 'collaborator:joined',
      payload: {
        userId,
        displayName,
        color: presence.color,
      },
    }, client);

    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin !== client) {
        this.sendToClient(ws, {
          type: 'yjs:update',
          payload: {
            update: Buffer.from(update).toString('base64'),
          },
        });
      }
    };

    doc.on('update', updateHandler);

    ws.on('message', async (data) => {
      try {
        const message: IncomingCollabMessage = JSON.parse(data.toString());
        await this.handleMessage(client, message, doc!);
      } catch (error) {
        logger.error('[StudioCollab] Message handling error:', error);
      }
    });

    ws.on('pong', () => {
      client.isAlive = true;
      client.lastPing = Date.now();
    });

    ws.on('close', async () => {
      doc!.off('update', updateHandler);
      await this.handleDisconnect(client);
    });

    ws.on('error', async (error) => {
      logger.error('[StudioCollab] WebSocket error:', error);
      doc!.off('update', updateHandler);
      await this.handleDisconnect(client);
    });

    logger.info(`[StudioCollab] Client connected: ${displayName} (${userId}) to project ${projectId}`);
  }

  private async handleMessage(
    client: CollabClient,
    message: IncomingCollabMessage,
    doc: Y.Doc
  ): Promise<void> {
    switch (message.type) {
      case 'yjs:update': {
        const updateMsg = message as YjsUpdateMessage;
        const update = Buffer.from(updateMsg.payload.update, 'base64');
        Y.applyUpdate(doc, new Uint8Array(update), client);

        this.broadcastToProject(client.projectId, {
          type: 'yjs:update',
          payload: {
            update: updateMsg.payload.update,
            origin: client.userId,
          },
        }, client);
        break;
      }

      case 'cursor:update': {
        const cursorMsg = message as CursorUpdateMessage;
        await presenceManager.updateCursor(
          client.projectId,
          client.userId,
          client.connectionId,
          cursorMsg.payload
        );

        this.broadcastToProject(client.projectId, {
          type: 'cursor:update',
          payload: {
            userId: client.userId,
            cursor: cursorMsg.payload,
          },
        }, client);
        break;
      }

      case 'selection:update': {
        const selectionMsg = message as SelectionUpdateMessage;
        await presenceManager.updateSelection(
          client.projectId,
          client.userId,
          client.connectionId,
          selectionMsg.payload
        );

        this.broadcastToProject(client.projectId, {
          type: 'selection:update',
          payload: {
            userId: client.userId,
            selection: selectionMsg.payload,
          },
        }, client);
        break;
      }

      case 'presence:update': {
        const presenceMsg = message as PresenceUpdateMessage;
        await presenceManager.updateStatus(
          client.projectId,
          client.userId,
          client.connectionId,
          presenceMsg.payload.status
        );

        this.broadcastToProject(client.projectId, {
          type: 'presence:update',
          payload: {
            userId: client.userId,
            status: presenceMsg.payload.status,
          },
        }, client);
        break;
      }

      case 'sync:request': {
        const state = Y.encodeStateAsUpdate(doc);
        this.sendToClient(client.ws, {
          type: 'yjs:sync',
          payload: {
            state: Buffer.from(state).toString('base64'),
          },
        });
        break;
      }

      case 'ping': {
        this.sendToClient(client.ws, { type: 'pong' });
        client.isAlive = true;
        client.lastPing = Date.now();
        break;
      }

      default:
        logger.warn(`[StudioCollab] Unknown message type: ${(message as CollabMessage).type}`);
    }
  }

  private async handleDisconnect(client: CollabClient): Promise<void> {
    const projectClients = this.clients.get(client.projectId);
    if (projectClients) {
      projectClients.delete(client);

      if (projectClients.size === 0) {
        this.clients.delete(client.projectId);

        setTimeout(async () => {
          const remainingClients = this.clients.get(client.projectId);
          if (!remainingClients || remainingClients.size === 0) {
            const doc = this.documents.get(client.projectId);
            if (doc) {
              await yjsService.unloadDocument(client.projectId, false);
              this.documents.delete(client.projectId);
              logger.info(`[StudioCollab] Unloaded document for project ${client.projectId}`);
            }
          }
        }, 60000);
      }
    }

    await presenceManager.removeCollaborator(client.projectId, client.userId, client.connectionId);

    this.broadcastToProject(client.projectId, {
      type: 'collaborator:left',
      payload: {
        userId: client.userId,
        displayName: client.displayName,
      },
    });

    logger.info(`[StudioCollab] Client disconnected: ${client.displayName} (${client.userId}) from project ${client.projectId}`);
  }

  private sendToClient(ws: WebSocket, message: object): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastToProject(projectId: string, message: object, exclude?: CollabClient): void {
    const projectClients = this.clients.get(projectId);
    if (!projectClients) return;

    const messageStr = JSON.stringify(message);

    for (const client of projectClients) {
      if (client !== exclude && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const [projectId, projectClients] of this.clients.entries()) {
        for (const client of projectClients) {
          if (!client.isAlive) {
            logger.warn(`[StudioCollab] Client unresponsive, terminating: ${client.userId}`);
            client.ws.terminate();
            this.handleDisconnect(client);
            continue;
          }

          client.isAlive = false;
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.ping();
          }
        }
      }
    }, PING_INTERVAL_MS);
  }

  private startAwarenessBroadcast(): void {
    this.awarenessInterval = setInterval(async () => {
      for (const [projectId, projectClients] of this.clients.entries()) {
        if (projectClients.size > 0) {
          try {
            const collaborators = await presenceManager.getCollaborators(projectId);
            this.broadcastToProject(projectId, {
              type: 'awareness:update',
              payload: { collaborators },
            });
          } catch (error) {
            logger.error(`[StudioCollab] Awareness broadcast failed for project ${projectId}:`, error);
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
      total += clients.size;
    }
    return total;
  }

  async shutdown(): Promise<void> {
    logger.info('[StudioCollab] Shutting down...');

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.awarenessInterval) {
      clearInterval(this.awarenessInterval);
      this.awarenessInterval = null;
    }

    for (const [projectId, projectClients] of this.clients.entries()) {
      for (const client of projectClients) {
        this.sendToClient(client.ws, {
          type: 'server:shutdown',
          payload: { message: 'Server is shutting down' },
        });
        client.ws.close(1001, 'Server shutdown');
      }
    }

    this.clients.clear();

    for (const [projectId, doc] of this.documents.entries()) {
      await yjsService.unloadDocument(projectId, false);
    }
    this.documents.clear();

    await presenceManager.shutdown();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info('[StudioCollab] Shutdown complete');
  }
}

export const studioCollabServer = new StudioCollabServer();
