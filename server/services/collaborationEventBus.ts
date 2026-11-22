import { createRedisClient, getRedisClient } from "../lib/redisConnectionFactory.js";
import { isPdimConfigured } from "../lib/pdimClient.js";
import { logger } from "../logger.js";

const CHANNEL_PREFIX = "maxbooster:collaboration:events:";
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

type EventCallback = (event: CollaborationRoomMessageEvent) => void;

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

export class CollaborationEventBus {
  private subscriber: Record<string, unknown> | null = null;
  private initialization: Promise<void> | null = null;
  private callbacks = new Map<string, Set<EventCallback>>();
  private subscriptions = new Map<string, Promise<void>>();
  private subscribedProjects = new Set<string>();

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
          if (!channel?.startsWith(CHANNEL_PREFIX)) return;
          const projectId = channel.slice(CHANNEL_PREFIX.length);
          if (!projectId || Buffer.byteLength(message) > MAX_EVENT_BYTES) return;
          try {
            const event: unknown = JSON.parse(message);
            if (!isRoomMessageEvent(event)) return;
            for (const callback of this.callbacks.get(projectId) ?? []) {
              try {
                callback(event);
              } catch (error) {
                logger.warn(
                  { projectId, err: error },
                  "Collaboration event subscriber callback failed",
                );
              }
            }
          } catch (error) {
            logger.warn(
              { projectId, err: error },
              "Invalid collaboration event received from PDIM",
            );
          }
        });
      })().catch((error) => {
        this.initialization = null;
        throw error;
      });
    }
    await this.initialization;
  }

  async subscribeToProject(
    projectId: string,
    callback: EventCallback,
  ): Promise<() => Promise<void>> {
    if (!projectId || projectId.length > 255) {
      throw new Error("A valid collaboration project ID is required");
    }
    await this.initialize();
    let callbacks = this.callbacks.get(projectId);
    if (!callbacks) {
      callbacks = new Set();
      this.callbacks.set(projectId, callbacks);
    }
    callbacks.add(callback);

    if (!this.subscribedProjects.has(projectId)) {
      let subscription = this.subscriptions.get(projectId);
      if (!subscription) {
        subscription = Promise.resolve()
          .then(() => (this.subscriber as any).subscribe(`${CHANNEL_PREFIX}${projectId}`))
          .then(() => {
            this.subscribedProjects.add(projectId);
          });
        this.subscriptions.set(projectId, subscription);
      }
      try {
        await subscription;
      } catch (error) {
        callbacks.delete(callback);
        if (!callbacks.size) this.callbacks.delete(projectId);
        throw error;
      } finally {
        if (this.subscriptions.get(projectId) === subscription) {
          this.subscriptions.delete(projectId);
        }
      }
    }

    let unsubscribed = false;
    return async () => {
      if (unsubscribed) return;
      unsubscribed = true;
      const current = this.callbacks.get(projectId);
      current?.delete(callback);
      if (current?.size) return;
      this.callbacks.delete(projectId);
      const pending = this.subscriptions.get(projectId);
      if (pending) await pending.catch(() => undefined);
      if (!this.subscribedProjects.has(projectId) || !this.subscriber) return;
      await (this.subscriber as any).unsubscribe(`${CHANNEL_PREFIX}${projectId}`);
      this.subscribedProjects.delete(projectId);
      this.subscriptions.delete(projectId);
    };
  }

  async publishProjectEvent(
    projectId: string,
    event: CollaborationRoomMessageEvent,
  ): Promise<number> {
    if (!isPdimConfigured()) {
      throw new Error("PDIM is required for cross-instance collaboration events");
    }
    if (!projectId || projectId.length > 255 || !isRoomMessageEvent(event)) {
      throw new Error("Invalid collaboration event");
    }
    const encoded = JSON.stringify(event);
    if (Buffer.byteLength(encoded) > MAX_EVENT_BYTES) {
      throw new Error("Collaboration event exceeds the size limit");
    }
    const publisher = await getRedisClient();
    if (!publisher || typeof (publisher as any).publish !== "function") {
      throw new Error("PDIM collaboration event publisher is unavailable");
    }
    return Number(
      await (publisher as any).publish(`${CHANNEL_PREFIX}${projectId}`, encoded),
    );
  }
}

export const collaborationEventBus = new CollaborationEventBus();
