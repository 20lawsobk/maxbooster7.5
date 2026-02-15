import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Music, BarChart3, Share2, Target } from 'lucide-react';

interface FeatureDiscoveryProps {
  onClose: () => void;
  userLevel: 'beginner' | 'intermediate' | 'advanced';
}

const features = {
  beginner: [
    {
      id: 'studio',
      title: 'Studio Production',
      icon: Music,
      description: 'Create and produce music with professional tools',
    },
    {
      id: 'distribution',
      title: 'Music Distribution',
      icon: Share2,
      description: 'Share your music on 150+ platforms',
    },
  ],
  intermediate: [
    {
      id: 'analytics',
      title: 'Advanced Analytics',
      icon: BarChart3,
      description: 'Track performance with detailed insights',
    },
    {
      id: 'ai-mixing',
      title: 'AI Mixing',
      icon: Sparkles,
      description: 'Professional mixing powered by AI',
    },
  ],
  advanced: [
    {
      id: 'ai-advertising',
      title: 'AI Advertising',
      icon: Target,
      description: 'Revolutionary zero-cost advertising',
    },
    {
      id: 'automation',
      title: 'Full Automation',
      icon: Sparkles,
      description: 'Automate your entire music career',
    },
  ],
};

export default function FeatureDiscovery({ onClose, userLevel }: FeatureDiscoveryProps) {
  const relevantFeatures = features[userLevel];

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[80vh] overflow-y-auto"
        data-testid="dialog-feature-discovery"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Discover Features - {userLevel.charAt(0).toUpperCase() + userLevel.slice(1)} Level
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {relevantFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.id}
                className="p-4 border rounded-lg hover:shadow-md transition-shadow"
                data-testid={`feature-card-${feature.id}`}
              >
                <Icon className="w-8 h-8 mb-2 text-primary" />
                <h3 className="font-semibold mb-1">{feature.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{feature.description}</p>
                <Button size="sm" variant="outline" data-testid={`button-explore-${feature.id}`}>
                  Explore
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
