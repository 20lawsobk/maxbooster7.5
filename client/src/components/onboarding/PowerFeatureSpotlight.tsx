import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Sparkles, Wand2, Zap, Bot, Music, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { apiRequest } from '@/lib/queryClient';

type UserPersona = 'artist' | 'producer' | 'label' | 'manager' | null;

interface PowerFeature {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<any>;
  actionLabel: string;
  actionUrl: string;
  gradient: string;
  personas: UserPersona[];
  priority: number;
}

const POWER_FEATURES: PowerFeature[] = [
  {
    id: 'ai-melody-generator',
    title: 'AI Music Generator',
    subtitle: 'Create custom melodies instantly',
    description: 'Describe what you want or upload audio — get unique drums, bass, synths, and full beats in seconds. No samples, 100% yours.',
    icon: Wand2,
    actionLabel: 'Try It Now',
    actionUrl: '/studio',
    gradient: 'from-purple-500 to-pink-500',
    personas: ['artist', 'producer', null],
    priority: 1,
  },
  {
    id: 'social-autopilot',
    title: 'Social Media Autopilot',
    subtitle: 'AI trained on viral strategies',
    description: 'Our AI knows the best posting times, hashtags, and content formats for musicians. Turn it on and watch your engagement grow.',
    icon: Bot,
    actionLabel: 'Activate Autopilot',
    actionUrl: '/social-media',
    gradient: 'from-blue-500 to-cyan-500',
    personas: ['artist', 'label', 'manager', null],
    priority: 2,
  },
  {
    id: 'organic-advertising',
    title: 'Zero-Cost Advertising',
    subtitle: 'Outperform paid ads for free',
    description: 'Our AI creates viral organic content that gets 50-100% better results than paid advertising — using your connected social accounts.',
    icon: Zap,
    actionLabel: 'See How It Works',
    actionUrl: '/advertising',
    gradient: 'from-orange-500 to-red-500',
    personas: ['artist', 'label', 'manager', null],
    priority: 3,
  },
  {
    id: 'desktop-app',
    title: 'Desktop App Available',
    subtitle: 'Native experience on any OS',
    description: 'Download Max Booster for Windows, Mac, or Linux. Get native file access, system notifications, and a dedicated app experience.',
    icon: Music,
    actionLabel: 'Learn More',
    actionUrl: '/settings',
    gradient: 'from-green-500 to-emerald-500',
    personas: ['artist', 'producer', 'label', 'manager', null],
    priority: 4,
  },
];

interface PowerFeatureSpotlightProps {
  userPersona?: UserPersona;
  dismissable?: boolean;
  compact?: boolean;
}

export default function PowerFeatureSpotlight({ 
  userPersona = null, 
  dismissable = true,
  compact = false 
}: PowerFeatureSpotlightProps) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0);

  const { data: seenFeaturesData } = useQuery<{ seenFeatures: string[] }>({
    queryKey: ['/api/users/seen-features'],
    staleTime: 60000,
  });
  const seenFeatures = seenFeaturesData?.seenFeatures || [];

  const markSeenMutation = useMutation({
    mutationFn: async (featureId: string) => {
      const response = await apiRequest('POST', '/api/users/mark-feature-seen', { featureId });
      return response.json();
    },
    onMutate: async (featureId: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/users/seen-features'] });
      const previousData = queryClient.getQueryData<{ seenFeatures: string[] }>(['/api/users/seen-features']);
      queryClient.setQueryData<{ seenFeatures: string[] }>(['/api/users/seen-features'], (old) => ({
        seenFeatures: [...(old?.seenFeatures || []), featureId],
      }));
      return { previousData };
    },
    onError: (err, featureId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['/api/users/seen-features'], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/seen-features'] });
    },
  });

  const relevantFeatures = POWER_FEATURES
    .filter(f => f.personas.includes(userPersona) || f.personas.includes(null))
    .filter(f => !seenFeatures?.includes(f.id))
    .sort((a, b) => a.priority - b.priority);

  const currentFeature = relevantFeatures[0];

  useEffect(() => {
    setDismissed(false);
  }, [currentFeature?.id]);

  const handleDismiss = () => {
    if (currentFeature) {
      markSeenMutation.mutate(currentFeature.id);
    }
    setDismissed(true);
  };

  const handleAction = () => {
    if (currentFeature) {
      markSeenMutation.mutate(currentFeature.id);
    }
  };

  if (dismissed || !currentFeature) {
    return null;
  }

  const IconComponent = currentFeature.icon;

  if (compact) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="mb-4"
        >
          <Card className="border-0 overflow-hidden">
            <div className={`bg-gradient-to-r ${currentFeature.gradient} p-0.5`}>
              <CardContent className="bg-background p-3 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-gradient-to-r ${currentFeature.gradient} text-white`}>
                  <IconComponent className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{currentFeature.title}</span>
                    <Badge variant="secondary" className="text-xs">New</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{currentFeature.subtitle}</p>
                </div>
                <Link href={currentFeature.actionUrl} onClick={handleAction}>
                  <Button size="sm" variant="ghost" className="shrink-0">
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                {dismissable && (
                  <Button size="sm" variant="ghost" onClick={handleDismiss} className="shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="mb-6"
      >
        <Card className="border-0 overflow-hidden shadow-lg">
          <div className={`bg-gradient-to-r ${currentFeature.gradient}`}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <IconComponent className="h-8 w-8 text-white" />
                </div>
                <div className="flex-1 text-white">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium opacity-90">Discover</span>
                  </div>
                  <h3 className="text-xl font-bold mb-1">{currentFeature.title}</h3>
                  <p className="text-white/80 text-sm mb-3">{currentFeature.description}</p>
                  <div className="flex items-center gap-3">
                    <Link href={currentFeature.actionUrl} onClick={handleAction}>
                      <Button 
                        variant="secondary" 
                        className="bg-white/20 hover:bg-white/30 text-white border-0"
                      >
                        {currentFeature.actionLabel}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                    {dismissable && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={handleDismiss}
                        className="text-white/70 hover:text-white hover:bg-white/10"
                      >
                        Maybe Later
                      </Button>
                    )}
                  </div>
                </div>
                {dismissable && (
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={handleDismiss}
                    className="text-white/50 hover:text-white hover:bg-white/10 shrink-0"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}
              </div>
              {relevantFeatures.length > 1 && (
                <div className="flex items-center justify-center gap-1 mt-4">
                  {relevantFeatures.slice(0, 4).map((_, i) => (
                    <div 
                      key={i} 
                      className={`h-1.5 rounded-full transition-all ${
                        i === 0 ? 'w-6 bg-white' : 'w-1.5 bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
