import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { offlineIdentity } from "@/lib/offline/identity";
import { requestErasure, erasureStatus, cancelErasure, securityError, reauthenticationGuidance, type ErasureRequest } from "./securityContracts";

export default function DeleteAccountDialog({ open, onOpenChange }: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { logout } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [request, setRequest] = useState<ErasureRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const identity = offlineIdentity();
  const current = () => {
    const now = offlineIdentity();
    return now.owner === identity.owner && now.epoch === identity.epoch;
  };
  async function refresh() {
    setBusy(true); setError(""); setLoaded(false);
    try {
      const request = await erasureStatus(apiRequest);
      if (current()) { setRequest(request); setLoaded(true); }
    } catch (error) { if (current()) setError(securityError(error)); }
    finally { if (current()) setBusy(false); }
  }
  useEffect(() => {
    if (open) { setPassword(""); setConfirmation(""); setAccepted(false); void refresh(); }
    else { setPassword(""); setConfirmation(""); }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (confirmation !== "DELETE" || busy) return;
    setBusy(true); setError("");
    try {
      await requestErasure(apiRequest, password);
      if (!current()) return;
      setAccepted(true); setPassword(""); setConfirmation("");
      toast({ title: "Erasure requested — not erased", description: "Awaiting retention review. Sign in again to view or cancel your queued request.", duration: 15000 });
      // Use the existing coordinated account cleanup; never clear/reassign drafts ourselves.
      try { await logout(); }
      catch (error) {
        if (current()) setError(`Erasure requested, not erased. ${securityError(error)}`);
        // Cleanup intentionally locks/remounts the account boundary. Surface failure
        // even when that transition unmounted this dialog; no account data is exposed.
        toast({ title: "Sign-out cleanup needs attention", description: "Erasure was requested, not completed. Local/server sign-out cleanup failed; retry sign-out before leaving this device.", variant: "destructive", duration: 15000 });
      }
    } catch (error) { if (current()) setError(securityError(error)); }
    finally { if (current()) setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setError("");
    try {
      await cancelErasure(apiRequest);
      if (current()) await refresh();
    } catch (error) { if (current()) setError(securityError(error)); }
    finally { if (current()) setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }}>
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Account erasure request</DialogTitle>
        <DialogDescription>
          This queues a request awaiting retention review; it does not delete your account or data now.
          Financial or legally retained records may need to be kept. No completion date is promised.
          Your current session ends on acceptance. Sign in again to view or cancel a queued request.
        </DialogDescription>
      </DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {accepted ? <div role="status">
        <p>Erasure requested — awaiting retention review. Your data has not been erased.</p>
        <a href="/login" className="underline">Sign in to view or cancel the request</a>
        <Button onClick={() => void logout().catch(error => setError(securityError(error)))}>Retry sign-out cleanup</Button>
      </div> : <>
        <div aria-live="polite">
          {!loaded ? <p>Status not yet available.</p> : request ? <>
            <p>Request status: {request.status === "pending_policy" ? "Queued — awaiting retention review (not erased)" : request.status}</p>
            <p>Requested: {new Date(request.requested_at).toLocaleString()}</p>
            <p>Not before: {new Date(request.not_before).toLocaleString()} — this is not a completion deadline.</p>
          </> : <p>No erasure request on record.</p>}
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>Refresh status</Button>
        {loaded && request?.status === "pending_policy" &&
          <Button variant="outline" disabled={busy} onClick={() => void cancel()}>Cancel queued erasure request</Button>}
        {loaded && (!request || request.status === "cancelled") && <form onSubmit={submit} className="space-y-4">
          <p className="text-sm">For a password account, enter your password. For a passwordless Google account, leave it blank after recent Google sign-in and MFA. {reauthenticationGuidance}</p>
          <Label htmlFor="erasure-password">Password (password accounts)</Label>
          <Input id="erasure-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
          <Label htmlFor="erasure-confirmation">Type DELETE to request erasure</Label>
          <Input id="erasure-confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
          <Button type="submit" variant="destructive" disabled={busy || confirmation !== "DELETE"}>{busy ? "Requesting…" : "Request account erasure"}</Button>
        </form>}
      </>}
    </DialogContent>
  </Dialog>;
}