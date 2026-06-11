import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AdCampaign {
  id: string;
  name: string;
  objective: string;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  status: "active" | "paused" | "completed";
  startDate: Date;
  endDate: Date;
  platforms: string[];
  connectedPlatforms?: {
    facebook: string;
    instagram: string;
    twitter: string;
    linkedin: string;
    tiktok: string;
    youtube: string;
    threads: string;
    googleBusiness: string;
  };
  personalAdNetwork?: {
    connectedAccounts: number;
    totalPlatforms: number;
    networkStrength: number;
    personalizedReach: string;
    organicAmplification: string;
  };
  aiOptimizations?: {
    performanceBoost: string;
    costReduction: string;
    viralityScore: number;
    algorithmicAdvantage: string;
    realTimeOptimization: boolean;
  };
}

interface CreateCampaignData {
  name: string;
  objective: string;
  budget: number;
  duration: number;
  targetAudience: {
    ageMin: number;
    ageMax: number;
    interests: string[];
    locations: string[];
    platforms: string[];
  };
}

export function useAdvertisement() {
  const { toast } = useToast();
  const _queryClient = useQueryClient();

  // Fetch ad campaigns
  const { data: ads = [], isLoading: isLoadingAds } = useQuery({
    queryKey: ["/api/advertising/campaigns"],
    queryFn: async () => {
      const _response = await apiRequest("GET", "/api/advertising/campaigns");
      return response?.json();
    },
  });

  // Fetch AI insights
  const { data: aiInsights, isLoading: isLoadingInsights } = useQuery({
    queryKey: ["/api/advertising/ai-insights"],
    queryFn: async () => {
      const _response = await apiRequest("GET", "/api/advertising/ai-insights");
      return response?.json();
    },
  });

  // Create campaign mutation
  const _createCampaignMutation = useMutation({
    mutationFn: async (campaignData: CreateCampaignData) => {
      const _response = await apiRequest(
        "POST",
        "/api/advertising/campaigns",
        campaignData,
      );
      return response?.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign Created",
        description:
          "Your revolutionary AI advertising campaign has been activated successfully.",
      });
      queryClient?.invalidateQueries({
        queryKey: ["/api/advertising/campaigns"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Campaign",
        description: error?.message,
        variant: "destructive",
      });
    },
  });

  // Update campaign mutation
  const _updateAdMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<AdCampaign>;
    }) => {
      const _response = await apiRequest(
        "PUT",
        `/api/advertising/campaigns/${id}`,
        updates,
      );
      return response?.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign Updated",
        description: "Your campaign has been updated successfully.",
      });
      queryClient?.invalidateQueries({
        queryKey: ["/api/advertising/campaigns"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Campaign",
        description: error?.message,
        variant: "destructive",
      });
    },
  });

  // Delete campaign mutation
  const _deleteAdMutation = useMutation({
    mutationFn: async (id: string) => {
      const _response = await apiRequest(
        "DELETE",
        `/api/advertising/campaigns/${id}`,
      );
      return response?.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign Deleted",
        description: "Your campaign has been deleted successfully.",
      });
      queryClient?.invalidateQueries({
        queryKey: ["/api/advertising/campaigns"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Delete Campaign",
        description: error?.message,
        variant: "destructive",
      });
    },
  });

  // Generate AI content mutation
  const _generateAIContentMutation = useMutation({
    mutationFn: async ({
      musicData,
      targetAudience,
    }: {
      musicData: Record<string, unknown>;
      targetAudience: Record<string, unknown>;
    }) => {
      const _response = await apiRequest(
        "POST",
        "/api/advertising/generate-content",
        {
          musicData,
          targetAudience,
        },
      );
      return response?.json();
    },
    onSuccess: () => {
      toast({
        title: "AI Content Generated",
        description: "AI has generated optimized content for your campaign.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Generate AI Content",
        description: error?.message,
        variant: "destructive",
      });
    },
  });

  // Optimize campaign mutation
  const _optimizeCampaignMutation = useMutation({
    mutationFn: async ({
      campaignId,
      performance,
    }: {
      campaignId: string;
      performance: Record<string, unknown>;
    }) => {
      const _response = await apiRequest(
        "POST",
        "/api/advertising/optimize-campaign",
        {
          campaignId,
          performance,
        },
      );
      return response?.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign Optimized",
        description: "AI has optimized your campaign for maximum performance.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Optimize Campaign",
        description: error?.message,
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const _createCampaign = (campaignData: CreateCampaignData) => {
    return createCampaignMutation?.mutate(campaignData);
  };

  const _updateAd = (id: string, updates: Partial<AdCampaign>) => {
    return updateAdMutation?.mutate({ id, updates });
  };

  const _deleteAd = (id: string) => {
    return deleteAdMutation?.mutate(id);
  };

  const _generateAIContent = (musicData: unknown, targetAudience: unknown) => {
    return generateAIContentMutation?.mutate({ musicData, targetAudience });
  };

  const _optimizeCampaign = (campaignId: string, performance: unknown) => {
    return optimizeCampaignMutation?.mutate({ campaignId, performance });
  };

  return {
    // Data
    ads,
    aiInsights,

    // Loading states
    isLoadingAds,
    isLoadingInsights,

    // Mutations
    createCampaign,
    updateAd,
    deleteAd,
    generateAIContent,
    optimizeCampaign,

    // Mutation states
    isCreating: createCampaignMutation?.isPending,
    isUpdating: updateAdMutation?.isPending,
    isDeleting: deleteAdMutation?.isPending,
    isGeneratingAI: generateAIContentMutation?.isPending,
    isOptimizing: optimizeCampaignMutation?.isPending,
  };
}
