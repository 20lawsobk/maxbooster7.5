import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Send, Tag, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRequireAdmin } from "@/hooks/useRequireAuth";
import { logger } from "@/lib/logger";

interface TicketMessage {
  id: string;
  userId: string | null;
  message: string | null;
  isStaffReply: boolean | null;
  createdAt: string | null;
}

interface TicketDetail {
  id: string;
  userId: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  createdAt: string;
  messages: TicketMessage[];
  tags: string[];
}

export default function SupportTicketDetail() {
  const { user, isLoading: authLoading } = useRequireAdmin();
  const { ticketId } = useParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [isSavingTag, setIsSavingTag] = useState(false);
  const { toast } = useToast();

  const fetchTicket = async () => {
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch ticket");
      const data = await response.json();
      setTicket(data);
    } catch (error: unknown) {
      logger.error("Error fetching ticket:", error);
      toast({
        title: "Error",
        description: "Failed to load ticket",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && ticketId) {
      fetchTicket();
    }
  }, [user, ticketId]);

  const sendReply = async () => {
    if (!replyText.trim()) return;
    setIsSendingReply(true);
    try {
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ message: replyText.trim() }),
      });
      if (!response.ok) throw new Error("Failed to send reply");
      setReplyText("");
      toast({ title: "Reply sent", description: "Your reply has been saved" });
      await fetchTicket();
    } catch (error: unknown) {
      logger.error("Error sending reply:", error);
      toast({
        title: "Error",
        description: "Failed to send reply",
        variant: "destructive",
      });
    } finally {
      setIsSendingReply(false);
    }
  };

  const addTag = async () => {
    const tag = newTag.trim();
    if (!tag) return;
    setIsSavingTag(true);
    try {
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch(`/api/support/tickets/${ticketId}/tags`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ tags: [tag] }),
      });
      if (!response.ok) throw new Error("Failed to add tag");
      const data = await response.json();
      setTicket((prev) => (prev ? { ...prev, tags: data.tags } : prev));
      setNewTag("");
    } catch (error: unknown) {
      logger.error("Error adding tag:", error);
      toast({
        title: "Error",
        description: "Failed to add tag",
        variant: "destructive",
      });
    } finally {
      setIsSavingTag(false);
    }
  };

  const removeTag = async (tag: string) => {
    try {
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch(
        `/api/support/tickets/${ticketId}/tags/${encodeURIComponent(tag)}`,
        {
          method: "DELETE",
          headers: {
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Failed to remove tag");
      const data = await response.json();
      setTicket((prev) => (prev ? { ...prev, tags: data.tags } : prev));
    } catch (error: unknown) {
      logger.error("Error removing tag:", error);
      toast({
        title: "Error",
        description: "Failed to remove tag",
        variant: "destructive",
      });
    }
  };

  if (authLoading || (isLoading && !ticket)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  if (!ticket) {
    return (
      <AppLayout title="Ticket not found">
        <div className="text-center py-12 text-muted-foreground">
          This ticket could not be found.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={ticket.subject} subtitle={`Ticket ${ticket.id}`}>
      <div className="space-y-6 max-w-3xl">
        <Link href="/admin/support">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Back to tickets
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{ticket.subject}</CardTitle>
              <div className="flex gap-2">
                <Badge>{ticket.status.replace("_", " ").toUpperCase()}</Badge>
                <Badge variant="outline">{ticket.priority.toUpperCase()}</Badge>
              </div>
            </div>
            <CardDescription>{ticket.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {ticket.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-1 rounded-full hover:bg-muted-foreground/20"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Add tag…"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="h-8 w-32"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSavingTag || !newTag.trim()}
                  onClick={addTag}
                >
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ticket.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No replies yet.</p>
            ) : (
              ticket.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg border p-3 ${msg.isStaffReply ? "bg-primary/5" : "bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">
                      {msg.isStaffReply ? "Support team" : "Customer"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {msg.createdAt
                        ? new Date(msg.createdAt).toLocaleString()
                        : ""}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                </div>
              ))
            )}

            <div className="pt-2 space-y-2">
              <Textarea
                placeholder="Write a reply…"
                rows={4}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  onClick={sendReply}
                  disabled={isSendingReply || !replyText.trim()}
                  className="gap-2"
                >
                  {isSendingReply ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send reply
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
