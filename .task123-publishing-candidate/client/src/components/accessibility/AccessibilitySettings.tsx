import { useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useHighContrast, type ContrastMode } from "@/hooks/useHighContrast";
import { announcePolite } from "@/lib/a11y/screenReader";
import { RotateCcw, Eye, Zap, Contrast, Type } from "lucide-react";

export type FontSize = "small" | "medium" | "large" | "x-large";
export type ColorBlindMode =
  | "none"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia";

export interface AccessibilitySettingsProps {
  fontSize?: FontSize;
  onFontSizeChange?: (size: FontSize) => void;
  colorBlindMode?: ColorBlindMode;
  onColorBlindModeChange?: (mode: ColorBlindMode) => void;
  showResetButton?: boolean;
  onReset?: () => void;
  className?: string;
}

export function AccessibilitySettings({
  fontSize = "medium",
  onFontSizeChange,
  colorBlindMode = "none",
  onColorBlindModeChange,
  showResetButton = true,
  onReset,
  className,
}: AccessibilitySettingsProps) {
  const reducedMotion = useReducedMotion();
  const highContrast = useHighContrast();

  const handleReducedMotionToggle = useCallback(
    (enabled: boolean) => {
      reducedMotion.setReducedMotion(enabled);
      announcePolite(`Reduced motion ${enabled ? "enabled" : "disabled"}`);
    },
    [reducedMotion],
  );

  const handleContrastModeChange = useCallback(
    (mode: ContrastMode) => {
      highContrast.setContrastMode(mode);
      const label =
        mode === "normal" ? "normal contrast" : `${mode} contrast mode`;
      announcePolite(`Changed to ${label}`);
    },
    [highContrast],
  );

  const handleFontSizeChange = useCallback(
    (size: FontSize) => {
      onFontSizeChange?.(size);
      announcePolite(`Font size changed to ${size}`);
    },
    [onFontSizeChange],
  );

  const handleColorBlindModeChange = useCallback(
    (mode: ColorBlindMode) => {
      onColorBlindModeChange?.(mode);
      const label = mode === "none" ? "normal colors" : `${mode} mode`;
      announcePolite(`Color blind mode changed to ${label}`);
    },
    [onColorBlindModeChange],
  );

  const handleReset = useCallback(() => {
    reducedMotion.setReducedMotion(null);
    highContrast.setContrastMode(null);
    onFontSizeChange?.("medium");
    onColorBlindModeChange?.("none");
    onReset?.();
    announcePolite("All accessibility settings reset to defaults");
  }, [
    reducedMotion,
    highContrast,
    onFontSizeChange,
    onColorBlindModeChange,
    onReset,
  ]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Accessibility Settings
        </CardTitle>
        <CardDescription>
          Customize your experience for improved accessibility
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="reduced-motion" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Reduce Motion
            </Label>
            <p className="text-sm text-muted-foreground">
              Minimize animations and motion effects
              {reducedMotion.isSystemPreference &&
                " (following system preference)"}
            </p>
          </div>
          <Switch
            id="reduced-motion"
            checked={reducedMotion.prefersReducedMotion}
            onCheckedChange={handleReducedMotionToggle}
            aria-describedby="reduced-motion-description"
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="contrast-mode" className="flex items-center gap-2">
            <Contrast className="h-4 w-4" />
            Contrast Mode
          </Label>
          <p className="text-sm text-muted-foreground">
            Adjust color contrast for better visibility
            {highContrast.isSystemPreference &&
              " (following system preference)"}
          </p>
          <Select
            value={highContrast.contrastMode}
            onValueChange={(value) =>
              handleContrastModeChange(value as ContrastMode)
            }
          >
            <SelectTrigger id="contrast-mode" className="w-full">
              <SelectValue placeholder="Select contrast mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High Contrast</SelectItem>
              <SelectItem value="more">Maximum Contrast</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {onFontSizeChange && (
          <>
            <Separator />

            <div className="space-y-2">
              <Label htmlFor="font-size" className="flex items-center gap-2">
                <Type className="h-4 w-4" />
                Font Size
              </Label>
              <p className="text-sm text-muted-foreground">
                Adjust text size for better readability
              </p>
              <Select
                value={fontSize}
                onValueChange={(value) =>
                  handleFontSizeChange(value as FontSize)
                }
              >
                <SelectTrigger id="font-size" className="w-full">
                  <SelectValue placeholder="Select font size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium (Default)</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                  <SelectItem value="x-large">Extra Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {onColorBlindModeChange && (
          <>
            <Separator />

            <div className="space-y-2">
              <Label
                htmlFor="color-blind-mode"
                className="flex items-center gap-2"
              >
                <Eye className="h-4 w-4" />
                Color Vision
              </Label>
              <p className="text-sm text-muted-foreground">
                Optimize colors for different types of color vision
              </p>
              <Select
                value={colorBlindMode}
                onValueChange={(value) =>
                  handleColorBlindModeChange(value as ColorBlindMode)
                }
              >
                <SelectTrigger id="color-blind-mode" className="w-full">
                  <SelectValue placeholder="Select color vision mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Normal Vision</SelectItem>
                  <SelectItem value="protanopia">
                    Protanopia (Red-blind)
                  </SelectItem>
                  <SelectItem value="deuteranopia">
                    Deuteranopia (Green-blind)
                  </SelectItem>
                  <SelectItem value="tritanopia">
                    Tritanopia (Blue-blind)
                  </SelectItem>
                  <SelectItem value="achromatopsia">
                    Achromatopsia (Monochrome)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {showResetButton && (
          <>
            <Separator />

            <Button
              variant="outline"
              onClick={handleReset}
              className="w-full"
              aria-label="Reset all accessibility settings to defaults"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AccessibilitySettings;
