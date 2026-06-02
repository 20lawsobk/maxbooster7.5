import React, { useState } from "react";
import {
  useAccessibility,
  type FontSize,
  type ColorBlindMode,
} from "./AccessibilityProvider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Eye,
  Move,
  Focus,
  RotateCcw,
  Type,
  Palette,
  Keyboard,
  Volume2,
} from "lucide-react";
import type { ContrastMode } from "@/hooks/useHighContrast";
import { KeyboardShortcutsHelpDialog } from "./KeyboardShortcutsHelpDialog";

export interface AccessibilitySettingsProps {
  className?: string;
  showResetButton?: boolean;
  variant?: "full" | "compact";
}

const fontSizeLabels: Record<FontSize, string> = {
  small: "Small (87.5%)",
  medium: "Medium (100%)",
  large: "Large (112.5%)",
  "x-large": "Extra Large (125%)",
  "150": "Very Large (150%)",
  "175": "Huge (175%)",
  "200": "Maximum (200%)",
};

const colorBlindModeLabels: Record<ColorBlindMode, string> = {
  none: "None (Normal)",
  protanopia: "Protanopia (Red-Blind)",
  deuteranopia: "Deuteranopia (Green-Blind)",
  tritanopia: "Tritanopia (Blue-Blind)",
  achromatopsia: "Achromatopsia (Monochrome)",
};

const contrastModeLabels: Record<ContrastMode, string> = {
  normal: "Normal",
  high: "High Contrast",
  more: "Maximum Contrast",
};

export function AccessibilitySettings({
  className = "",
  showResetButton = true,
  variant = "full",
}: AccessibilitySettingsProps) {
  const {
    reducedMotion,
    highContrast,
    fontSize,
    setFontSize,
    colorBlindMode,
    setColorBlindMode,
    announce,
    resetAllPreferences,
  } = useAccessibility();

  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  const handleReducedMotionChange = (checked: boolean) => {
    reducedMotion.setReducedMotion(checked);
    announce(`Reduced motion ${checked ? "enabled" : "disabled"}`);
  };

  const handleContrastModeChange = (value: string) => {
    const mode = value as ContrastMode;
    highContrast.setContrastMode(mode);
    announce(`Contrast mode set to ${mode}`);
  };

  const handleFontSizeChange = (value: string) => {
    setFontSize(value as FontSize);
  };

  const handleColorBlindModeChange = (value: string) => {
    setColorBlindMode(value as ColorBlindMode);
  };

  const handleReset = () => {
    resetAllPreferences();
  };

  if (variant === "compact") {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <Label htmlFor="reduced-motion-compact" className="text-sm">
            Reduce Motion
          </Label>
          <Switch
            id="reduced-motion-compact"
            checked={reducedMotion.prefersReducedMotion}
            onCheckedChange={handleReducedMotionChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="high-contrast-compact" className="text-sm">
            High Contrast
          </Label>
          <Switch
            id="high-contrast-compact"
            checked={highContrast.isHighContrast}
            onCheckedChange={(checked) =>
              highContrast.setContrastMode(checked ? "high" : "normal")
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="font-size-compact" className="text-sm">
            Text Size
          </Label>
          <Select value={fontSize} onValueChange={handleFontSizeChange}>
            <SelectTrigger id="font-size-compact" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fontSizeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showResetButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="w-full"
          >
            <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" />
            Reset
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Focus className="h-5 w-5" aria-hidden="true" />
          Accessibility Settings
        </CardTitle>
        <CardDescription>
          Customize your experience to improve accessibility. All preferences
          are saved automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion
          type="multiple"
          defaultValue={["motion", "visual", "typography"]}
          className="w-full"
        >
          <AccordionItem value="motion">
            <AccordionTrigger className="text-base">
              <span className="flex items-center gap-2">
                <Move className="h-4 w-4" aria-hidden="true" />
                Motion & Animation
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="flex items-center justify-between space-x-4">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="reduced-motion" className="font-normal">
                    Reduce Motion
                  </Label>
                  <p
                    id="reduced-motion-description"
                    className="text-sm text-muted-foreground"
                  >
                    Minimize animations and transitions. Reduces motion sickness
                    for sensitive users.
                    {reducedMotion.isSystemPreference && (
                      <span className="ml-1 text-xs font-medium">
                        (using system setting)
                      </span>
                    )}
                  </p>
                </div>
                <Switch
                  id="reduced-motion"
                  checked={reducedMotion.prefersReducedMotion}
                  onCheckedChange={handleReducedMotionChange}
                  aria-describedby="reduced-motion-description"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="visual">
            <AccordionTrigger className="text-base">
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4" aria-hidden="true" />
                Visual Preferences
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-6 pt-2">
              <div className="space-y-2">
                <Label htmlFor="contrast-mode" className="font-medium">
                  Contrast Mode
                </Label>
                <p
                  id="contrast-mode-description"
                  className="text-sm text-muted-foreground"
                >
                  Adjust color contrast for better visibility
                  {highContrast.isSystemPreference && (
                    <span className="ml-1 text-xs font-medium">
                      (using system setting)
                    </span>
                  )}
                </p>
                <Select
                  value={highContrast.contrastMode}
                  onValueChange={handleContrastModeChange}
                >
                  <SelectTrigger
                    id="contrast-mode"
                    className="w-full"
                    aria-describedby="contrast-mode-description"
                  >
                    <SelectValue placeholder="Select contrast mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(contrastModeLabels).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="color-blind-mode"
                  className="flex items-center gap-2 font-medium"
                >
                  <Palette className="h-4 w-4" aria-hidden="true" />
                  Color Blind Mode
                </Label>
                <p
                  id="color-blind-description"
                  className="text-sm text-muted-foreground"
                >
                  Adjust colors for different types of color vision deficiency
                </p>
                <Select
                  value={colorBlindMode}
                  onValueChange={handleColorBlindModeChange}
                >
                  <SelectTrigger
                    id="color-blind-mode"
                    className="w-full"
                    aria-describedby="color-blind-description"
                  >
                    <SelectValue placeholder="Select color blind mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(colorBlindModeLabels).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="typography">
            <AccordionTrigger className="text-base">
              <span className="flex items-center gap-2">
                <Type className="h-4 w-4" aria-hidden="true" />
                Typography & Text
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="font-size" className="font-medium">
                  Text Size
                </Label>
                <p
                  id="font-size-description"
                  className="text-sm text-muted-foreground"
                >
                  Scale text up to 200% for better readability. WCAG recommends
                  supporting at least 200% zoom.
                </p>
                <Select value={fontSize} onValueChange={handleFontSizeChange}>
                  <SelectTrigger
                    id="font-size"
                    className="w-full"
                    aria-describedby="font-size-description"
                  >
                    <SelectValue placeholder="Select text size" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(fontSizeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-4 rounded-lg border bg-muted/50">
                <p
                  className="text-center"
                  style={{ fontSize: `var(--a11y-font-size, 16px)` }}
                  aria-label="Text size preview"
                >
                  Preview: The quick brown fox jumps over the lazy dog
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="keyboard">
            <AccordionTrigger className="text-base">
              <span className="flex items-center gap-2">
                <Keyboard className="h-4 w-4" aria-hidden="true" />
                Keyboard Navigation
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium">Quick Keyboard Tips</h4>
                <ul className="text-sm space-y-2 text-muted-foreground">
                  <li className="flex items-center justify-between">
                    <span>Skip to main content</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">
                      Alt+1
                    </kbd>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Skip to navigation</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">
                      Alt+2
                    </kbd>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Show all shortcuts</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">?</kbd>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Navigate forward</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">
                      Tab
                    </kbd>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Navigate backward</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">
                      Shift+Tab
                    </kbd>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Close dialogs</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">
                      Escape
                    </kbd>
                  </li>
                </ul>
              </div>

              <KeyboardShortcutsHelpDialog
                open={showKeyboardShortcuts}
                onOpenChange={setShowKeyboardShortcuts}
                showTrigger={true}
                triggerLabel="View All Keyboard Shortcuts"
                className="w-full justify-start"
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-6 rounded-lg border p-4 space-y-2 bg-muted/30">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Focus className="h-4 w-4" aria-hidden="true" />
            Current Settings Summary
          </h4>
          <ul
            className="text-sm text-muted-foreground space-y-1"
            aria-label="Current accessibility settings"
          >
            <li className="flex justify-between">
              <span>Reduced Motion:</span>
              <span className="font-medium">
                {reducedMotion.prefersReducedMotion ? "On" : "Off"}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Contrast:</span>
              <span className="font-medium capitalize">
                {contrastModeLabels[highContrast.contrastMode]}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Text Size:</span>
              <span className="font-medium capitalize">
                {fontSizeLabels[fontSize]}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Color Blind Mode:</span>
              <span className="font-medium capitalize">
                {colorBlindMode === "none" ? "None" : colorBlindMode}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Focus Ring Width:</span>
              <span className="font-medium">
                {highContrast.getFocusIndicatorWidth()}px
              </span>
            </li>
            <li className="flex justify-between">
              <span>Border Width:</span>
              <span className="font-medium">
                {highContrast.getBorderWidth()}px
              </span>
            </li>
          </ul>
        </div>

        {showResetButton && (
          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full mt-4"
          >
            <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
            Reset All to System Defaults
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default AccessibilitySettings;
