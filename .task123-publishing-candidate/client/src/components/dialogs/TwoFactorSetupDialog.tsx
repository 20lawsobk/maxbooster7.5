import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { offlineIdentity } from "@/lib/offline/identity";
import { freshCodeGuidance, reauthenticationGuidance, securityError, setupFactor } from "./securityContracts";

export default function TwoFactorSetupDialog({ open, onOpenChange, onSuccess, replacing = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSuccess?: () => void; replacing?: boolean;
}) {
  const { toast } = useToast();
  const [pending, setPending] = useState<{ secret: string; qrCode: string } | null>(null);
  const [currentCode, setCurrentCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPending(null); setCurrentCode(""); setCode(""); setError("");
  }, [open, replacing]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setPending(null); setCode(""); setCurrentCode("");
      setError("Setup expired after ten minutes. Sign in again and start a new setup.");
    }, 10 * 60_000);
    return () => clearTimeout(timer);
  }, [pending]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const identity = offlineIdentity();
    const current = () => offlineIdentity().owner === identity.owner && offlineIdentity().epoch === identity.epoch;
    setBusy(true); setError("");
    try {
      if (!pending) {
        const data = await setupFactor(apiRequest, replacing, currentCode);
        if (current()) setPending(data);
      } else {
        const response = await apiRequest("POST", "/api/auth/2fa/verify", { code });
        if ((await response.json()).success !== true) throw new Error("The server did not confirm factor verification.");
        if (current()) {
          toast({ title: replacing ? "Authenticator replaced" : "2FA enabled", description: freshCodeGuidance });
          setPending(null); onSuccess?.(); onOpenChange(false);
        }
      }
    } catch (error) {
      if (current()) setError(`${securityError(error)} If setup expired or is missing, start setup again. ${freshCodeGuidance}`);
    } finally {
      if (current()) { setBusy(false); setCode(""); setCurrentCode(""); }
    }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>{replacing ? "Replace authenticator" : "Set up two-factor authentication"}</DialogTitle>
        <DialogDescription>{reauthenticationGuidance} Setup expires in ten minutes and only works in this browser session. Your existing factor stays active until the new factor is verified.</DialogDescription>
      </DialogHeader>
      <p className="text-sm">{freshCodeGuidance}</p>
      <form onSubmit={submit} className="space-y-3">
        {pending ? <>
          <p>Scan this QR code with your authenticator app, or enter the secret manually. Verify with the new authenticator, not the old one.</p>
          <img src={pending.qrCode} alt="New authenticator setup QR code" className="w-48 h-48 mx-auto" />
          <Label htmlFor="factor-secret">Secret key (manual entry)</Label>
          <Input id="factor-secret" value={pending.secret} readOnly />
          <Label htmlFor="factor-verify">New authenticator code</Label>
          <Input id="factor-verify" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setPending(null); setCode(""); setError(""); }}>Start setup again</Button>
        </> : replacing && <>
          <Label htmlFor="factor-current">Current authenticator code</Label>
          <Input id="factor-current" inputMode="numeric" autoComplete="one-time-code" value={currentCode} onChange={e => setCurrentCode(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} />
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || (pending ? code.length !== 6 : replacing && currentCode.length !== 6)}>
          {busy ? "Please wait…" : pending ? "Verify new authenticator" : "Start setup"}
        </Button>
      </form>
    </DialogContent>
  </Dialog>;
}