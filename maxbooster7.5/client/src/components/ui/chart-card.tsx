import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  children,
  className,
  headerAction,
}: ChartCardProps) {
  return (
    <Card
      className={cn(
        'bg-[var(--stat-card-bg)] border-[var(--stat-card-border)] shadow-sm',
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-[var(--stat-card-text)]">
              {title}
            </CardTitle>
            {subtitle && (
              <p className="text-sm text-[var(--stat-card-muted)] mt-1">{subtitle}</p>
            )}
          </div>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

interface AreaChartData {
  label: string;
  value: number;
}

interface SimpleAreaChartProps {
  data: AreaChartData[];
  color?: string;
  height?: number;
  showLabels?: boolean;
  formatValue?: (value: number) => string;
}

const colorMap: Record<string, { fill: string; stroke: string }> = {
  blue: { fill: '#3b82f6', stroke: '#60a5fa' },
  cyan: { fill: '#06b6d4', stroke: '#22d3ee' },
  emerald: { fill: '#10b981', stroke: '#34d399' },
  purple: { fill: '#a855f7', stroke: '#c084fc' },
};

export function SimpleAreaChart({
  data,
  color = 'blue',
  height = 200,
  showLabels = true,
  formatValue = (v) => v.toLocaleString(),
}: SimpleAreaChartProps) {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((d.value - min) / range) * 80;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPath = `M0,100 L0,${100 - ((data[0].value - min) / range) * 80} ${data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((d.value - min) / range) * 80;
      return `L${x},${y}`;
    })
    .join(' ')} L100,100 Z`;

  const colors = colorMap[color] || colorMap.cyan;
  const gradientId = `area-gradient-${color}-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div style={{ height }} className="relative">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full"
        role="img"
        aria-label="Area chart"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.fill} stopOpacity="0.4" />
            <stop offset="100%" stopColor={colors.fill} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <polyline
          points={points}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {showLabels && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-slate-500 pt-2">
          {data.filter((_, i) => i % Math.ceil(data.length / 5) === 0).map((d, i) => (
            <span key={i}>{d.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

interface DonutChartData {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutChartData[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}

export function DonutChart({
  data,
  size = 120,
  thickness = 16,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {data.map((segment, i) => {
          const percentage = total > 0 ? segment.value / total : 0;
          const strokeDasharray = `${circumference * percentage} ${circumference * (1 - percentage)}`;
          const strokeDashoffset = -currentOffset;
          currentOffset += circumference * percentage;

          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={thickness}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500"
            />
          );
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && (
            <span className="text-2xl font-bold text-[var(--stat-card-text)]">{centerValue}</span>
          )}
          {centerLabel && (
            <span className="text-xs text-[var(--stat-card-muted)]">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface PlatformBreakdownProps {
  /**
   * Array of platform data for the breakdown chart.
   * @example
   * [
   *   { name: 'Spotify', value: 45000, color: '#1DB954' },
   *   { name: 'Apple Music', value: 32000, color: '#FA2D48' },
   *   { name: 'YouTube', value: 28000, color: '#FF0000' }
   * ]
   */
  platforms: Array<{
    name: string;
    value: number;
    /** CSS color value (hex, rgb, hsl). Do NOT use Tailwind class names. */
    color: string;
    icon?: React.ReactNode;
  }>;
}

export function PlatformBreakdown({ platforms }: PlatformBreakdownProps) {
  const total = platforms.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="flex items-center gap-6">
      <DonutChart
        data={platforms.map((p) => ({
          label: p.name,
          value: p.value,
          color: p.color,
        }))}
        size={100}
        thickness={14}
        centerValue={total > 0 ? `${Math.round((platforms[0]?.value / total) * 100)}%` : '0%'}
      />
      <div className="flex flex-col gap-2">
        {platforms.map((platform, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: platform.color }}
            />
            {platform.icon}
            <span className="text-sm text-[var(--stat-card-muted)]">{platform.name}</span>
            <span className="text-sm font-medium text-[var(--stat-card-text)] ml-auto">
              {platform.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
