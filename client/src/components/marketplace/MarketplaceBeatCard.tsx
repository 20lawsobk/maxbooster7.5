import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Pause,
  Heart,
  Star,
  Plus,
  Shield,
  Share2,
  Loader2,
  Headphones,
} from "lucide-react";

export interface MarketplaceBeatCardBeat {
  id: string;
  title: string;
  producer: string;
  coverArt?: string;
  tempo?: number;
  bpm?: number;
  genre?: string;
  mood?: string;
  isExclusive?: boolean;
  plays?: number;
  likes?: number;
  avgRating?: number;
  price: number;
  discountPercent?: number | null;
  discountPriceCents?: number | null;
}

export interface LicenseTierInfo {
  label?: string;
  bogoEnabled?: boolean;
  bogoGetType?: string;
  bogoGetPercent?: number;
  fileFormats?: string[];
  discountPercent?: number;
}

export interface MarketplaceBeatCardProps {
  beat: MarketplaceBeatCardBeat;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  availableLicenses: string[];
  getLicenseTier: (license: string) => LicenseTierInfo | undefined;
  getLicensePrice: (license: string) => number;
  getLicenseOriginalPrice: (license: string) => number | null;
  getLicenseDescription: (license: string) => string;

  onPlayPause: (beatId: string) => void;
  onLike: (beatId: string) => void;
  isLikePending: boolean;
  onRate: (beatId: string, rating: number) => void;
  isRatePending: boolean;
  onAddToCart: (license: string) => void;
  onPurchaseEscrow: () => void;
  onShare: () => void;
}

/** Deterministic gradient seeded from beat id for a stable cover fallback. */
function pickGradient(seed: string): { from: string; to: string } {
  const palettes: Array<{ from: string; to: string }> = [
    { from: "#7c3aed", to: "#2563eb" },
    { from: "#ec4899", to: "#8b5cf6" },
    { from: "#f97316", to: "#db2777" },
    { from: "#10b981", to: "#0891b2" },
    { from: "#0ea5e9", to: "#6366f1" },
    { from: "#f59e0b", to: "#ef4444" },
    { from: "#06b6d4", to: "#3b82f6" },
    { from: "#a855f7", to: "#3b82f6" },
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palettes[Math.abs(hash) % palettes.length];
}

export function MarketplaceBeatCard({
  beat,
  isPlaying,
  isLoadingAudio,
  availableLicenses,
  getLicenseTier,
  getLicensePrice,
  getLicenseOriginalPrice,
  getLicenseDescription,
  onPlayPause,
  onLike,
  isLikePending,
  onRate,
  isRatePending,
  onAddToCart,
  onPurchaseEscrow,
  onShare,
}: MarketplaceBeatCardProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const tempo = beat.tempo ?? beat.bpm;
  const hasDiscount =
    beat.discountPercent != null &&
    beat.discountPercent > 0 &&
    beat.discountPriceCents != null;
  const showImage = !!beat.coverArt && !imageBroken;
  const gradient = pickGradient(beat.id || beat.title || "beat");
  const gradientStyle = {
    backgroundImage: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
  };
  const userRating = beat.avgRating ?? 0;

  return (
    <Card className="group flex flex-col overflow-hidden border border-border/60 bg-card hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300">
      <CardContent className="p-0 flex flex-col flex-1">
        {/* Cover */}
        <div
          className="relative w-full aspect-square overflow-hidden"
          style={gradientStyle}
        >
          {showImage && (
            <img
              src={beat.coverArt}
              alt={beat.title}
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageBroken(true)}
            />
          )}

          {/* Fallback icon — visible whenever we don't have a loaded image */}
          {(!showImage || !imageLoaded) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 pointer-events-none">
              <Headphones
                className="w-16 h-16 mb-2 drop-shadow-lg"
                strokeWidth={1.5}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">
                Beat
              </span>
            </div>
          )}

          {/* Bottom gradient for badge legibility */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/60 via-black/20 to-transparent" />

          {/* Hover dim + play */}
          <button
            onClick={() => onPlayPause(beat.id)}
            disabled={isLoadingAudio && isPlaying}
            className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-200"
            aria-label={isPlaying ? "Pause preview" : "Play preview"}
            data-testid={`button-play-${beat.id}`}
          >
            <span
              className={`flex items-center justify-center w-14 h-14 rounded-full bg-white text-black shadow-xl transition-all duration-200
                ${isPlaying ? "opacity-100 scale-100" : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"}`}
            >
              {isLoadingAudio && isPlaying ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6 ml-0.5 fill-current" />
              )}
            </span>
          </button>

          {/* Top-left: Escrow */}
          <div className="absolute top-3 left-3 z-10">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur">
              <Shield className="w-3 h-3" />
              Escrow
            </span>
          </div>

          {/* Top-right: BPM */}
          {tempo ? (
            <div className="absolute top-3 right-3 z-10">
              <span className="inline-flex items-center rounded-full bg-black/65 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-white tracking-wide">
                {tempo} BPM
              </span>
            </div>
          ) : null}

          {/* Bottom-left: Discount */}
          {hasDiscount && (
            <div className="absolute bottom-3 left-3 z-10">
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-500 px-2 py-1 text-[11px] font-bold text-white shadow-lg">
                -{beat.discountPercent}% OFF
              </span>
            </div>
          )}

          {/* Bottom-right: Exclusive */}
          {beat.isExclusive && (
            <div className="absolute bottom-3 right-3 z-10">
              <span className="inline-flex items-center rounded-md bg-amber-500 px-2 py-1 text-[11px] font-bold text-white shadow-lg uppercase tracking-wide">
                Exclusive
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col flex-1 space-y-3">
          {/* Title block */}
          <div>
            <h3
              className="font-semibold text-base leading-tight truncate"
              title={beat.title}
              data-testid={`text-beat-title-${beat.id}`}
            >
              {beat.title}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {beat.producer}
            </p>
          </div>

          {/* Tags */}
          {(beat.genre || beat.mood) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {beat.genre && (
                <Badge
                  variant="secondary"
                  className="text-[11px] px-2 py-0 h-5"
                >
                  {beat.genre}
                </Badge>
              )}
              {beat.mood && (
                <Badge variant="outline" className="text-[11px] px-2 py-0 h-5">
                  {beat.mood}
                </Badge>
              )}
            </div>
          )}

          {/* Headline price */}
          <div className="border-t border-border/40 pt-3 flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {hasDiscount ? "Sale price" : "Starting from"}
            </span>
            {hasDiscount ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] line-through text-muted-foreground tabular-nums">
                  ${beat.price}
                </span>
                <span className="text-base font-bold tabular-nums text-emerald-500">
                  ${(beat.discountPriceCents! / 100).toFixed(2)}
                </span>
              </div>
            ) : (
              <span className="text-base font-bold tabular-nums text-foreground">
                ${beat.price}
              </span>
            )}
          </div>

          {/* Plays + likes */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1" title="Plays">
              <Play className="w-3 h-3 shrink-0" />
              <span className="tabular-nums">
                {(beat.plays ?? 0).toLocaleString()}
              </span>
            </span>
            <button
              onClick={() => onLike(beat.id)}
              disabled={isLikePending}
              className="inline-flex items-center gap-1 hover:text-rose-500 transition-colors"
              data-testid={`button-like-${beat.id}`}
            >
              <Heart
                className={`w-3 h-3 shrink-0 ${isLikePending ? "animate-pulse" : ""}`}
              />
              <span className="tabular-nums">
                {(beat.likes ?? 0).toLocaleString()}
              </span>
            </button>
          </div>

          {/* Rating — own row so stars never collide with neighbors */}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="text-[11px]">Rate this beat</span>
            <div
              className="inline-flex items-center gap-1.5"
              role="group"
              aria-label="Rate beat"
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => onRate(beat.id, star)}
                  disabled={isRatePending}
                  className="hover:scale-110 transition-transform"
                  aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                >
                  <Star
                    className={`w-4 h-4 ${
                      star <= userRating
                        ? "text-amber-400 fill-amber-400"
                        : "text-muted-foreground/40"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* License tiers */}
          {availableLicenses.length > 0 && (
            <div className="space-y-1.5 mt-2 pt-2 border-t border-border/40">
              {availableLicenses.map((license) => {
                const tier = getLicenseTier(license);
                const originalPrice = getLicenseOriginalPrice(license);
                const price = getLicensePrice(license);
                return (
                  <div
                    key={license}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors border border-transparent hover:border-border"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium capitalize truncate">
                          {tier?.label || license}
                        </span>
                        {tier?.bogoEnabled && (
                          <Badge className="text-[9px] px-1.5 py-0 h-4 bg-orange-500 text-white border-0">
                            BOGO
                          </Badge>
                        )}
                        {tier?.fileFormats && tier.fileFormats.length > 1 && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0 h-4"
                          >
                            {tier.fileFormats
                              .map((f) => f.toUpperCase())
                              .join("+")}
                          </Badge>
                        )}
                        {tier?.discountPercent && tier.discountPercent > 0 ? (
                          <Badge
                            variant="destructive"
                            className="text-[9px] px-1.5 py-0 h-4"
                          >
                            -{tier.discountPercent}%
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {getLicenseDescription(license)}
                      </p>
                      {tier?.bogoEnabled && tier.bogoGetType && (
                        <p className="text-[10px] text-orange-500">
                          Buy 1, get{" "}
                          {tier.bogoGetPercent === 100
                            ? "FREE"
                            : `${tier.bogoGetPercent}% off`}{" "}
                          {tier.bogoGetType}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right leading-tight">
                        <div className="text-sm font-semibold tabular-nums">
                          ${price.toFixed(2)}
                        </div>
                        {originalPrice != null && (
                          <div className="text-[10px] line-through text-muted-foreground tabular-nums">
                            ${originalPrice.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => onAddToCart(license)}
                        className="h-8 w-8 p-0 text-white shadow-md"
                        style={{
                          backgroundImage:
                            "linear-gradient(90deg, #7c3aed 0%, #2563eb 100%)",
                        }}
                        aria-label={`Add ${tier?.label || license} license to cart`}
                        data-testid={`button-add-${beat.id}-${license}`}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex gap-2 pt-2 mt-auto">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400"
              onClick={onPurchaseEscrow}
              data-testid={`button-escrow-${beat.id}`}
            >
              <Shield className="w-4 h-4 mr-1.5" />
              Buy with Escrow
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onShare}
              aria-label="Share"
              data-testid={`button-share-${beat.id}`}
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default MarketplaceBeatCard;
