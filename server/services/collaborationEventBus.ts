import { createRedisClient, getRedisClient } from "../lib/redisConnectionFactory.js";
import { isPdimConfigured } from "../lib/pdimClient.js";
import { logger } from "../logger.js";

const CHANNEL = "maxbooster:collaboration:room-events";
const MAX_EVENT_BYTES = 16 * 1024;

export interface CollaborationRoomMessageEvent {
  type: "room:message";
  payload: {
    id: string;
    clientMessageId: string;
    senderId: string;
    senderName: string;
    content: string;
    createdAt: string;
  };
}

export type CollaborationEventListener = (
  projectId: string,
  event: CollaborationRoomMessageEvent,
) => void;

interface EventEnvelope {
  projectId: string;
  event: CollaborationRoomMessageEvent;
}

function isRoomMessageEvent(value: unknown): value is CollaborationRoomMessageEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<CollaborationRoomMessageEvent>;
  const payload = event.payload;
  return (
    event.type === "room:message" &&
    !!payload &&
    typeof payload.id === "string" &&
    typeof payload.clientMessageId === "string" &&
    typeof payload.senderId === "string" &&
    typeof payload.senderName === "string" &&
    typeof payload.content === "string" &&
    typeof payload.createdAt === "string"
  );
}

function isEventEnvelope(value: unknown): value is EventEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<EventEnvelope>;
  return (
    typeof envelope.projectId === "string" &&
    envelope.projectId.length > 0 &&
    envelope.projectId.length <= 255 &&
    isRoomMessageEvent(envelope.event)
  );
}

export class CollaborationEventBus {
  private subscriber: Record<string, unknown> | null = null;
  private initialization: Promise<void> | null = null;
  private listeners = new Set<CollaborationEventListener>();

  private async initialize(): Promise<void> {
    if (!isPdimConfigured()) {
      throw new Error("PDIM is required for cross-instance collaboration events");
    }
    if (!this.initialization) {
      this.initialization = (async () => {
        const client = await createRedisClient();
        if (
          !client ||
          typeof (client as any).on !== "function" ||
          typeof (client as any).subscribe !== "function"
        ) {
          throw new Error("PDIM collaboration event subscriber is unavailable");
        }
        this.subscriber = client as Record<string, unknown>;
        (this.subscriber as any).on("message", (channel: string, message: string) => {
          if (channel !== CHANNEL || Buffer.byteLength(message) > MAX_EVENT_BYTES) {
            return;
          }
          try {
            const envelope: unknown = JSON.parse(message);
            if (!isEventEnvelope(envelope)) return;
            for (const listener of this.listeners) {
              try {
                listener(envelope.projectId, envelope.event);
              } catch (error) {
                logger.warn(
                  { projectId: envelope.projectId, err: error },
                  "Collaboration event listener failed",
                );
              }
            }
          } catch (error) {
            logger.warn({ err: error }, "Invalid collaboration event received");
          }
        });
        await (this.subscriber as any).subscribe(CHANNEL);
      })().catch((error) => {
        this.initialization = null;
        this.subscriber = null;
        throw error;
      });
    }
    await this.initialization;
  }

  async subscribe(
    listener: CollaborationEventListener,
  ): Promise<() => void> {
    await this.initialize();
    this.listeners.add(listener);
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.listeners.delete(listener);
    };
  }

  async publishProjectEvent(
    projectId: string,
    event: CollaborationRoomMessageEvent,
  ): Promise<number> {
    if (!isPdimConfigured()) {
      throw new Error("PDIM is required for cross-instance collaboration events");
    }
    if (
      !projectId ||
      projectId.length > 255 ||
      !isRoomMessageEvent(event)
    ) {
      throw new Error("Invalid collaboration event");
    }
    const encoded = JSON.stringify({ projectId, event } satisfies EventEnvelope);
    if (Buffer.byteLength(encoded) > MAX_EVENT_BYTES) {
      throw new Error("Collaboration event exceeds the size limit");
    }
    const publisher = await getRedisClient();
    if (!publisher || typeof (publisher as any).publish !== "function") {
      throw new Error("PDIM collaboration event publisher is unavailable");
    }
    return Number(await (publisher as any).publish(CHANNEL, encoded));
  }

  async shutdown(): Promise<void> {
    const subscriber = this.subscriber as any;
    if (subscriber && this.initialization) {
      await this.initialization.catch(() => undefined);
      await subscriber.unsubscribe?.(CHANNEL);
      await subscriber.quit?.();
    }
    this.listeners.clear();
    this.subscriber = null;
    this.initialization = null;
  }
}

export const collaborationEventBus = new CollaborationEventBus();
