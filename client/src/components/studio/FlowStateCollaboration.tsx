import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  MessageSquare,
  Send,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import {
  useCollaborationDocument,
  type CollaborationRoomMessage,
} from "@/hooks/useCollaborationDocument";
import { cn } from "@/lib/utils";

interface CollaborationRoom {
  id: string;
  projectId: string;
  state: "active" | "closed";
  mediaState: "unavailable" | "available" | "degraded";
  mediaRegion: string | null;
  participantLimit: number | null;
  createdAt: string;
  updatedAt: string;
}

interface FlowStateCollaborationProps {
  projectId: string;
  projectName: string;
  currentUserId: string;
  className?: string;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // The caller receives a stable status-specific error below.
  }
  return `Request failed (${response.status})`;
}

export function FlowStateCollaboration({
  projectId,
  projectName,
  currentUserId,
  className,
}: FlowStateCollaborationProps) {
  const { toast } = useToast();
  const [room, setRoom] = useState<CollaborationRoom | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [opening, setOpening] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const openRoom = async () => {
      setOpening(true);
      setRoomError(null);
      try {
        let response = await fetch(
          `/api/collaboration/rooms/${encodeURIComponent(projectId)}`,
          { credentials: "include" },
        );
        if (response.status === 404) {
          const csrfToken = getCsrfTokenFromCookie();
          response = await fetch(
            `/api/collaboration/rooms/${encodeURIComponent(projectId)}/open`,
            {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
              },
              body: JSON.stringify({}),
            },
          );
        }
        if (!response.ok) throw new Error(await readError(response));
        const result = (await response.json()) as { room?: CollaborationRoom };
        if (!result.room?.id || result.room.projectId !== projectId) {
          throw new Error("The server returned an invalid collaboration room");
        }
        if (!cancelled) setRoom(result.room);
      } catch (error) {
        if (!cancelled) {
          setRoomError(
            error instanceof Error ? error.message : "Room could not be opened",
          );
        }
      } finally {
        if (!cancelled) setOpening(false);
      }
    };

    void openRoom();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (opening) {
    return (
      <div className={cn("flex h-full items-center justify-center", className)}>
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening the shared room…
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className={cn("p-6", className)}>
        <Card role="alert" className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Collaboration room unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {roomError || "The room could not be opened."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ActiveCollaborationRoom
      room={room}
      projectName={projectName}
      projectId={projectId}
      currentUserId={currentUserId}
      className={className}
      toast={toast}
    />
  );
}

function ActiveCollaborationRoom({
  room,
  projectName,
  projectId,
  currentUserId,
  className,
  toast,
}: {
  room: CollaborationRoom;
  projectName: string;
  projectId: string;
  currentUserId: string;
  className?: string;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const {
    sharedText,
    setSharedText,
    connectionState,
    canWrite,
    roomMessages,
    connectionEpoch,
    replaceRoomMessages,
    addRoomMessage,
  } = useCollaborationDocument(projectId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const loadMessages = async () => {
      try {
        const response = await fetch(
          `/api/collaboration/rooms/${encodeURIComponent(projectId)}/messages?limit=100`,
          { credentials: "include" },
        );
        if (!response.ok) throw new Error(await readError(response));
        const result = (await response.json()) as {
          messages?: CollaborationRoomMessage[];
        };
        if (!Array.isArray(result.messages)) {
          throw new Error("The server returned invalid room messages");
        }
        if (!cancelled) replaceRoomMessages(result.messages);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Room messages unavailable",
            description:
              error instanceof Error ? error.message : "Could not load messages",
            variant: "destructive",
          });
        }
      }
    };
    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [connectionEpoch, projectId, replaceRoomMessages, toast]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [roomMessages]);

  const sendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !canWrite || sending) return;
    setSending(true);
    const clientMessageId = crypto.randomUUID();
    try {
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch(
        `/api/collaboration/rooms/${encodeURIComponent(projectId)}/messages`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
          body: JSON.stringify({ clientMessageId, content }),
        },
      );
      const result = (await response.json()) as {
        message?: CollaborationRoomMessage;
        error?: string;
        persisted?: boolean;
      };
      if (result.message) addRoomMessage(result.message);
      if (!response.ok) {
        if (result.persisted) setDraft("");
        throw new Error(result.error || `Message send failed (${response.status})`);
      }
      setDraft("");
    } catch (error) {
      toast({
        title: "Could not send message",
        description: error instanceof Error ? error.message : "Please retry",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const connectionLabel = {
    connecting: "Connecting",
    syncing: "Syncing",
    connected: "Live",
    reconnecting: "Reconnecting",
    denied: "Access ended",
  }[connectionState];

  return (
    <div className={cn("flex h-full min-h-[36rem] flex-col bg-background", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Users className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{projectName}</h2>
            <p className="text-xs text-muted-foreground">Shared collaboration room</p>
          </div>
        </div>
        <Badge
          variant={connectionState === "connected" ? "default" : "secondary"}
          className="gap-1"
          role="status"
        >
          {connectionState === "connected" ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {connectionLabel}
        </Badge>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
        <section className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Shared notes</h3>
            <span className="text-xs text-muted-foreground">
              {canWrite ? "Edits sync as you type" : "Read-only access"}
            </span>
          </div>
          <Textarea
            aria-label="Shared collaboration notes"
            value={sharedText}
            onChange={(event) => setSharedText(event.target.value)}
            disabled={!canWrite || connectionState !== "connected"}
            placeholder="Write lyrics or notes for this project…"
            className="min-h-[18rem] flex-1 resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Changes are synchronized through the project’s persisted Yjs document.
          </p>

          <Card className="mt-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Audio and video
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {room.mediaState === "available" && room.mediaRegion ? (
                <>
                  Media capacity is assigned in region{" "}
                  <strong>{room.mediaRegion}</strong>
                  {room.participantLimit
                    ? `, with a tested limit of ${room.participantLimit} participants.`
                    : ". The tested participant limit is not published yet."}
                </>
              ) : (
                "Calls are unavailable: no healthy, load-tested self-managed media region is assigned to this room."
              )}
            </CardContent>
          </Card>
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4" />
              Room messages
            </h3>
            <span className="text-xs text-muted-foreground">
              {roomMessages.length}
            </span>
          </div>
          <ScrollArea className="min-h-[16rem] flex-1 p-3">
            <div className="space-y-3">
              {roomMessages.map((message) => (
                <article key={message.id} className="break-words">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {message.sender.id === currentUserId
                        ? "You"
                        : message.sender.name}
                    </span>
                    <time
                      className="shrink-0 text-xs text-muted-foreground"
                      dateTime={message.createdAt}
                    >
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {message.content}
                  </p>
                </article>
              ))}
              {roomMessages.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No messages yet.
                </p>
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
          <form onSubmit={sendMessage} className="flex gap-2 border-t p-3">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={4_000}
              disabled={!canWrite || connectionState !== "connected" || sending}
              placeholder={canWrite ? "Write a room message…" : "Read-only access"}
              aria-label="Room message"
            />
            <Button
              type="submit"
              size="icon"
              disabled={
                !draft.trim() ||
                !canWrite ||
                connectionState !== "connected" ||
                sending
              }
              aria-label="Send room message"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default FlowStateCollaboration;
