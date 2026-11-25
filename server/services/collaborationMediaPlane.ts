import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { types as MediaTypes } from "mediasoup";

type MediaWorker = Awaited<
  ReturnType<typeof import("mediasoup").createWorker>
>;
type MediaRouter = Awaited<ReturnType<MediaWorker["createRouter"]>>;
type WebRtcTransport = Awaited<
  ReturnType<MediaRouter["createWebRtcTransport"]>
>;
type Producer = Awaited<ReturnType<WebRtcTransport["produce"]>>;
type Consumer = Awaited<ReturnType<WebRtcTransport["consume"]>>;
type MediaKind = Parameters<WebRtcTransport["produce"]>[0]["kind"];
type RtpParameters = Parameters<WebRtcTransport["produce"]>[0]["rtpParameters"];
type DtlsParameters = Parameters<WebRtcTransport["connect"]>[0]["dtlsParameters"];
type RtpCapabilities = MediaRouter["rtpCapabilities"];

export interface MediaCapacityEvidence {
  schemaVersion: 1;
  region: string;
  maxParticipants: number;
  testedParticipants: number;
  testRunId: string;
  measuredAt: string;
  durationSeconds: number;
  loadTestPassed: true;
  turnRelayVerified: true;
}

export interface MediaPlaneAvailability {
  available: boolean;
  state: "unavailable" | "degraded" | "available";
  region: string | null;
  participantLimit: number | null;
  reason: string | null;
}

export interface MediaTransportParameters {
  id: string;
  iceParameters: WebRtcTransport["iceParameters"];
  iceCandidates: WebRtcTransport["iceCandidates"];
  dtlsParameters: WebRtcTransport["dtlsParameters"];
}

interface MediaConfig {
  region: string;
  listenIp: string;
  announcedAddress: string;
  minPort: number;
  maxPort: number;
  turnUrls: string[];
  turnSharedSecret: string;
  capacityEvidencePath: string;
  capacityEvidenceSha256: string;
}

interface MediaPeer {
  roomKey: string;
  roomId: string;
  roomGeneration: number;
  userId: string;
  connectionId: string;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
}

interface MediaRoom {
  id: string;
  generation: number;
  router: MediaRouter;
  peers: Map<string, MediaPeer>;
  producers: Map<string, { producer: Producer; userId: string }>;
}

const MEDIA_CODECS: MediaTypes.RouterRtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48_000,
    channels: 2,
    parameters: { useinbandfec: 1 },
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90_000,
    rtcpFeedback: [
      { type: "nack" },
      { type: "nack", parameter: "pli" },
      { type: "transport-cc" },
    ],
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90_000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
    },
    rtcpFeedback: [
      { type: "nack" },
      { type: "nack", parameter: "pli" },
      { type: "transport-cc" },
    ],
  },
];

const REGION_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_EVIDENCE_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function readConfig(env: NodeJS.ProcessEnv): MediaConfig | null {
  if (env.COLLABORATION_MEDIA_ENABLED !== "true") return null;
  const region = env.COLLABORATION_MEDIA_REGION?.trim() || "";
  const listenIp = env.COLLABORATION_MEDIA_LISTEN_IP?.trim() || "";
  const announcedAddress =
    env.COLLABORATION_MEDIA_ANNOUNCED_ADDRESS?.trim() || "";
  const minPort = parsePositiveInteger(env.COLLABORATION_MEDIA_RTP_MIN_PORT);
  const maxPort = parsePositiveInteger(env.COLLABORATION_MEDIA_RTP_MAX_PORT);
  const turnUrls = (env.COLLABORATION_TURN_URLS || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const turnSharedSecret =
    env.COLLABORATION_TURN_SHARED_SECRET?.trim() || "";
  const capacityEvidencePath =
    env.COLLABORATION_MEDIA_CAPACITY_REPORT?.trim() || "";
  const capacityEvidenceSha256 =
    env.COLLABORATION_MEDIA_CAPACITY_REPORT_SHA256?.trim() || "";

  if (
    !REGION_PATTERN.test(region) ||
    !listenIp ||
    !announcedAddress ||
    !minPort ||
    !maxPort ||
    maxPort <= minPort ||
    maxPort - minPort < 100 ||
    turnUrls.length === 0 ||
    turnUrls.some((url) => !/^turns?:[^\s/]+$/i.test(url)) ||
    !turnSharedSecret ||
    !capacityEvidencePath ||
    !SHA256_PATTERN.test(capacityEvidenceSha256)
  ) {
    return null;
  }

  const allowedReportDirectory = path.resolve(
    process.cwd(),
    "reports",
    "collaboration-media",
  );
  const resolvedReportPath = path.resolve(process.cwd(), capacityEvidencePath);
  if (
    resolvedReportPath !== allowedReportDirectory &&
    !resolvedReportPath.startsWith(`${allowedReportDirectory}${path.sep}`)
  ) {
    return null;
  }

  return {
    region,
    listenIp,
    announcedAddress,
    minPort,
    maxPort,
    turnUrls,
    turnSharedSecret,
    capacityEvidencePath: resolvedReportPath,
    capacityEvidenceSha256: capacityEvidenceSha256.toLowerCase(),
  };
}

function roomKey(roomId: string, generation: number): string {
  return `${roomId}:${generation}`;
}

function isCapacityEvidence(value: unknown): value is MediaCapacityEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Partial<MediaCapacityEvidence>;
  const measuredAt = Date.parse(evidence.measuredAt || "");
  return (
    evidence.schemaVersion === 1 &&
    typeof evidence.region === "string" &&
    Number.isSafeInteger(evidence.maxParticipants) &&
    Number(evidence.maxParticipants) >= 2 &&
    Number.isSafeInteger(evidence.testedParticipants) &&
    Number(evidence.testedParticipants) >= Number(evidence.maxParticipants) &&
    typeof evidence.testRunId === "string" &&
    evidence.testRunId.length >= 8 &&
    Number.isFinite(measuredAt) &&
    measuredAt <= Date.now() &&
    Date.now() - measuredAt <= MAX_EVIDENCE_AGE_MS &&
    Number.isFinite(evidence.durationSeconds) &&
    Number(evidence.durationSeconds) >= 300 &&
    evidence.loadTestPassed === true &&
    evidence.turnRelayVerified === true
  );
}

export class CollaborationMediaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollaborationMediaUnavailableError";
  }
}

export class CollaborationMediaPlane {
  private worker: MediaWorker | null = null;
  private workerStart: Promise<MediaWorker> | null = null;
  private rooms = new Map<string, MediaRoom>();
  private roomLoads = new Map<string, Promise<MediaRoom>>();
  private peers = new Map<string, MediaPeer>();
  private lastWorkerError: string | null = null;

  async prepare(): Promise<MediaPlaneAvailability> {
    if (process.env.COLLABORATION_MEDIA_ENABLED !== "true") {
      return this.getAvailability();
    }
    try {
      const { config } = await this.getConfig();
      await this.ensureWorker(config);
    } catch {
      // Regional media remains explicitly unavailable until its configuration,
      // relay check, capacity evidence, and native worker are all valid.
    }
    return this.getAvailability();
  }

  async getAvailability(
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<MediaPlaneAvailability> {
    if (env.COLLABORATION_MEDIA_ENABLED !== "true") {
      return {
        available: false,
        state: "unavailable",
        region: null,
        participantLimit: null,
        reason: "No regional media service is enabled.",
      };
    }
    const config = readConfig(env);
    if (!config) {
      return {
        available: false,
        state: "unavailable",
        region: env.COLLABORATION_MEDIA_REGION || null,
        participantLimit: null,
        reason:
          "Regional SFU, public address, relay, or verified capacity configuration is incomplete.",
      };
    }

    try {
      const raw = await readFile(config.capacityEvidencePath);
      const digest = createHash("sha256").update(raw).digest("hex");
      if (digest !== config.capacityEvidenceSha256) {
        return {
          available: false,
          state: "unavailable",
          region: config.region,
          participantLimit: null,
          reason: "The regional load-test evidence fingerprint does not match.",
        };
      }
      const evidence: unknown = JSON.parse(raw.toString("utf8"));
      if (!isCapacityEvidence(evidence) || evidence.region !== config.region) {
        return {
          available: false,
          state: "unavailable",
          region: config.region,
          participantLimit: null,
          reason: "The regional load-test or relay verification evidence is invalid or stale.",
        };
      }
      if (this.lastWorkerError) {
        return {
          available: false,
          state: "unavailable",
          region: config.region,
          participantLimit: null,
          reason: "The regional SFU worker is not healthy.",
        };
      }
      return {
        available: this.worker !== null && !this.worker.died,
        state: this.worker !== null && !this.worker.died ? "available" : "degraded",
        region: config.region,
        participantLimit: evidence.maxParticipants,
        reason:
          this.worker && !this.worker.died
            ? null
            : "Regional media capacity is configured but its SFU worker is not running.",
      };
    } catch {
      return {
        available: false,
        state: "unavailable",
        region: config.region,
        participantLimit: null,
        reason: "The regional capacity evidence could not be read.",
      };
    }
  }

  private async getConfig(): Promise<{
    config: MediaConfig;
    evidence: MediaCapacityEvidence;
  }> {
    const config = readConfig(process.env);
    if (!config) {
      throw new CollaborationMediaUnavailableError(
        "Regional audio/video service is not configured.",
      );
    }
    const available = await this.getAvailability();
    if (
      !available.region ||
      !available.participantLimit ||
      available.reason === "The regional load-test evidence fingerprint does not match."
    ) {
      throw new CollaborationMediaUnavailableError(
        available.reason || "Regional media is not ready.",
      );
    }
    const raw = await readFile(config.capacityEvidencePath);
    const evidence: unknown = JSON.parse(raw.toString("utf8"));
    if (
      createHash("sha256").update(raw).digest("hex") !==
        config.capacityEvidenceSha256 ||
      !isCapacityEvidence(evidence) ||
      evidence.region !== config.region
    ) {
      throw new CollaborationMediaUnavailableError(
        "Regional capacity or relay evidence failed verification.",
      );
    }
    return { config, evidence };
  }

  private async ensureWorker(config: MediaConfig): Promise<MediaWorker> {
    if (this.worker && !this.worker.died) return this.worker;
    if (!this.workerStart) {
      this.lastWorkerError = null;
      this.workerStart = import("mediasoup")
        .then(({ createWorker }) =>
          createWorker({
          logLevel: "warn",
          rtcMinPort: config.minPort,
          rtcMaxPort: config.maxPort,
          }),
        )
        .then((worker) => {
          worker.on("died", () => {
            this.lastWorkerError = "SFU worker terminated unexpectedly";
            this.worker = null;
            for (const room of this.rooms.values()) {
              if (!room.router.closed) room.router.close();
            }
            this.rooms.clear();
            this.roomLoads.clear();
            this.peers.clear();
          });
          this.worker = worker;
          return worker;
        })
        .catch((error) => {
          this.workerStart = null;
          this.lastWorkerError =
            error instanceof Error ? error.message : "SFU worker failed";
          throw new CollaborationMediaUnavailableError(
            "Regional SFU worker could not start.",
          );
        });
    }
    try {
      return await this.workerStart;
    } finally {
      this.workerStart = null;
    }
  }

  async join(input: {
    roomId: string;
    roomGeneration: number;
    userId: string;
    connectionId: string;
  }): Promise<{
    region: string;
    participantLimit: number;
    routerRtpCapabilities: RtpCapabilities;
    iceServers: RTCIceServer[];
    participants: Array<{ userId: string }>;
  }> {
    const { config, evidence } = await this.getConfig();
    const worker = await this.ensureWorker(config);
    const key = roomKey(input.roomId, input.roomGeneration);
    let room = this.rooms.get(key);
    if (!room) {
      let roomLoad = this.roomLoads.get(key);
      if (!roomLoad) {
        roomLoad = worker
          .createRouter({ mediaCodecs: MEDIA_CODECS })
          .then((router) => {
            const created: MediaRoom = {
              id: input.roomId,
              generation: input.roomGeneration,
              router,
              peers: new Map(),
              producers: new Map(),
            };
            this.rooms.set(key, created);
            return created;
          });
        this.roomLoads.set(key, roomLoad);
      }
      try {
        room = await roomLoad;
      } finally {
        if (this.roomLoads.get(key) === roomLoad) {
          this.roomLoads.delete(key);
        }
      }
    }
    const existing = this.peers.get(input.connectionId);
    if (
      existing &&
      existing.roomKey === key &&
      existing.userId === input.userId
    ) {
      return this.joinResponse(room, config, evidence);
    }
    if (existing) {
      throw new CollaborationMediaUnavailableError(
        "This connection is already assigned to a different call.",
      );
    }

    const activeUsers = new Set(
      Array.from(room.peers.values(), (peer) => peer.userId),
    );
    if (
      !activeUsers.has(input.userId) &&
      activeUsers.size >= evidence.maxParticipants
    ) {
      throw new CollaborationMediaUnavailableError(
        "The room has reached its measured participant limit.",
      );
    }

    const peer: MediaPeer = {
      roomKey: key,
      roomId: input.roomId,
      roomGeneration: input.roomGeneration,
      userId: input.userId,
      connectionId: input.connectionId,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    };
    room.peers.set(input.connectionId, peer);
    this.peers.set(input.connectionId, peer);
    return this.joinResponse(room, config, evidence);
  }

  private joinResponse(
    room: MediaRoom,
    config: MediaConfig,
    evidence: MediaCapacityEvidence,
  ) {
    const expiresAt = Math.floor(Date.now() / 1000) + 86_400;
    const username = `${expiresAt}:${randomUUID()}`;
    const credential = createHmac("sha1", config.turnSharedSecret)
      .update(username)
      .digest("base64");
    return {
      region: config.region,
      participantLimit: evidence.maxParticipants,
      routerRtpCapabilities: room.router.rtpCapabilities,
      iceServers: [
        {
          urls: config.turnUrls,
          username,
          credential,
        },
      ],
      participants: Array.from(
        new Map(
          Array.from(room.peers.values(), (peer) => [
            peer.userId,
            { userId: peer.userId },
          ]),
        ).values(),
      ),
      producers: this.listRoomProducers(room.id, room.generation),
    };
  }

  async createTransport(
    connectionId: string,
  ): Promise<MediaTransportParameters> {
    const peer = this.requirePeer(connectionId);
    const { config } = await this.getConfig();
    const room = this.rooms.get(peer.roomKey);
    if (!room) throw new CollaborationMediaUnavailableError("Call room expired.");
    const transport = await room.router.createWebRtcTransport({
      listenInfos: [
        {
          protocol: "udp",
          ip: config.listenIp,
          announcedAddress: config.announcedAddress,
        },
        {
          protocol: "tcp",
          ip: config.listenIp,
          announcedAddress: config.announcedAddress,
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      enableBwe: true,
      initialAvailableOutgoingBitrate: 1_000_000,
      maxIncomingBitrate: 2_000_000,
    });
    peer.transports.set(transport.id, transport);
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(
    connectionId: string,
    transportId: string,
    dtlsParameters: DtlsParameters,
  ): Promise<void> {
    await this.requireTransport(connectionId, transportId).connect({
      dtlsParameters,
    });
  }

  async produce(
    connectionId: string,
    transportId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
  ): Promise<{ id: string; kind: MediaKind; userId: string }> {
    if (kind !== "audio" && kind !== "video") {
      throw new Error("Only audio and video producers are supported.");
    }
    const peer = this.requirePeer(connectionId);
    const room = this.requireRoom(peer.roomKey);
    const producer = await this.requireTransport(
      connectionId,
      transportId,
    ).produce({ kind, rtpParameters });
    peer.producers.set(producer.id, producer);
    room.producers.set(producer.id, { producer, userId: peer.userId });
    producer.on("transportclose", () => {
      peer.producers.delete(producer.id);
      room.producers.delete(producer.id);
    });
    return { id: producer.id, kind: producer.kind, userId: peer.userId };
  }

  async consume(
    connectionId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: MediaTypes.RtpCapabilities,
  ): Promise<{
    id: string;
    producerId: string;
    kind: MediaKind;
    rtpParameters: RtpParameters;
    type: Consumer["type"];
  }> {
    const peer = this.requirePeer(connectionId);
    const room = this.requireRoom(peer.roomKey);
    const source = room.producers.get(producerId);
    if (!source || source.userId === peer.userId) {
      throw new Error("Requested media producer is not available.");
    }
    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error("This device cannot receive the requested media stream.");
    }
    const consumer = await this.requireTransport(
      connectionId,
      transportId,
    ).consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });
    peer.consumers.set(consumer.id, consumer);
    consumer.on("transportclose", () => peer.consumers.delete(consumer.id));
    return {
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
    };
  }

  async resumeConsumer(connectionId: string, consumerId: string): Promise<void> {
    const consumer = this.requirePeer(connectionId).consumers.get(consumerId);
    if (!consumer) throw new Error("Consumer is not part of this call.");
    await consumer.resume();
  }

  listRoomProducers(
    roomId: string,
    roomGeneration: number,
  ): Array<{ producerId: string; userId: string; kind: MediaKind }> {
    const room = this.rooms.get(roomKey(roomId, roomGeneration));
    if (!room) return [];
    return Array.from(room.producers.entries()).map(([producerId, item]) => ({
      producerId,
      userId: item.userId,
      kind: item.producer.kind,
    }));
  }

  isJoined(connectionId: string): boolean {
    return this.peers.has(connectionId);
  }

  async leave(connectionId: string): Promise<void> {
    const peer = this.peers.get(connectionId);
    if (!peer) return;
    const room = this.rooms.get(peer.roomKey);
    this.peers.delete(connectionId);
    room?.peers.delete(connectionId);
    for (const consumer of peer.consumers.values()) consumer.close();
    for (const producer of peer.producers.values()) {
      room?.producers.delete(producer.id);
      producer.close();
    }
    for (const transport of peer.transports.values()) transport.close();
    if (room && room.peers.size === 0) {
      if (!room.router.closed) room.router.close();
      this.rooms.delete(peer.roomKey);
    }
  }

  async closeRoom(roomId: string, generation: number): Promise<void> {
    const key = roomKey(roomId, generation);
    const room = this.rooms.get(key);
    if (!room) return;
    for (const connectionId of Array.from(room.peers.keys())) {
      await this.leave(connectionId);
    }
    if (!room.router.closed) room.router.close();
    this.rooms.delete(key);
  }

  private requirePeer(connectionId: string): MediaPeer {
    const peer = this.peers.get(connectionId);
    if (!peer) throw new Error("Join the call before using media transports.");
    return peer;
  }

  private requireRoom(key: string): MediaRoom {
    const room = this.rooms.get(key);
    if (!room) throw new Error("Call room is no longer active.");
    return room;
  }

  private requireTransport(
    connectionId: string,
    transportId: string,
  ): WebRtcTransport {
    const transport = this.requirePeer(connectionId).transports.get(transportId);
    if (!transport || transport.closed) {
      throw new Error("WebRTC transport is unavailable.");
    }
    return transport;
  }

  async shutdown(): Promise<void> {
    for (const room of this.rooms.values()) {
      if (!room.router.closed) room.router.close();
    }
    this.rooms.clear();
    this.roomLoads.clear();
    this.peers.clear();
    const worker = this.worker;
    if (worker && !worker.subprocessClosed) {
      const subprocessClosed = new Promise<void>((resolve) => {
        worker.once("subprocessclose", resolve);
      });
      worker.close();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        subprocessClosed,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, 2_000);
        }),
      ]);
      if (timeout) clearTimeout(timeout);
    } else {
      worker?.close();
    }
    this.worker = null;
    this.workerStart = null;
    this.lastWorkerError = null;
  }
}

export const collaborationMediaPlane = new CollaborationMediaPlane();
