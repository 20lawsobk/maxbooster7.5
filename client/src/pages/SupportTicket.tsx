import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";

import { useRequireAuth } from "@/hooks/useRequireAuth";

type Ticket = {
  id: string; subject: string; description: string; status: string;
  messages: { id: string; message: string; isStaffReply: boolean; createdAt: string }[];
};

export default function SupportTicket() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { user, isLoading } = useRequireAuth();
  if (isLoading) return <AppLayout><p role="status">Loading conversation…</p></AppLayout>;
  if (!user || !ticketId) return null;
  return <TicketConversation key={`${user.id}:${ticketId}`} ticketId={ticketId} />;
}

function TicketConversation({ticketId}: {ticketId: string}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const generation = useRef(0);
  const sendPending = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = generation.current;
    const response = await apiRequest("GET", `/api/support/my/tickets/${encodeURIComponent(ticketId || "")}`, undefined, { signal, timeout: 30000 });
    const data = await response.json();
    if (current === generation.current && !signal?.aborted) setTicket(data);
  }, [ticketId]);
  useEffect(() => {
    generation.current += 1;
    const controller = new AbortController();
    setTicket(null);
    setError("");
    setReply("");
    load(AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load ticket");
    });
    return () => { controller.abort(); generation.current += 1; };
  }, [load]);
  const send = async () => {
    if (sendPending.current || !reply.trim() || !ticket || ticket.status === "closed") return;
    sendPending.current = true;
    const current = generation.current;
    setSending(true);
    setError("");
    try {
      await apiRequest("POST", `/api/support/my/tickets/${encodeURIComponent(ticketId || "")}/messages`, {message: reply.trim()}, {timeout: 30000});
      if (current !== generation.current) return;
      setReply("");
      await load();
    } catch (error) {
      if (current === generation.current) setError(error instanceof Error ? error.message : "Unable to send reply");
    } finally {
      sendPending.current = false;
      setSending(false);
    }
  };
  return <AppLayout><main className="mx-auto max-w-3xl space-y-6 p-6">
    <h1 className="text-2xl font-semibold">{ticket?.subject || "Support conversation"}</h1>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!ticket && !error && <p>Loading conversation…</p>}
    {ticket && <>
      <p>Status: {ticket.status}</p>
      <p className="whitespace-pre-wrap">{ticket.description}</p>
      {ticket.messages.map(message => <article key={message.id} className="rounded border p-4">
        <p className="font-semibold">{message.isStaffReply ? "Support" : "You"}</p>
        <p className="whitespace-pre-wrap">{message.message}</p>
        <time>{new Date(message.createdAt).toLocaleString()}</time>
      </article>)}
      {ticket.status === "closed" ? <p>This ticket is closed.</p> : <>
        <Textarea aria-label="Your reply" value={reply} maxLength={10000} disabled={sending} onChange={event => setReply(event.target.value)} />
        <Button onClick={send} disabled={sending || !reply.trim()}>{sending ? "Sending…" : "Send reply"}</Button>
      </>}
    </>}
  </main></AppLayout>;
}