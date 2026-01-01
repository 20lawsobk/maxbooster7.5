import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
import { parse as parseCookie } from 'cookie';
import { logger } from '../logger.js';

export { studioCollabServer, StudioCollabServer } from './studioCollabServer.js';
export {
  presenceManager,
  PresenceManager,
  type PresenceState,
  type CursorPosition,
  type SelectionState,
  type PresenceStatus,
  type CollaboratorInfo,
} from './presenceManager.js';

// General notification WebSocket server
let notificationWss: WebSocketServer | null = null;
const notificationClients: Set<WebSocket> = new Set();
const userConnections: Map<string, Set<WebSocket>> = new Map();

// Session store reference - set by main server during initialization
let sessionStore: any = null;

export function setSessionStore(store: any): void {
  sessionStore = store;
  logger.info('WebSocket session store configured');
}

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAuthenticated?: boolean;
}

async function authenticateFromSession(request: IncomingMessage): Promise<string | null> {
  try {
    const cookies = parseCookie(request.headers.cookie || '');
    const sessionId = cookies.sessionId;
    
    if (!sessionId || !sessionStore) {
      return null;
    }

    // Parse the signed session ID (format: s:<sessionId>.<signature> or just sessionId)
    let rawSessionId = sessionId;
    if (sessionId.startsWith('s:')) {
      rawSessionId = sessionId.slice(2).split('.')[0];
    }

    return new Promise((resolve) => {
      sessionStore.get(rawSessionId, (err: any, session: any) => {
        if (err || !session) {
          resolve(null);
          return;
        }
        
        const userId = session.passport?.user || session.userId;
        resolve(userId || null);
      });
    });
  } catch (error) {
    logger.error('WebSocket session auth error:', error);
    return null;
  }
}

function initializeNotificationServer(httpServer: HttpServer): void {
  notificationWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (request, socket, head) => {
    const pathname = parseUrl(request.url || '').pathname;

    // Handle general /ws path for notifications
    if (pathname === '/ws') {
      // Authenticate using session cookie before upgrading
      const userId = await authenticateFromSession(request);
      
      notificationWss!.handleUpgrade(request, socket, head, (ws: AuthenticatedWebSocket) => {
        notificationClients.add(ws);
        
        // Set authenticated user from server-side session validation
        if (userId) {
          ws.userId = userId;
          ws.isAuthenticated = true;
          
          if (!userConnections.has(userId)) {
            userConnections.set(userId, new Set());
          }
          userConnections.get(userId)!.add(ws);
          
          ws.send(JSON.stringify({ type: 'auth_success', userId }));
          logger.info(`WebSocket authenticated via session for user: ${userId}`);
        }
        
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            // Echo back pings with pong
            if (message.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
            // Ignore client-side auth attempts - authentication is server-side only
            if (message.type === 'auth') {
              if (!ws.isAuthenticated) {
                ws.send(JSON.stringify({ 
                  type: 'auth_error', 
                  message: 'Authentication failed. Please refresh the page.' 
                }));
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        });

        ws.on('close', () => {
          notificationClients.delete(ws);
          if (ws.userId) {
            const connections = userConnections.get(ws.userId);
            if (connections) {
              connections.delete(ws);
              if (connections.size === 0) {
                userConnections.delete(ws.userId);
              }
            }
          }
        });

        ws.on('error', () => {
          notificationClients.delete(ws);
          if (ws.userId) {
            const connections = userConnections.get(ws.userId);
            if (connections) {
              connections.delete(ws);
              if (connections.size === 0) {
                userConnections.delete(ws.userId);
              }
            }
          }
        });

        // Send welcome message
        ws.send(JSON.stringify({ 
          type: 'connected', 
          message: 'Connected to Max Booster notifications',
          authenticated: !!userId,
          timestamp: Date.now()
        }));
      });
    }
  });

  // Register global broadcast function for notification service
  (global as any).broadcastNotification = sendNotificationToUser;

  logger.info('General notification WebSocket server initialized at /ws');
}

// Send notification to a specific user
export function sendNotificationToUser(userId: string, notification: object): void {
  const connections = userConnections.get(userId);
  if (connections && connections.size > 0) {
    const message = JSON.stringify({ type: 'notification', data: notification });
    connections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    logger.info(`Sent notification to user ${userId} (${connections.size} connections)`);
  }
}

// Broadcast to all notification clients
export function broadcastNotification(notification: object): void {
  const message = JSON.stringify({ type: 'notification', data: notification });
  notificationClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Initialize the realtime collaboration server
export async function initializeRealtimeServer(httpServer: HttpServer): Promise<void> {
  try {
    // Initialize general notification WebSocket first
    initializeNotificationServer(httpServer);

    const { studioCollabServer } = await import('./studioCollabServer.js');
    
    // Initialize the collaboration server with the HTTP server for WebSocket upgrades
    if (studioCollabServer && typeof studioCollabServer.initialize === 'function') {
      await studioCollabServer.initialize(httpServer);
      logger.info('Studio collaboration WebSocket server initialized');
    } else {
      // The collaboration server may auto-initialize, just log status
      logger.info('Studio collaboration server ready');
    }
    
    // Initialize presence manager
    const { presenceManager } = await import('./presenceManager.js');
    if (presenceManager) {
      logger.info('Presence manager ready');
    }
  } catch (error) {
    logger.warn('Failed to initialize realtime server:', error);
  }
}
