import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Play, Pause, ShoppingCart, Heart, Settings2 } from 'lucide-react';
import { BeatPreviewControls, BeatPreviewBadges } from '@/components/marketplace/BeatPreviewControls';
import { useState } from 'react';

interface BeatCardProps {
  id: string;
  title: string;
  producer: string;
  price: number;
  bpm?: number;
  key?: string;
  genre?: string;
  audioUrl?: string;
  waveformColor?: string;
  isPlaying?: boolean;
  isLiked?: boolean;
  onPlay?: () => void;
  onAddToCart?: () => void;
  onLike?: () => void;
  className?: string;
  showPreviewControls?: boolean;
}

const waveformColors = {
  cyan: 'from-cyan-400 to-cyan-600',
  purple: 'from-purple-400 to-purple-600',
  pink: 'from-pink-400 to-pink-600',
  orange: 'from-orange-400 to-orange-600',
  yellow: 'from-yellow-400 to-yellow-600',
  emerald: 'from-emerald-400 to-emerald-600',
  blue: 'from-blue-400 to-blue-600',
  red: 'from-red-400 to-red-600',
};

export function BeatCard({
  id,
  title,
  producer,
  price,
  bpm,
  key: musicalKey,
  genre,
  audioUrl,
  waveformColor = 'cyan',
  isPlaying = false,
  isLiked = false,
  onPlay,
  onAddToCart,
  onLike,
  className,
  showPreviewControls = true,
}: BeatCardProps) {
  const colorClass = waveformColors[waveformColor as keyof typeof waveformColors] || waveformColors.cyan;
  const [showControls, setShowControls] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const handlePlayClick = () => {
    if (audioUrl && showPreviewControls) {
      setShowControls(!showControls);
    }
    onPlay?.();
  };

  return (
    <Card
      className={cn(
        'group overflow-hidden bg-slate-800/50 border-slate-700/50 hover:border-slate-600 transition-all hover:shadow-xl hover:shadow-cyan-500/5',
        className
      )}
    >
      <CardContent className="p-4 space-y-4">
        <div className="relative h-24 flex items-center justify-center">
          <WaveformVisualization colorClass={colorClass} isPlaying={isPreviewPlaying} />
          <button
            onClick={handlePlayClick}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors">
              {isPlaying || isPreviewPlaying ? (
                <Pause className="h-6 w-6 text-white" />
              ) : (
                <Play className="h-6 w-6 text-white ml-1" />
              )}
            </div>
          </button>
          {audioUrl && showPreviewControls && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowControls(!showControls);
              }}
              className="absolute top-1 right-1 p-1.5 rounded-md bg-white/10 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"
              title="Speed/Pitch Controls"
            >
              <Settings2 className="h-4 w-4 text-white" />
            </button>
          )}
        </div>

        {showControls && audioUrl && bpm && musicalKey && (
          <BeatPreviewControls
            beatId={id}
            audioUrl={audioUrl}
            originalBpm={bpm}
            originalKey={musicalKey}
            onPlayStateChange={setIsPreviewPlaying}
          />
        )}

        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white truncate">{title}</h3>
              <p className="text-sm text-slate-400 truncate">by {producer}</p>
            </div>
            <span className="text-lg font-bold text-emerald-400">${price}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {bpm && (
              <Badge variant="secondary" className="bg-slate-700/50 text-slate-300 text-xs">
                {bpm} BPM
              </Badge>
            )}
            {musicalKey && (
              <Badge variant="secondary" className="bg-slate-700/50 text-slate-300 text-xs">
                {musicalKey}
              </Badge>
            )}
            {genre && (
              <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-400 text-xs">
                {genre}
              </Badge>
            )}
            {bpm && musicalKey && (
              <BeatPreviewBadges originalBpm={bpm} originalKey={musicalKey} />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'flex-1',
              isLiked ? 'text-red-400 hover:text-red-300' : 'text-slate-400 hover:text-white'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onLike?.();
            }}
          >
            <Heart className={cn('h-4 w-4 mr-1', isLiked && 'fill-current')} />
            Like
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-cyan-600 hover:bg-cyan-500"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart?.();
            }}
          >
            <ShoppingCart className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WaveformVisualization({ colorClass, isPlaying = false }: { colorClass: string; isPlaying?: boolean }) {
  const bars = 32;

  return (
    <div className="w-full h-full flex items-center justify-center gap-[2px]">
      {Array.from({ length: bars }).map((_, i) => {
        const baseHeight = 20 + (Math.sin(i * 0.5) * 30 + 30);
        const delay = i * 0.05;

        return (
          <div
            key={i}
            className={cn(
              'w-1 rounded-full bg-gradient-to-t transition-all duration-150',
              colorClass,
              isPlaying && 'animate-pulse'
            )}
            style={{
              height: `${baseHeight}%`,
              opacity: isPlaying ? 0.8 + Math.sin(Date.now() / 200 + i) * 0.2 : 0.6 + (i % 3) * 0.1,
              animationDelay: `${delay}s`,
              transform: isPlaying ? `scaleY(${0.8 + Math.random() * 0.4})` : 'scaleY(1)',
            }}
          />
        );
      })}
    </div>
  );
}

interface BeatGridProps {
  children: React.ReactNode;
  className?: string;
}

export function BeatGrid({ children, className }: BeatGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4',
        className
      )}
    >
      {children}
    </div>
  );
}

interface FilterRailProps {
  genres: string[];
  selectedGenres: string[];
  onGenreToggle: (genre: string) => void;
  bpmRange?: [number, number];
  onBpmChange?: (range: [number, number]) => void;
  className?: string;
}

export function FilterRail({
  genres,
  selectedGenres,
  onGenreToggle,
  className,
}: FilterRailProps) {
  return (
    <div className={cn('space-y-6', className)} role="group" aria-label="Genre filters">
      <div>
        <h3 className="text-sm font-semibold text-white mb-3" id="genre-filter-heading">
          Genres
        </h3>
        <div className="space-y-2" role="group" aria-labelledby="genre-filter-heading">
          {genres.map((genre) => {
            const isChecked = selectedGenres.includes(genre);
            const inputId = `genre-filter-${genre.toLowerCase().replace(/\s+/g, '-')}`;
            return (
              <label
                key={genre}
                htmlFor={inputId}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <Checkbox
                  id={inputId}
                  checked={isChecked}
                  onCheckedChange={() => onGenreToggle(genre)}
                  className="border-slate-600 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                  aria-label={`Filter by ${genre}`}
                />
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                  {genre}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ProducerProfileProps {
  name: string;
  avatar?: string;
  beats?: number;
  sales?: number;
  className?: string;
}

export function ProducerProfile({
  name,
  avatar,
  beats,
  sales,
  className,
}: ProducerProfileProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors cursor-pointer',
        className
      )}
    >
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full rounded-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">{name}</p>
        <p className="text-xs text-slate-400">
          {beats} beats {sales && `· ${sales} sales`}
        </p>
      </div>
    </div>
  );
}
