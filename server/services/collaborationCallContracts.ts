import { z } from "zod";

const requestId = z.string().uuid();
const transportId = z.string().min(1).max(128);
const producerId = z.string().min(1).max(128);
const consumerId = z.string().min(1).max(128);
const rtpParameters = z.record(z.string(), z.unknown());
const rtpCapabilities = z.record(z.string(), z.unknown());
const dtlsParameters = z
  .object({
    role: z.enum(["auto", "client", "server"]).optional(),
    fingerprints: z
      .array(
        z
          .object({
            algorithm: z.enum([
              "sha-1",
              "sha-224",
              "sha-256",
              "sha-384",
              "sha-512",
            ]),
            value: z.string().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();

export const collaborationCallRequestSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("call:join"),
      requestId,
      payload: z.object({}).strict().default({}),
    })
    .strict(),
  z
    .object({
      type: z.literal("call:create-transport"),
      requestId,
      payload: z
        .object({ direction: z.enum(["send", "receive"]) })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("call:connect-transport"),
      requestId,
      payload: z
        .object({ transportId, dtlsParameters })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("call:produce"),
      requestId,
      payload: z
        .object({
          transportId,
          kind: z.enum(["audio", "video"]),
          rtpParameters,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("call:consume"),
      requestId,
      payload: z
        .object({ transportId, producerId, rtpCapabilities })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("call:resume-consumer"),
      requestId,
      payload: z.object({ consumerId }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("call:media-state"),
      requestId,
      payload: z
        .object({ audioEnabled: z.boolean(), videoEnabled: z.boolean() })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("call:leave"),
      requestId,
      payload: z.object({}).strict().default({}),
    })
    .strict(),
]);

export type CollaborationCallRequest = z.infer<
  typeof collaborationCallRequestSchema
>;

