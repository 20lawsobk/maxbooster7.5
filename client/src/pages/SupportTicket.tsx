import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";

type Ticket = {
  id: string; subject: string; description: string; status: string;
  messages: { id: string; message: string; isStaffReply: boolean; createdAt: string }[];
};

export default function SupportTicket() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/support/my/tickets/${encodeURIComponent(ticketId || "")}`, { credentials: "include" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load ticket");
    setTicket(data);
  }, [ticketId]);
  useEffect(() => {
    setTicket(null);
    load().catch(error => setError(error.message));
  }, [load]);
  const send = async () => {
    setSending(true);
    setError("");
    try {
      const csrf = getCsrfTokenFromCookie();
      const response = await fetch(`/api/support/my/tickets/${encodeURIComponent(ticketId || "")}/messages`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) },
        body: JSON.stringify({ message: reply }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Unable to send reply");
      setReply("");
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to send reply");
    } finally {
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
        <Textarea aria-label="Your reply" value={reply} maxLength={10000} onChange={event => setReply(event.target.value)} />
        <Button onClick={send} disabled={sending || !reply.trim()}>{sending ? "Sending…" : "Send reply"}</Button>
      </>}
    </>}
  </main></AppLayout>;
}