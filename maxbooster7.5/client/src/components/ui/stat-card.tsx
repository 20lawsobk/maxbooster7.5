import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown } from 'lucide-react';
import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  sparklineData?: number[];
  className?: string;
  variant?: 'default' | 'subtle' | 'outline';
  prefix?: string;
  suffix?: string;
  color?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeLabel,
  trend,
  icon,
  sparklineData,
  className,
  variant = 'default',
  prefix = '',
  suffix = '',
}: StatCardProps) {
  const isPositive = trend === 'up' || (change !== undefined && change > 0);
  const isNegative = trend === 'down' || (change !== undefined && change < 0);

  const formattedValue = typeof value === 'number' 
    ? `${prefix}${value.toLocaleString()}${suffix}`
    : `${prefix}${value}${suffix}`;

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all hover:shadow-lg',
        'bg-[var(--stat-card-bg)] border-[var(--stat-card-border)]',
        variant === 'subtle' && 'bg-slate-50 dark:bg-blue-950/50 border-slate-100 dark:border-blue-900/50',
        variant === 'outline' && 'bg-[var(--stat-card-bg)] border-2 border-blue-200 dark:border-white/30',
        className
      )}
    >
      <CardContent className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--stat-card-muted)] uppercase tracking-wider">
              {title}
            </p>
            <p className="text-3xl font-bold text-[var(--stat-card-text)]">{formattedValue}</p>
            {change !== undefined && (
              <div className="flex items-center gap-1">
                {isPositive && <ArrowUp className="h-4 w-4 text-emerald-500" />}
                {isNegative && <ArrowDown className="h-4 w-4 text-red-500" />}
                <span
                  className={cn(
                    'text-sm font-medium',
                    isPositive && 'text-emerald-500',
                    isNegative && 'text-red-500',
                    !isPositive && !isNegative && 'text-[var(--stat-card-muted)]'
                  )}
                >
                  {isPositive && '+'}
                  {change}%
                </span>
                {changeLabel && (
                  <span className="text-sm text-[var(--stat-card-muted)]">{changeLabel}</span>
                )}
              </div>
            )}
          </div>
          {icon && (
            <div className="p-3 rounded-xl bg-[var(--stat-card-icon-bg)]">
              <div className="text-[var(--stat-card-icon)]">{icon}</div>
            </div>
          )}
        </div>

        {sparklineData && sparklineData.length > 0 && (
          <div className="mt-4 h-12 flex items-end gap-1">
            {sparklineData.map((val, i) => {
              const max = Math.max(...sparklineData);
              const height = max > 0 ? (val / max) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{ 
                    height: `${Math.max(height, 5)}%`,
                    background: 'linear-gradient(to top, var(--stat-card-sparkline), transparent)'
                  }}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StatCardRowProps {
  children: React.ReactNode;
  className?: string;
}

export function StatCardRow({ children, className }: StatCardRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
        className
      )}
    >
      {children}
    </div>
  );
}
