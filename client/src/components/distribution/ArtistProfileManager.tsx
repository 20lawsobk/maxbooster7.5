import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Music2, CheckCircle2, ChevronDown, ChevronUp, Trash2, Zap, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AutoArtistSync from "./AutoArtistSync";

interface ArtistProfile {
  id: string;
  artistName: string;
  isNewArtist: boolean;
  spotifyArtistId: string | null;
  spotifyArtistUri: string | null;
  appleArtistId: string | null;
  youtubeChannelId: string | null;
  tidalArtistId: string | null;
  deezerArtistId: string | null;
  soundcloudArtistId: string | null;
  amazonMusicArtistId: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  fixerPending: boolean;
  fixerStatus: string;
  profileImageUrl: string | null;
  genres: string[];
  // Phase 2 — health + safety
  healthScore: number | null;
  healthBreakdown: Record<string, number> | null;
  splitDetected: boolean;
  lastHealthAt: string | null;
  musicbrainzId: string | null;
  watchEnabled: boolean;
}

function healthGrade(score: number | null): { grade: string; color: string } {
  if (score === null || score === undefined)
    return { grade: "?", color: "text-muted-foreground" };
  if (score >= 85) return { grade: "A", color: "text-green-500" };
  if (score >= 70) return { grade: "B", color: "text-blue-500" };
  if (score >= 55) return { grade: "C", color: "text-amber-500" };
  if (score >= 40) return { grade: "D", color: "text-orange-500" };
  return { grade: "F", color: "text-destructive" };
}

interface Props {
  onSelectProfile?: (profile: ArtistProfile) => void;
  selectedProfileId?: string;
}

function connectedPlatforms(p: ArtistProfile): string[] {
  const out: string[] = [];
  if (p.spotifyArtistId) out.push("Spotify");
  if (p.appleArtistId) out.push("Apple");
  if (p.youtubeChannelId) out.push("YouTube");
  if (p.deezerArtistId) out.push("Deezer");
  if (p.tidalArtistId) out.push("Tidal");
  if (p.soundcloudArtistId) out.push("SoundCloud");
  if (p.amazonMusicArtistId) out.push("Amazon");
  return out;
}

export default function ArtistProfileManager({
  onSelectProfile,
  selectedProfileId,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);
  const [form, setForm] = useState({
    artistName: "",
    isNewArtist: true,
    upc: "",
  });

  const { data, isLoading } = useQuery<{ profiles: ArtistProfile[] }>({
    queryKey: ["/api/artist-profiles"],
    queryFn: () =>
      apiRequest("GET", "/api/artist-profiles").then((r) => r.json()),
  });
  const profiles = data?.profiles ?? [];

  const triggerDiscover = async (profileId: string, upc?: string) => {
    setDiscoveringId(profileId);
    try {
      await apiRequest(
        "POST",
        `/api/artist-profiles/${profileId}/auto-discover`,
        {
          upc: upc?.replace(/[^0-9]/g, "") || undefined,
        },
      );
      queryClient.invalidateQueries({ queryKey: ["/api/artist-profiles"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/artist-profiles/${profileId}/profile-hub`],
      });
    } catch {
      // silently fail — user can retry from the hub
    } finally {
      setDiscoveringId(null);
    }
  };

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      apiRequest("POST", "/api/artist-profiles", body).then((r) => r.json()),
    onSuccess: async ({ profile }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artist-profiles"] });
      setShowCreateDialog(false);
      const upc = form.upc;
      setForm({ artistName: "", isNewArtist: true, upc: "" });
      setExpandedId(profile.id);
      toast({
        title: "Artist profile created",
        description: `Searching for "${profile.artistName}" across streaming platforms…`,
      });
      await triggerDiscover(profile.id, upc);
      queryClient.invalidateQueries({ queryKey: ["/api/artist-profiles"] });
    },
    onError: (err: Error) => {
      const isStorageLimit =
        err?.status === 507 ||
        err?.message?.includes("storage limit") ||
        err?.message?.includes("DB_STORAGE_LIMIT");
      toast({
        title: isStorageLimit
          ? "Database Storage Full"
          : "Failed to create artist profile",
        description: isStorageLimit
          ? "Your database has reached its 512 MB limit. Visit console.neon.tech to upgrade your plan or free up storage."
          : err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/artist-profiles/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artist-profiles"] });
      if (expandedId === id) setExpandedId(null);
      toast({ title: "Artist profile deleted" });
    },
    onError: () =>
      toast({
        title: "Failed to delete artist profile",
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Artist Profiles</h3>
          <p className="text-sm text-muted-foreground">
            Auto-discovers and syncs your artist identity across Spotify, Apple
            Music, Deezer, and more.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Profile
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading artist profiles…</span>
        </div>
      )}

      {!isLoading && profiles.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Music2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No artist profiles yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create a profile and MaxBooster will automatically find and link
              your artist pages across streaming platforms.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Profile
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {profiles.map((profile) => {
          const platforms = connectedPlatforms(profile);
          const isSelected = selectedProfileId === profile.id;
          const isExpanded = expandedId === profile.id;
          const isDiscovering = discoveringId === profile.id;
          const { grade } = healthGrade(profile.healthScore);

          return (
            <Card
              key={profile.id}
              className={`transition-all ${isSelected ? "ring-2 ring-primary" : "hover:border-primary/50"} ${profile.splitDetected ? "border-destructive/40" : ""}`}
            >
              <Collapsible
                open={isExpanded}
                onOpenChange={(open) => setExpandedId(open ? profile.id : null)}
              >
                <CollapsibleTrigger asChild>
                  <CardContent
                    className="p-4 cursor-pointer"
                    onClick={() => {
                      onSelectProfile?.(profile);
                      setExpandedId(isExpanded ? null : profile.id);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar with health ring */}
                      <div className="relative flex-shrink-0">
                        {profile.profileImageUrl ? (
                          <img
                            src={profile.profileImageUrl}
                            alt={profile.artistName}
                            className="h-12 w-12 rounded-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <Music2 className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        {/* Health grade ring — bottom-right of avatar */}
                        {profile.healthScore !== null && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-bold cursor-default ${
                                    grade === "A"
                                      ? "bg-green-500 text-white"
                                      : grade === "B"
                                        ? "bg-blue-500 text-white"
                                        : grade === "C"
                                          ? "bg-amber-500 text-white"
                                          : grade === "D"
                                            ? "bg-orange-500 text-white"
                                            : "bg-destructive text-white"
                                  }`}
                                >
                                  {grade}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">
                                <p className="font-medium">
                                  Profile Health: {profile.healthScore}/100
                                </p>
                                {profile.healthBreakdown && (
                                  <div className="mt-1 space-y-0.5">
                                    {Object.entries(
                                      profile.healthBreakdown,
                                    ).map(([k, v]) => (
                                      <div
                                        key={k}
                                        className="flex justify-between gap-3"
                                      >
                                        <span className="capitalize text-muted-foreground">
                                          {k}
                                        </span>
                                        <span>{v}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <p className="text-muted-foreground mt-1">
                                  Expand to recalculate
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold truncate">
                            {profile.artistName}
                          </span>
                          {profile.isVerified && (
                            <CheckCircle2
                              className="h-4 w-4 text-green-500 shrink-0"
                              title="Verified"
                            />
                          )}
                          {isDiscovering && (
                            <Loader2
                              className="h-4 w-4 animate-spin text-blue-500 shrink-0"
                              title="Searching platforms…"
                            />
                          )}
                          {profile.splitDetected && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className="text-xs text-destructive border-destructive/40 gap-1 cursor-default"
                                  >
                                    <TriangleAlert className="h-3 w-3" /> Split
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs max-w-xs">
                                  A split profile was detected. Music has landed
                                  on a duplicate or wrong artist page. Expand
                                  this profile and use the Multi-Platform Fixer
                                  to resolve.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {profile.fixerPending && (
                            <Badge variant="secondary" className="text-xs">
                              Fixer pending
                            </Badge>
                          )}
                          {profile.musicbrainzId && (
                            <Badge
                              variant="outline"
                              className="text-xs text-purple-500 border-purple-500/30"
                              title={`MusicBrainz: ${profile.musicbrainzId}`}
                            >
                              MB
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge
                            variant={
                              profile.isNewArtist ? "secondary" : "outline"
                            }
                            className="text-xs"
                          >
                            {profile.isNewArtist
                              ? "New artist"
                              : "Existing artist"}
                          </Badge>
                          {platforms.map((p) => (
                            <Badge
                              key={p}
                              variant="outline"
                              className="text-xs text-green-600 border-green-200"
                            >
                              {p}
                            </Badge>
                          ))}
                          {platforms.length === 0 && !isDiscovering && (
                            <Badge
                              variant="outline"
                              className="text-xs text-orange-500 border-orange-200"
                            >
                              No platforms linked
                            </Badge>
                          )}
                          {isDiscovering && (
                            <Badge
                              variant="outline"
                              className="text-xs text-blue-500 border-blue-200"
                            >
                              Discovering…
                            </Badge>
                          )}
                        </div>

                        {profile.genres && profile.genres.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {profile.genres.slice(0, 3).map((g) => (
                              <span
                                key={g}
                                className="text-xs text-muted-foreground/70"
                              >
                                {g}
                              </span>
                            ))}
                            {profile.genres.length > 3 && (
                              <span className="text-xs text-muted-foreground/50">
                                +{profile.genres.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {platforms.length === 0 && !isDiscovering && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerDiscover(profile.id);
                            }}
                            title="Run auto-discovery"
                            className="text-xs gap-1 text-blue-500 hover:text-blue-600"
                          >
                            <Zap className="h-3.5 w-3.5" /> Discover
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(profile.id);
                          }}
                          title="Delete profile"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-4 pb-4 border-t pt-3">
                    <AutoArtistSync
                      profile={profile}
                      onUpdated={() =>
                        queryClient.invalidateQueries({
                          queryKey: ["/api/artist-profiles"],
                        })
                      }
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Artist Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Artist Name</Label>
              <Input
                placeholder="e.g. B-Lawz"
                value={form.artistName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, artistName: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && form.artistName.trim())
                    createMutation.mutate({
                      artistName: form.artistName,
                      isNewArtist: form.isNewArtist,
                    });
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>
                UPC (optional)
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  — improves discovery accuracy
                </span>
              </Label>
              <Input
                placeholder="e.g. 00602557698992"
                value={form.upc}
                onChange={(e) =>
                  setForm((f) => ({ ...f, upc: e.target.value }))
                }
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Enter the UPC of one of your releases. This allows exact lookup
                on Apple Music and Deezer instead of name-based search.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium text-sm">New artist?</p>
                <p className="text-xs text-muted-foreground">
                  Turn off if this artist already has profiles on Spotify, Apple
                  Music, etc.
                </p>
              </div>
              <Switch
                checked={form.isNewArtist}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isNewArtist: v }))
                }
              />
            </div>

            {!form.isNewArtist && (
              <div className="rounded-lg bg-muted/50 border p-3 text-sm text-muted-foreground">
                After creating this profile, MaxBooster will automatically
                search Spotify, Apple Music, Deezer, MusicBrainz, and Audiomack
                for your artist page and link any high-confidence matches.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  artistName: form.artistName,
                  isNewArtist: form.isNewArtist,
                })
              }
              disabled={!form.artistName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating…
                </>
              ) : (
                "Create Profile"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
