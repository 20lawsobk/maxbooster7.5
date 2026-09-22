import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { offlineIdentity } from "@/lib/offline/identity";
import { disableFactor, freshCodeGuidance, reauthenticationGuidance, securityError } from "./securityContracts";

export default function TwoFactorDisableDialog({ open, onOpenChange, onSuccess }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPassword(""); setCode(""); setError(""); }, [open]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const identity = offlineIdentity();
    const current = () => offlineIdentity().owner === identity.owner && offlineIdentity().epoch === identity.epoch;
    setBusy(true); setError("");
    try {
      await disableFactor(apiRequest, password, code);
      if (current()) { onSuccess(); onOpenChange(false); }
    } catch (error) { if (current()) setError(securityError(error)); }
    finally { if (current()) { setBusy(false); setCode(""); } }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <DialogContent><DialogHeader>
      <DialogTitle>Disable two-factor authentication</DialogTitle>
      <DialogDescription>This reduces your account security. Enter your password and current factor code. Passwordless Google accounts may leave the password blank after recent Google sign-in and MFA.</DialogDescription>
    </DialogHeader>
      <p className="text-sm">{reauthenticationGuidance} {freshCodeGuidance}</p>
      <form onSubmit={submit} className="space-y-3">
        <Label htmlFor="disable-password">Password (password accounts)</Label>
        <Input id="disable-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
        <Label htmlFor="disable-code">Current authenticator code</Label>
        <Input id="disable-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} />
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button type="submit" variant="destructive" disabled={busy || code.length !== 6}>{busy ? "Disabling…" : "Disable 2FA"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}