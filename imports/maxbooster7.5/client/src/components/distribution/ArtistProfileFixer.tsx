import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Wrench, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ArtistProfile {
  id: string;
  artistName: string;
  spotifyArtistUri: string | null;
  fixerPending: boolean;
  fixerStatus: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ArtistProfile;
  onSubmitted: () => void;
}

export default function ArtistProfileFixer({
  open,
  onOpenChange,
  profile,
  onSubmitted,
}: Props) {
  const { toast } = useToast();
  const [targetUri, setTargetUri] = useState("");
  const [notes, setNotes] = useState("");
  const [uriError, setUriError] = useState("");

  const validateUri = (v: string) => {
    if (!v) return "";
    if (!/^spotify:artist:[A-Za-z0-9]+$/.test(v)) {
      return "Must be a valid Spotify artist URI, e.g. spotify:artist:4Z8W4fKeB5YxbusRsdQVPb";
    }
    return "";
  };

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/artist-profiles/${profile.id}/fixer`, {
        targetSpotifyUri: targetUri,
        notes,
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({
        title: "Fixer request submitted",
        description:
          "Your release mapping will be corrected on the next distribution update.",
      });
      setTargetUri("");
      setNotes("");
      onSubmitted();
    },
    onError: (err: Error) =>
      toast({
        title: "Failed to submit fixer request",
        description:
          err?.message ?? "Please check the Spotify URI and try again.",
        variant: "destructive",
      }),
  });

  const handleSubmit = () => {
    const err = validateUri(targetUri);
    setUriError(err);
    if (err || !targetUri) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-orange-500" />
            Artist Profile Fixer
          </DialogTitle>
          <DialogDescription>
            If your music is appearing under the wrong artist page on Spotify,
            use this tool to request a re-mapping.
          </DialogDescription>
        </DialogHeader>

        {profile.fixerPending && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription>
              A fixer request is already pending for this profile. Status:{" "}
              <strong>{profile.fixerStatus}</strong>. Submitting a new one will
              replace the existing request.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1">Profile being fixed</p>
            <p className="text-sm text-muted-foreground">
              {profile.artistName}
            </p>
            {profile.spotifyArtistUri && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Current: {profile.spotifyArtistUri}
              </p>
            )}
          </div>

          <Alert
            variant="destructive"
            className="bg-orange-50 border-orange-200 text-orange-800"
          >
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <AlertDescription className="text-orange-800">
              Only use this if your music is incorrectly grouped with another
              artist. The fixer request will update your artist URI and apply to
              all future releases. Past releases may require manual DSP support
              tickets.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>
              Correct Spotify Artist URI{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="spotify:artist:4Z8W4fKeB5YxbusRsdQVPb"
              value={targetUri}
              onChange={(e) => {
                setTargetUri(e.target.value);
                setUriError(validateUri(e.target.value));
              }}
              className={uriError ? "border-destructive" : ""}
            />
            {uriError && <p className="text-xs text-destructive">{uriError}</p>}
            <p className="text-xs text-muted-foreground">
              Find your correct artist URI on Spotify: right-click your artist
              page → Share → Copy Spotify URI.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Describe the issue, e.g. 'My releases are appearing under a different artist with the same name based in the UK'"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {notes.length}/1000
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!targetUri || !!uriError || mutation.isPending}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Wrench className="h-4 w-4 mr-2" />
            {mutation.isPending ? "Submitting…" : "Submit Fixer Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
