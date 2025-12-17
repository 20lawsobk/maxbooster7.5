import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap } from 'lucide-react';

interface FeatureSpotlightProps {
  onClose: () => void;
  onExploreFeature: (featureId: string) => void;
}

const spotlightFeatures = [
  {
    id: 'ai-advertising',
    title: 'AI Advertising Revolution',
    description: 'Zero-cost advertising that outperforms paid campaigns',
    badge: 'New',
    badgeColor: 'bg-green-500',
  },
  {
    id: 'ai-mixing',
    title: 'AI-Powered Mixing',
    description: 'Professional-grade mixing with AI assistance',
    badge: 'Popular',
    badgeColor: 'bg-blue-500',
  },
  {
    id: 'analytics',
    title: 'Advanced Analytics',
    description: 'Deep insights into your music performance',
    badge: 'Trending',
    badgeColor: 'bg-purple-500',
  },
];

export default function FeatureSpotlight({ onClose, onExploreFeature }: FeatureSpotlightProps) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" data-testid="dialog-feature-spotlight">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            All Features Spotlight
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {spotlightFeatures.map((feature) => (
            <div
              key={feature.id}
              className="p-4 border rounded-lg"
              data-testid={`spotlight-card-${feature.id}`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold">{feature.title}</h3>
                <Badge className={feature.badgeColor}>{feature.badge}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{feature.description}</p>
              <Button
                size="sm"
                onClick={() => onExploreFeature(feature.id)}
                data-testid={`button-explore-${feature.id}`}
              >
                Explore Feature
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
