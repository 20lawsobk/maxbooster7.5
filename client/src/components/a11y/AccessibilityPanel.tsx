import React, { useState } from 'react';
import { useAccessibility, type FontSize, type ColorBlindMode } from './AccessibilityProvider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Eye, 
  Move, 
  Focus, 
  RotateCcw, 
  Type, 
  Palette, 
  Settings, 
  Keyboard,
  Volume2,
} from 'lucide-react';
import type { ContrastMode } from '@/hooks/useHighContrast';

export interface AccessibilityPanelProps {
  className?: string;
  variant?: 'inline' | 'sheet' | 'dialog';
  showTabs?: boolean;
}

const fontSizeLabels: Record<FontSize, string> = {
  small: 'Small (87.5%)',
  medium: 'Medium (100%)',
  large: 'Large (112.5%)',
  'x-large': 'Extra Large (125%)',
  '150': 'Very Large (150%)',
  '175': 'Huge (175%)',
  '200': 'Maximum (200%)',
};

const colorBlindModeLabels: Record<ColorBlindMode, string> = {
  none: 'None (Normal)',
  protanopia: 'Protanopia (Red-Blind)',
  deuteranopia: 'Deuteranopia (Green-Blind)',
  tritanopia: 'Tritanopia (Blue-Blind)',
  achromatopsia: 'Achromatopsia (Monochrome)',
};

const contrastModeLabels: Record<ContrastMode, string> = {
  normal: 'Normal',
  high: 'High Contrast',
  more: 'Maximum Contrast',
};

function AccessibilityPanelContent() {
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

  const handleReducedMotionChange = (checked: boolean) => {
    reducedMotion.setReducedMotion(checked);
    announce(`Reduced motion ${checked ? 'enabled' : 'disabled'}`);
  };

  const handleContrastModeChange = (value: string) => {
    const mode = value as ContrastMode;
    highContrast.setContrastMode(mode);
  };

  const handleFontSizeChange = (value: string) => {
    setFontSize(value as FontSize);
  };

  const handleColorBlindModeChange = (value: string) => {
    setColorBlindMode(value as ColorBlindMode);
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="motion-section">
        <h3 id="motion-section" className="flex items-center gap-2 font-medium mb-3">
          <Move className="h-4 w-4" aria-hidden="true" />
          Motion & Animation
        </h3>
        <div className="space-y-4 pl-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reduced-motion" className="font-normal">
                Reduce Motion
              </Label>
              <p className="text-sm text-muted-foreground">
                Minimize animations and transitions
                {reducedMotion.isSystemPreference && (
                  <span className="ml-1 text-xs">(using system)</span>
                )}
              </p>
            </div>
            <Switch
              id="reduced-motion"
              checked={reducedMotion.prefersReducedMotion}
              onCheckedChange={handleReducedMotionChange}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="visual-section">
        <h3 id="visual-section" className="flex items-center gap-2 font-medium mb-3">
          <Eye className="h-4 w-4" aria-hidden="true" />
          Visual Preferences
        </h3>
        <div className="space-y-4 pl-6">
          <div className="space-y-2">
            <Label htmlFor="contrast-mode">Contrast Mode</Label>
            <Select
              value={highContrast.contrastMode}
              onValueChange={handleContrastModeChange}
            >
              <SelectTrigger id="contrast-mode" className="w-full">
                <SelectValue placeholder="Select contrast" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(contrastModeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {highContrast.isSystemPreference && (
              <p className="text-xs text-muted-foreground">Using system preference</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="color-blind-mode">
              <span className="flex items-center gap-2">
                <Palette className="h-4 w-4" aria-hidden="true" />
                Color Blind Mode
              </span>
            </Label>
            <Select
              value={colorBlindMode}
              onValueChange={handleColorBlindModeChange}
            >
              <SelectTrigger id="color-blind-mode" className="w-full">
                <SelectValue placeholder="Select color mode" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(colorBlindModeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section aria-labelledby="typography-section">
        <h3 id="typography-section" className="flex items-center gap-2 font-medium mb-3">
          <Type className="h-4 w-4" aria-hidden="true" />
          Typography
        </h3>
        <div className="space-y-4 pl-6">
          <div className="space-y-2">
            <Label htmlFor="font-size">Text Size</Label>
            <Select
              value={fontSize}
              onValueChange={handleFontSizeChange}
            >
              <SelectTrigger id="font-size" className="w-full">
                <SelectValue placeholder="Select size" />
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
            >
              Preview: The quick brown fox jumps over the lazy dog
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="summary-section">
        <h3 id="summary-section" className="flex items-center gap-2 font-medium mb-3">
          <Focus className="h-4 w-4" aria-hidden="true" />
          Current Settings
        </h3>
        <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
          <ul className="text-sm space-y-1">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Reduced Motion:</span>
              <span className="font-medium">
                {reducedMotion.prefersReducedMotion ? 'On' : 'Off'}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Contrast:</span>
              <span className="font-medium capitalize">
                {contrastModeLabels[highContrast.contrastMode]}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Text Size:</span>
              <span className="font-medium capitalize">{fontSize}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Color Blind Mode:</span>
              <span className="font-medium capitalize">
                {colorBlindMode === 'none' ? 'None' : colorBlindMode}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Focus Ring:</span>
              <span className="font-medium">
                {highContrast.getFocusIndicatorWidth()}px
              </span>
            </li>
          </ul>
        </div>
      </section>

      <Button
        variant="outline"
        onClick={resetAllPreferences}
        className="w-full"
      >
        <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
        Reset to System Defaults
      </Button>
    </div>
  );
}

function AccessibilityPanelTabs() {
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

  return (
    <Tabs defaultValue="visual" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="visual">
          <Eye className="h-4 w-4 mr-2" />
          Visual
        </TabsTrigger>
        <TabsTrigger value="motion">
          <Move className="h-4 w-4 mr-2" />
          Motion
        </TabsTrigger>
        <TabsTrigger value="keyboard">
          <Keyboard className="h-4 w-4 mr-2" />
          Keyboard
        </TabsTrigger>
      </TabsList>

      <TabsContent value="visual" className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label>Contrast Mode</Label>
          <Select
            value={highContrast.contrastMode}
            onValueChange={(value) => highContrast.setContrastMode(value as ContrastMode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(contrastModeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Text Size</Label>
          <Select value={fontSize} onValueChange={(value) => setFontSize(value as FontSize)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fontSizeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Color Blind Mode</Label>
          <Select value={colorBlindMode} onValueChange={(value) => setColorBlindMode(value as ColorBlindMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(colorBlindModeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TabsContent>

      <TabsContent value="motion" className="space-y-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="motion-toggle">Reduce Motion</Label>
            <p className="text-sm text-muted-foreground">
              Minimize animations and transitions
            </p>
          </div>
          <Switch
            id="motion-toggle"
            checked={reducedMotion.prefersReducedMotion}
            onCheckedChange={(checked) => reducedMotion.setReducedMotion(checked)}
          />
        </div>
      </TabsContent>

      <TabsContent value="keyboard" className="space-y-4 mt-4">
        <div className="rounded-lg border p-4 space-y-2">
          <h4 className="font-medium">Keyboard Shortcuts</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li><kbd className="px-1 rounded bg-muted">Alt+1</kbd> - Skip to main content</li>
            <li><kbd className="px-1 rounded bg-muted">Alt+2</kbd> - Skip to navigation</li>
            <li><kbd className="px-1 rounded bg-muted">?</kbd> - Show all shortcuts</li>
            <li><kbd className="px-1 rounded bg-muted">Tab</kbd> - Navigate forward</li>
            <li><kbd className="px-1 rounded bg-muted">Shift+Tab</kbd> - Navigate backward</li>
            <li><kbd className="px-1 rounded bg-muted">Escape</kbd> - Close dialogs/modals</li>
          </ul>
        </div>
      </TabsContent>
    </Tabs>
  );
}

export function AccessibilityPanel({
  className = '',
  variant = 'inline',
  showTabs = false,
}: AccessibilityPanelProps) {
  const content = showTabs ? <AccessibilityPanelTabs /> : <AccessibilityPanelContent />;

  if (variant === 'sheet') {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Accessibility settings">
            <Settings className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Focus className="h-5 w-5" />
              Accessibility Settings
            </SheetTitle>
            <SheetDescription>
              Customize your experience for better accessibility
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">{content}</div>
        </SheetContent>
      </Sheet>
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
          Customize your experience for better accessibility
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

export default AccessibilityPanel;
