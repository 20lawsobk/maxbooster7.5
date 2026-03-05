import { useState, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DollarSign,
  CreditCard,
  Clock,
  AlertCircle,
  CheckCircle,
  Receipt,
} from 'lucide-react';
import { DateRangePicker } from '@/components/analytics/DateRangePicker';
import { RevenueEmptyState } from '@/components/analytics/AnalyticsEmptyStates';
import { RevenueBreakdownSkeleton, StatCardRowSkeleton } from '@/components/analytics/AnalyticsLoadingSkeletons';
import { cn } from '@/lib/utils';

interface RevenueBreakdown {
  platform: string;
  earnings: number;
  streams: number;
  ratePerStream: number;
  change: number;
  color: string;
}

interface EarningsStatus {
  pending: number;
  paid: number;
  processing: number;
  nextPayoutDate: string;
  nextPayoutAmount: number;
}

interface TaxInfo {
  grossEarnings: number;
  taxWithheld: number;
  netEarnings: number;
  taxRate: number;
}

interface RoyaltyBreakdown {
  type: string;
  amount: number;
  percentage: number;
  description: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  spotify: '#1DB954',
  apple_music: '#FA2D48',
  youtube_music: '#FF0000',
  amazon_music: '#FF9900',
  deezer: '#00C7F2',
  tidal: '#000000',
  other: '#6B7280',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
        <p className="font-semibold text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <span className="text-slate-600 dark:text-slate-400">{entry.name}:</span>
            <span className="font-medium">
              {entry.name.includes('Rate') ? `$${entry.value.toFixed(4)}` : `$${entry.value.toLocaleString()}`}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const EarningsCard = memo(({
  title,
  amount,
  subtitle,
  icon: Icon,
  variant = 'default',
}: {
  title: string;
  amount: number;
  subtitle?: string;
  icon: React.ElementType;
  variant?: 'default' | 'pending' | 'success' | 'warning';
}) => {
  const variantClasses = {
    default: 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900',
    pending: 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200',
    success: 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200',
    warning: 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-200',
  };

  const iconClasses = {
    default: 'text-slate-500',
    pending: 'text-amber-500',
    success: 'text-green-500',
    warning: 'text-red-500',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <Card className={cn("border", variantClasses[variant])}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{title}</p>
              <p className="text-2xl font-bold">${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
              )}
            </div>
            <div className={cn("p-2.5 rounded-lg bg-white/50 dark:bg-slate-800/50", iconClasses[variant])}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});
EarningsCard.displayName = 'EarningsCard';

interface RevenueAnalyticsProps {
  userId?: string;
  timeRange?: string;
  onTimeRangeChange?: (range: string) => void;
}

export function RevenueAnalytics({
  userId,
  timeRange = '30d',
  onTimeRangeChange,
}: RevenueAnalyticsProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  const { data, isLoading} = useQuery({
    queryKey: ['/api/analytics/revenue', timeRange, selectedPlatforms],
    queryFn: async () => {
      const params = new URLSearchParams({ range: timeRange });
      const response = await fetch(`/api/analytics/dashboard?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch revenue data');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const revenueBreakdown = useMemo<RevenueBreakdown[]>(() => {
    if (!data?.revenue?.revenueByPlatform) return [];
    return data.revenue.revenueByPlatform.map((p: any) => ({
      platform: p.platform,
      earnings: p.revenue || 0,
      streams: p.streams || 0,
      ratePerStream: p.streams > 0 ? (p.revenue / p.streams) : 0,
      change: p.change || 0,
      color: PLATFORM_COLORS[p.platform.toLowerCase().replace(' ', '_')] || PLATFORM_COLORS.other,
    }));
  }, [data]);

  const earningsStatus = useMemo<EarningsStatus>(() => ({
    pending: data?.revenue?.pendingEarnings ?? 0,
    paid: data?.revenue?.paidEarnings ?? 0,
    processing: data?.revenue?.processingEarnings ?? 0,
    nextPayoutDate: data?.revenue?.nextPayoutDate ?? '—',
    nextPayoutAmount: data?.revenue?.nextPayoutAmount ?? 0,
  }), [data]);

  const taxInfo = useMemo<TaxInfo>(() => ({
    grossEarnings: data?.revenue?.grossEarnings ?? 0,
    taxWithheld: data?.revenue?.taxWithheld ?? 0,
    netEarnings: data?.revenue?.netEarnings ?? 0,
    taxRate: data?.revenue?.taxRate ?? 0,
  }), [data]);

  const royaltyBreakdown = useMemo<RoyaltyBreakdown[]>(() => {
    if (!data?.revenue?.royaltyBreakdown) return [];
    return data.revenue.royaltyBreakdown;
  }, [data]);

  const totalEarnings = revenueBreakdown.reduce((sum, p) => sum + p.earnings, 0);
  const hasData = totalEarnings > 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <StatCardRowSkeleton count={4} />
        <RevenueBreakdownSkeleton />
      </div>
    );
  }

if (!hasData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Revenue Analytics</h2>
          <DateRangePicker value={timeRange} onChange={onTimeRangeChange || (() => {})} />
        </div>
        <RevenueEmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Revenue Analytics</h2>
          <p className="text-sm text-muted-foreground">Track earnings, royalties, and payout status</p>
        </div>
        <DateRangePicker value={timeRange} onChange={onTimeRangeChange || (() => {})} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <EarningsCard
          title="Total Earnings"
          amount={totalEarnings}
          subtitle="This period"
          icon={DollarSign}
          variant="success"
        />
        <EarningsCard
          title="Pending"
          amount={earningsStatus.pending}
          subtitle="Awaiting payout"
          icon={Clock}
          variant="pending"
        />
        <EarningsCard
          title="Paid Out"
          amount={earningsStatus.paid}
          subtitle="All time"
          icon={CheckCircle}
          variant="default"
        />
        <EarningsCard
          title="Next Payout"
          amount={earningsStatus.nextPayoutAmount}
          subtitle={earningsStatus.nextPayoutDate}
          icon={CreditCard}
          variant="default"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Platform Breakdown</TabsTrigger>
          <TabsTrigger value="royalties">Royalty Types</TabsTrigger>
          <TabsTrigger value="taxes">Tax Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Earnings by Platform</CardTitle>
                <CardDescription>Revenue distribution across streaming platforms</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenueBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="earnings"
                        nameKey="platform"
                        label={({ platform, percent }) => `${platform} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {revenueBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Platform Details</CardTitle>
                <CardDescription>Earnings and rate per stream by platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {revenueBreakdown.map((platform, index) => (
                    <motion.div
                      key={platform.platform}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: platform.color }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{platform.platform}</span>
                          <span className="font-semibold">${platform.earnings.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{platform.streams.toLocaleString()} streams</span>
                          <span className="flex items-center gap-1">
                            ${platform.ratePerStream.toFixed(4)}/stream
                            <Badge variant={platform.change > 0 ? "default" : "secondary"} className="text-[10px] px-1">
                              {platform.change > 0 ? '+' : ''}{platform.change}%
                            </Badge>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="royalties" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Royalty Breakdown</CardTitle>
              <CardDescription>Understanding your different revenue streams</CardDescription>
            </CardHeader>
            <CardContent>
              {royaltyBreakdown.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  <p>No royalty breakdown data available yet</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    {royaltyBreakdown.map((royalty, index) => (
                      <motion.div
                        key={royalty.type}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800/50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{royalty.type}</span>
                          <span className="font-bold">${royalty.amount.toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{royalty.description}</p>
                        <Progress value={royalty.percentage} className="h-2" />
                        <span className="text-xs text-muted-foreground mt-1">{royalty.percentage}% of total</span>
                      </motion.div>
                    ))}
                  </div>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={royaltyBreakdown} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                        <YAxis type="category" dataKey="type" width={120} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="taxes" className="mt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Tax Summary
                </CardTitle>
                <CardDescription>Withholding and deductions for this period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="p-4 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200">
                    <p className="text-sm text-muted-foreground">Gross Earnings</p>
                    <p className="text-3xl font-bold text-green-600">${taxInfo.grossEarnings.toLocaleString()}</p>
                  </div>
                  
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200">
                    <AlertCircle className="h-6 w-6 text-red-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Tax Withheld ({taxInfo.taxRate}%)</p>
                      <p className="text-xl font-bold text-red-600">-${taxInfo.taxWithheld.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200">
                    <p className="text-sm text-muted-foreground">Net Earnings</p>
                    <p className="text-3xl font-bold text-blue-600">${taxInfo.netEarnings.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tax Documents</CardTitle>
                <CardDescription>Download your tax forms and reports</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  <p>No tax documents available yet</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default RevenueAnalytics;
