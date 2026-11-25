// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Fingerprint, CheckCircle2, XCircle, Loader2, Shield, Copy, Music, AlertTriangle, Info, RefreshCw, Waves } from "lucide-react";

interface ContentIdRegistration {
  id: string;
  trackId: string;
  trackTitle: string;
  fingerprint: string;
  fingerprintAlgorithm?: string | null;
  fingerprintByteLength?: number | null;
  status:
    | "pending"
    | "fingerprint_generated"
    | "unverified_legacy"
    | "registered"
    | "conflict"
    | "failed";
  registeredAt?: string;
  platforms?: string[];
  conflictDetails?: ContentConflict;
}

interface ContentConflict {
  matchPercentage: number;
  matchedTrack: {
    title: string;
    artist: string;
    isrc?: string;
    releaseDate?: string;
    owner?: string;
  };
  resolutionOptions: ResolutionOption[];
}

interface ResolutionOption {
  id: string;
  type: "claim_ownership" | "dispute" | "license" | "remove" | "coexist";
  label: string;
  description: string;
  requiresEvidence: boolean;
}

interface ContentIDManagerProps {
  releaseId: string;
  tracks: Array<{
    id: string;
    title: string;
    audioUrl?: string;
  }>;
  onComplete?: () => void;
}

export function ContentIDManager({
  releaseId,
  tracks,
  onComplete,
}: ContentIDManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTrack, setSelectedTrack] =
    useState<ContentIdRegistration | null>(null);
  const [resolutionChoice, setResolutionChoice] = useState<string>("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [showResolutionDialog, setShowResolutionDialog] = useState(false);

  const {
    data: registrations = [],
    isLoading,
    refetch,
  } = useQuery<ContentIdRegistration[]>({
    queryKey: [`/api/distribution/releases/${releaseId}/content-id`],
  });

  const generateFingerprintMutation = useMutation({
    mutationFn: async (trackId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/distribution/content-id/generate`,
        {
          releaseId,
          trackId,
        },
      );
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Exact file digest saved",
        description:
          data.message || "The exact audio file digest was saved.",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/distribution/releases/${releaseId}/content-id`],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/distribution/content-id/generate-all`,
        {
          releaseId,
        },
      );
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Exact file digests saved",
        description: data.message,
      });
      onComplete?.();
      queryClient.invalidateQueries({
        queryKey: [`/api/distribution/releases/${releaseId}/content-id`],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resolveConflictMutation = useMutation({
    mutationFn: async ({
      registrationId,
      resolution,
      notes,
    }: {
      registrationId: string;
      resolution: string;
      notes?: string;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/distribution/content-id/resolve`,
        {
          registrationId,
          resolution,
          notes,
        },
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Resolution Submitted",
        description: "Your conflict resolution has been submitted for review.",
      });
      setShowResolutionDialog(false);
      setSelectedTrack(null);
      setResolutionChoice("");
      setResolutionNotes("");
      queryClient.invalidateQueries({
        queryKey: [`/api/distribution/releases/${releaseId}/content-id`],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Resolution Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registeredCount = registrations.filter(
    (r) => r.status === "registered",
  ).length;
  const digestCount = registrations.filter(
    (r) => r.status === "fingerprint_generated",
  ).length;
  const pendingCount = tracks.length - digestCount;
  const legacyCount = registrations.filter(
    (r) => r.status === "unverified_legacy",
  ).length;
  const progress =
    tracks.length > 0 ? (digestCount / tracks.length) * 100 : 0;

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "registered":
        return {
          icon: CheckCircle2,
          color: "text-green-500",
          bg: "bg-green-500/10",
          label: "Provider-confirmed registration",
        };
      case "generating":
        return {
          icon: Loader2,
          color: "text-blue-500",
          bg: "bg-blue-500/10",
          label: "Generating",
        };
      case "fingerprint_generated":
        return {
          icon: CheckCircle2,
          color: "text-blue-500",
          bg: "bg-blue-500/10",
          label: "Exact file digest saved",
        };
      case "unverified_legacy":
        return {
          icon: AlertTriangle,
          color: "text-orange-500",
          bg: "bg-orange-500/10",
          label: "Unverified old status",
        };
      case "pending":
        return {
          icon: Fingerprint,
          color: "text-yellow-500",
          bg: "bg-yellow-500/10",
          label: "Pending",
        };
      case "conflict":
        return {
          icon: AlertTriangle,
          color: "text-orange-500",
          bg: "bg-orange-500/10",
          label: "Conflict",
        };
      case "failed":
        return {
          icon: XCircle,
          color: "text-red-500",
          bg: "bg-red-500/10",
          label: "Failed",
        };
      default:
        return {
          icon: Info,
          color: "text-gray-500",
          bg: "bg-gray-500/10",
          label: status,
        };
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5 text-primary" />
                Track File Integrity
              </CardTitle>
              <CardDescription>
                Save exact-file SHA-256 digests for file integrity. This is not
                an acoustic fingerprint and does not register content with any
                platform.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                onClick={() => generateAllMutation.mutate()}
                disabled={generateAllMutation.isPending}
              >
                {generateAllMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Fingerprint className="h-4 w-4 mr-2" />
                )}
                Generate All Fingerprints
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Exact File Digest Coverage
              </span>
              <span className="font-medium">
                  {digestCount} / {tracks.length} track files hashed
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <p className="text-2xl font-bold text-green-500">
                {registeredCount}
              </p>
              <p className="text-xs text-muted-foreground">Platform-registered</p>
            </div>
            <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
              <p className="text-2xl font-bold text-yellow-500">
                {pendingCount}
              </p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="text-center p-3 bg-orange-500/10 rounded-lg">
              <p className="text-2xl font-bold text-orange-500">
                {legacyCount}
              </p>
              <p className="text-xs text-muted-foreground">Unverified old status</p>
            </div>
          </div>

          {tracks.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Platform registration is unavailable</AlertTitle>
              <AlertDescription>
                No Content ID provider is connected. Hashing records the exact
                file bytes only; it does not create claims or protection on
                YouTube, Meta, or another service.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Track File Digest Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tracks.map((track, index) => {
              const registration = registrations.find(
                (r) => r.trackId === track.id,
              );
              const status = registration?.status || "pending";
              const statusConfig = getStatusConfig(status);
              const StatusIcon = statusConfig.icon;

              return (
                <div
                  key={track.id}
                  className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                    <span className="text-sm font-medium">{index + 1}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{track.title}</p>
                    {registration?.fingerprint && (
                      <div className="flex items-center gap-2 mt-1">
                        <Waves className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-mono truncate">
                          {registration.fingerprint.substring(0, 24)}...
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge
                      className={`${statusConfig.bg} ${statusConfig.color} border-0`}
                    >
                      <StatusIcon
                        className={`h-3 w-3 mr-1 ${status === "generating" ? "animate-spin" : ""}`}
                      />
                      {statusConfig.label}
                    </Badge>

                    {status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          generateFingerprintMutation.mutate(track.id)
                        }
                        disabled={generateFingerprintMutation.isPending}
                      >
                        <Fingerprint className="h-3 w-3 mr-1" />
                        Generate
                      </Button>
                    )}

                    {status === "conflict" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          toast({
                            title: "Provider action unavailable",
                            description:
                              "No connected Content ID provider can verify or resolve this status.",
                            variant: "destructive",
                          });
                        }}
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Details
                      </Button>
                    )}

                    {(status === "registered" ||
                      status === "fingerprint_generated" ||
                      status === "unverified_legacy") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedTrack(registration!)}
                      >
                        <Info className="h-3 w-3 mr-1" />
                        Details
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!selectedTrack && !showResolutionDialog}
        onOpenChange={() => setSelectedTrack(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              File Integrity Details
            </DialogTitle>
            <DialogDescription>{selectedTrack?.trackTitle}</DialogDescription>
          </DialogHeader>

          {selectedTrack && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge className={getStatusConfig(selectedTrack.status).bg}>
                    {getStatusConfig(selectedTrack.status).label}
                  </Badge>
                </div>
                {selectedTrack.fingerprint && (
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Exact-file SHA-256 digest
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedTrack.fingerprintAlgorithm || "Unverified algorithm"}
                      {selectedTrack.fingerprintByteLength
                        ? ` · ${selectedTrack.fingerprintByteLength.toLocaleString()} bytes`
                        : ""}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs bg-background p-2 rounded flex-1 truncate">
                        {selectedTrack.fingerprint}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            selectedTrack.fingerprint,
                          );
                          toast({ title: "Copied to clipboard" });
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
                {selectedTrack.registeredAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Registered
                    </span>
                    <span className="text-sm">
                      {new Date(selectedTrack.registeredAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {(selectedTrack.platforms || []).length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Provider-confirmed platforms
                    </span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(selectedTrack.platforms || []).map((platform) => (
                        <Badge key={platform} variant="outline">
                          {platform}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTrack(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showResolutionDialog}
        onOpenChange={setShowResolutionDialog}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Resolve Content Conflict
            </DialogTitle>
            <DialogDescription>
              Similar content has been detected. Choose how to proceed.
            </DialogDescription>
          </DialogHeader>

          {selectedTrack?.conflictDetails && (
            <div className="space-y-4">
              <Alert>
                <Music className="h-4 w-4" />
                <AlertTitle>
                  Matched Content (
                  {selectedTrack.conflictDetails.matchPercentage}% match)
                </AlertTitle>
                <AlertDescription>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>
                      <strong>Title:</strong>{" "}
                      {selectedTrack.conflictDetails.matchedTrack.title}
                    </p>
                    <p>
                      <strong>Artist:</strong>{" "}
                      {selectedTrack.conflictDetails.matchedTrack.artist}
                    </p>
                    {selectedTrack.conflictDetails.matchedTrack.isrc && (
                      <p>
                        <strong>ISRC:</strong>{" "}
                        {selectedTrack.conflictDetails.matchedTrack.isrc}
                      </p>
                    )}
                    {selectedTrack.conflictDetails.matchedTrack.owner && (
                      <p>
                        <strong>Owner:</strong>{" "}
                        {selectedTrack.conflictDetails.matchedTrack.owner}
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Label>Resolution Option</Label>
                <RadioGroup
                  value={resolutionChoice}
                  onValueChange={setResolutionChoice}
                >
                  {selectedTrack.conflictDetails.resolutionOptions.map(
                    (option) => (
                      <div
                        key={option.id}
                        className="flex items-start space-x-3 p-3 border rounded-lg"
                      >
                        <RadioGroupItem
                          value={option.id}
                          id={option.id}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={option.id}
                            className="font-medium cursor-pointer"
                          >
                            {option.label}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {option.description}
                          </p>
                          {option.requiresEvidence && (
                            <Badge variant="outline" className="mt-2">
                              Requires evidence
                            </Badge>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Additional Notes (Optional)</Label>
                <Textarea
                  placeholder="Provide any additional context or evidence..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResolutionDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedTrack && resolutionChoice) {
                  resolveConflictMutation.mutate({
                    registrationId: selectedTrack.id,
                    resolution: resolutionChoice,
                    notes: resolutionNotes,
                  });
                }
              }}
              disabled={!resolutionChoice || resolveConflictMutation.isPending}
            >
              {resolveConflictMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Submit Resolution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
