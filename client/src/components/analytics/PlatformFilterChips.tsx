import { useCallback } from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Platform {
  id: string;
  name: string;
  icon?: string;
  color: string;
}

const STREAMING_PLATFORMS: Platform[] = [
  { id: "spotify", name: "Spotify", color: "#1DB954", icon: "🎵" },
  { id: "apple_music", name: "Apple Music", color: "#FA2D48", icon: "🍎" },
  { id: "youtube_music", name: "YouTube Music", color: "#FF0000", icon: "📺" },
  { id: "amazon_music", name: "Amazon Music", color: "#FF9900", icon: "📦" },
  { id: "deezer", name: "Deezer", color: "#00C7F2", icon: "🎧" },
  { id: "tidal", name: "Tidal", color: "#000000", icon: "🌊" },
  { id: "pandora", name: "Pandora", color: "#3668FF", icon: "📻" },
  { id: "soundcloud", name: "SoundCloud", color: "#FF5500", icon: "☁️" },
];

interface PlatformFilterChipsProps {
  selectedPlatforms: string[];
  onChange: (platforms: string[]) => void;
  className?: string;
  variant?: "chips" | "badges" | "buttons";
  allowMultiple?: boolean;
  showSelectAll?: boolean;
  platforms?: Platform[];
}

export function PlatformFilterChips({
  selectedPlatforms,
  onChange,
  className,
  variant = "chips",
  allowMultiple = true,
  showSelectAll = true,
  platforms = STREAMING_PLATFORMS,
}: PlatformFilterChipsProps) {
  const handleToggle = useCallback(
    (platformId: string) => {
      if (allowMultiple) {
        const newSelection = selectedPlatforms.includes(platformId)
          ? selectedPlatforms.filter((id) => id !== platformId)
          : [...selectedPlatforms, platformId];
        onChange(newSelection);
      } else {
        onChange([platformId]);
      }
    },
    [selectedPlatforms, onChange, allowMultiple],
  );

  const handleSelectAll = useCallback(() => {
    if (selectedPlatforms.length === platforms.length) {
      onChange([]);
    } else {
      onChange(platforms.map((p) => p.id));
    }
  }, [selectedPlatforms, onChange, platforms]);

  const handleClear = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const allSelected = selectedPlatforms.length === platforms.length;
  const noneSelected = selectedPlatforms.length === 0;

  if (variant === "buttons") {
    return (
      <div className={cn("flex items-center gap-2 flex-wrap", className)}>
        {showSelectAll && (
          <Button
            variant={allSelected || noneSelected ? "default" : "outline"}
            size="sm"
            className="h-8"
            onClick={handleSelectAll}
          >
            {allSelected || noneSelected ? "All Platforms" : "Select All"}
          </Button>
        )}
        {platforms.map((platform) => {
          const isSelected =
            selectedPlatforms.includes(platform.id) || noneSelected;
          return (
            <Button
              key={platform.id}
              variant={isSelected && !noneSelected ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-8 gap-1.5",
                isSelected && !noneSelected && "ring-2 ring-offset-1",
              )}
              style={{
                borderColor:
                  isSelected && !noneSelected ? platform.color : undefined,
                backgroundColor:
                  isSelected && !noneSelected
                    ? `${platform.color}15`
                    : undefined,
                ringColor: platform.color,
              }}
              onClick={() => handleToggle(platform.id)}
            >
              {platform.icon && (
                <span className="text-sm">{platform.icon}</span>
              )}
              <span>{platform.name}</span>
              {isSelected && !noneSelected && (
                <Check className="h-3 w-3 ml-1" />
              )}
            </Button>
          );
        })}
        {selectedPlatforms.length > 0 && !allSelected && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={handleClear}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
    );
  }

  if (variant === "badges") {
    return (
      <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
        {showSelectAll && (
          <Badge
            variant={allSelected || noneSelected ? "default" : "outline"}
            className="cursor-pointer hover:bg-primary/90 transition-colors"
            onClick={handleSelectAll}
          >
            All
          </Badge>
        )}
        {platforms.map((platform) => {
          const isSelected = selectedPlatforms.includes(platform.id);
          return (
            <Badge
              key={platform.id}
              variant={isSelected ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-all hover:scale-105",
                isSelected && "text-white",
              )}
              style={{
                backgroundColor: isSelected ? platform.color : "transparent",
                borderColor: platform.color,
                color: isSelected ? "white" : platform.color,
              }}
              onClick={() => handleToggle(platform.id)}
            >
              {platform.icon && <span className="mr-1">{platform.icon}</span>}
              {platform.name}
            </Badge>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {showSelectAll && (
        <button
          onClick={handleSelectAll}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
            "border-2 hover:shadow-md",
            allSelected || noneSelected
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300",
          )}
        >
          All
        </button>
      )}
      {platforms.map((platform) => {
        const isSelected = selectedPlatforms.includes(platform.id);
        return (
          <button
            key={platform.id}
            onClick={() => handleToggle(platform.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
              "border-2 hover:shadow-md hover:scale-105",
              isSelected
                ? "text-white shadow-sm"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300",
            )}
            style={{
              backgroundColor: isSelected ? platform.color : undefined,
              borderColor: platform.color,
            }}
          >
            {platform.icon && <span>{platform.icon}</span>}
            {platform.name}
            {isSelected && <Check className="h-3.5 w-3.5 ml-0.5" />}
          </button>
        );
      })}
      {selectedPlatforms.length > 0 && !allSelected && (
        <button
          onClick={handleClear}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
          Clear filters
        </button>
      )}
    </div>
  );
}

export function PlatformSummaryChips({
  platforms,
  className,
}: {
  platforms: Array<{ id: string; name: string; value: number; color: string }>;
  className?: string;
}) {
  const total = platforms.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {platforms.map((platform) => {
        const percentage =
          total > 0 ? ((platform.value / total) * 100).toFixed(1) : "0";
        return (
          <div
            key={platform.id}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border"
            style={{ borderColor: `${platform.color}40` }}
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: platform.color }}
            />
            <div className="flex flex-col">
              <span className="text-xs font-medium">{platform.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {platform.value.toLocaleString()} ({percentage}%)
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
