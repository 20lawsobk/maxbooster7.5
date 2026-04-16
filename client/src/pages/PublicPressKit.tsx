import { useQuery } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Mail,
  Globe,
  Instagram,
  Twitter,
  Youtube,
  Facebook,
  Music,
  Download,
  ExternalLink,
  User,
  MapPin,
  AlertCircle,
} from 'lucide-react';

export default function PublicPressKit() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data: pressKit, isLoading, isError } = useQuery({
    queryKey: ['/api/press-kit/public', slug],
    queryFn: async () => {
      const res = await fetch(`/api/press-kit/public/${slug}`);
      if (!res.ok) throw new Error('Not found');
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-sm">Loading press kit…</p>
        </div>
      </div>
    );
  }

  if (isError || !pressKit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm mx-auto px-6">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-2xl font-bold">Press Kit Not Found</h1>
          <p className="text-muted-foreground">
            This press kit is either private or doesn't exist. Please contact the artist directly for press materials.
          </p>
        </div>
      </div>
    );
  }

  const socialLinks = (pressKit.socialLinks ?? {}) as Record<string, string>;
  const photos = (pressKit.photos ?? []) as { url: string; caption?: string }[];
  const genres = (pressKit.genres ?? []) as string[];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative bg-gradient-to-b from-primary/10 to-background">
        <div className="container mx-auto max-w-5xl px-6 py-16">
          <div className="flex flex-col md:flex-row gap-10 items-start">
            {/* Artist photo */}
            <div className="flex-shrink-0">
              <div className="w-48 h-48 md:w-56 md:h-56 rounded-2xl overflow-hidden border-4 border-white/10 shadow-2xl bg-muted flex items-center justify-center">
                {photos[0]?.url ? (
                  <img src={photos[0].url} alt={pressKit.artistName} className="w-full h-full object-cover" />
                ) : (
                  <User className="h-20 w-20 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Artist info */}
            <div className="space-y-4 flex-1">
              <div>
                <p className="text-sm font-medium text-primary uppercase tracking-widest mb-1">Electronic Press Kit</p>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight">{pressKit.artistName || 'Artist'}</h1>
              </div>

              <div className="flex flex-wrap gap-2">
                {genres.map((g: string) => (
                  <Badge key={g} variant="secondary" className="text-sm px-3 py-1">{g}</Badge>
                ))}
              </div>

              {pressKit.shortBio && (
                <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
                  {pressKit.shortBio}
                </p>
              )}

              {/* Social links */}
              <div className="flex items-center gap-4 pt-2">
                {socialLinks.instagram && (
                  <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer"
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                    <Instagram className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.twitter && (
                  <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer"
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                    <Twitter className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.youtube && (
                  <a href={socialLinks.youtube} target="_blank" rel="noopener noreferrer"
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                    <Youtube className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.facebook && (
                  <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer"
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                    <Facebook className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.spotify && (
                  <a href={socialLinks.spotify} target="_blank" rel="noopener noreferrer"
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                    <Music className="h-5 w-5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Main content */}
      <div className="container mx-auto max-w-5xl px-6 py-12">
        <div className="grid md:grid-cols-3 gap-12">
          {/* Bio + Photos */}
          <div className="md:col-span-2 space-y-12">
            {pressKit.bio && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Biography</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {pressKit.bio}
                </p>
              </section>
            )}

            {photos.length > 1 && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Press Photos</h2>
                <div className="grid grid-cols-2 gap-4">
                  {photos.map((photo, i) => (
                    <div key={i} className="group relative rounded-xl overflow-hidden aspect-video bg-muted border">
                      <img src={photo.url} alt={photo.caption || `Press photo ${i + 1}`} className="w-full h-full object-cover" />
                      <a
                        href={photo.url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute bottom-2 right-2 p-1.5 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Download high-res"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  High-resolution photos available for press use. Please credit appropriately.
                </p>
              </section>
            )}
          </div>

          {/* Sidebar: Contact + Technical */}
          <div className="space-y-8">
            <div className="rounded-2xl border bg-card p-6 space-y-5">
              <h3 className="text-lg font-semibold">Contact & Booking</h3>

              {pressKit.contactEmail && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">General</p>
                  <a href={`mailto:${pressKit.contactEmail}`}
                    className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    {pressKit.contactEmail}
                  </a>
                </div>
              )}

              {pressKit.bookingEmail && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Booking</p>
                  <a href={`mailto:${pressKit.bookingEmail}`}
                    className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    {pressKit.bookingEmail}
                  </a>
                </div>
              )}

              {pressKit.website && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Website</p>
                  <a href={pressKit.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Globe className="h-4 w-4 flex-shrink-0" />
                    {pressKit.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
            </div>

            {(pressKit.technicalRider || pressKit.hospitality) && (
              <div className="rounded-2xl border bg-card p-6 space-y-4">
                <h3 className="text-lg font-semibold">Performance Requirements</h3>

                {pressKit.technicalRider && (
                  <div>
                    <p className="text-sm font-medium mb-2">Technical Rider</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{pressKit.technicalRider}</p>
                  </div>
                )}

                {pressKit.hospitality && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-2">Hospitality</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{pressKit.hospitality}</p>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="rounded-2xl border bg-muted/30 p-5 text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                Press kit powered by
              </p>
              <a href="https://maxbooster.replit.app" target="_blank" rel="noopener noreferrer"
                className="text-sm font-semibold text-primary hover:underline flex items-center justify-center gap-1">
                Max Booster <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
