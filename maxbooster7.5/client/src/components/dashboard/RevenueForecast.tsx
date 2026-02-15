import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Sparkles,
  RefreshCw,
  Calendar,
  Lightbulb,
  ArrowUp,
  Award,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ForecastResult {
  period: string;
  months: number;
  projectedStreams: number;
  projectedRevenue: number;
  projectedRoyalties: number;
  confidence: number;
  confidenceLow: number;
  confidenceHigh: number;
  growthRate: number;
  seasonalityFactor: number;
}

interface MonthlyProjection {
  month: string;
  date: string;
  projectedStreams: number;
  projectedRevenue: number;
  projectedRoyalties: number;
  confidence: number;
  confidenceLow: number;
  confidenceHigh: number;
  isHistorical: boolean;
}

interface RevenueProjections {
  threeMonth: ForecastResult;
  sixMonth: ForecastResult;
  twelveMonth: ForecastResult;
  monthlyBreakdown: MonthlyProjection[];
  currentRate: number;
  goalProgress: {
    currentMonthly: number;
    projectedMonthly: number;
    daysToGoal: number | null;
    goalAmount: number;
  };
  tips: string[];
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

const formatMonth = (monthStr: string): string => {
  const date = new Date(monthStr + '-01');
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const ForecastCard: React.FC<{
  title: string;
  forecast: ForecastResult;
  isSelected: boolean;
  onClick: () => void;
}> = ({ title, forecast, isSelected, onClick }) => {
  const isPositiveGrowth = forecast.growthRate >= 0;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary shadow-lg"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <Badge variant={isPositiveGrowth ? "default" : "destructive"} className="text-xs">
            {isPositiveGrowth ? <ArrowUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {Math.abs(forecast.growthRate).toFixed(1)}%
          </Badge>
        </div>
        <div className="text-2xl font-bold text-primary">
          {formatCurrency(forecast.projectedRevenue)}
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span>{formatNumber(forecast.projectedStreams)} streams</span>
          <span>•</span>
          <span>{Math.round(forecast.confidence * 100)}% confidence</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Range: {formatCurrency(forecast.confidenceLow)} - {formatCurrency(forecast.confidenceHigh)}
        </div>
      </CardContent>
    </Card>
  );
};

const GoalProgressCard: React.FC<{
  goalProgress: RevenueProjections['goalProgress'];
  onGoalChange: (goal: number) => void;
}> = ({ goalProgress, onGoalChange }) => {
  const [editingGoal, setEditingGoal] = useState(false);
  const [newGoal, setNewGoal] = useState(goalProgress.goalAmount.toString());

  const progress = Math.min(100, (goalProgress.currentMonthly / goalProgress.goalAmount) * 100);
  const projectedProgress = Math.min(100, (goalProgress.projectedMonthly / goalProgress.goalAmount) * 100);

  const handleSaveGoal = () => {
    const goal = parseFloat(newGoal);
    if (!isNaN(goal) && goal > 0) {
      onGoalChange(goal);
      setEditingGoal(false);
    }
  };

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Revenue Goal
          </CardTitle>
          {!editingGoal ? (
            <Button variant="ghost" size="sm" onClick={() => setEditingGoal(true)}>
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                type="number"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                className="w-24 h-8"
              />
              <Button size="sm" onClick={handleSaveGoal}>Save</Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-3xl font-bold">
            {formatCurrency(goalProgress.goalAmount)}
            <span className="text-sm font-normal text-muted-foreground">/month</span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Current: {formatCurrency(goalProgress.currentMonthly)}</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Projected: {formatCurrency(goalProgress.projectedMonthly)}</span>
              <span>{projectedProgress.toFixed(1)}%</span>
            </div>
            <Progress value={projectedProgress} className="h-2 bg-muted" />
          </div>

          {goalProgress.daysToGoal !== null ? (
            <div className="flex items-center gap-2 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 p-3 rounded-lg">
              <Zap className="w-4 h-4" />
              <span>
                At your current rate, you'll reach {formatCurrency(goalProgress.goalAmount)}/month in{' '}
                <strong>{goalProgress.daysToGoal} days</strong>!
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
              <TrendingUp className="w-4 h-4" />
              <span>Keep growing to reach your goal!</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const TipsCard: React.FC<{ tips: string[] }> = ({ tips }) => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-500" />
          Tips to Increase Revenue
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {tips.map((tip, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <ChevronRight className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

export default function RevenueForecast() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState<'3' | '6' | '12'>('12');
  const [customGoal, setCustomGoal] = useState<number | null>(null);

  const { data: projectionsData, isLoading, error } = useQuery({
    queryKey: ['/api/revenue-forecast/projections'],
    staleTime: 5 * 60 * 1000,
  });

  const generateMutation = useMutation({
    mutationFn: async (months: number) => {
      const response = await apiRequest('POST', '/api/revenue-forecast/generate', { months });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Forecast Generated',
        description: 'Your revenue forecast has been updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/revenue-forecast/projections'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to generate forecast. Please try again.',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (error || !projectionsData?.data) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <p>Unable to load revenue forecast</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => generateMutation.mutate(12)}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Generate Forecast
          </Button>
        </div>
      </Card>
    );
  }

  const projections: RevenueProjections = projectionsData.data;
  const goalProgress = customGoal 
    ? { ...projections.goalProgress, goalAmount: customGoal }
    : projections.goalProgress;

  const selectedForecast = selectedPeriod === '3' 
    ? projections.threeMonth 
    : selectedPeriod === '6' 
      ? projections.sixMonth 
      : projections.twelveMonth;

  const chartData = projections.monthlyBreakdown.map((m) => ({
    month: formatMonth(m.month),
    revenue: m.projectedRevenue,
    confidenceLow: m.isHistorical ? null : m.confidenceLow,
    confidenceHigh: m.isHistorical ? null : m.confidenceHigh,
    isHistorical: m.isHistorical,
    streams: m.projectedStreams,
  }));

  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + parseInt(selectedPeriod));
  const futureDateStr = futureDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-500" />
            Revenue Forecast
          </h2>
          <p className="text-muted-foreground">
            Projected earnings based on your performance trends
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => generateMutation.mutate(12)}
          disabled={generateMutation.isPending}
        >
          {generateMutation.isPending ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Refresh Forecast
        </Button>
      </div>

      <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as '3' | '6' | '12')}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="3">3 Months</TabsTrigger>
          <TabsTrigger value="6">6 Months</TabsTrigger>
          <TabsTrigger value="12">12 Months</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedPeriod} className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <ForecastCard
              title="3 Month Projection"
              forecast={projections.threeMonth}
              isSelected={selectedPeriod === '3'}
              onClick={() => setSelectedPeriod('3')}
            />
            <ForecastCard
              title="6 Month Projection"
              forecast={projections.sixMonth}
              isSelected={selectedPeriod === '6'}
              onClick={() => setSelectedPeriod('6')}
            />
            <ForecastCard
              title="12 Month Projection"
              forecast={projections.twelveMonth}
              isSelected={selectedPeriod === '12'}
              onClick={() => setSelectedPeriod('12')}
            />
          </div>

          <Card className="bg-gradient-to-r from-primary/10 to-green-500/10 border-primary/20 mb-6">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-primary/20">
                  <Award className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-medium">
                    At your current rate, you'll earn{' '}
                    <span className="text-2xl font-bold text-primary">
                      {formatCurrency(selectedForecast.projectedRevenue)}
                    </span>{' '}
                    by {futureDateStr}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    That's approximately {formatNumber(selectedForecast.projectedStreams)} streams and{' '}
                    {formatCurrency(selectedForecast.projectedRoyalties)} in royalties
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Monthly Revenue Forecast
              </CardTitle>
              <CardDescription>
                Historical data (solid) and projected earnings (dashed) with confidence intervals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis
                      tickFormatter={(value) => `$${value}`}
                      className="text-xs"
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name === 'revenue' ? 'Revenue' : name,
                      ]}
                      labelFormatter={(label) => `Month: ${label}`}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="confidenceHigh"
                      stackId="confidence"
                      stroke="transparent"
                      fill="url(#colorConfidence)"
                      name="Confidence High"
                    />
                    <Area
                      type="monotone"
                      dataKey="confidenceLow"
                      stackId="confidence"
                      stroke="transparent"
                      fill="transparent"
                      name="Confidence Low"
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#colorRevenue)"
                      name="Projected Revenue"
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        if (payload.isHistorical) {
                          return (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill="hsl(var(--primary))"
                              stroke="white"
                              strokeWidth={2}
                            />
                          );
                        }
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={4}
                            fill="white"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            strokeDasharray="2 2"
                          />
                        );
                      }}
                    />
                    <ReferenceLine
                      y={goalProgress.goalAmount}
                      stroke="hsl(var(--destructive))"
                      strokeDasharray="5 5"
                      label={{
                        value: `Goal: ${formatCurrency(goalProgress.goalAmount)}/mo`,
                        position: 'right',
                        fill: 'hsl(var(--destructive))',
                        fontSize: 12,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <GoalProgressCard
              goalProgress={goalProgress}
              onGoalChange={setCustomGoal}
            />
            <TipsCard tips={projections.tips} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
