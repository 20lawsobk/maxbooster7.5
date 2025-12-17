import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
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

function initializeNotificationServer(httpServer: HttpServer): void {
  notificationWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = parseUrl(request.url || '').pathname;

    // Handle general /ws path for notifications
    if (pathname === '/ws') {
      notificationWss!.handleUpgrade(request, socket, head, (ws) => {
        notificationClients.add(ws);
        
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            // Echo back pings with pong
            if (message.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
          } catch (e) {
            // Ignore parse errors
          }
        });

        ws.on('close', () => {
          notificationClients.delete(ws);
        });

        ws.on('error', () => {
          notificationClients.delete(ws);
        });

        // Send welcome message
        ws.send(JSON.stringify({ 
          type: 'connected', 
          message: 'Connected to Max Booster notifications',
          timestamp: Date.now()
        }));
      });
    }
  });

  logger.info('General notification WebSocket server initialized at /ws');
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
