import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";
import type { types as MediaClientTypes } from "mediasoup-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  CollaborationCallEvent,
  CollaborationMediaAvailability,
} from "@/hooks/useCollaborationDocument";

type MediaDevice = import("mediasoup-client").Device;
type MediaTransport = MediaClientTypes.Transport;
type MediaProducer = MediaClientTypes.Producer;
type MediaConsumer = MediaClientTypes.Consumer;

interface MediaTransportParameters {
  id: string;
  iceParameters: MediaClientTypes.IceParameters;
  iceCandidates: MediaClientTypes.IceCandidate[];
  dtlsParameters: MediaClientTypes.DtlsParameters;
}

interface CallJoinResult {
  region: string;
  participantLimit: number;
  routerRtpCapabilities: MediaClientTypes.RtpCapabilities;
  iceServers: RTCIceServer[];
  participants: Array<{ userId: string }>;
  producers: Array<{ producerId: string; userId: string; kind: "audio" | "video" }>;
}

interface CollaborationCallControlsProps {
  availability: CollaborationMediaAvailability;
  callEvents: CollaborationCallEvent[];
  clearCallEvents: () => void;
  connectionState: string;
  currentUserId: string;
  requestCall: <T>(
    type: string,
    payload?: Record<string, unknown>,
  ) => Promise<T>;
}

type CallState = "idle" | "connecting" | "connected" | "reconnecting";
interface RemoteParticipant {
  userId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  stream: MediaStream;
}

interface ProducerAnnouncement {
  producerId: string;
  userId: string;
  kind: "audio" | "video";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The call could not start.";
}

export function CollaborationCallControls({
  availability,
  callEvents,
  clearCallEvents,
  connectionState,
  currentUserId,
  requestCall,
}: CollaborationCallControlsProps) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callError, setCallError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [hasVideoTrack, setHasVideoTrack] = useState(true);
  const [participants, setParticipants] = useState<string[]>([]);
  const [remoteParticipants, setRemoteParticipants] = useState<
    RemoteParticipant[]
  >([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const deviceRef = useRef<MediaDevice | null>(null);
  const sendTransportRef = useRef<MediaTransport | null>(null);
  const receiveTransportRef = useRef<MediaTransport | null>(null);
  const producersRef = useRef<MediaProducer[]>([]);
  const consumersRef = useRef<Map<string, MediaConsumer>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const consumedProducerIds = useRef<Set<string>>(new Set());
  const pendingProducers = useRef<Map<string, ProducerAnnouncement>>(new Map());
  const joinCallRef = useRef<() => Promise<void>>(async () => undefined);
  const mounted = useRef(true);
  const processedEvents = useRef(0);

  const stopLocalMedia = useCallback(() => {
    for (const producer of producersRef.current) producer.close();
    producersRef.current = [];
    for (const consumer of consumersRef.current.values()) consumer.close();
    consumersRef.current.clear();
    sendTransportRef.current?.close();
    receiveTransportRef.current?.close();
    sendTransportRef.current = null;
    receiveTransportRef.current = null;
    deviceRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamsRef.current.clear();
    consumedProducerIds.current.clear();
    pendingProducers.current.clear();
    if (mounted.current) {
      setLocalStream(null);
      setRemoteParticipants([]);
      setParticipants([]);
      setHasVideoTrack(true);
    }
  }, []);

  const consumeProducer = useCallback(
    async (producer: {
      producerId: string;
      userId: string;
      kind: "audio" | "video";
    }) => {
      const device = deviceRef.current;
      const receiveTransport = receiveTransportRef.current;
      if (!device || !receiveTransport) {
        pendingProducers.current.set(producer.producerId, producer);
        return;
      }
      if (
        producer.userId === currentUserId ||
        consumedProducerIds.current.has(producer.producerId)
      ) {
        return;
      }
      consumedProducerIds.current.add(producer.producerId);
      try {
        const parameters = await requestCall<{
          id: string;
          producerId: string;
          kind: "audio" | "video";
          rtpParameters: MediaClientTypes.RtpParameters;
        }>("call:consume", {
          transportId: receiveTransport.id,
          producerId: producer.producerId,
          rtpCapabilities: device.recvRtpCapabilities,
        });
        const consumer = await receiveTransport.consume({
          id: parameters.id,
          producerId: parameters.producerId,
          kind: parameters.kind,
          rtpParameters: parameters.rtpParameters,
        });
        consumersRef.current.set(consumer.id, consumer);
        const stream =
          remoteStreamsRef.current.get(producer.userId) || new MediaStream();
        stream.addTrack(consumer.track);
        remoteStreamsRef.current.set(producer.userId, stream);
        if (mounted.current) {
          setRemoteParticipants((current) => {
            const existing = current.find(
              (participant) => participant.userId === producer.userId,
            );
            if (existing) {
              return current.map((participant) =>
                participant.userId === producer.userId
                  ? { ...participant, stream }
                  : participant,
              );
            }
            return [
              ...current,
              {
                userId: producer.userId,
                audioEnabled: true,
                videoEnabled: true,
                stream,
              },
            ];
          });
        }
        await requestCall("call:resume-consumer", {
          consumerId: consumer.id,
        });
      } catch (error) {
        consumedProducerIds.current.delete(producer.producerId);
        if (mounted.current) setCallError(errorMessage(error));
      }
    },
    [currentUserId, requestCall],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopLocalMedia();
    };
  }, [stopLocalMedia]);

  useEffect(() => {
    const freshEvents = callEvents.slice(processedEvents.current);
    processedEvents.current = callEvents.length;
    for (const event of freshEvents) {
      if (event.event === "producer-added" && event.producerId && event.userId) {
        void consumeProducer({
          producerId: event.producerId,
          userId: event.userId,
          kind: event.kind || "audio",
        });
      } else if (event.event === "participant-joined" && event.userId) {
        setParticipants((current) =>
          current.includes(event.userId!) ? current : [...current, event.userId!],
        );
      } else if (event.event === "participant-left" && event.userId) {
        const stream = remoteStreamsRef.current.get(event.userId);
        stream?.getTracks().forEach((track) => track.stop());
        remoteStreamsRef.current.delete(event.userId);
        for (const [consumerId, consumer] of consumersRef.current) {
          if (stream?.getTracks().some((track) => track.id === consumer.track.id)) {
            consumer.close();
            consumersRef.current.delete(consumerId);
          }
        }
        setParticipants((current) =>
          current.filter((userId) => userId !== event.userId),
        );
        setRemoteParticipants((current) =>
          current.filter((participant) => participant.userId !== event.userId),
        );
      } else if (
        event.event === "participant-state" &&
        event.userId &&
        event.userId !== currentUserId
      ) {
        setRemoteParticipants((current) =>
          current.map((participant) =>
            participant.userId === event.userId
              ? {
                  ...participant,
                  audioEnabled: event.audioEnabled ?? participant.audioEnabled,
                  videoEnabled: event.videoEnabled ?? participant.videoEnabled,
                }
              : participant,
          ),
        );
      }
    }
    if (callEvents.length >= 80) {
      clearCallEvents();
      processedEvents.current = 0;
    }
  }, [callEvents, clearCallEvents, consumeProducer, currentUserId]);

  useEffect(() => {
    if (
      callState === "connected" &&
      connectionState !== "connected"
    ) {
      stopLocalMedia();
      setCallState("reconnecting");
      setCallError("The collaboration connection changed. Rejoin the call.");
    }
  }, [callState, connectionState, stopLocalMedia]);

  const wireTransport = (
    transport: MediaTransport,
  ) => {
    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      void requestCall("call:connect-transport", {
        transportId: transport.id,
        dtlsParameters,
      })
        .then(() => callback())
        .catch((error: Error) => errback(error));
    });
    transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
      void requestCall<{ id: string }>("call:produce", {
        transportId: transport.id,
        kind,
        rtpParameters,
      })
        .then(({ id }) => callback({ id }))
        .catch((error: Error) => errback(error));
    });
    transport.on("connectionstatechange", (state) => {
      if (state === "failed" || state === "closed") {
        setCallError(`Media transport ${state}. Rejoin the call.`);
        setCallState("reconnecting");
      }
    });
  };

  const joinCall = async () => {
    if (
      !availability.available ||
      connectionState !== "connected" ||
      callState === "connecting" ||
      callState === "connected"
    ) {
      return;
    }
    setCallState("connecting");
    setCallError(null);
    clearCallEvents();
    processedEvents.current = 0;
    try {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      let stream = audio;
      try {
        const video = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
        stream = new MediaStream([...audio.getAudioTracks(), ...video.getVideoTracks()]);
        setHasVideoTrack(true);
        setVideoEnabled(true);
        audio.getTracks().forEach((track) => {
          if (!stream.getTracks().includes(track)) track.stop();
        });
      } catch {
        setHasVideoTrack(false);
        setVideoEnabled(false);
      }
      setAudioEnabled(true);
      localStreamRef.current = stream;
      setLocalStream(stream);

      const joined = await requestCall<CallJoinResult>("call:join");
      const { Device } = await import("mediasoup-client");
      const device = new Device();
      await device.load({
        routerRtpCapabilities: joined.routerRtpCapabilities,
      });
      deviceRef.current = device;

      const sendParams = await requestCall<MediaTransportParameters>(
        "call:create-transport",
        { direction: "send" },
      );
      const sendTransport = device.createSendTransport({
        ...sendParams,
        iceServers: joined.iceServers,
      });
      sendTransportRef.current = sendTransport;
      wireTransport(sendTransport);

      const receiveParams = await requestCall<MediaTransportParameters>(
        "call:create-transport",
        { direction: "receive" },
      );
      const receiveTransport = device.createRecvTransport({
        ...receiveParams,
        iceServers: joined.iceServers,
      });
      receiveTransportRef.current = receiveTransport;
      wireTransport(receiveTransport);
      const producersReceivedDuringSetup = Array.from(
        pendingProducers.current.values(),
      );
      pendingProducers.current.clear();
      for (const producer of producersReceivedDuringSetup) {
        void consumeProducer(producer);
      }

      for (const track of stream.getTracks()) {
        const producer = await sendTransport.produce({ track });
        producersRef.current.push(producer);
      }
      setParticipants(
        Array.from(new Set(joined.participants.map(({ userId }) => userId))),
      );
      setCallState("connected");
      for (const producer of joined.producers) {
        void consumeProducer(producer);
      }
    } catch (error) {
      await requestCall("call:leave").catch(() => undefined);
      stopLocalMedia();
      setCallState("idle");
      setCallError(errorMessage(error));
    }
  };
  joinCallRef.current = joinCall;

  useEffect(() => {
    if (
      callState === "reconnecting" &&
      connectionState === "connected" &&
      availability.available
    ) {
      void joinCallRef.current();
    }
  }, [availability.available, callState, connectionState]);

  const leaveCall = async () => {
    if (callState === "idle") return;
    try {
      await requestCall("call:leave");
    } catch {
      // Server cleanup also runs when the signaling socket closes.
    }
    stopLocalMedia();
    setCallState("idle");
    setCallError(null);
  };

  const toggleAudio = () => {
    const next = !audioEnabled;
    localStreamRef.current
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = next));
    setAudioEnabled(next);
    void requestCall("call:media-state", {
      audioEnabled: next,
      videoEnabled,
    }).catch(() => undefined);
  };

  const toggleVideo = () => {
    if (!hasVideoTrack) return;
    const next = !videoEnabled;
    localStreamRef.current
      ?.getVideoTracks()
      .forEach((track) => (track.enabled = next));
    setVideoEnabled(next);
    void requestCall("call:media-state", {
      audioEnabled,
      videoEnabled: next,
    }).catch(() => undefined);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={availability.available ? "default" : "secondary"}>
          {availability.available
            ? `${availability.region} · limit ${availability.participantLimit}`
            : "Regional media unavailable"}
        </Badge>
        <Badge variant={callState === "connected" ? "default" : "outline"}>
          {callState === "connected"
            ? `${participants.length} participant${participants.length === 1 ? "" : "s"}`
            : callState === "reconnecting"
              ? "Reconnect required"
              : callState}
        </Badge>
      </div>
      {!availability.available && (
        <p role="status" className="text-sm">
          {availability.reason ||
            "Audio/video is disabled until a healthy regional media service and verified capacity are available."}
        </p>
      )}
      {callError && (
        <p role="alert" className="text-sm text-destructive">
          {callError}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <video
          autoPlay
          muted
          playsInline
          ref={(element) => {
            if (element && localStream && element.srcObject !== localStream) {
              element.srcObject = localStream;
            }
          }}
          aria-label="Your camera preview"
          className="aspect-video w-full rounded-md bg-muted object-cover"
        />
        {remoteParticipants.map((participant) => (
          <video
            key={participant.userId}
            autoPlay
            playsInline
            ref={(element) => {
              if (
                element &&
                element.srcObject !== participant.stream
              ) {
                element.srcObject = participant.stream;
              }
            }}
            aria-label={`Video from collaborator ${participant.userId}`}
            className="aspect-video w-full rounded-md bg-muted object-cover"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {callState !== "connected" ? (
          <Button
            type="button"
            onClick={() => void joinCall()}
            disabled={
              !availability.available ||
              connectionState !== "connected" ||
              callState === "connecting"
            }
          >
            <Phone className="mr-2 h-4 w-4" />
            {callState === "connecting" ? "Joining…" : "Join call"}
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={toggleAudio}>
              {audioEnabled ? (
                <Mic className="mr-2 h-4 w-4" />
              ) : (
                <MicOff className="mr-2 h-4 w-4" />
              )}
              {audioEnabled ? "Mute" : "Unmute"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={toggleVideo}
              disabled={!hasVideoTrack}
            >
              {videoEnabled ? (
                <Video className="mr-2 h-4 w-4" />
              ) : (
                <VideoOff className="mr-2 h-4 w-4" />
              )}
              {videoEnabled ? "Turn camera off" : "Turn camera on"}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void leaveCall()}>
              <PhoneOff className="mr-2 h-4 w-4" />
              Leave call
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
