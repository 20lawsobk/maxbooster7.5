import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRecommendations, PreferenceRecommendation } from '@/hooks/useRecommendations';
import { useSmartDefaults, SmartDefault } from '@/hooks/useSmartDefaults';
import { useSchedulingSuggestions, SchedulingSuggestion } from '@/hooks/useSmartDefaults';
import { usePlatformRecommendations, PlatformRecommendation } from '@/hooks/useSmartDefaults';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useToast } from '@/hooks/use-toast';
import {
  Brain,
  Sparkles,
  Calendar,
  Share2,
  Settings,
  Check,
  X,
  ArrowRight,
  Zap,
  TrendingUp,
  Clock,
  Target,
  AlertCircle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

interface SmartSuggestionsProps {
  showHeader?: boolean;
  defaultTab?: 'all' | 'settings' | 'schedule' | 'platforms';
}

export function SmartSuggestions({ showHeader = true, defaultTab = 'all' }: SmartSuggestionsProps) {
  const { recommendations, isLoading: loadingRecs, getHighPriorityRecommendations } = useRecommendations();
  const { defaults, isLoading: loadingDefaults } = useSmartDefaults();
  const { suggestions: scheduleSuggestions, isLoading: loadingSchedule } = useSchedulingSuggestions();
  const { recommendations: platformRecs, isLoading: loadingPlatforms } = usePlatformRecommendations();
  const { updatePreferences, isUpdating } = useUserPreferences();
  const { toast } = useToast();
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());

  const isLoading = loadingRecs || loadingDefaults || loadingSchedule || loadingPlatforms;

  const handleApplySuggestion = async (suggestion: PreferenceRecommendation) => {
    if (!suggestion.suggestedValue || !suggestion.actionable) return;

    try {
      await updatePreferences(suggestion.suggestedValue);
      setAppliedSuggestions((prev) => new Set([...prev, suggestion.recommendation]));
      toast({
        title: 'Suggestion Applied',
        description: suggestion.recommendation,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to apply suggestion. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Suggestions
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const highPriority = getHighPriorityRecommendations();

  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-500" />
              AI Suggestions
            </CardTitle>
            <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
              <Sparkles className="h-3 w-3 mr-1" />
              Powered by AI
            </Badge>
          </div>
        </CardHeader>
      )}
      <CardContent className={showHeader ? '' : 'pt-6'}>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              All
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs">
              <Settings className="h-3 w-3 mr-1" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs">
              <Calendar className="h-3 w-3 mr-1" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="platforms" className="text-xs">
              <Share2 className="h-3 w-3 mr-1" />
              Platforms
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4 space-y-3">
            {highPriority.length > 0 ? (
              highPriority.slice(0, 5).map((rec, index) => (
                <SuggestionCard
                  key={index}
                  recommendation={rec}
                  onApply={handleApplySuggestion}
                  isApplied={appliedSuggestions.has(rec.recommendation)}
                  isUpdating={isUpdating}
                />
              ))
            ) : (
              <EmptyState message="No high-priority suggestions right now. Check back later!" />
            )}
          </TabsContent>

          <TabsContent value="settings" className="mt-4 space-y-3">
            {defaults && defaults.length > 0 ? (
              defaults.slice(0, 5).map((def, index) => (
                <DefaultCard key={index} defaultSetting={def} />
              ))
            ) : (
              <EmptyState message="Your settings are already optimized!" />
            )}
          </TabsContent>

          <TabsContent value="schedule" className="mt-4 space-y-3">
            {scheduleSuggestions && scheduleSuggestions.length > 0 ? (
              scheduleSuggestions.slice(0, 5).map((sug, index) => (
                <ScheduleCard key={index} suggestion={sug} />
              ))
            ) : (
              <EmptyState message="No scheduling suggestions available." />
            )}
          </TabsContent>

          <TabsContent value="platforms" className="mt-4 space-y-3">
            {platformRecs && platformRecs.length > 0 ? (
              platformRecs.slice(0, 5).map((rec, index) => (
                <PlatformCard key={index} recommendation={rec} />
              ))
            ) : (
              <EmptyState message="No platform recommendations available." />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function SuggestionCard({
  recommendation,
  onApply,
  isApplied,
  isUpdating,
}: {
  recommendation: PreferenceRecommendation;
  onApply: (rec: PreferenceRecommendation) => void;
  isApplied: boolean;
  isUpdating: boolean;
}) {
  const priorityColors = {
    high: 'border-l-red-500',
    medium: 'border-l-yellow-500',
    low: 'border-l-green-500',
  };

  return (
    <div className={`p-3 rounded-lg border border-l-4 ${priorityColors[recommendation.priority]} bg-card`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs capitalize">
              {recommendation.category}
            </Badge>
            <Badge
              variant={recommendation.priority === 'high' ? 'destructive' : 'secondary'}
              className="text-xs"
            >
              {recommendation.priority}
            </Badge>
          </div>
          <p className="text-sm font-medium">{recommendation.recommendation}</p>
          <p className="text-xs text-muted-foreground mt-1">{recommendation.reason}</p>
        </div>
        {recommendation.actionable && (
          <Button
            variant={isApplied ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onApply(recommendation)}
            disabled={isApplied || isUpdating}
          >
            {isApplied ? (
              <>
                <Check className="h-3 w-3 mr-1" />
                Applied
              </>
            ) : isUpdating ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <>
                Apply
                <ArrowRight className="h-3 w-3 ml-1" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function DefaultCard({ defaultSetting }: { defaultSetting: SmartDefault }) {
  const confidenceColor =
    defaultSetting.confidence >= 0.8
      ? 'text-green-600'
      : defaultSetting.confidence >= 0.6
      ? 'text-yellow-600'
      : 'text-muted-foreground';

  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs capitalize">
            {defaultSetting.category}
          </Badge>
          <span className="text-sm font-medium">{defaultSetting.key}</span>
        </div>
        <span className={`text-xs ${confidenceColor}`}>
          {Math.round(defaultSetting.confidence * 100)}% confident
        </span>
      </div>
      <p className="text-sm">
        Suggested: <span className="font-medium">{JSON.stringify(defaultSetting.value)}</span>
      </p>
      <p className="text-xs text-muted-foreground mt-1">{defaultSetting.reasoning}</p>
    </div>
  );
}

function ScheduleCard({ suggestion }: { suggestion: SchedulingSuggestion }) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{suggestion.day}</span>
        </div>
        <Badge variant="outline" className="text-xs capitalize">
          {suggestion.platform}
        </Badge>
      </div>
      <div className="flex items-center gap-2 mb-2">
        {suggestion.times.map((time, i) => (
          <Badge key={i} variant="secondary" className="text-xs">
            {time}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
      <div className="flex items-center gap-1 mt-2">
        <TrendingUp className="h-3 w-3 text-green-500" />
        <span className="text-xs text-green-600">
          {Math.round(suggestion.engagementScore * 100)}% engagement score
        </span>
      </div>
    </div>
  );
}

function PlatformCard({ recommendation }: { recommendation: PlatformRecommendation }) {
  const priorityColors = {
    primary: 'border-l-green-500',
    secondary: 'border-l-blue-500',
    emerging: 'border-l-purple-500',
  };

  const effortBadges = {
    low: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-red-100 text-red-700',
  };

  return (
    <div className={`p-3 rounded-lg border border-l-4 ${priorityColors[recommendation.priority]} bg-card`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium capitalize">{recommendation.platform}</span>
        <Badge variant="outline" className="text-xs capitalize">
          {recommendation.priority}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{recommendation.reason}</p>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          <Target className="h-3 w-3 mr-1" />
          {Math.round(recommendation.audienceMatch * 100)}% match
        </Badge>
        <Badge variant="secondary" className="text-xs">
          <TrendingUp className="h-3 w-3 mr-1" />
          {Math.round(recommendation.growthPotential * 100)}% growth
        </Badge>
        <Badge className={`text-xs ${effortBadges[recommendation.effort]}`}>
          {recommendation.effort} effort
        </Badge>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default SmartSuggestions;
