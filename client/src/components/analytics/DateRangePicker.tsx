import { useState, useCallback } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePreset {
  label: string;
  value: string;
  days: number;
}

const DATE_PRESETS: DatePreset[] = [
  { label: 'Today', value: '1d', days: 1 },
  { label: 'Last 7 days', value: '7d', days: 7 },
  { label: 'Last 14 days', value: '14d', days: 14 },
  { label: 'Last 30 days', value: '30d', days: 30 },
  { label: 'Last 90 days', value: '90d', days: 90 },
  { label: 'Last 6 months', value: '180d', days: 180 },
  { label: 'Last year', value: '365d', days: 365 },
  { label: 'All time', value: 'all', days: -1 },
];

interface DateRangePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  showCompare?: boolean;
  onCompareChange?: (enabled: boolean) => void;
  isComparing?: boolean;
}

export function DateRangePicker({
  value,
  onChange,
  className,
  showCompare = false,
  onCompareChange,
  isComparing = false,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const currentPreset = DATE_PRESETS.find(p => p.value === value) || DATE_PRESETS[3];

  const handleSelect = useCallback((preset: DatePreset) => {
    onChange(preset.value);
    setIsOpen(false);
  }, [onChange]);

  const getDateRangeText = useCallback(() => {
    const now = new Date();
    const preset = DATE_PRESETS.find(p => p.value === value);
    if (!preset) return 'Custom range';
    if (preset.days === -1) return 'All time';
    
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - preset.days);
    
    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: preset.days > 90 ? 'numeric' : undefined 
    });
    
    return `${formatDate(startDate)} - ${formatDate(now)}`;
  }, [value]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-between min-w-[200px] bg-white dark:bg-slate-900",
            className
          )}
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{currentPreset.label}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Select Date Range</span>
            {value !== '30d' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => handleSelect(DATE_PRESETS[3])}
              >
                Reset
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{getDateRangeText()}</p>
        </div>

        <div className="p-2">
          <div className="grid grid-cols-2 gap-1">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                variant={value === preset.value ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "justify-start h-9",
                  value === preset.value && "bg-primary/10 text-primary"
                )}
                onClick={() => handleSelect(preset)}
              >
                <span>{preset.label}</span>
                {preset.days > 0 && value === preset.value && (
                  <Badge variant="outline" className="ml-auto text-[10px] px-1">
                    {preset.days}d
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </div>

        {showCompare && (
          <div className="p-3 border-t bg-slate-50 dark:bg-slate-900/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isComparing}
                onChange={(e) => onCompareChange?.(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span className="text-sm">Compare to previous period</span>
            </label>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function QuickDateFilters({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const quickFilters = DATE_PRESETS.slice(0, 5);

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {quickFilters.map((preset) => (
        <Button
          key={preset.value}
          variant={value === preset.value ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-7 text-xs",
            value === preset.value && "bg-primary text-primary-foreground"
          )}
          onClick={() => onChange(preset.value)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
