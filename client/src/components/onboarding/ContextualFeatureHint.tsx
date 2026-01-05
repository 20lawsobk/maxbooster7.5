import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Sparkles, Lightbulb, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';

interface FeatureHint {
  id: string;
  triggerCondition: string;
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  icon: 'Sparkles' | 'Lightbulb' | 'Zap';
  priority: number;
}

const FEATURE_HINTS: FeatureHint[] = [
  {
    id: 'ai_music_after_upload',
    triggerCondition: 'uploaded_track',
    title: 'Take it further with AI',
    description: 'Did you know you can generate entirely new melodies, beats, or even full tracks using just a text description?',
    ctaText: 'Try AI Music Generator',
    ctaUrl: '/studio',
    icon: 'Sparkles',
    priority: 1,
  },
  {
    id: 'autopilot_after_social_connect',
    triggerCondition: 'connected_social',
    title: 'Let AI handle your posting',
    description: 'Your social account is connected! Activate Autopilot to let AI post viral content for you automatically.',
    ctaText: 'Activate Social Autopilot',
    ctaUrl: '/social-media',
    icon: 'Zap',
    priority: 2,
  },
  {
    id: 'zero_cost_ads_after_post',
    triggerCondition: 'scheduled_post',
    title: 'Skip the ad spend',
    description: 'Our AI can create viral organic content that outperforms paid ads. Save thousands on marketing.',
    ctaText: 'Explore Zero-Cost Advertising',
    ctaUrl: '/advertising',
    icon: 'Lightbulb',
    priority: 3,
  },
  {
    id: 'storefront_after_track',
    triggerCondition: 'uploaded_track',
    title: 'Start selling your beats',
    description: 'Your track is ready! Set up your beat store to start generating revenue from your music.',
    ctaText: 'Set Up Beat Store',
    ctaUrl: '/storefront',
    icon: 'Sparkles',
    priority: 4,
  },
];

const iconMap = {
  Sparkles,
  Lightbulb,
  Zap,
};

interface ContextualFeatureHintProps {
  currentPage?: string;
}

export default function ContextualFeatureHint({ currentPage }: ContextualFeatureHintProps) {
  const [, setLocation] = useLocation();
  const [dismissedHints, setDismissedHints] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: userProgress } = useQuery({
    queryKey: ['/api/onboarding/progress'],
    staleTime: 30000,
  });

  const { data: seenFeatures } = useQuery<{ seenFeatures: string[] }>({
    queryKey: ['/api/users/seen-features'],
    staleTime: 60000,
  });

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

  const getActiveHint = (): FeatureHint | null => {
    const completedSteps = (userProgress as any)?.completedSteps || [];
    const seen = seenFeatures?.seenFeatures || [];
    
    const stepToConditionMap: Record<string, string> = {
      'upload_first_track': 'uploaded_track',
      'Upload first track': 'uploaded_track',
      'connect_social_account': 'connected_social',
      'Connect a social account': 'connected_social',
      'schedule_first_post': 'scheduled_post',
      'Schedule first post': 'scheduled_post',
    };

    const activeConditions = new Set<string>();
    completedSteps.forEach((step: string) => {
      const condition = stepToConditionMap[step];
      if (condition) {
        activeConditions.add(condition);
      }
    });

    const availableHints = FEATURE_HINTS
      .filter(hint => 
        activeConditions.has(hint.triggerCondition) && 
        !seen.includes(hint.id) && 
        !dismissedHints.includes(hint.id)
      )
      .sort((a, b) => a.priority - b.priority);

    return availableHints[0] || null;
  };

  const activeHint = getActiveHint();

  const handleDismiss = (hintId: string) => {
    setDismissedHints(prev => [...prev, hintId]);
    markSeenMutation.mutate(hintId);
  };

  const handleCTA = (hint: FeatureHint) => {
    markSeenMutation.mutate(hint.id);
    setLocation(hint.ctaUrl);
  };

  if (!activeHint) {
    return null;
  }

  const Icon = iconMap[activeHint.icon];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed bottom-6 right-6 z-40 max-w-sm"
      >
        <Card className="relative overflow-hidden border-2 border-purple-500/30 bg-gradient-to-br from-purple-900/90 via-indigo-900/90 to-blue-900/90 backdrop-blur-xl shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-blue-500/10" />
          
          <div className="relative p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDismiss(activeHint.id)}
              className="absolute top-2 right-2 h-6 w-6 p-0 text-white/60 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="flex items-start gap-3 pr-6">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shrink-0">
                <Icon className="h-5 w-5 text-white" />
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold text-white text-sm leading-tight">
                  {activeHint.title}
                </h4>
                <p className="text-xs text-white/70 leading-relaxed">
                  {activeHint.description}
                </p>
                
                <Button
                  onClick={() => handleCTA(activeHint)}
                  size="sm"
                  className="mt-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs"
                >
                  {activeHint.ctaText}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
