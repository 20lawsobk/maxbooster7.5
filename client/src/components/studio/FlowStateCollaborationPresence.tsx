import { logger } from "@/lib/logger";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown,
  Eye,
  Edit3,
  Mic,
  MousePointer2,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface Collaborator {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  role: "owner" | "editor" | "viewer";
  status: "active" | "idle" | "away";
  cursorPosition?: { x: number; y: number };
  currentTrackId?: string;
  isRecording?: boolean;
  lastActivity: number;
}

interface FlowStateCollaborationPresenceProps {
  collaborators: Collaborator[];
  currentUserId: string;
  isConnected: boolean;
  onInvite?: () => void;
  onReconnect?: () => void;
}

const ROLE_ICONS = {
  owner: Crown,
  editor: Edit3,
  viewer: Eye,
};

const ROLE_LABELS = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

const STATUS_COLORS = {
  active: "bg-green-500",
  idle: "bg-yellow-500",
  away: "bg-gray-500",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function FlowStateCollaborationPresence({
  collaborators,
  currentUserId,
  isConnected,
  onInvite,
  onReconnect,
}: FlowStateCollaborationPresenceProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sortedCollaborators = useMemo(() => {
    return [...collaborators].sort((a, b) => {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;
      if (a.role === "owner") return -1;
      if (b.role === "owner") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [collaborators, currentUserId]);

  const activeCount = collaborators.filter((c) => c.status === "active").length;

  return (
    <>
      <motion.div
        className="fixed top-4 right-4 z-50"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className={cn(
            "bg-black/60 backdrop-blur-xl rounded-2xl border overflow-hidden transition-all",
            isExpanded ? "w-64" : "w-auto",
            isConnected ? "border-white/10" : "border-red-500/30",
          )}
        >
          <motion.button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 px-3 py-2 w-full hover:bg-white/5 transition-colors"
          >
            <div className="flex -space-x-2">
              {sortedCollaborators.slice(0, 4).map((collaborator) => (
                <motion.div
                  key={collaborator.id}
                  className={cn(
                    "w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold relative",
                    collaborator.isRecording &&
                      "ring-2 ring-red-500 ring-offset-1 ring-offset-black",
                  )}
                  style={{
                    backgroundColor: collaborator.color + "40",
                    borderColor: collaborator.color,
                    color: collaborator.color,
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.1, zIndex: 10 }}
                >
                  {collaborator.avatar ? (
                    <img
                      src={collaborator.avatar}
                      alt={collaborator.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    getInitials(collaborator.name)
                  )}
                  <div
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black",
                      STATUS_COLORS[collaborator.status],
                    )}
                  />
                  {collaborator.isRecording && (
                    <motion.div
                      className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    >
                      <Mic className="w-2 h-2 text-white" />
                    </motion.div>
                  )}
                </motion.div>
              ))}

              {collaborators.length > 4 && (
                <div className="w-7 h-7 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center text-[10px] text-white/60">
                  +{collaborators.length - 4}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-white/70">
              {isConnected ? (
                <Wifi className="w-4 h-4 text-green-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
              <span className="text-xs font-medium">{activeCount} active</span>
            </div>
          </motion.button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-white/5"
              >
                {!isConnected && (
                  <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
                    <span className="text-xs text-red-400">
                      Connection lost
                    </span>
                    <motion.button
                      onClick={onReconnect}
                      className="text-xs text-red-300 hover:text-white flex items-center gap-1"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Reconnect
                    </motion.button>
                  </div>
                )}

                <div className="max-h-64 overflow-y-auto">
                  {sortedCollaborators.map((collaborator) => {
                    const RoleIcon = ROLE_ICONS[collaborator.role];
                    const isCurrentUser = collaborator.id === currentUserId;

                    return (
                      <motion.div
                        key={collaborator.id}
                        className={cn(
                          "px-3 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors",
                          isCurrentUser && "bg-white/5",
                        )}
                      >
                        <div className="relative">
                          <div
                            className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                              collaborator.isRecording && "ring-2 ring-red-500",
                            )}
                            style={{
                              backgroundColor: collaborator.color + "40",
                              color: collaborator.color,
                            }}
                          >
                            {collaborator.avatar ? (
                              <img
                                src={collaborator.avatar}
                                alt={collaborator.name}
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              getInitials(collaborator.name)
                            )}
                          </div>
                          <div
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black",
                              STATUS_COLORS[collaborator.status],
                            )}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-white truncate">
                              {collaborator.name}
                              {isCurrentUser && (
                                <span className="text-white/40 ml-1">
                                  (you)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-white/40 text-[10px]">
                            <RoleIcon className="w-3 h-3" />
                            <span>{ROLE_LABELS[collaborator.role]}</span>
                            {collaborator.currentTrackId && (
                              <>
                                <span>·</span>
                                <span>Track {collaborator.currentTrackId}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {collaborator.isRecording && (
                          <motion.div
                            className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded"
                            animate={{ opacity: [1, 0.5, 1] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                          >
                            REC
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                <div className="p-2 border-t border-white/5">
                  <motion.button
                    onClick={onInvite}
                    className="w-full py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-medium transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Invite Collaborators
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {collaborators
        .filter((c) => c.id !== currentUserId && c.cursorPosition)
        .map((collaborator) => (
          <motion.div
            key={`cursor-${collaborator.id}`}
            className="fixed pointer-events-none z-40"
            style={{
              left: collaborator.cursorPosition!.x,
              top: collaborator.cursorPosition!.y,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
          >
            <MousePointer2
              className="w-5 h-5"
              style={{ color: collaborator.color }}
            />
            <div
              className="absolute left-4 top-4 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
              style={{ backgroundColor: collaborator.color, color: "white" }}
            >
              {collaborator.name}
            </div>
          </motion.div>
        ))}
    </>
  );
}

interface UseCollaborationPresenceOptions {
  heartbeatInterval?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export function useCollaborationPresence(
  projectId: string | null,
  options: UseCollaborationPresenceOptions = {},
) {
  const {
    heartbeatInterval = 30000,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!projectId || wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState("connecting");

    setCollaborators([
      {
        id: "current-user",
        name: "You",
        color: "#8b5cf6",
        role: "owner",
        status: "active",
        lastActivity: Date.now(),
      },
    ]);
    setIsConnected(true);
    setConnectionState("connected");
    reconnectAttemptsRef.current = 0;

    heartbeatRef.current = setInterval(() => {
      setCollaborators((prev) =>
        prev.map((c) =>
          c.id === "current-user" ? { ...c, lastActivity: Date.now() } : c,
        ),
      );
    }, heartbeatInterval);
  }, [projectId, heartbeatInterval]);

  const disconnect = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setConnectionState("disconnected");
    setCollaborators([]);
  }, []);

  const reconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      logger.warn("Max reconnection attempts reached");
      return;
    }

    reconnectAttemptsRef.current += 1;
    const delay =
      reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect, maxReconnectAttempts, reconnectDelay]);

  useEffect(() => {
    if (projectId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [projectId, connect, disconnect]);

  const updateCursorPosition = useCallback((x: number, y: number) => {
    setCollaborators((prev) =>
      prev.map((c) =>
        c.id === "current-user"
          ? { ...c, cursorPosition: { x, y }, lastActivity: Date.now() }
          : c,
      ),
    );
  }, []);

  const setCurrentTrack = useCallback((trackId: string | null) => {
    setCollaborators((prev) =>
      prev.map((c) =>
        c.id === "current-user"
          ? {
              ...c,
              currentTrackId: trackId || undefined,
              lastActivity: Date.now(),
            }
          : c,
      ),
    );
  }, []);

  const setRecordingStatus = useCallback((isRecording: boolean) => {
    setCollaborators((prev) =>
      prev.map((c) =>
        c.id === "current-user"
          ? { ...c, isRecording, lastActivity: Date.now() }
          : c,
      ),
    );
  }, []);

  const setUserStatus = useCallback((status: Collaborator["status"]) => {
    setCollaborators((prev) =>
      prev.map((c) =>
        c.id === "current-user"
          ? { ...c, status, lastActivity: Date.now() }
          : c,
      ),
    );
  }, []);

  return {
    collaborators,
    isConnected,
    connectionState,
    connect,
    disconnect,
    reconnect,
    updateCursorPosition,
    setCurrentTrack,
    setRecordingStatus,
    setUserStatus,
  };
}
