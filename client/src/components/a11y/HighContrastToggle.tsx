import { useHighContrast, type ContrastMode } from "@/hooks/useHighContrast";
import { Button } from "@/components/ui/button";
import { Contrast, Eye, EyeOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { announcePolite } from "@/lib/a11y/screenReader";

export interface HighContrastToggleProps {
  variant?: "button" | "dropdown" | "simple";
  size?: "sm" | "default" | "lg";
  showLabel?: boolean;
  className?: string;
}

const contrastModeLabels: Record<ContrastMode, string> = {
  normal: "Normal",
  high: "High Contrast",
  more: "Maximum Contrast",
};

export function HighContrastToggle({
  variant = "dropdown",
  size = "default",
  showLabel = false,
  className = "",
}: HighContrastToggleProps) {
  const { contrastMode, isHighContrast, isSystemPreference, setContrastMode } =
    useHighContrast();

  const handleSimpleToggle = () => {
    const newMode: ContrastMode = isHighContrast ? "normal" : "high";
    setContrastMode(newMode);
    announcePolite(`Contrast mode changed to ${contrastModeLabels[newMode]}`);
  };

  const handleModeChange = (mode: ContrastMode | null) => {
    setContrastMode(mode);
    if (mode === null) {
      announcePolite("Contrast mode set to system preference");
    } else {
      announcePolite(`Contrast mode changed to ${contrastModeLabels[mode]}`);
    }
  };

  const icon = isHighContrast ? (
    <Eye className="h-4 w-4" />
  ) : (
    <Contrast className="h-4 w-4" />
  );
  const label = contrastModeLabels[contrastMode];

  if (variant === "simple") {
    return (
      <Button
        variant={isHighContrast ? "default" : "outline"}
        size={size}
        onClick={handleSimpleToggle}
        className={className}
        aria-pressed={isHighContrast}
        aria-label={`High contrast mode is ${isHighContrast ? "enabled" : "disabled"}. Click to ${isHighContrast ? "disable" : "enable"}.`}
      >
        {icon}
        {showLabel && <span className="ml-2">{label}</span>}
      </Button>
    );
  }

  if (variant === "button") {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={() => {
          const modes: ContrastMode[] = ["normal", "high", "more"];
          const currentIndex = modes.indexOf(contrastMode);
          const nextIndex = (currentIndex + 1) % modes.length;
          handleModeChange(modes[nextIndex]);
        }}
        className={className}
        aria-label={`Current contrast: ${label}. Click to cycle through contrast modes.`}
      >
        {icon}
        {showLabel && <span className="ml-2">{label}</span>}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={size}
          className={className}
          aria-label={`Contrast settings. Current: ${label}${isSystemPreference ? " (system)" : ""}`}
        >
          {icon}
          {showLabel && <span className="ml-2">{label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Contrast Mode</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => handleModeChange(null)}
          className="flex items-center justify-between"
        >
          <span>Use System Setting</span>
          {isSystemPreference && (
            <span className="text-xs text-muted-foreground">✓</span>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => handleModeChange("normal")}
          className="flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <Contrast className="h-4 w-4" />
            Normal
          </span>
          {contrastMode === "normal" && !isSystemPreference && (
            <span className="text-xs text-muted-foreground">✓</span>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleModeChange("high")}
          className="flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            High Contrast
          </span>
          {contrastMode === "high" && !isSystemPreference && (
            <span className="text-xs text-muted-foreground">✓</span>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleModeChange("more")}
          className="flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <EyeOff className="h-4 w-4" />
            Maximum Contrast
          </span>
          {contrastMode === "more" && !isSystemPreference && (
            <span className="text-xs text-muted-foreground">✓</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ContrastModeIndicatorProps {
  className?: string;
}

export function ContrastModeIndicator({
  className = "",
}: ContrastModeIndicatorProps) {
  const { contrastMode, isHighContrast, isSystemPreference } =
    useHighContrast();

  if (!isHighContrast) return null;

  return (
    <div
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-foreground text-background ${className}`}
      role="status"
      aria-live="polite"
    >
      <Eye className="h-3 w-3" />
      <span>
        {contrastModeLabels[contrastMode]}
        {isSystemPreference && " (System)"}
      </span>
    </div>
  );
}

export default HighContrastToggle;
