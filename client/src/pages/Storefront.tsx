import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Music,
  ShoppingCart,
  Crown,
  Instagram,
  Twitter,
  Youtube,
  ExternalLink,
  Check,
  Sparkles,
  Heart,
  Share2,
  Play,
  Gift,
  Tag,
  Loader2,
  Eye,
  EyeOff,
  Pencil,
  Globe,
  Copy,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { Star, UserPlus, UserCheck, Pause } from "lucide-react";

interface Storefront {
  id: string;
  userId: string;
  name: string;
  slug: string;
  templateId: string | null;
  customization: {
    colors?: {
      primary?: string;
      secondary?: string;
      background?: string;
      text?: string;
    };
    fonts?: {
      heading?: string;
      body?: string;
    };
    layout?: {
      headerStyle?: string;
      gridColumns?: number;
    };
    logo?: string;
    banner?: string;
    avatar?: string;
    bio?: string;
    socialLinks?: {
      instagram?: string;
      twitter?: string;
      youtube?: string;
      soundcloud?: string;
    };
  };
  seo: {
    title?: string;
    description?: string;
    keywords?: string[];
    ogImage?: string;
  };
  isActive: boolean;
  isPublic: boolean;
  views: number;
  uniqueVisitors: number;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    username: string;
    email: string;
  };
}

interface MembershipTier {
  id: string;
  storefrontId: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  interval: "month" | "year";
  benefits: {
    exclusiveContent?: boolean;
    earlyAccess?: boolean;
    discounts?: { percentage: number };
    customPerks?: string[];
  };
  isActive: boolean;
  sortOrder: number;
  maxSubscribers: number | null;
  currentSubscribers: number;
  stripeProductId: string | null;
  stripePriceId: string | null;
}

interface MarketplaceListing {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: string;
  priceCents: number;
  currency: string;
  audioUrl: string;
  coverArtUrl: string;
  tags: string[];
  bpm: number | null;
  key: string | null;
  genre: string;
  mood: string | null;
  isExclusive: boolean;
  status: string;
  views: number;
  favorites: number;
  sales: number;
  discountPercent: number | null;
  discountPriceCents: number | null;
  discountExpiresAt: string | null;
  createdAt: string;
}

function BannerImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div
      className="w-full h-64 md:h-96 bg-cover bg-center relative"
      style={{ backgroundImage: `url(${url})` }}
    >
      <img
        src={url}
        alt=""
        className="hidden"
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-0 bg-black/30"></div>
    </div>
  );
}

function AvatarImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center border-4 border-white shadow-lg">
        <Music className="w-16 h-16 text-white" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-white shadow-lg"
      onError={() => setFailed(true)}
    />
  );
}

export default function Storefront() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [selectedTier, setSelectedTier] = useState<MembershipTier | null>(null);
  const [cart, setCart] = useState<string[]>([]);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [userRatingValue, setUserRatingValue] = useState(0);
  const [userReview, setUserReview] = useState("");
  const [playingListingId, setPlayingListingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayListing = useCallback(
    (listing: MarketplaceListing) => {
      if (playingListingId === listing.id) {
        audioRef.current?.pause();
        setPlayingListingId(null);
        return;
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      let audioUrl = listing.audioUrl;
      if (!audioUrl) return;
      if (!audioUrl.startsWith("http")) {
        if (!audioUrl.startsWith("/")) {
          audioUrl = `/api/marketplace/audio/${audioUrl}`;
        } else if (!audioUrl.startsWith("/api/")) {
          audioUrl = `/api/marketplace/audio${audioUrl}`;
        }
      }
      const audio = new Audio(audioUrl);
      audio.play().catch(() => {});
      audio.onended = () => setPlayingListingId(null);
      audio.onerror = () => setPlayingListingId(null);
      audioRef.current = audio;
      setPlayingListingId(listing.id);
    },
    [playingListingId],
  );

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get("checkout");
    const membershipStatus = params.get("membership");
    if (checkoutStatus === "success") {
      toast({
        title: "Purchase Complete!",
        description:
          "Your beats have been purchased successfully. Check your purchases page for downloads.",
      });
      setCart([]);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (checkoutStatus === "canceled") {
      toast({
        title: "Checkout Canceled",
        description:
          "Your checkout was canceled. Your cart items are still available.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (membershipStatus === "success") {
      toast({
        title: "Membership Activated!",
        description: "Welcome! Your membership subscription is now active.",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (membershipStatus === "canceled") {
      toast({
        title: "Subscription Canceled",
        description: "You did not complete the membership subscription.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const {
    data: publicStorefront,
    isLoading: publicLoading,
    isError: publicError,
  } = useQuery<Storefront>({
    queryKey: [`/api/storefront/public/${slug}`],
    enabled: !!slug,
    retry: 1,
  });

  // Owner preview: fires when the public endpoint returns nothing (private/inactive)
  // and the user is authenticated. The server verifies ownership.
  const { data: previewStorefront, isLoading: previewLoading } =
    useQuery<Storefront>({
      queryKey: [`/api/storefront/preview/${slug}`],
      enabled: !!slug && !!user && (publicError || !publicStorefront),
      retry: false,
    });

  const storefront = publicStorefront ?? previewStorefront;
  const storefrontLoading =
    publicLoading || (!!user && previewLoading && !publicStorefront);
  const isOwnerPreview =
    !!user && !!storefront && storefront.userId === user.id;

  const { data: tiers = [], isLoading: tiersLoading } = useQuery<
    MembershipTier[]
  >({
    queryKey: [`/api/storefront/${storefront?.id}/membership-tiers/public`],
    enabled: !!storefront?.id,
    queryFn: async () => {
      const res = await fetch(
        `/api/storefront/${storefront!.id}/membership-tiers/public`,
      );
      if (!res.ok) throw new Error("Failed to fetch tiers");
      return res.json();
    },
  });

  const { data: listings = [], isLoading: listingsLoading } = useQuery<
    MarketplaceListing[]
  >({
    queryKey: [`/api/storefront/${storefront?.id}/listings`],
    enabled: !!storefront?.id,
    queryFn: async () => {
      const res = await fetch(`/api/storefront/${storefront!.id}/listings`);
      if (!res.ok) throw new Error("Failed to fetch listings");
      return res.json();
    },
  });

  interface SocialData {
    likes: number;
    follows: number;
    ratingsCount: number;
    avgRating: number;
    userLiked: boolean;
    userFollowing: boolean;
    userRating: number | null;
  }

  const { data: socialData } = useQuery<SocialData>({
    queryKey: [`/api/storefront/${storefront?.id}/social`],
    enabled: !!storefront?.id,
  });

  interface BogoPromo {
    id: string;
    name: string;
    buyQuantity: number;
    getQuantity: number;
    getDiscountPercent: number;
    description: string | null;
  }

  const { data: bogoPromotions = [] } = useQuery<BogoPromo[]>({
    queryKey: [`/api/storefront/${storefront?.id}/bogo-promotions`],
    enabled: !!storefront?.id,
  });

  interface CheckoutPreview {
    items: Array<{
      id: string;
      title: string;
      priceCents: number;
      isFree: boolean;
      discountPercent: number;
    }>;
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
    promotionApplied: { id: string; name: string; summary: string } | null;
  }

  const { data: checkoutPreview } = useQuery<CheckoutPreview>({
    queryKey: [`/api/storefront/${storefront?.id}/checkout/preview`, cart],
    enabled: !!storefront?.id && cart.length > 0,
    queryFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/storefront/${storefront!.id}/checkout/preview`,
        { listingIds: cart },
      );
      return res as CheckoutPreview;
    },
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/storefront/${storefront!.id}/like`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/storefront/${storefront?.id}/social`],
      });
    },
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/storefront/${storefront!.id}/follow`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/storefront/${storefront?.id}/social`],
      });
    },
  });

  const rateMutation = useMutation({
    mutationFn: async ({
      rating,
      review,
    }: {
      rating: number;
      review?: string;
    }) => {
      return apiRequest("POST", `/api/storefront/${storefront!.id}/rate`, {
        rating,
        review,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/storefront/${storefront?.id}/social`],
      });
      setShowRatingDialog(false);
      toast({
        title: "Rating submitted",
        description: "Thank you for your feedback!",
      });
    },
  });

  const handleLike = useCallback(() => {
    likeMutation.mutate();
  }, [likeMutation]);

  const handleFollow = useCallback(() => {
    followMutation.mutate();
  }, [followMutation]);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const title = storefront?.name || "Check out this storefront";

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link copied!",
          description: "Storefront link has been copied to your clipboard",
        });
      } catch {
        toast({
          title: "Share",
          description: url,
        });
      }
    }
  }, [storefront?.name, toast]);

  const subscribeMutation = useMutation({
    mutationFn: async (tierId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/storefront/subscribe/${tierId}`,
        {},
      );
      return response.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({
          title: "Subscription Successful!",
          description: "Welcome to the membership tier!",
        });
        queryClient.invalidateQueries({
          queryKey: [
            `/api/storefront/${storefront?.id}/membership-tiers/public`,
          ],
        });
      }
    },
    onError: (error: Error) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to process subscription";
      toast({
        title: "Subscription Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/storefront/${storefront!.id}/checkout`,
        {
          listingIds: cart,
          licenseType: "basic",
        },
      );
      return response.json();
    },
    onSuccess: (data: { checkoutUrl?: string }) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({
          title: "Purchase Complete!",
          description: "Your beats are ready for download.",
        });
        setCart([]);
      }
    },
    onError: (error: Error) => {
      const errorMessage =
        error instanceof Error ? error.message : "Checkout failed";
      toast({
        title: "Checkout Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleCheckout = useCallback(() => {
    if (cart.length === 0) return;
    checkoutMutation.mutate();
  }, [cart, checkoutMutation]);

  const addToCart = (listingId: string) => {
    if (cart.includes(listingId)) {
      setCart(cart.filter((id) => id !== listingId));
      toast({
        title: "Removed from Cart",
        description: "Item removed from your cart",
      });
    } else {
      setCart([...cart, listingId]);
      toast({
        title: "Added to Cart",
        description: "Item added to your cart",
      });
    }
  };

  if (storefrontLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Opening your storefront…</p>
        </div>
      </div>
    );
  }

  // Visitors can't see private/inactive storefronts; owners can always preview
  if (
    !storefront ||
    ((!storefront.isActive || !storefront.isPublic) && !isOwnerPreview)
  ) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-12 text-center">
            <Music className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">Storefront Not Found</h2>
            <p className="text-muted-foreground">
              This storefront doesn't exist or is not publicly available.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLive = storefront.isActive && storefront.isPublic;

  const customization = storefront.customization || {};
  const colors = customization.colors || {};
  const fonts = customization.fonts || {};
  const socialLinks = customization.socialLinks || {};

  const primaryColor = colors.primary || "#8B5CF6";
  const secondaryColor = colors.secondary || "#EC4899";
  const bgColor = colors.background || "#FFFFFF";
  const textColor = colors.text || "#000000";
  const headingFont = fonts.heading || "Inter";
  const bodyFont = fonts.body || "Inter";

  const customStyles = {
    "--primary-color": primaryColor,
    "--secondary-color": secondaryColor,
    "--background-color": bgColor,
    "--text-color": textColor,
    "--heading-font": headingFont,
    "--body-font": bodyFont,
    backgroundColor: bgColor,
    color: textColor,
    fontFamily: bodyFont,
  } as React.CSSProperties;

  const handleCopyLink = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied",
        description: "Storefront URL copied to clipboard",
      });
    } catch {
      toast({ title: "Link", description: url });
    }
  }, [toast]);

  return (
    <div className="min-h-screen" style={customStyles}>
      {/* ── Owner Preview Banner ── */}
      {isOwnerPreview && (
        <div className="sticky top-0 z-50 w-full bg-gray-900 border-b border-gray-700 shadow-lg">
          <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-amber-500 text-black font-bold text-xs px-2 py-0.5">
                PREVIEW
              </Badge>
              {isLive ? (
                <span className="flex items-center gap-1.5 text-sm text-green-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Live — visible to everyone
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-amber-400 font-medium">
                  <EyeOff className="w-4 h-4" />
                  Not live — only you can see this
                </span>
              )}
              <span className="text-gray-500 text-sm hidden sm:inline">·</span>
              <span className="text-gray-400 text-sm hidden sm:inline">
                Visitors see exactly what's below
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="border-gray-600 text-gray-200 hover:bg-gray-800 h-7 text-xs gap-1.5"
                onClick={handleCopyLink}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Link
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-gray-600 text-gray-200 hover:bg-gray-800 h-7 text-xs gap-1.5"
                onClick={() => setLocation("/marketplace?tab=storefronts")}
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Button>
              {!isLive && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs gap-1.5"
                  onClick={() => setLocation("/marketplace?tab=storefronts")}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Go Live
                </Button>
              )}
            </div>
          </div>
          {!isLive && (
            <div className="bg-amber-900/40 border-t border-amber-800/50 px-4 py-1.5">
              <p className="text-xs text-amber-300 flex items-center gap-1.5 max-w-6xl mx-auto">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Your storefront is not public yet. Go to your storefront
                settings to publish it and make it visible to visitors.
              </p>
            </div>
          )}
        </div>
      )}

      {customization.banner && <BannerImage url={customization.banner} />}

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row gap-8 items-start mb-12">
            <div className="flex-shrink-0">
              {customization.avatar ? (
                <AvatarImage src={customization.avatar} alt={storefront.name} />
              ) : (
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center border-4 border-white shadow-lg">
                  <Music className="w-16 h-16 text-white" />
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h1
                    className="text-4xl md:text-5xl font-bold mb-2"
                    style={{ fontFamily: headingFont, color: textColor }}
                  >
                    {storefront.name}
                  </h1>
                  {customization.bio && (
                    <p
                      className="text-lg max-w-2xl"
                      style={{
                        fontFamily: bodyFont,
                        color: textColor,
                        opacity: 0.7,
                      }}
                    >
                      {customization.bio}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {!isOwnerPreview && (
                    <>
                      <Button
                        variant={
                          socialData?.userFollowing ? "default" : "outline"
                        }
                        size="sm"
                        onClick={handleFollow}
                        className="gap-1"
                      >
                        {socialData?.userFollowing ? (
                          <>
                            <UserCheck className="w-4 h-4" /> Following
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" /> Follow
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleLike}
                        aria-label={
                          socialData?.userLiked
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                      >
                        <Heart
                          className={`w-5 h-5 ${socialData?.userLiked ? "fill-red-500 text-red-500" : ""}`}
                        />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleShare}
                    aria-label="Share storefront"
                  >
                    <Share2 className="w-5 h-5" />
                  </Button>
                  {!isOwnerPreview && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowRatingDialog(!showRatingDialog)}
                      aria-label="Rate storefront"
                    >
                      <Star
                        className={`w-5 h-5 ${socialData?.userRating ? "fill-yellow-400 text-yellow-400" : ""}`}
                      />
                    </Button>
                  )}
                </div>
              </div>

              {(socialLinks.instagram ||
                socialLinks.twitter ||
                socialLinks.youtube ||
                socialLinks.soundcloud) && (
                <div className="flex gap-3 mb-6">
                  {socialLinks.instagram && (
                    <a
                      href={`https://instagram.com/${socialLinks.instagram.replace("@", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: textColor, opacity: 0.6 }}
                      className="hover:opacity-100 transition-opacity"
                    >
                      <Instagram className="w-6 h-6" />
                    </a>
                  )}
                  {socialLinks.twitter && (
                    <a
                      href={`https://twitter.com/${socialLinks.twitter.replace("@", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: textColor, opacity: 0.6 }}
                      className="hover:opacity-100 transition-opacity"
                    >
                      <Twitter className="w-6 h-6" />
                    </a>
                  )}
                  {socialLinks.youtube && (
                    <a
                      href={socialLinks.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: textColor, opacity: 0.6 }}
                      className="hover:opacity-100 transition-opacity"
                    >
                      <Youtube className="w-6 h-6" />
                    </a>
                  )}
                  {socialLinks.soundcloud && (
                    <a
                      href={socialLinks.soundcloud}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: textColor, opacity: 0.6 }}
                      className="hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="w-6 h-6" />
                    </a>
                  )}
                </div>
              )}

              {showRatingDialog && (
                <div className="bg-card border rounded-lg p-4 mb-4 max-w-sm">
                  <h4 className="font-medium mb-2">Rate this storefront</h4>
                  <div className="flex gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setUserRatingValue(star)}
                        className="p-0.5"
                      >
                        <Star
                          className={`w-6 h-6 cursor-pointer transition-colors ${
                            star <= userRatingValue
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Write a review (optional)"
                    value={userReview}
                    onChange={(e) => setUserReview(e.target.value)}
                    className="w-full p-2 border rounded text-sm mb-2 bg-background"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={userRatingValue === 0}
                      onClick={() =>
                        rateMutation.mutate({
                          rating: userRatingValue,
                          review: userReview || undefined,
                        })
                      }
                    >
                      Submit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowRatingDialog(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="font-medium">{storefront.views}</span> views
                </div>
                <div className="flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5" />
                  <span className="font-medium">
                    {socialData?.likes || 0}
                  </span>{" "}
                  likes
                </div>
                <div className="flex items-center gap-1">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span className="font-medium">
                    {socialData?.follows || 0}
                  </span>{" "}
                  followers
                </div>
                {(socialData?.ratingsCount ?? 0) > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium">
                      {(socialData?.avgRating || 0).toFixed(1)}
                    </span>
                    <span>({socialData?.ratingsCount} ratings)</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span className="font-medium">{listings.length}</span>{" "}
                  products
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">{tiers.length}</span> membership
                  tiers
                </div>
              </div>
            </div>
          </div>

          {tiers.length > 0 && (
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <Crown className="w-8 h-8" style={{ color: primaryColor }} />
                <h2
                  className="text-3xl font-bold"
                  style={{ fontFamily: headingFont, color: textColor }}
                >
                  Join the Community
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {tiers
                  .filter((tier) => tier.isActive)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((tier) => {
                    const isLimited =
                      tier.maxSubscribers &&
                      tier.currentSubscribers >= tier.maxSubscribers;
                    const isMostPopular = tier.sortOrder === 1;

                    return (
                      <Card
                        key={tier.id}
                        className={`relative ${isMostPopular ? "border-2 shadow-lg" : ""}`}
                        style={{
                          backgroundColor: bgColor,
                          color: textColor,
                          borderColor: isMostPopular ? primaryColor : undefined,
                        }}
                      >
                        {isMostPopular && (
                          <div
                            className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-white text-sm font-semibold"
                            style={{ backgroundColor: primaryColor }}
                          >
                            <Sparkles className="w-4 h-4 inline mr-1" />
                            Most Popular
                          </div>
                        )}
                        <CardHeader>
                          <CardTitle
                            className="flex items-center gap-2"
                            style={{
                              fontFamily: headingFont,
                              color: textColor,
                            }}
                          >
                            <Crown
                              className="w-5 h-5"
                              style={{ color: primaryColor }}
                            />
                            {tier.name}
                          </CardTitle>
                          <CardDescription
                            style={{
                              fontFamily: bodyFont,
                              color: textColor,
                              opacity: 0.7,
                            }}
                          >
                            {tier.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="mb-6">
                            <div className="flex items-baseline gap-1 mb-1">
                              <span className="text-4xl font-bold">
                                ${(tier.priceCents / 100).toFixed(2)}
                              </span>
                              <span className="text-muted-foreground">
                                / {tier.interval}
                              </span>
                            </div>
                            {tier.maxSubscribers && (
                              <p className="text-sm text-muted-foreground">
                                {tier.currentSubscribers} /{" "}
                                {tier.maxSubscribers} subscribers
                              </p>
                            )}
                          </div>

                          <div className="space-y-3 mb-6">
                            {tier.benefits.exclusiveContent && (
                              <div className="flex items-center gap-2 text-sm">
                                <Check className="w-4 h-4 text-green-500" />
                                <span>Exclusive content access</span>
                              </div>
                            )}
                            {tier.benefits.earlyAccess && (
                              <div className="flex items-center gap-2 text-sm">
                                <Check className="w-4 h-4 text-green-500" />
                                <span>Early access to new releases</span>
                              </div>
                            )}
                            {tier.benefits.discounts &&
                              tier.benefits.discounts.percentage > 0 && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Check className="w-4 h-4 text-green-500" />
                                  <span>
                                    {tier.benefits.discounts.percentage}%
                                    discount on all purchases
                                  </span>
                                </div>
                              )}
                            {tier.benefits.customPerks?.map((perk, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 text-sm"
                              >
                                <Check className="w-4 h-4 text-green-500" />
                                <span>{perk}</span>
                              </div>
                            ))}
                          </div>

                          {isOwnerPreview ? (
                            <Button
                              className="w-full"
                              size="lg"
                              disabled
                              variant="outline"
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Preview Only
                            </Button>
                          ) : (
                            <Button
                              className="w-full"
                              size="lg"
                              disabled={isLimited}
                              onClick={() => subscribeMutation.mutate(tier.id)}
                              style={{
                                backgroundColor: primaryColor,
                                color: "#FFFFFF",
                              }}
                            >
                              {isLimited ? "Sold Out" : "Subscribe Now"}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </section>
          )}

          <Separator className="my-12" />

          {bogoPromotions.length > 0 && (
            <div className="mb-8 space-y-3">
              {bogoPromotions.map((promo) => (
                <div
                  key={promo.id}
                  className="rounded-xl p-4 border-2 border-purple-300 dark:border-purple-700 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/50">
                      <Gift className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        {promo.getDiscountPercent === 100
                          ? `Buy ${promo.buyQuantity}, Get ${promo.getQuantity} FREE!`
                          : `Buy ${promo.buyQuantity}, Get ${promo.getQuantity} at ${promo.getDiscountPercent}% Off!`}
                      </p>
                      {promo.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {promo.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Add {promo.buyQuantity + promo.getQuantity} or more
                        items to your cart to qualify
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <section>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Music className="w-8 h-8" style={{ color: primaryColor }} />
                <h2
                  className="text-3xl font-bold"
                  style={{ fontFamily: headingFont, color: textColor }}
                >
                  Products
                </h2>
              </div>
              {cart.length > 0 && (
                <Button>
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Cart ({cart.length})
                </Button>
              )}
            </div>

            {listings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Music className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    No products available yet
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div
                className="grid gap-6"
                style={{
                  gridTemplateColumns: `repeat(${customization.layout?.gridColumns || 3}, minmax(0, 1fr))`,
                }}
              >
                {listings.map((listing) => (
                  <Card
                    key={listing.id}
                    className="overflow-hidden hover:shadow-lg transition-shadow"
                    style={{ backgroundColor: bgColor, color: textColor }}
                  >
                    <div className="relative">
                      <div className="w-full h-48 bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                        <Music className="w-16 h-16 text-white" />
                      </div>
                      {listing.coverArtUrl && (
                        <img
                          src={listing.coverArtUrl}
                          alt={listing.title}
                          className="absolute inset-0 w-full h-48 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge
                          variant={
                            listing.isExclusive ? "default" : "secondary"
                          }
                        >
                          {listing.isExclusive ? "Exclusive" : "Non-Exclusive"}
                        </Badge>
                      </div>
                    </div>
                    <CardHeader>
                      <CardTitle
                        className="text-lg"
                        style={{ fontFamily: headingFont, color: textColor }}
                      >
                        {listing.title}
                      </CardTitle>
                      <CardDescription
                        style={{
                          fontFamily: bodyFont,
                          color: textColor,
                          opacity: 0.7,
                        }}
                      >
                        {listing.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {listing.genre && (
                          <Badge variant="outline">{listing.genre}</Badge>
                        )}
                        {listing.bpm && (
                          <Badge variant="outline">{listing.bpm} BPM</Badge>
                        )}
                        {listing.key && (
                          <Badge variant="outline">{listing.key}</Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          {listing.discountPercent &&
                          listing.discountPriceCents != null &&
                          (!listing.discountExpiresAt ||
                            new Date(listing.discountExpiresAt) >
                              new Date()) ? (
                            <div className="flex items-center gap-2">
                              <span className="text-2xl font-bold text-green-600">
                                ${(listing.discountPriceCents / 100).toFixed(2)}
                              </span>
                              <span className="text-lg text-muted-foreground line-through">
                                ${(listing.priceCents / 100).toFixed(2)}
                              </span>
                              <Badge variant="destructive" className="text-xs">
                                -{listing.discountPercent}%
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-2xl font-bold">
                              ${(listing.priceCents / 100).toFixed(2)}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handlePlayListing(listing)}
                          >
                            {playingListingId === listing.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                          {isOwnerPreview ? (
                            <Button variant="outline" disabled>
                              <Eye className="w-4 h-4 mr-1" />
                              Preview Only
                            </Button>
                          ) : (
                            <Button
                              onClick={() => addToCart(listing.id)}
                              variant={
                                cart.includes(listing.id)
                                  ? "secondary"
                                  : "default"
                              }
                              style={
                                !cart.includes(listing.id)
                                  ? {
                                      backgroundColor: primaryColor,
                                      color: "#FFFFFF",
                                    }
                                  : undefined
                              }
                            >
                              {cart.includes(listing.id) ? (
                                <>
                                  <Check className="w-4 h-4 mr-1" />
                                  Added
                                </>
                              ) : (
                                <>
                                  <ShoppingCart className="w-4 h-4 mr-1" />
                                  Add to Cart
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {cart.length > 0 && !isOwnerPreview && (
            <div className="fixed bottom-8 right-8 z-50 max-w-md">
              <div className="bg-background border rounded-xl shadow-2xl p-4 space-y-2">
                {checkoutPreview?.promotionApplied && (
                  <div className="flex items-center gap-2 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 rounded-lg px-3 py-1.5">
                    <Gift className="w-3.5 h-3.5" />
                    {checkoutPreview.promotionApplied.summary}
                    <Badge
                      variant="secondary"
                      className="ml-auto text-[10px] bg-green-100 text-green-700"
                    >
                      Save ${(checkoutPreview.discountCents / 100).toFixed(2)}
                    </Badge>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">
                      {cart.length} item{cart.length > 1 ? "s" : ""}
                    </span>
                    {checkoutPreview ? (
                      <span className="ml-2">
                        {checkoutPreview.discountCents > 0 && (
                          <span className="line-through text-muted-foreground mr-1">
                            ${(checkoutPreview.subtotalCents / 100).toFixed(2)}
                          </span>
                        )}
                        <span className="font-bold">
                          ${(checkoutPreview.totalCents / 100).toFixed(2)}
                        </span>
                      </span>
                    ) : (
                      <span className="ml-2 font-bold">
                        $
                        {(
                          listings
                            .filter((l) => cart.includes(l.id))
                            .reduce((sum, l) => {
                              const price =
                                l.discountPercent &&
                                l.discountPriceCents != null &&
                                (!l.discountExpiresAt ||
                                  new Date(l.discountExpiresAt) > new Date())
                                  ? l.discountPriceCents
                                  : l.priceCents;
                              return sum + price;
                            }, 0) / 100
                        ).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <Button
                    size="lg"
                    className="shadow-xl"
                    onClick={handleCheckout}
                    disabled={checkoutMutation.isPending}
                  >
                    {checkoutMutation.isPending ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <ShoppingCart className="w-5 h-5 mr-2" />
                        Checkout
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
