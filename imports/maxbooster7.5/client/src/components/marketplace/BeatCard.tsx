import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Music,
  Play,
  Pause,
  ShoppingCart,
  Edit,
  Trash2,
  Percent,
  Loader2,
  Headphones,
} from "lucide-react";

export interface BeatCardData {
  id: string;
  title: string;
  genre?: string;
  mood?: string;
  bpm?: number;
  tempo?: number;
  key?: string;
  price: number;
  coverArt?: string;
  artworkUrl?: string;
  audioUrl?: string;
  previewUrl?: string;
  discountPercent?: number | null;
  discountPriceCents?: number | null;
}

export type BeatCardMode = "buy" | "owner";

export interface BeatCardProps {
  beat: BeatCardData;
  mode?: BeatCardMode;

  isPlaying?: boolean;
  isLoadingAudio?: boolean;
  onPlayToggle?: (beat: BeatCardData) => void;

  /** "Buy" handler — only used when mode='buy'. */
  onBuy?: (beat: BeatCardData) => void;

  /** Owner-only handlers. */
  onEdit?: (beat: BeatCardData) => void;
  onDelete?: (beat: BeatCardData) => void;
  onSetDiscount?: (beat: BeatCardData) => void;

  /** Optional bulk-select checkbox (owner mode). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (beat: BeatCardData) => void;

  className?: string;
}

/**
 * Deterministic gradient seeded from the beat id so each card has a
 * stable, recognizable cover when no artwork is provided.
 */
function pickGradient(seed: string): { from: string; to: string } {
  const palettes: Array<{ from: string; to: string }> = [
    { from: "#7c3aed", to: "#2563eb" }, // violet → blue
    { from: "#ec4899", to: "#8b5cf6" }, // pink → violet
    { from: "#f97316", to: "#db2777" }, // orange → pink
    { from: "#10b981", to: "#0891b2" }, // emerald → cyan
    { from: "#0ea5e9", to: "#6366f1" }, // sky → indigo
    { from: "#f59e0b", to: "#ef4444" }, // amber → red
    { from: "#06b6d4", to: "#3b82f6" }, // cyan → blue
    { from: "#a855f7", to: "#3b82f6" }, // purple → blue
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return palettes[Math.abs(hash) % palettes.length];
}

/**
 * Unified beat card used across the marketplace and producer storefronts.
 * Square cover art with gradient fallback (always visible — never bare bg-card),
 * floating play button on hover, title + meta line, price, and a single
 * primary CTA on the right.
 */
export function BeatCard({
  beat,
  mode = "buy",
  isPlaying = false,
  isLoadingAudio = false,
  onPlayToggle,
  onBuy,
  onEdit,
  onDelete,
  onSetDiscount,
  selectable = false,
  selected = false,
  onToggleSelect,
  className = "",
}: BeatCardProps) {
  const cover = beat.coverArt || beat.artworkUrl || "";
  const tempo = beat.bpm ?? beat.tempo;
  const hasDiscount =
    beat.discountPercent != null &&
    beat.discountPercent > 0 &&
    beat.discountPriceCents != null;

  // Track image load failure so the fallback actually renders (the previous
  // implementation only set display:none on the broken <img>, leaving the
  // gradient + icon hidden behind a transparent box on top of bg-card).
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = cover && !imageBroken;

  const gradient = pickGradient(beat.id || beat.title || "beat");
  // Inline-style gradient is intentional: Tailwind v4 renamed
  // `bg-gradient-to-*` → `bg-linear-to-*`, and inline style guarantees
  // the fallback is always visible regardless of class-name churn.
  const gradientStyle = {
    backgroundImage: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
  };

  return (
    <Card
      className={`group relative overflow-hidden border border-border/60 bg-card hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 ${
        selected ? "ring-2 ring-primary" : ""
      } ${className}`}
      data-testid={`card-beat-${beat.id}`}
    >
      <CardContent className="p-0">
        {/* Cover art */}
        <div
          className="relative aspect-square overflow-hidden rounded-t-lg"
          style={gradientStyle}
        >
          {showImage ? (
            <img
              src={cover}
              alt={beat.title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={() => setImageBroken(true)}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90">
              <Headphones
                className="w-16 h-16 mb-2 drop-shadow-lg"
                strokeWidth={1.5}
              />
              <span className="text-xs font-medium uppercase tracking-widest opacity-80">
                Beat Preview
              </span>
            </div>
          )}

          {/* Subtle bottom gradient for badge legibility on bright artwork */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/60 via-black/20 to-transparent" />

          {/* Bulk-select checkbox */}
          {selectable && (
            <div className="absolute top-3 left-3 z-10">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect?.(beat)}
                className="w-5 h-5 rounded border-2 border-white bg-black/40 cursor-pointer accent-primary"
                onClick={(e) => e.stopPropagation()}
                data-testid={`checkbox-select-beat-${beat.id}`}
              />
            </div>
          )}

          {/* Tempo pill — top-right */}
          {tempo ? (
            <div className="absolute top-3 right-3 z-10">
              <span className="inline-flex items-center rounded-full bg-black/60 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-white tracking-wide">
                {tempo} BPM
              </span>
            </div>
          ) : null}

          {/* Discount flag — bottom-left */}
          {hasDiscount && (
            <div className="absolute bottom-3 left-3 z-10">
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-500 px-2 py-1 text-[11px] font-bold text-white shadow-lg">
                <Percent className="w-3 h-3" />
                {beat.discountPercent}% OFF
              </span>
            </div>
          )}

          {/* Play button — appears on hover, always visible while playing */}
          {onPlayToggle && (
            <Button
              size="icon"
              className={`absolute bottom-3 right-3 z-10 rounded-full w-12 h-12 bg-white text-black shadow-xl transition-all duration-200
                ${isPlaying ? "opacity-100 scale-100" : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"}
                hover:bg-white hover:scale-105`}
              onClick={(e) => {
                e.stopPropagation();
                onPlayToggle(beat);
              }}
              aria-label={isPlaying ? "Pause preview" : "Play preview"}
              data-testid={`button-play-${beat.id}`}
            >
              {isLoadingAudio ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5 fill-current" />
              )}
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <h4
              className="font-semibold text-base leading-tight truncate"
              title={beat.title}
              data-testid={`text-beat-title-${beat.id}`}
            >
              {beat.title}
            </h4>
            <div className="flex items-center gap-1.5 flex-wrap min-h-[22px]">
              {beat.key ? (
                <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {beat.key}
                </span>
              ) : null}
              {beat.genre ? (
                <Badge
                  variant="secondary"
                  className="text-[11px] px-2 py-0 h-5"
                >
                  {beat.genre}
                </Badge>
              ) : null}
              {beat.mood ? (
                <Badge variant="outline" className="text-[11px] px-2 py-0 h-5">
                  {beat.mood}
                </Badge>
              ) : null}
              {!beat.key && !beat.genre && !beat.mood && (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Music className="w-3 h-3" /> Untagged
                </span>
              )}
            </div>
          </div>

          <div className="flex items-end justify-between gap-2 pt-1">
            <div className="min-w-0">
              {hasDiscount ? (
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span
                    className="text-xl font-bold tabular-nums text-emerald-500"
                    data-testid={`text-beat-price-${beat.id}`}
                  >
                    ${(beat.discountPriceCents! / 100).toFixed(2)}
                  </span>
                  <span className="text-xs line-through text-muted-foreground tabular-nums">
                    ${beat.price}
                  </span>
                </div>
              ) : (
                <span
                  className="text-xl font-bold tabular-nums text-foreground"
                  data-testid={`text-beat-price-${beat.id}`}
                >
                  ${beat.price}
                </span>
              )}
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {hasDiscount ? "Sale price" : "Starting price"}
              </div>
            </div>

            {mode === "buy" && onBuy && (
              <Button
                size="sm"
                className="shrink-0 bg-linear-to-r from-violet-600 to-blue-600 text-white hover:from-violet-500 hover:to-blue-500 shadow-md font-semibold"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #7c3aed 0%, #2563eb 100%)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onBuy(beat);
                }}
                data-testid={`button-buy-${beat.id}`}
              >
                <ShoppingCart className="w-4 h-4 mr-1.5" />
                Buy
              </Button>
            )}

            {mode === "owner" && (
              <div className="flex space-x-1 shrink-0">
                {onSetDiscount && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetDiscount(beat);
                    }}
                    title="Set discount"
                    data-testid={`button-discount-${beat.id}`}
                  >
                    <Percent className="w-4 h-4" />
                  </Button>
                )}
                {onEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(beat);
                    }}
                    title="Edit beat"
                    data-testid={`button-edit-${beat.id}`}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(beat);
                    }}
                    title="Delete beat"
                    className="hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20"
                    data-testid={`button-delete-${beat.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default BeatCard;
