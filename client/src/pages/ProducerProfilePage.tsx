import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BeatCard } from "@/components/marketplace/BeatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Music,
  Share2,
  Star,
  Users,
  UserPlus,
  UserCheck,
  DollarSign,
  CheckCircle,
  MapPin,
  Globe,
  ArrowLeft,
  ShoppingCart,
  RefreshCw,
  Loader2,
  FileText,
  Infinity as InfinityIcon,
  Lock,
} from "lucide-react";
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface Producer {
  id: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  website?: string;
  verified?: boolean;
  followers?: number;
  followerCount?: number;
  sales?: number;
  beats?: number;
  beatCount?: number;
  rating?: number;
}

interface Beat {
  id: string;
  title: string;
  bpm: number;
  tempo?: number;
  key: string;
  genre: string;
  price: number;
  coverArt?: string;
  audioPreview?: string;
  audioUrl?: string;
  previewUrl?: string;
  plays?: number;
  licenseOptions?: Array<{
    licenseType: string;
    priceCents: number;
    fileFormats: string[];
  }>;
}

const DEFAULT_LICENSES = [
  {
    licenseType: "basic",
    label: "Basic License",
    description: "MP3 download, up to 100k streams",
    fileFormats: ["mp3"],
    multiplier: 1,
    icon: "file",
  },
  {
    licenseType: "premium",
    label: "Premium License",
    description: "WAV + MP3, up to 500k streams",
    fileFormats: ["mp3", "wav"],
    multiplier: 1.5,
    icon: "star",
  },
  {
    licenseType: "unlimited",
    label: "Unlimited License",
    description: "WAV + MP3 + Stems, unlimited streams",
    fileFormats: ["mp3", "wav", "stems"],
    multiplier: 2,
    icon: "infinity",
  },
  {
    licenseType: "exclusive",
    label: "Exclusive Rights",
    description: "Full ownership transfer, beat removed from store",
    fileFormats: ["mp3", "wav", "stems"],
    multiplier: 5,
    icon: "lock",
  },
];

export default function ProducerProfilePage() {
  const { isLoading: authLoading } = useRequireAuth();
  const params = useParams<{ producerId: string }>();
  const producerId = params.producerId;
  const [, navigate] = useLocation();
  const [playingBeatId, setPlayingBeatId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [purchaseBeat, setPurchaseBeat] = useState<Beat | null>(null);
  const [selectedLicense, setSelectedLicense] = useState<string>("basic");

  const purchaseMutation = useMutation({
    mutationFn: async ({
      beatId,
      licenseType,
    }: {
      beatId: string;
      licenseType: string;
    }) => {
      const res = await apiRequest("POST", "/api/marketplace/purchase", {
        beatId,
        licenseType,
      });
      return res.json();
    },
    onSuccess: (data: { url?: string }) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Purchase Successful!",
          description: `You've successfully purchased "${purchaseBeat?.title}". Check your purchases for the download link.`,
        });
        setPurchaseBeat(null);
        queryClient.invalidateQueries({
          queryKey: ["/api/marketplace/purchases"],
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Purchase Failed",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: followStatus } = useQuery<{ isFollowing: boolean }>({
    queryKey: ["producer-follow-status", producerId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/marketplace/producers/${producerId}/follow-status`,
      );
      return res.json();
    },
    enabled: !!producerId,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/marketplace/follow/${producerId}`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["producer-follow-status", producerId],
      });
      queryClient.invalidateQueries({ queryKey: ["producer", producerId] });
      toast({
        title: followStatus?.isFollowing ? "Unfollowed" : "Following!",
        description: followStatus?.isFollowing
          ? "You unfollowed this producer"
          : "You are now following this producer",
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/marketplace/unfollow/${producerId}`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["producer-follow-status", producerId],
      });
      queryClient.invalidateQueries({ queryKey: ["producer", producerId] });
      toast({
        title: "Unfollowed",
        description: "You unfollowed this producer",
      });
    },
  });

  const { data: producer, isLoading: producerLoading } = useQuery<Producer>({
    queryKey: ["producer", producerId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/marketplace/producers/${producerId}`,
      );
      return res.json();
    },
    enabled: !!producerId,
  });

  const { data: beatsData, isLoading: beatsLoading } = useQuery<Beat[]>({
    queryKey: ["producer-beats", producerId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/marketplace/beats?producerId=${producerId}`,
      );
      return res.json();
    },
    enabled: !!producerId,
  });

  const beats = Array.isArray(beatsData) ? beatsData : [];

  const { data: allProducersData } = useQuery<{ producers: unknown[] }>({
    queryKey: ["all-producers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/marketplace/producers");
      return res.json();
    },
    enabled: !!producerId,
    staleTime: 5 * 60 * 1000,
  });
  const allProducers = allProducersData?.producers || [];

  const handlePlayBeat = (beat: Beat) => {
    if (playingBeatId === beat.id) {
      audioRef.current?.pause();
      setPlayingBeatId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const src = beat.audioPreview || beat.audioUrl || beat.previewUrl;
      if (src) {
        const fullSrc = src.startsWith("http")
          ? src
          : `${window.location.origin}${src.startsWith("/") ? src : "/" + src}`;
        audioRef.current = new Audio(fullSrc);
        audioRef.current.play().catch(() => {});
        setPlayingBeatId(beat.id);
        audioRef.current.onended = () => setPlayingBeatId(null);
      } else {
        toast({
          title: "Preview unavailable",
          description: "No audio preview for this beat.",
          variant: "destructive",
        });
      }
    }
  };

  const getLicensePrice = (beat: Beat, licenseType: string) => {
    const opt = beat.licenseOptions?.find((o) => o.licenseType === licenseType);
    if (opt) return opt.priceCents / 100;
    const def = DEFAULT_LICENSES.find((l) => l.licenseType === licenseType);
    return beat.price * (def?.multiplier || 1);
  };

  if (authLoading || producerLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!producer) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <h2 className="text-2xl font-bold">Producer Not Found</h2>
          <p className="text-muted-foreground">
            The producer you're looking for doesn't exist.
          </p>
          <Button onClick={() => navigate("/marketplace")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Marketplace
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/marketplace")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Marketplace
        </Button>

        <Card className="overflow-hidden">
          <div className="h-32 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600" />
          <CardContent className="relative pt-0">
            <div className="flex flex-col md:flex-row items-start md:items-end gap-6 -mt-16">
              <div className="relative">
                {producer.avatarUrl ? (
                  <img
                    src={producer.avatarUrl}
                    alt={producer.name || producer.username}
                    className="w-32 h-32 rounded-full border-4 border-background object-cover shadow-xl"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full border-4 border-background bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold shadow-xl">
                    {(producer.name || producer.username)
                      ?.substring(0, 2)
                      ?.toUpperCase() || "PR"}
                  </div>
                )}
                {producer.verified && (
                  <div className="absolute bottom-2 right-2 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>

              <div className="flex-1 pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold">
                    {producer.name || producer.username}
                  </h1>
                  {producer.verified && (
                    <Badge className="bg-blue-600">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>

                {producer.bio && (
                  <p className="text-muted-foreground mb-3 max-w-2xl">
                    {producer.bio}
                  </p>
                )}

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {producer.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {producer.location}
                    </div>
                  )}
                  {producer.website && (
                    <a
                      href={producer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-blue-500 transition"
                    >
                      <Globe className="w-4 h-4" />
                      Website
                    </a>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className={
                    followStatus?.isFollowing
                      ? ""
                      : "bg-gradient-to-r from-blue-600 to-purple-600"
                  }
                  variant={followStatus?.isFollowing ? "outline" : "default"}
                  onClick={() =>
                    followStatus?.isFollowing
                      ? unfollowMutation.mutate()
                      : followMutation.mutate()
                  }
                  disabled={
                    followMutation.isPending || unfollowMutation.isPending
                  }
                >
                  {followStatus?.isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4 mr-2" /> Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" /> Follow
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/marketplace/producer/${producerId}`;
                    const shareData = {
                      title: `${producer.displayName || producer.username} on Max Booster`,
                      url: shareUrl,
                    };
                    if (navigator.share) {
                      navigator.share(shareData).catch(() => {});
                    } else {
                      navigator.clipboard
                        .writeText(shareUrl)
                        .then(() => {
                          toast({
                            title: "Link copied!",
                            description:
                              "Producer profile link copied to clipboard",
                          });
                        })
                        .catch(() => {
                          toast({
                            title: "Could not copy link",
                            variant: "destructive",
                          });
                        });
                    }
                  }}
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Music className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">
                {producer.beatCount || producer.beats || beats.length || 0}
              </p>
              <p className="text-sm text-muted-foreground">Beats</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">{producer.sales || 0}</p>
              <p className="text-sm text-muted-foreground">Sales</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-purple-500" />
              <p className="text-2xl font-bold">
                {producer.followerCount || producer.followers || 0}
              </p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Star className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
              <p className="text-2xl font-bold">
                {(producer.rating || 0).toFixed(1)}
              </p>
              <p className="text-sm text-muted-foreground">Rating</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="beats" className="w-full">
          <TabsList>
            <TabsTrigger value="beats">Beats ({beats.length})</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="beats" className="mt-6">
            {beatsLoading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : beats.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {beats.map((beat) => (
                  <BeatCard
                    key={beat.id}
                    beat={beat}
                    mode="buy"
                    isPlaying={playingBeatId === beat.id}
                    onPlayToggle={(b) => handlePlayBeat(b as Beat)}
                    onBuy={(b) => {
                      setSelectedLicense("basic");
                      setPurchaseBeat(b as Beat);
                    }}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Music className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">No Beats Yet</h3>
                  <p className="text-muted-foreground">
                    This producer hasn't uploaded any beats yet.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="about" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  About {producer.name || producer.username}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {producer.bio ? (
                  <p className="text-muted-foreground">{producer.bio}</p>
                ) : (
                  <p className="text-muted-foreground italic">
                    No bio available.
                  </p>
                )}
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  {producer.location && (
                    <div>
                      <p className="text-sm font-medium">Location</p>
                      <p className="text-muted-foreground">
                        {producer.location}
                      </p>
                    </div>
                  )}
                  {producer.website && (
                    <div>
                      <p className="text-sm font-medium">Website</p>
                      <a
                        href={producer.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {producer.website}
                      </a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {allProducers.length > 1 && (
          <div className="mt-8 space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-500" />
              Similar Producers
            </h3>
            <p className="text-sm text-muted-foreground">
              If you like {producer.name || producer.username}, you might also
              enjoy these producers
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allProducers
                .filter((p: Record<string, unknown>) => p.id !== producerId)
                .slice(0, 6)
                .map((p: Record<string, unknown>) => (
                  <Card
                    key={p.id}
                    className="hover:shadow-xl transition group cursor-pointer border-2 hover:border-blue-500"
                    onClick={() => navigate(`/marketplace/producer/${p.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="relative flex-shrink-0">
                          {p.avatar || p.avatarUrl ? (
                            <img
                              src={p.avatar || p.avatarUrl}
                              alt={p.displayName || p.username || "Producer"}
                              className="w-14 h-14 rounded-full object-cover border-2 border-purple-500/30"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold">
                              {(p.displayName || p.username || "PR")
                                .substring(0, 2)
                                .toUpperCase()}
                            </div>
                          )}
                          {p.verified && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white">
                              <CheckCircle className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold truncate group-hover:text-blue-600 transition">
                            {p.displayName || p.username}
                          </h4>
                          {p.bio && (
                            <p className="text-xs text-muted-foreground truncate">
                              {p.bio}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{p.beats || p.beatCount || 0} beats</span>
                            <span>
                              {p.followers || p.followerCount || 0} followers
                            </span>
                            {(p.rating || 0) > 0 && (
                              <span>{"★".repeat(Math.round(p.rating))}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Purchase / License Selection Dialog */}
      <Dialog
        open={!!purchaseBeat}
        onOpenChange={(open) => {
          if (!open) setPurchaseBeat(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Purchase License
            </DialogTitle>
          </DialogHeader>

          {purchaseBeat && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                {purchaseBeat.coverArt ? (
                  <img
                    src={purchaseBeat.coverArt}
                    alt={purchaseBeat.title}
                    className="w-14 h-14 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <Music className="w-7 h-7 text-white opacity-70" />
                  </div>
                )}
                <div>
                  <p className="font-semibold">{purchaseBeat.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {purchaseBeat.genre} •{" "}
                    {purchaseBeat.bpm || purchaseBeat.tempo} BPM •{" "}
                    {purchaseBeat.key}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Select License
                </p>
                {DEFAULT_LICENSES.map((license) => {
                  const price = getLicensePrice(
                    purchaseBeat,
                    license.licenseType,
                  );
                  const isSelected = selectedLicense === license.licenseType;
                  return (
                    <button
                      key={license.licenseType}
                      onClick={() => setSelectedLicense(license.licenseType)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                          : "border-border hover:border-blue-300 hover:bg-muted/50"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-blue-500 text-white" : "bg-muted"}`}
                      >
                        {license.icon === "file" && (
                          <FileText className="w-4 h-4" />
                        )}
                        {license.icon === "star" && (
                          <Star className="w-4 h-4" />
                        )}
                        {license.icon === "infinity" && (
                          <InfinityIcon className="w-4 h-4" />
                        )}
                        {license.icon === "lock" && (
                          <Lock className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{license.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {license.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {license.fileFormats.join(", ").toUpperCase()}
                        </p>
                      </div>
                      <span className="font-bold text-green-600 flex-shrink-0">
                        ${price.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPurchaseBeat(null)}
                  disabled={purchaseMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600"
                  disabled={purchaseMutation.isPending}
                  onClick={() =>
                    purchaseMutation.mutate({
                      beatId: purchaseBeat.id,
                      licenseType: selectedLicense,
                    })
                  }
                >
                  {purchaseMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4 mr-2" /> Purchase for $
                      {getLicensePrice(purchaseBeat, selectedLicense).toFixed(
                        2,
                      )}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
