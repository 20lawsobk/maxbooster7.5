import React from 'react';
import { useAccessibility } from './AccessibilityProvider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { Eye, Move, Focus, RotateCcw } from 'lucide-react';
import type { ContrastMode } from '@/hooks/useHighContrast';

export interface AccessibilitySettingsProps {
  className?: string;
  showResetButton?: boolean;
}

export function AccessibilitySettings({
  className = '',
  showResetButton = true,
}: AccessibilitySettingsProps) {
  const { reducedMotion, highContrast, announce } = useAccessibility();

  const handleReducedMotionChange = (checked: boolean) => {
    reducedMotion.setReducedMotion(checked);
    announce(`Reduced motion ${checked ? 'enabled' : 'disabled'}`);
  };

  const handleContrastModeChange = (value: string) => {
    const mode = value as ContrastMode;
    highContrast.setContrastMode(mode);
    announce(`Contrast mode set to ${mode}`);
  };

  const handleReset = () => {
    reducedMotion.setReducedMotion(null);
    highContrast.setContrastMode(null);
    announce('Accessibility settings reset to system defaults');
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Focus className="h-5 w-5" aria-hidden="true" />
          Accessibility Settings
        </CardTitle>
        <CardDescription>
          Customize your experience to improve accessibility
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="flex-1 space-y-1">
            <Label
              htmlFor="reduced-motion"
              className="flex items-center gap-2 font-medium"
            >
              <Move className="h-4 w-4" aria-hidden="true" />
              Reduce Motion
            </Label>
            <p className="text-sm text-muted-foreground">
              Minimize animations and transitions
              {reducedMotion.isSystemPreference && (
                <span className="ml-1 text-xs">(using system setting)</span>
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

        <div className="space-y-2">
          <Label
            htmlFor="contrast-mode"
            className="flex items-center gap-2 font-medium"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            Contrast Mode
          </Label>
          <p
            id="contrast-mode-description"
            className="text-sm text-muted-foreground"
          >
            Adjust color contrast for better visibility
            {highContrast.isSystemPreference && (
              <span className="ml-1 text-xs">(using system setting)</span>
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
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High Contrast</SelectItem>
              <SelectItem value="more">Maximum Contrast</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border p-4 space-y-2">
          <h4 className="font-medium text-sm">Current Settings</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>
              • Reduced Motion:{' '}
              <span className="font-medium">
                {reducedMotion.prefersReducedMotion ? 'On' : 'Off'}
              </span>
            </li>
            <li>
              • Contrast:{' '}
              <span className="font-medium capitalize">
                {highContrast.contrastMode}
              </span>
            </li>
            <li>
              • Focus Ring Width:{' '}
              <span className="font-medium">
                {highContrast.getFocusIndicatorWidth()}px
              </span>
            </li>
            <li>
              • Border Width:{' '}
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
            className="w-full"
          >
            <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
            Reset to System Defaults
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default AccessibilitySettings;
