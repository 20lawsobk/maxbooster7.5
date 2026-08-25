export type Platform =
  | "facebook"
  | "instagram"
  | "threads"
  | "tiktok"
  | "youtube"
  | "google_business"
  | "linkedin"
  | "twitter";

export type InputModality = "text" | "url" | "image" | "audio" | "video";
export type OutputModality = "text" | "image" | "audio" | "video";

export type PackId =
  | "singlereleasefull_pack"
  | "announcement_pack"
  | "tourdatespack"
  | "evergreenbrandpack";

export interface PlatformAssetSpec {
  id: string;
  platform: Platform;
  modality: OutputModality;
  purpose: string;
}

export const PACK_DEFINITIONS: Record<PackId, PlatformAssetSpec[]> = {
  singlereleasefull_pack: [
    {
      id: "fb_post",
      platform: "facebook",
      modality: "text",
      purpose: "Main post copy",
    },
    {
      id: "ig_caption",
      platform: "instagram",
      modality: "text",
      purpose: "IG feed caption",
    },
    {
      id: "ig_story_text",
      platform: "instagram",
      modality: "text",
      purpose: "Story text overlays",
    },
    {
      id: "threads_post",
      platform: "threads",
      modality: "text",
      purpose: "Threads announcement",
    },
    {
      id: "tiktok_hook",
      platform: "tiktok",
      modality: "text",
      purpose: "Hook + script for short",
    },
    {
      id: "yt_description",
      platform: "youtube",
      modality: "text",
      purpose: "YouTube description",
    },
    {
      id: "yt_title",
      platform: "youtube",
      modality: "text",
      purpose: "YouTube title options",
    },
    {
      id: "gb_post",
      platform: "google_business",
      modality: "text",
      purpose: "Google Business update",
    },
    {
      id: "li_post",
      platform: "linkedin",
      modality: "text",
      purpose: "Professional angle post",
    },
    {
      id: "cover_image",
      platform: "instagram",
      modality: "image",
      purpose: "Cover/thumbnail usable cross-platform",
    },
  ],
  announcement_pack: [
    {
      id: "fb_announcement",
      platform: "facebook",
      modality: "text",
      purpose: "Facebook announcement post",
    },
    {
      id: "ig_announcement",
      platform: "instagram",
      modality: "text",
      purpose: "Instagram announcement caption",
    },
    {
      id: "threads_announce",
      platform: "threads",
      modality: "text",
      purpose: "Threads announcement thread",
    },
    {
      id: "tiktok_announce",
      platform: "tiktok",
      modality: "text",
      purpose: "TikTok announcement hook",
    },
    {
      id: "li_announce",
      platform: "linkedin",
      modality: "text",
      purpose: "LinkedIn professional announcement",
    },
  ],
  tourdatespack: [
    {
      id: "fb_tour",
      platform: "facebook",
      modality: "text",
      purpose: "Facebook tour dates post",
    },
    {
      id: "ig_tour",
      platform: "instagram",
      modality: "text",
      purpose: "Instagram tour caption",
    },
    {
      id: "tiktok_tour",
      platform: "tiktok",
      modality: "text",
      purpose: "TikTok tour announcement hook",
    },
    {
      id: "gb_tour",
      platform: "google_business",
      modality: "text",
      purpose: "Google Business tour event post",
    },
    {
      id: "tour_graphic",
      platform: "instagram",
      modality: "image",
      purpose: "Tour dates graphic",
    },
  ],
  evergreenbrandpack: [
    {
      id: "fb_brand",
      platform: "facebook",
      modality: "text",
      purpose: "Brand story Facebook post",
    },
    {
      id: "ig_brand",
      platform: "instagram",
      modality: "text",
      purpose: "Brand voice Instagram caption",
    },
    {
      id: "li_brand",
      platform: "linkedin",
      modality: "text",
      purpose: "LinkedIn brand authority post",
    },
    {
      id: "gb_brand",
      platform: "google_business",
      modality: "text",
      purpose: "Google Business about post",
    },
    {
      id: "brand_image",
      platform: "instagram",
      modality: "image",
      purpose: "Brand visual asset",
    },
  ],
};

export interface GenerationRequest {
  id: string;
  userId: string;
  artistProfileId?: string;

  input: {
    modality: InputModality;
    payload: string;
    metadata?: Record<string, any>;
  };

  platforms: Platform[];
  packId?: PackId;
  intent?: string;

  constraints?: {
    length?: "short" | "medium" | "long";
    styleTags?: string[];
    language?: string;
    tone?: string;
    // Self-Evolution content-shaping knobs (see advancedSocialAIService's
    // applyHashtagStrategyPure / applyCaptionLengthPure / applyCtaStrengthPure).
    hashtagStrategy?: "trending" | "niche" | "branded" | "balanced";
    captionLength?: "short" | "optimal" | "long";
    callToActionStrength?: "low" | "medium" | "high";
  };
}

export interface GeneratedAsset {
  id: string;
  modality: OutputModality;
  payload: string;
  platform?: Platform;
  slotId?: string;
  purpose?: string;
  metadata?: Record<string, any>;
}

export interface TaskStep {
  id: string;
  type: "analyze" | "generate";
  worker: "text" | "image" | "audio" | "video";
  inputFrom: "normalizedInput" | string[];
  params?: Record<string, any>;
}

export interface TaskPlan {
  requestId: string;
  steps: TaskStep[];
}

export interface MultimodalPackage {
  requestId: string;
  assets: GeneratedAsset[];
  plan: TaskPlan;
  generatedAt: string;
}
