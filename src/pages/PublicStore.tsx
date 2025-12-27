import { useEffect, useState } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Music,
  User,
  MapPin,
  Instagram,
  Twitter,
  Youtube,
  ExternalLink,
  Play,
  ShoppingCart,
  Crown,
  Star,
  ArrowLeft,
} from 'lucide-react';

interface Storefront {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  user: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
  customization: {
    colors?: {
      primary?: string;
      secondary?: string;
      background?: string;
    };
    bio?: string;
    logo?: string;
    banner?: string;
    avatar?: string;
    socialLinks?: {
      instagram?: string;
      twitter?: string;
      youtube?: string;
      soundcloud?: string;
    };
  };
  listings: Array<{
    id: string;
    title: string;
    description: string | null;
    price: number;
    coverArt: string | null;
    genre: string | null;
  }>;
  membershipTiers: Array<{
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    interval: string;
    benefits: any;
  }>;
}

export default function PublicStore() {
  const { slug } = useParams<{ slug: string }>();
  
  const { data: storefront, isLoading, error } = useQuery<Storefront>({
    queryKey: [`/api/storefront/public/${slug}`],
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="h-48 bg-gradient-to-r from-blue-600 to-purple-600" />
        <div className="max-w-6xl mx-auto px-4 -mt-16">
          <div className="flex items-end gap-4 mb-8">
            <Skeleton className="w-32 h-32 rounded-full" />
            <div className="space-y-2 pb-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !storefront) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Store Not Found</h2>
            <p className="text-muted-foreground mb-4">
              This store doesn't exist or is no longer available.
            </p>
            <Link href="/marketplace">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Marketplace
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryColor = storefront.customization?.colors?.primary || '#3B82F6';
  const displayName = storefront.user?.firstName 
    ? `${storefront.user.firstName} ${storefront.user.lastName || ''}`.trim()
    : storefront.user?.username || storefront.name;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div 
        className="h-48 md:h-64 relative"
        style={{
          background: storefront.customization?.banner 
            ? `url(${storefront.customization.banner}) center/cover`
            : `linear-gradient(135deg, ${primaryColor}, #8B5CF6)`
        }}
      >
        <div className="absolute inset-0 bg-black/20" />
        <Link href="/marketplace" className="absolute top-4 left-4">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Marketplace
          </Button>
        </Link>
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-16 relative z-10">
        <div className="flex flex-col md:flex-row items-start md:items-end gap-4 mb-8">
          <div 
            className="w-32 h-32 rounded-full border-4 border-white dark:border-gray-800 shadow-lg flex items-center justify-center text-4xl font-bold text-white"
            style={{
              background: storefront.customization?.avatar 
                ? `url(${storefront.customization.avatar}) center/cover`
                : primaryColor
            }}
          >
            {!storefront.customization?.avatar && displayName.charAt(0).toUpperCase()}
          </div>
          
          <div className="flex-1 pb-4">
            <h1 className="text-2xl md:text-3xl font-bold text-white md:text-gray-900 dark:text-white">
              {storefront.name}
            </h1>
            <p className="text-white/80 md:text-muted-foreground">
              @{storefront.user?.username || storefront.slug}
            </p>
            
            <div className="flex items-center gap-3 mt-3">
              {storefront.customization?.socialLinks?.instagram && (
                <a 
                  href={`https://instagram.com/${storefront.customization.socialLinks.instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-pink-500 transition-colors"
                >
                  <Instagram className="w-5 h-5" />
                </a>
              )}
              {storefront.customization?.socialLinks?.twitter && (
                <a 
                  href={`https://twitter.com/${storefront.customization.socialLinks.twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-blue-400 transition-colors"
                >
                  <Twitter className="w-5 h-5" />
                </a>
              )}
              {storefront.customization?.socialLinks?.youtube && (
                <a 
                  href={storefront.customization.socialLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Youtube className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {storefront.customization?.bio && (
          <Card className="mb-8">
            <CardContent className="pt-6">
              <p className="text-muted-foreground">{storefront.customization.bio}</p>
            </CardContent>
          </Card>
        )}

        {storefront.membershipTiers && storefront.membershipTiers.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-500" />
              Membership Tiers
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {storefront.membershipTiers.map((tier) => (
                <Card key={tier.id} className="relative overflow-hidden">
                  <div 
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ background: primaryColor }}
                  />
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{tier.name}</span>
                      <Badge variant="secondary">
                        ${(tier.priceCents / 100).toFixed(0)}/{tier.interval === 'month' ? 'mo' : 'yr'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {tier.description && (
                      <p className="text-sm text-muted-foreground mb-4">{tier.description}</p>
                    )}
                    <Button className="w-full" style={{ background: primaryColor }}>
                      Subscribe
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Music className="w-5 h-5" />
            Beats & Products
          </h2>
          
          {storefront.listings && storefront.listings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {storefront.listings.map((listing) => (
                <Card key={listing.id} className="group overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-square relative bg-gradient-to-br from-blue-500 to-purple-600">
                    {listing.coverArt ? (
                      <img 
                        src={listing.coverArt} 
                        alt={listing.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-12 h-12 text-white/50" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <Button 
                        size="sm" 
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Preview
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold truncate">{listing.title}</h3>
                    {listing.genre && (
                      <Badge variant="secondary" className="mt-1 text-xs">
                        {listing.genre}
                      </Badge>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <span className="font-bold" style={{ color: primaryColor }}>
                        ${listing.price}
                      </span>
                      <Button size="sm" variant="outline">
                        <ShoppingCart className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No products available yet</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <footer className="mt-16 py-8 border-t">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Powered by Max Booster</p>
        </div>
      </footer>
    </div>
  );
}
