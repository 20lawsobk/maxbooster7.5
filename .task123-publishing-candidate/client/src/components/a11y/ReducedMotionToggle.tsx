import { useA11yReducedMotion } from "./AccessibilityProvider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Move, Pause, Play } from "lucide-react";
import { announcePolite } from "@/lib/a11y/screenReader";

export interface ReducedMotionToggleProps {
  variant?: "button" | "switch" | "icon";
  size?: "sm" | "default" | "lg";
  showLabel?: boolean;
  showSystemIndicator?: boolean;
  className?: string;
}

export function ReducedMotionToggle({
  variant = "switch",
  size = "default",
  showLabel = true,
  showSystemIndicator = true,
  className = "",
}: ReducedMotionToggleProps) {
  const { prefersReducedMotion, isSystemPreference, setReducedMotion } =
    useA11yReducedMotion();

  const handleToggle = () => {
    const newValue = !prefersReducedMotion;
    setReducedMotion(newValue);
    announcePolite(`Reduced motion ${newValue ? "enabled" : "disabled"}`);
  };

  const handleReset = () => {
    setReducedMotion(null);
    announcePolite("Reduced motion set to system preference");
  };

  const icon = prefersReducedMotion ? (
    <Pause className="h-4 w-4" aria-hidden="true" />
  ) : (
    <Play className="h-4 w-4" aria-hidden="true" />
  );

  if (variant === "icon") {
    return (
      <Button
        variant={prefersReducedMotion ? "default" : "outline"}
        size={size}
        onClick={handleToggle}
        className={className}
        aria-pressed={prefersReducedMotion}
        aria-label={`Reduced motion is ${prefersReducedMotion ? "enabled" : "disabled"}. Click to ${prefersReducedMotion ? "disable" : "enable"}.`}
      >
        {icon}
      </Button>
    );
  }

  if (variant === "button") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Button
          variant={prefersReducedMotion ? "default" : "outline"}
          size={size}
          onClick={handleToggle}
          aria-pressed={prefersReducedMotion}
          className="flex items-center gap-2"
        >
          <Move className="h-4 w-4" aria-hidden="true" />
          {showLabel && (
            <span>
              {prefersReducedMotion ? "Motion Reduced" : "Motion Enabled"}
            </span>
          )}
        </Button>
        {showSystemIndicator && !isSystemPreference && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            aria-label="Reset to system preference"
            className="text-xs"
          >
            Reset
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex-1 space-y-0.5">
        <Label
          htmlFor="reduced-motion-toggle"
          className="flex items-center gap-2 font-medium cursor-pointer"
        >
          <Move className="h-4 w-4" aria-hidden="true" />
          Reduce Motion
        </Label>
        {showLabel && (
          <p className="text-sm text-muted-foreground">
            Minimize animations and transitions
            {showSystemIndicator && isSystemPreference && (
              <span className="ml-1 text-xs">(using system setting)</span>
            )}
          </p>
        )}
      </div>
      <Switch
        id="reduced-motion-toggle"
        checked={prefersReducedMotion}
        onCheckedChange={(checked) => {
          setReducedMotion(checked);
          announcePolite(`Reduced motion ${checked ? "enabled" : "disabled"}`);
        }}
        aria-describedby="reduced-motion-description"
      />
    </div>
  );
}

export interface ReducedMotionIndicatorProps {
  className?: string;
}

export function ReducedMotionIndicator({
  className = "",
}: ReducedMotionIndicatorProps) {
  const { prefersReducedMotion, isSystemPreference } = useA11yReducedMotion();

  if (!prefersReducedMotion) return null;

  return (
    <div
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted ${className}`}
      role="status"
      aria-live="polite"
    >
      <Move className="h-3 w-3" aria-hidden="true" />
      <span>
        Reduced Motion
        {isSystemPreference && " (System)"}
      </span>
    </div>
  );
}

export default ReducedMotionToggle;
