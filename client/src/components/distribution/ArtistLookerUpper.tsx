import { useState } from "react";
import {
  Search,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Music2,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ArtistProfile {
  id: string;
  artistName: string;
  spotifyArtistId: string | null;
  spotifyArtistUri: string | null;
  appleArtistId: string | null;
  deezerArtistId: string | null;
}

interface SpotifyResult {
  id: string;
  uri: string;
  name: string;
  imageUrl: string | null;
  genres: string[];
  followers: number;
  popularity: number;
  externalUrl: string;
}

interface AppleResult {
  id: string;
  name: string;
  genres: string[];
  artworkUrl: string | null;
  url: string;
}

interface DeezerResult {
  id: string;
  name: string;
  pictureUrl: string | null;
  fans: number;
  link: string;
}

interface SearchResults {
  spotify: SpotifyResult[];
  apple: AppleResult[];
  deezer: DeezerResult[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ArtistProfile;
  onSaved: () => void;
}

export default function ArtistLookerUpper({
  open,
  onOpenChange,
  profile,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [query, setQuery] = useState(profile.artistName);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await apiRequest(
        "GET",
        `/api/artist-profiles/search?q=${encodeURIComponent(query)}&platform=all`,
      );
      const data = await res.json();
      setResults(data.results);
    } catch {
      toast({
        title: "Search failed",
        description: "Could not reach platform APIs",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<ArtistProfile>) =>
      apiRequest("PATCH", `/api/artist-profiles/${profile.id}`, updates).then(
        (r) => r.json(),
      ),
    onSuccess: () => {
      toast({ title: "Platform ID saved to artist profile" });
      onSaved();
    },
    onError: () =>
      toast({ title: "Failed to save platform ID", variant: "destructive" }),
  });

  const fmt = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1000
        ? `${(n / 1000).toFixed(0)}K`
        : String(n);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Artist Looker-Upper</DialogTitle>
          <DialogDescription>
            Search Spotify, Apple Music, and Deezer to find the correct IDs for{" "}
            <strong>{profile.artistName}</strong>. Select the matching result to
            save it to this profile.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Search artist name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <Button onClick={search} disabled={isSearching}>
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {results && (
          <Tabs defaultValue="spotify">
            <TabsList className="w-full">
              <TabsTrigger value="spotify" className="flex-1">
                Spotify{" "}
                {results.spotify.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {results.spotify.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="apple" className="flex-1">
                Apple Music{" "}
                {results.apple.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {results.apple.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="deezer" className="flex-1">
                Deezer{" "}
                {results.deezer.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {results.deezer.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="spotify" className="space-y-2 mt-3">
              {results.spotify.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No Spotify results found
                </p>
              )}
              {results.spotify.map((artist) => (
                <div
                  key={artist.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50"
                >
                  {artist.imageUrl ? (
                    <img
                      src={artist.imageUrl}
                      alt={artist.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <Music2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{artist.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {artist.genres.slice(0, 3).join(", ")} ·{" "}
                      {fmt(artist.followers)} followers
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {artist.uri}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {profile.spotifyArtistId === artist.id ? (
                      <Badge className="bg-green-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Saved
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          saveMutation.mutate({
                            spotifyArtistId: artist.id,
                            spotifyArtistUri: artist.uri,
                          })
                        }
                        disabled={saveMutation.isPending}
                      >
                        Use this
                      </Button>
                    )}
                    <a
                      href={artist.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button size="sm" variant="ghost">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="apple" className="space-y-2 mt-3">
              {results.apple.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No Apple Music results found
                </p>
              )}
              {results.apple.map((artist) => (
                <div
                  key={artist.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50"
                >
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Music2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{artist.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {artist.genres.join(", ")}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      ID: {artist.id}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {profile.appleArtistId === artist.id ? (
                      <Badge className="bg-green-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Saved
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          saveMutation.mutate({ appleArtistId: artist.id })
                        }
                        disabled={saveMutation.isPending}
                      >
                        Use this
                      </Button>
                    )}
                    <a href={artist.url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="deezer" className="space-y-2 mt-3">
              {results.deezer.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No Deezer results found
                </p>
              )}
              {results.deezer.map((artist) => (
                <div
                  key={artist.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50"
                >
                  {artist.pictureUrl ? (
                    <img
                      src={artist.pictureUrl}
                      alt={artist.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <Music2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{artist.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmt(artist.fans)} fans
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      ID: {artist.id}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {profile.deezerArtistId === artist.id ? (
                      <Badge className="bg-green-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Saved
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          saveMutation.mutate({ deezerArtistId: artist.id })
                        }
                        disabled={saveMutation.isPending}
                      >
                        Use this
                      </Button>
                    )}
                    <a href={artist.link} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}

        {!results && !isSearching && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Search for "{profile.artistName}" to find your artist profiles
            across platforms.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
