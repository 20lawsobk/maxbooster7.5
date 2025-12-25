import { useParams } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
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
  DollarSign,
  Heart,
  Share2,
  Play,
  Download,
} from 'lucide-react';
import { useState } from 'react';

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
  interval: 'month' | 'year';
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
  createdAt: string;
}

export default function Storefront() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedTier, setSelectedTier] = useState<MembershipTier | null>(null);
  const [cart, setCart] = useState<string[]>([]);

  const { data: storefront, isLoading: storefrontLoading } = useQuery<Storefront>({
    queryKey: [`/api/storefront/public/${slug}`],
    enabled: !!slug,
    retry: 1,
  });

  const { data: tiers = [], isLoading: tiersLoading } = useQuery<MembershipTier[]>({
    queryKey: [`/api/storefront/${storefront?.id}/membership-tiers/public`],
    enabled: !!storefront?.id,
    queryFn: async () => {
      const res = await fetch(`/api/storefront/${storefront!.id}/membership-tiers/public`);
      if (!res.ok) throw new Error('Failed to fetch tiers');
      return res.json();
    },
  });

  const { data: listings = [], isLoading: listingsLoading } = useQuery<MarketplaceListing[]>({
    queryKey: [`/api/storefront/${storefront?.id}/listings`],
    enabled: !!storefront?.id,
    queryFn: async () => {
      const res = await fetch(`/api/storefront/${storefront!.id}/listings`);
      if (!res.ok) throw new Error('Failed to fetch listings');
      return res.json();
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: async (tierId: string) => {
      const response = await apiRequest('POST', `/api/storefront/subscribe/${tierId}`, {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({
          title: 'Subscription Successful!',
          description: 'Welcome to the membership tier!',
        });
        queryClient.invalidateQueries({
          queryKey: [`/api/storefront/${storefront?.id}/membership-tiers/public`],
        });
      }
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process subscription';
      toast({
        title: 'Subscription Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  const addToCart = (listingId: string) => {
    if (cart.includes(listingId)) {
      setCart(cart.filter((id) => id !== listingId));
      toast({
        title: 'Removed from Cart',
        description: 'Item removed from your cart',
      });
    } else {
      setCart([...cart, listingId]);
      toast({
        title: 'Added to Cart',
        description: 'Item added to your cart',
      });
    }
  };

  if (storefrontLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading storefront...</p>
        </div>
      </div>
    );
  }

  if (!storefront || !storefront.isActive || !storefront.isPublic) {
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

  const customization = storefront.customization || {};
  const colors = customization.colors || {};
  const fonts = customization.fonts || {};
  const socialLinks = customization.socialLinks || {};

  const customStyles = {
    '--primary-color': colors.primary || '#8B5CF6',
    '--secondary-color': colors.secondary || '#EC4899',
    '--background-color': colors.background || '#FFFFFF',
    '--text-color': colors.text || '#000000',
    '--heading-font': fonts.heading || 'Inter',
    '--body-font': fonts.body || 'Inter',
  } as React.CSSProperties;

  return (
    <div className="min-h-screen" style={customStyles}>
      {customization.banner && (
        <div
          className="w-full h-64 md:h-96 bg-cover bg-center relative"
          style={{ backgroundImage: `url(${customization.banner})` }}
        >
          <div className="absolute inset-0 bg-black/30"></div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row gap-8 items-start mb-12">
            <div className="flex-shrink-0">
              {customization.avatar ? (
                <img
                  src={customization.avatar}
                  alt={storefront.name}
                  className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-white shadow-lg"
                />
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
                    style={{ fontFamily: fonts.heading }}
                  >
                    {storefront.name}
                  </h1>
                  {customization.bio && (
                    <p
                      className="text-lg text-muted-foreground max-w-2xl"
                      style={{ fontFamily: fonts.body }}
                    >
                      {customization.bio}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon">
                    <Heart className="w-5 h-5" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <Share2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {(socialLinks.instagram ||
                socialLinks.twitter ||
                socialLinks.youtube ||
                socialLinks.soundcloud) && (
                <div className="flex gap-3 mb-6">
                  {socialLinks.instagram && (
                    <a
                      href={`https://instagram.com/${socialLinks.instagram.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Instagram className="w-6 h-6" />
                    </a>
                  )}
                  {socialLinks.twitter && (
                    <a
                      href={`https://twitter.com/${socialLinks.twitter.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Twitter className="w-6 h-6" />
                    </a>
                  )}
                  {socialLinks.youtube && (
                    <a
                      href={socialLinks.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Youtube className="w-6 h-6" />
                    </a>
                  )}
                  {socialLinks.soundcloud && (
                    <a
                      href={socialLinks.soundcloud}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ExternalLink className="w-6 h-6" />
                    </a>
                  )}
                </div>
              )}

              <div className="flex gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="font-medium">{storefront.views}</span> views
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">{listings.length}</span> products
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">{tiers.length}</span> membership tiers
                </div>
              </div>
            </div>
          </div>

          {tiers.length > 0 && (
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <Crown className="w-8 h-8" style={{ color: colors.primary }} />
                <h2 className="text-3xl font-bold" style={{ fontFamily: fonts.heading }}>
                  Join the Community
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {tiers
                  .filter((tier) => tier.isActive)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((tier) => {
                    const isLimited =
                      tier.maxSubscribers && tier.currentSubscribers >= tier.maxSubscribers;
                    const isMostPopular = tier.sortOrder === 1;

                    return (
                      <Card
                        key={tier.id}
                        className={`relative ${isMostPopular ? 'border-2 shadow-lg' : ''}`}
                        style={isMostPopular ? { borderColor: colors.primary } : undefined}
                      >
                        {isMostPopular && (
                          <div
                            className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-white text-sm font-semibold"
                            style={{ backgroundColor: colors.primary }}
                          >
                            <Sparkles className="w-4 h-4 inline mr-1" />
                            Most Popular
                          </div>
                        )}
                        <CardHeader>
                          <CardTitle
                            className="flex items-center gap-2"
                            style={{ fontFamily: fonts.heading }}
                          >
                            <Crown className="w-5 h-5" />
                            {tier.name}
                          </CardTitle>
                          <CardDescription style={{ fontFamily: fonts.body }}>
                            {tier.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="mb-6">
                            <div className="flex items-baseline gap-1 mb-1">
                              <span className="text-4xl font-bold">
                                ${(tier.priceCents / 100).toFixed(2)}
                              </span>
                              <span className="text-muted-foreground">/ {tier.interval}</span>
                            </div>
                            {tier.maxSubscribers && (
                              <p className="text-sm text-muted-foreground">
                                {tier.currentSubscribers} / {tier.maxSubscribers} subscribers
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
                            {tier.benefits.discounts && tier.benefits.discounts.percentage > 0 && (
                              <div className="flex items-center gap-2 text-sm">
                                <Check className="w-4 h-4 text-green-500" />
                                <span>
                                  {tier.benefits.discounts.percentage}% discount on all purchases
                                </span>
                              </div>
                            )}
                            {tier.benefits.customPerks?.map((perk, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <Check className="w-4 h-4 text-green-500" />
                                <span>{perk}</span>
                              </div>
                            ))}
                          </div>

                          <Button
                            className="w-full"
                            size="lg"
                            disabled={isLimited}
                            onClick={() => subscribeMutation.mutate(tier.id)}
                            style={isMostPopular ? { backgroundColor: colors.primary } : undefined}
                          >
                            {isLimited ? 'Sold Out' : 'Subscribe Now'}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </section>
          )}

          <Separator className="my-12" />

          <section>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Music className="w-8 h-8" style={{ color: colors.primary }} />
                <h2 className="text-3xl font-bold" style={{ fontFamily: fonts.heading }}>
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
                  <p className="text-muted-foreground">No products available yet</p>
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
                  >
                    <div className="relative">
                      {listing.coverArtUrl ? (
                        <img
                          src={listing.coverArtUrl}
                          alt={listing.title}
                          className="w-full h-48 object-cover"
                        />
                      ) : (
                        <div className="w-full h-48 bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                          <Music className="w-16 h-16 text-white" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant={listing.isExclusive ? 'default' : 'secondary'}>
                          {listing.isExclusive ? 'Exclusive' : 'Non-Exclusive'}
                        </Badge>
                      </div>
                    </div>
                    <CardHeader>
                      <CardTitle className="text-lg" style={{ fontFamily: fonts.heading }}>
                        {listing.title}
                      </CardTitle>
                      <CardDescription style={{ fontFamily: fonts.body }}>
                        {listing.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {listing.genre && <Badge variant="outline">{listing.genre}</Badge>}
                        {listing.bpm && <Badge variant="outline">{listing.bpm} BPM</Badge>}
                        {listing.key && <Badge variant="outline">{listing.key}</Badge>}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold">
                          ${(listing.priceCents / 100).toFixed(2)}
                        </span>
                        <div className="flex gap-2">
                          <Button variant="outline" size="icon">
                            <Play className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => addToCart(listing.id)}
                            variant={cart.includes(listing.id) ? 'secondary' : 'default'}
                            style={
                              !cart.includes(listing.id)
                                ? { backgroundColor: colors.primary }
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
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {cart.length > 0 && (
            <div className="fixed bottom-8 right-8">
              <Button size="lg" className="shadow-xl">
                <ShoppingCart className="w-5 h-5 mr-2" />
                Checkout ({cart.length} items)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
