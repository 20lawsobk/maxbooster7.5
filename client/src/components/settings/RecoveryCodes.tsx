import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Shield,
  Key,
  Copy,
  Download,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  Printer,
} from "lucide-react";

interface RecoveryCodesStatus {
  enabled: boolean;
  codesRemaining: number;
  totalCodes: number;
  lastGeneratedAt?: string;
  lastUsedAt?: string;
}

interface RecoveryCodesResponse {
  codes: string[];
  generatedAt: string;
}

export function RecoveryCodes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewCodesOpen, setViewCodesOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const { data: status, isLoading } = useQuery<RecoveryCodesStatus>({
    queryKey: ["/api/auth/recovery-codes/status"],
  });

  const generateCodesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/recovery-codes/generate");
      return res.json();
    },
    onSuccess: (data: RecoveryCodesResponse) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/auth/recovery-codes/status"],
      });
      setCodes(data.codes);
      setViewCodesOpen(true);
      setRegenerateOpen(false);
      toast({
        title: "Recovery Codes Generated",
        description: "New backup codes have been generated. Store them safely.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate recovery codes. Please try again.",
        variant: "destructive",
      });
    },
  });

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied",
        description: "Recovery codes copied to clipboard.",
      });
    } catch {
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  const downloadCodes = () => {
    const content = `Max Booster Recovery Codes
Generated: ${new Date().toLocaleString()}

These are your backup codes. Store them in a safe place.
Each code can only be used once.

${codes.map((code, i) => `${i + 1}. ${code}`).join("\n")}

Keep these codes secret and secure.
`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "maxbooster-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast({
      title: "Downloaded",
      description: "Recovery codes saved to file.",
    });
  };

  const printCodes = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Max Booster Recovery Codes</title>
            <style>
              body { font-family: monospace; padding: 40px; }
              h1 { font-size: 24px; margin-bottom: 20px; }
              .code { font-size: 18px; margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 4px; }
              .warning { color: #dc2626; margin-top: 20px; }
            </style>
          </head>
          <body>
            <h1>Max Booster Recovery Codes</h1>
            <p>Generated: ${new Date().toLocaleString()}</p>
            <p>Each code can only be used once.</p>
            <div style="margin: 20px 0;">
              ${codes.map((code, i) => `<div class="code">${i + 1}. ${code}</div>`).join("")}
            </div>
            <p class="warning">⚠️ Keep these codes secret and secure.</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-40 bg-muted animate-pulse rounded" />
          <div className="h-4 w-60 bg-muted animate-pulse rounded mt-2" />
        </CardHeader>
        <CardContent>
          <div className="h-32 bg-muted animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const codesLow = status?.enabled && status.codesRemaining <= 2;
  const codesExhausted = status?.enabled && status.codesRemaining === 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Recovery Codes
          </CardTitle>
          <CardDescription>
            Backup codes for account recovery if you lose access to your 2FA
            device
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status?.enabled ? (
            <div className="text-center py-8 bg-muted/10 rounded-lg border border-dashed">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">
                Recovery Codes Not Set Up
              </h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Generate recovery codes as a backup method to access your
                account if you lose your 2FA device.
              </p>
              <Button
                onClick={() => generateCodesMutation.mutate()}
                disabled={generateCodesMutation.isPending}
              >
                {generateCodesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    Generate Recovery Codes
                  </>
                )}
              </Button>
            </div>
          ) : (
            <>
              {codesExhausted && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No Recovery Codes Left</AlertTitle>
                  <AlertDescription>
                    All your recovery codes have been used. Generate new codes
                    immediately to maintain account access.
                  </AlertDescription>
                </Alert>
              )}

              {codesLow && !codesExhausted && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Running Low on Codes</AlertTitle>
                  <AlertDescription>
                    You only have {status.codesRemaining} recovery code
                    {status.codesRemaining > 1 ? "s" : ""} remaining. Consider
                    generating new codes.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/10">
                <div className="flex items-center gap-4">
                  <div
                    className={`p-3 rounded-full ${codesExhausted ? "bg-destructive/10" : codesLow ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-green-100 dark:bg-green-900/30"}`}
                  >
                    <Key
                      className={`h-6 w-6 ${codesExhausted ? "text-destructive" : codesLow ? "text-yellow-600" : "text-green-600"}`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {status.codesRemaining} of {status.totalCodes} codes
                        remaining
                      </p>
                      <Badge
                        variant={
                          codesExhausted
                            ? "destructive"
                            : codesLow
                              ? "secondary"
                              : "default"
                        }
                      >
                        {codesExhausted
                          ? "Exhausted"
                          : codesLow
                            ? "Low"
                            : "Active"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {status.lastGeneratedAt &&
                        `Generated ${new Date(status.lastGeneratedAt).toLocaleDateString()}`}
                      {status.lastUsedAt &&
                        ` • Last used ${new Date(status.lastUsedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setRegenerateOpen(true)}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
              </div>

              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-400">
                      Keep Your Codes Safe
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-500 mt-1">
                      Store your recovery codes in a secure password manager or
                      printed in a safe location. Never share them with anyone.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={viewCodesOpen} onOpenChange={setViewCodesOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Your Recovery Codes
            </DialogTitle>
            <DialogDescription>
              Save these codes in a secure location. Each code can only be used
              once.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                These codes will only be shown once. Copy or download them now.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Recovery Codes</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCodes(!showCodes)}
                >
                  {showCodes ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-1" />
                      Hide
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-1" />
                      Show
                    </>
                  )}
                </Button>
              </div>

              <div
                className={`grid grid-cols-2 gap-2 p-4 rounded-lg bg-muted ${showCodes ? "" : "blur-sm select-none"}`}
              >
                {codes.map((code, index) => (
                  <div
                    key={index}
                    className="font-mono text-sm px-3 py-2 bg-background rounded border"
                  >
                    {index + 1}. {code}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={copyCodes}
                className={copied ? "bg-green-600 text-white" : ""}
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 mr-1" />
                ) : (
                  <Copy className="h-4 w-4 mr-1" />
                )}
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={downloadCodes}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
              <Button variant="outline" size="sm" onClick={printCodes}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setViewCodesOpen(false);
                setCodes([]);
                setShowCodes(false);
              }}
            >
              I've Saved My Codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Recovery Codes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will invalidate all your existing recovery codes and generate
              new ones. Make sure to save the new codes securely.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => generateCodesMutation.mutate()}
              disabled={generateCodesMutation.isPending}
            >
              {generateCodesMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Generate New Codes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default RecoveryCodes;
