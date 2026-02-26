import Redis from 'ioredis';
import { logger } from '../logger.js';

const CHANNEL_USER = 'ws:user:notify';
const CHANNEL_BROADCAST = 'ws:broadcast';

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let _ready = false;

type UserNotifyHandler = (userId: string, notification: object) => void;
type BroadcastHandler = (notification: object) => void;

let onUserNotify: UserNotifyHandler | null = null;
let onBroadcast: BroadcastHandler | null = null;

export function registerHandlers(
  userHandler: UserNotifyHandler,
  broadcastHandler: BroadcastHandler
): void {
  onUserNotify = userHandler;
  onBroadcast = broadcastHandler;
}

export async function initRedisPubSub(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('[WS PubSub] REDIS_URL not set — cross-instance broadcasting disabled');
    return;
  }

  const makeClient = () =>
    new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 300, 3000);
      },
    });

  try {
    publisher = makeClient();
    subscriber = makeClient();

    subscriber.on('message', (channel: string, message: string) => {
      try {
        const payload = JSON.parse(message);
        if (channel === CHANNEL_USER && onUserNotify) {
          onUserNotify(payload.userId, payload.notification);
        } else if (channel === CHANNEL_BROADCAST && onBroadcast) {
          onBroadcast(payload.notification);
        }
      } catch {
        // ignore malformed messages
      }
    });

    await subscriber.subscribe(CHANNEL_USER, CHANNEL_BROADCAST);
    _ready = true;
    logger.info('✅ [WS PubSub] Redis Pub/Sub active — WebSocket broadcasting is cross-instance');
  } catch (err: any) {
    logger.warn(`[WS PubSub] Failed to init Redis Pub/Sub: ${err.message} — single-instance only`);
    publisher = null;
    subscriber = null;
    _ready = false;
  }
}

export function isReady(): boolean {
  return _ready;
}

export async function publishUserNotification(userId: string, notification: object): Promise<void> {
  if (!publisher || !_ready) return;
  try {
    await publisher.publish(CHANNEL_USER, JSON.stringify({ userId, notification }));
  } catch {
    // silent — local delivery still works
  }
}

export async function publishBroadcast(notification: object): Promise<void> {
  if (!publisher || !_ready) return;
  try {
    await publisher.publish(CHANNEL_BROADCAST, JSON.stringify({ notification }));
  } catch {
    // silent
  }
}

export async function closePubSub(): Promise<void> {
  if (subscriber) await subscriber.quit();
  if (publisher) await publisher.quit();
  subscriber = null;
  publisher = null;
  _ready = false;
}
