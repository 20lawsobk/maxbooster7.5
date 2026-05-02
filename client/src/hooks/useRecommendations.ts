import { useQuery } from '@tanstack/react-query';
import { useUserPreferences, CareerStage } from './useUserPreferences';

export interface PreferenceRecommendation {
  category: string;
  recommendation: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  actionable: boolean;
  suggestedValue?: Record<string, unknown>;
}

export interface NextAction {
  id: string;
  title: string;
  description: string;
  category: 'content' | 'distribution' | 'marketing' | 'engagement' | 'monetization';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  estimatedTime: string;
  impact: 'high' | 'medium' | 'low';
  link?: string;
}

export interface PersonalizedTip {
  id: string;
  title: string;
  content: string;
  category: string;
  relevanceScore: number;
  dismissed?: boolean;
}

export interface CareerGuidance {
  stage: CareerStage;
  currentFocus: string[];
  nextMilestones: string[];
  suggestedActions: string[];
  resources: { title: string; link: string }[];
}

const CAREER_STAGE_GUIDANCE: Record<CareerStage, CareerGuidance> = {
  emerging: {
    stage: 'emerging',
    currentFocus: [
      'Building your initial fanbase',
      'Developing your unique sound',
      'Creating consistent content',
    ],
    nextMilestones: [
      'Reach 1,000 followers on one platform',
      'Release your first single',
      'Get featured on a playlist',
    ],
    suggestedActions: [
      'Complete your artist profile',
      'Set up social media accounts',
      'Start a content calendar',
      'Engage with other artists in your genre',
    ],
    resources: [
      { title: 'Getting Started Guide', link: '/help/getting-started' },
      { title: 'Social Media 101', link: '/help/social-media' },
    ],
  },
  developing: {
    stage: 'developing',
    currentFocus: [
      'Growing your audience consistently',
      'Building deeper fan connections',
      'Developing a release strategy',
    ],
    nextMilestones: [
      'Reach 10,000 monthly listeners',
      'Build an email list of 500+',
      'Land a major playlist placement',
    ],
    suggestedActions: [
      'Launch a pre-save campaign',
      'Start email marketing',
      'Collaborate with similar artists',
      'Analyze your best-performing content',
    ],
    resources: [
      { title: 'Growth Strategies', link: '/help/growth' },
      { title: 'Email Marketing Guide', link: '/help/email' },
    ],
  },
  established: {
    stage: 'established',
    currentFocus: [
      'Maximizing revenue streams',
      'Strategic partnerships',
      'Brand expansion',
    ],
    nextMilestones: [
      'Reach 100,000 monthly listeners',
      'Secure sync licensing deals',
      'Build a merchandise line',
    ],
    suggestedActions: [
      'Diversify income sources',
      'Explore licensing opportunities',
      'Build team relationships',
      'Plan strategic releases',
    ],
    resources: [
      { title: 'Monetization Strategies', link: '/help/monetization' },
      { title: 'Sync Licensing Guide', link: '/help/sync' },
    ],
  },
  professional: {
    stage: 'professional',
    currentFocus: [
      'Scaling operations',
      'Team management',
      'Long-term career planning',
    ],
    nextMilestones: [
      'Major label or distribution deal',
      'International touring',
      'Multiple revenue streams',
    ],
    suggestedActions: [
      'Hire key team members',
      'Develop a 5-year plan',
      'Explore international markets',
      'Build strategic partnerships',
    ],
    resources: [
      { title: 'Scaling Your Career', link: '/help/scaling' },
      { title: 'Team Building', link: '/help/team' },
    ],
  },
};

const CONTEXTUAL_TIPS: PersonalizedTip[] = [
  {
    id: 'tip-1',
    title: 'Optimize Your Release Schedule',
    content: 'Friday releases get more playlist consideration. Plan your next release for a Friday and submit to playlists 4 weeks ahead.',
    category: 'distribution',
    relevanceScore: 0.9,
  },
  {
    id: 'tip-2',
    title: 'Engage Before Posting',
    content: 'Spend 15 minutes engaging with fans before posting new content. This boosts your algorithm visibility.',
    category: 'engagement',
    relevanceScore: 0.85,
  },
  {
    id: 'tip-3',
    title: 'Cross-Promote Effectively',
    content: 'Share your Spotify link on Instagram Stories with a direct link sticker for better conversion rates.',
    category: 'marketing',
    relevanceScore: 0.8,
  },
  {
    id: 'tip-4',
    title: 'Build Email First',
    content: "Social followers can disappear. Email subscribers are yours forever. Start building your list today.",
    category: 'marketing',
    relevanceScore: 0.75,
  },
  {
    id: 'tip-5',
    title: 'Content Batching',
    content: 'Create a week\'s worth of content in one session. This ensures consistency without daily stress.',
    category: 'content',
    relevanceScore: 0.7,
  },
];

export function useRecommendations() {
  const {
    data: recommendations,
    isLoading,
    error,
    refetch,
  } = useQuery<PreferenceRecommendation[]>({
    queryKey: ['/api/preferences/recommendations'],
    staleTime: 15 * 60 * 1000,
  });

  const getHighPriorityRecommendations = (): PreferenceRecommendation[] => {
    return recommendations?.filter(r => r.priority === 'high') || [];
  };

  const getActionableRecommendations = (): PreferenceRecommendation[] => {
    return recommendations?.filter(r => r.actionable) || [];
  };

  const getRecommendationsByCategory = (category: string): PreferenceRecommendation[] => {
    return recommendations?.filter(r => r.category === category) || [];
  };

  return {
    recommendations,
    isLoading,
    error,
    refetch,
    getHighPriorityRecommendations,
    getActionableRecommendations,
    getRecommendationsByCategory,
  };
}

export function useNextActions() {
  const { preferences } = useUserPreferences();

  const generateNextActions = (): NextAction[] => {
    const actions: NextAction[] = [];

    if (!preferences) return actions;

    if (preferences.genres.length === 0) {
      actions.push({
        id: 'complete-profile',
        title: 'Complete Your Artist Profile',
        description: 'Add your genres and target audience to get personalized recommendations',
        category: 'content',
        priority: 'urgent',
        estimatedTime: '5 min',
        impact: 'high',
        link: '/settings',
      });
    }

    if (preferences.contentPreferences.platforms.length < 2) {
      actions.push({
        id: 'connect-platforms',
        title: 'Connect More Platforms',
        description: 'Link your social accounts to manage everything in one place',
        category: 'marketing',
        priority: 'high',
        estimatedTime: '10 min',
        impact: 'high',
        link: '/settings',
      });
    }

    actions.push({
      id: 'schedule-content',
      title: 'Schedule This Week\'s Content',
      description: 'Plan and schedule your social media posts for the week',
      category: 'content',
      priority: 'medium',
      estimatedTime: '30 min',
      impact: 'medium',
      link: '/social-media',
    });

    actions.push({
      id: 'review-analytics',
      title: 'Review Your Analytics',
      description: 'Check your streaming and social media performance',
      category: 'engagement',
      priority: 'medium',
      estimatedTime: '15 min',
      impact: 'medium',
      link: '/analytics',
    });

    return actions.sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  };

  return {
    actions: generateNextActions(),
    isLoading: false,
  };
}

export function usePersonalizedTips() {
  const { preferences } = useUserPreferences();

  const getTips = (): PersonalizedTip[] => {
    if (!preferences) return CONTEXTUAL_TIPS.slice(0, 3);

    let tips = [...CONTEXTUAL_TIPS];

    if (preferences.careerStage === 'emerging') {
      tips = tips.filter(t => t.category !== 'monetization');
    }

    if (preferences.contentPreferences.platforms.length > 3) {
      tips = tips.filter(t => t.id !== 'tip-3');
    }

    return tips.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
  };

  return {
    tips: getTips(),
    isLoading: false,
  };
}

export function useCareerStageGuidance() {
  const { preferences } = useUserPreferences();

  const getGuidance = (): CareerGuidance | null => {
    if (!preferences) return null;
    return CAREER_STAGE_GUIDANCE[preferences.careerStage];
  };

  return {
    guidance: getGuidance(),
    isLoading: false,
  };
}
