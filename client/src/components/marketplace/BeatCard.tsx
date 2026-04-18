import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Music,
  Play,
  Pause,
  ShoppingCart,
  Edit,
  Trash2,
  Percent,
  Loader2,
} from 'lucide-react';

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

export type BeatCardMode = 'buy' | 'owner';

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
 * Unified beat card used across the marketplace and producer storefronts.
 * The visual baseline matches the producer profile design: square cover art,
 * floating play button, title + BPM/Key/Genre line, price, and a single
 * primary CTA on the right.
 */
export function BeatCard({
  beat,
  mode = 'buy',
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
  className = '',
}: BeatCardProps) {
  const cover = beat.coverArt || beat.artworkUrl || '';
  const tempo = beat.bpm ?? beat.tempo;
  const hasDiscount =
    beat.discountPercent != null &&
    beat.discountPercent > 0 &&
    beat.discountPriceCents != null;

  return (
    <Card
      className={`group hover:shadow-lg transition ${
        selected ? 'ring-2 ring-blue-500' : ''
      } ${className}`}
      data-testid={`card-beat-${beat.id}`}
    >
      <CardContent className="p-0">
        <div className="relative aspect-square bg-gradient-to-br from-blue-500 to-purple-600 rounded-t-lg overflow-hidden">
          {cover ? (
            <img
              src={cover}
              alt={beat.title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Music className="w-16 h-16 text-white opacity-50" />
            </div>
          )}

          {selectable && (
            <div className="absolute top-2 left-2 z-10">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect?.(beat)}
                className="w-5 h-5 rounded border-2 border-white bg-black/30 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
                data-testid={`checkbox-select-beat-${beat.id}`}
              />
            </div>
          )}

          {onPlayToggle && (
            <Button
              size="icon"
              className="absolute bottom-4 right-4 rounded-full w-12 h-12 bg-white/90 hover:bg-white text-black shadow-lg"
              onClick={() => onPlayToggle(beat)}
              aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
              data-testid={`button-play-${beat.id}`}
            >
              {isLoadingAudio ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </Button>
          )}
        </div>

        <div className="p-4 space-y-3">
          <div>
            <h4
              className="font-semibold truncate"
              data-testid={`text-beat-title-${beat.id}`}
            >
              {beat.title}
            </h4>
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              {tempo ? <span>{tempo} BPM</span> : null}
              {tempo && beat.key ? <span>•</span> : null}
              {beat.key ? <span>{beat.key}</span> : null}
              {(tempo || beat.key) && beat.genre ? <span>•</span> : null}
              {beat.genre ? (
                <Badge variant="secondary" className="text-xs">
                  {beat.genre}
                </Badge>
              ) : null}
              {beat.mood ? (
                <Badge variant="outline" className="text-xs">
                  {beat.mood}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              {hasDiscount ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className="text-lg font-bold text-green-600"
                    data-testid={`text-beat-price-${beat.id}`}
                  >
                    ${(beat.discountPriceCents! / 100).toFixed(2)}
                  </span>
                  <span className="text-sm line-through text-muted-foreground">
                    ${beat.price}
                  </span>
                  <Badge
                    variant="destructive"
                    className="text-[10px] px-1 py-0"
                  >
                    -{beat.discountPercent}%
                  </Badge>
                </div>
              ) : (
                <span
                  className="text-lg font-bold text-green-600"
                  data-testid={`text-beat-price-${beat.id}`}
                >
                  ${beat.price}
                </span>
              )}
            </div>

            {mode === 'buy' && onBuy && (
              <Button
                size="sm"
                className="bg-gradient-to-r from-blue-600 to-purple-600 shrink-0"
                onClick={() => onBuy(beat)}
                data-testid={`button-buy-${beat.id}`}
              >
                <ShoppingCart className="w-4 h-4 mr-1" />
                Buy
              </Button>
            )}

            {mode === 'owner' && (
              <div className="flex space-x-1 shrink-0">
                {onSetDiscount && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSetDiscount(beat)}
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
                    onClick={() => onEdit(beat)}
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
                    onClick={() => onDelete(beat)}
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
