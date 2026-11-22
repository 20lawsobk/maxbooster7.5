import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";

export interface CollaborationRoomMessage {
  id: string;
  clientMessageId: string;
  sender: { id: string; name: string; avatarUrl: string | null };
  content: string;
  createdAt: string;
}

type ConnectionState =
  | "connecting"
  | "syncing"
  | "connected"
  | "reconnecting"
  | "denied";

const SERVER_UPDATE_ORIGIN = Symbol("collaboration-server-update");
const MAX_ROOM_MESSAGES = 200;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeMessage(
  message: Record<string, unknown>,
): CollaborationRoomMessage | null {
  if (
    typeof message.id !== "string" ||
    typeof message.clientMessageId !== "string" ||
    typeof message.content !== "string" ||
    typeof message.createdAt !== "string"
  ) {
    return null;
  }
  const sender =
    message.sender && typeof message.sender === "object"
      ? (message.sender as Record<string, unknown>)
      : null;
  if (
    !sender ||
    typeof sender.id !== "string" ||
    typeof sender.name !== "string"
  ) {
    return null;
  }
  return {
    id: message.id,
    clientMessageId: message.clientMessageId,
    sender: {
      id: sender.id,
      name: sender.name,
      avatarUrl: typeof sender.avatarUrl === "string" ? sender.avatarUrl : null,
    },
    content: message.content,
    createdAt: message.createdAt,
  };
}

export function useCollaborationDocument(projectId: string) {
  const [sharedText, setSharedTextState] = useState("");
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [canWrite, setCanWrite] = useState(false);
  const [roomMessages, setRoomMessages] = useState<
    CollaborationRoomMessage[]
  >([]);
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const documentRef = useRef<Y.Doc | null>(null);
  const textRef = useRef<Y.Text | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const canWriteRef = useRef(false);

  useEffect(() => {
    let stopped = false;
    let denied = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 500;
    const document = new Y.Doc();
    const text = document.getText("sharedNotes");
    documentRef.current = document;
    textRef.current = text;
    setSharedTextState(text.toString());
    setCanWrite(false);
    canWriteRef.current = false;
    setConnectionState("connecting");

    const onTextChange = () => setSharedTextState(text.toString());
    text.observe(onTextChange);

    const sendFullDocument = (socket: WebSocket) => {
      if (
        !canWriteRef.current ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      const update = Y.encodeStateAsUpdate(document);
      socket.send(
        JSON.stringify({
          type: "yjs:update",
          payload: { update: toBase64(update) },
        }),
      );
    };

    const connect = () => {
      if (stopped || denied) return;
      setConnectionState(reconnectDelay === 500 ? "connecting" : "reconnecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws/studio?projectId=${encodeURIComponent(projectId)}`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectDelay = 500;
        setConnectionState("syncing");
      };

      socket.onmessage = (event) => {
        let message: { type?: string; payload?: unknown };
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.type === "connected") {
          const payload = message.payload as
            | { permissions?: { write?: boolean } }
            | undefined;
          const write = payload?.permissions?.write === true;
          canWriteRef.current = write;
          setCanWrite(write);
          return;
        }
        if (message.type === "yjs:sync" || message.type === "yjs:update") {
          const payload = message.payload as
            | { state?: string; update?: string }
            | undefined;
          const encoded =
            message.type === "yjs:sync" ? payload?.state : payload?.update;
          if (typeof encoded !== "string") return;
          try {
            Y.applyUpdate(document, fromBase64(encoded), SERVER_UPDATE_ORIGIN);
            if (message.type === "yjs:sync") {
              setConnectionState("connected");
              setConnectionEpoch((value) => value + 1);
              sendFullDocument(socket);
            }
          } catch {
            socket.close(1002, "Invalid shared document update");
          }
          return;
        }
        if (message.type === "room:message") {
          const payload = message.payload;
          if (!payload || typeof payload !== "object") return;
          const raw = payload as Record<string, unknown>;
          const normalized = normalizeMessage({
            id: raw.id,
            clientMessageId: raw.clientMessageId,
            content: raw.content,
            createdAt: raw.createdAt,
            sender: {
              id: raw.senderId,
              name: raw.senderName,
              avatarUrl: null,
            },
          });
          if (normalized) {
            setRoomMessages((current) => {
              if (current.some((item) => item.id === normalized.id)) {
                return current;
              }
              return [...current, normalized].slice(-MAX_ROOM_MESSAGES);
            });
          }
        }
      };

      socket.onclose = (event) => {
        canWriteRef.current = false;
        setCanWrite(false);
        if (stopped) return;
        if (event.code === 1008) {
          denied = true;
          setConnectionState("denied");
          return;
        }
        setConnectionState("reconnecting");
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
      };

      socket.onerror = () => {
        if (socket.readyState !== WebSocket.CLOSED) socket.close();
      };
    };

    document.on("update", (update, origin) => {
      if (origin === SERVER_UPDATE_ORIGIN) return;
      const socket = socketRef.current;
      if (
        canWriteRef.current &&
        socket?.readyState === WebSocket.OPEN
      ) {
        socket.send(
          JSON.stringify({
            type: "yjs:update",
            payload: { update: toBase64(update) },
          }),
        );
      }
    });

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      text.unobserve(onTextChange);
      socketRef.current?.close(1000, "Room closed");
      socketRef.current = null;
      document.destroy();
      documentRef.current = null;
      textRef.current = null;
    };
  }, [projectId]);

  const setSharedText = useCallback(
    (nextText: string) => {
      const document = documentRef.current;
      const text = textRef.current;
      if (!document || !text || !canWriteRef.current) return;
      const current = text.toString();
      if (current === nextText) return;

      let prefix = 0;
      while (
        prefix < current.length &&
        prefix < nextText.length &&
        current[prefix] === nextText[prefix]
      ) {
        prefix += 1;
      }
      let suffix = 0;
      while (
        suffix < current.length - prefix &&
        suffix < nextText.length - prefix &&
        current[current.length - 1 - suffix] ===
          nextText[nextText.length - 1 - suffix]
      ) {
        suffix += 1;
      }

      document.transact(() => {
        const deleteCount = current.length - prefix - suffix;
        if (deleteCount > 0) text.delete(prefix, deleteCount);
        const insertion = nextText.slice(prefix, nextText.length - suffix);
        if (insertion) text.insert(prefix, insertion);
      });
    },
    [],
  );

  const replaceRoomMessages = useCallback(
    (messages: CollaborationRoomMessage[]) => {
      setRoomMessages((current) => {
        const byId = new Map<string, CollaborationRoomMessage>();
        for (const message of messages) byId.set(message.id, message);
        for (const message of current) byId.set(message.id, message);
        return [...byId.values()]
          .sort(
            (left, right) =>
              Date.parse(left.createdAt) - Date.parse(right.createdAt),
          )
          .slice(-MAX_ROOM_MESSAGES);
      });
    },
    [],
  );

  const addRoomMessage = useCallback((message: CollaborationRoomMessage) => {
    setRoomMessages((current) => {
      if (current.some((item) => item.id === message.id)) return current;
      return [...current, message].slice(-MAX_ROOM_MESSAGES);
    });
  }, []);

  return {
    sharedText,
    setSharedText,
    connectionState,
    canWrite,
    roomMessages,
    connectionEpoch,
    replaceRoomMessages,
    addRoomMessage,
  };
}
