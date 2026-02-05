import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePersonalizedTips, PersonalizedTip } from '@/hooks/useRecommendations';
import {
  Lightbulb,
  X,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Users,
  Share2,
  Music,
  ArrowRight,
} from 'lucide-react';

const categoryIcons: Record<string, React.ElementType> = {
  distribution: Share2,
  engagement: Users,
  marketing: TrendingUp,
  content: Music,
};

interface PersonalizedTipsProps {
  showHeader?: boolean;
  maxTips?: number;
  variant?: 'card' | 'inline' | 'carousel';
}

export function PersonalizedTips({ showHeader = true, maxTips = 3, variant = 'card' }: PersonalizedTipsProps) {
  const { tips, isLoading } = usePersonalizedTips();
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [expandedTip, setExpandedTip] = useState<string | null>(null);

  const handleDismiss = (tipId: string) => {
    setDismissedTips((prev) => new Set([...prev, tipId]));
  };

  const visibleTips = tips
    .filter((tip) => !dismissedTips.has(tip.id))
    .slice(0, maxTips);

  if (isLoading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Tips for You
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (visibleTips.length === 0) {
    return null;
  }

  if (variant === 'inline') {
    return (
      <div className="space-y-2">
        {visibleTips.map((tip) => (
          <InlineTip key={tip.id} tip={tip} onDismiss={handleDismiss} />
        ))}
      </div>
    );
  }

  if (variant === 'carousel') {
    return <TipCarousel tips={visibleTips} onDismiss={handleDismiss} />;
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Tips for You
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              Personalized
            </Badge>
          </div>
        </CardHeader>
      )}
      <CardContent className={showHeader ? '' : 'pt-6'}>
        <div className="space-y-3">
          {visibleTips.map((tip) => {
            const Icon = categoryIcons[tip.category] || Lightbulb;
            const isExpanded = expandedTip === tip.id;

            return (
              <div
                key={tip.id}
                className="group relative p-4 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border border-amber-200 dark:border-amber-800/50"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDismiss(tip.id)}
                >
                  <X className="h-3 w-3" />
                </Button>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm mb-1">{tip.title}</h4>
                    <p
                      className={`text-sm text-muted-foreground ${
                        isExpanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {tip.content}
                    </p>
                    {tip.content.length > 100 && (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto text-xs text-amber-600"
                        onClick={() => setExpandedTip(isExpanded ? null : tip.id)}
                      >
                        {isExpanded ? 'Show less' : 'Read more'}
                        <ChevronRight className={`h-3 w-3 ml-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function InlineTip({ tip, onDismiss }: { tip: PersonalizedTip; onDismiss: (id: string) => void }) {
  const Icon = categoryIcons[tip.category] || Lightbulb;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
      <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <p className="text-sm flex-1 line-clamp-1">{tip.title}</p>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDismiss(tip.id)}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function TipCarousel({ tips, onDismiss }: { tips: PersonalizedTip[]; onDismiss: (id: string) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextTip = () => {
    setCurrentIndex((prev) => (prev + 1) % tips.length);
  };

  const prevTip = () => {
    setCurrentIndex((prev) => (prev - 1 + tips.length) % tips.length);
  };

  const currentTip = tips[currentIndex];
  if (!currentTip) return null;

  const Icon = categoryIcons[currentTip.category] || Lightbulb;

  return (
    <Card className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-amber-200 dark:border-amber-800/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Icon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-medium">{currentTip.title}</h4>
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1} of {tips.length}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{currentTip.content}</p>
          </div>
        </div>
        <div className="flex justify-between items-center mt-4 pt-3 border-t border-amber-200 dark:border-amber-800/50">
          <Button variant="ghost" size="sm" onClick={prevTip} disabled={tips.length <= 1}>
            Previous
          </Button>
          <div className="flex gap-1">
            {tips.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === currentIndex ? 'bg-amber-600' : 'bg-amber-300 dark:bg-amber-700'
                }`}
              />
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={nextTip} disabled={tips.length <= 1}>
            Next
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default PersonalizedTips;
