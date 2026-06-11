/**
 * Platform Formatters
 *
 * Defines per-platform constraints, format rules, and content specs for every
 * supported social media platform in Max Booster. All limits, aspect ratios,
 * and slot definitions are sourced from current platform developer documentation.
 *
 * Platforms: TikTok, Instagram, YouTube, Twitter/X, Facebook, Threads, LinkedIn, Google Business
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupportedPlatform =
  | "tiktok"
  | "instagram"
  | "youtube"
  | "twitter"
  | "facebook"
  | "threads"
  | "linkedin"
  | "google_business";

export type ContentSlot =
  | "short_video" // ≤60s vertical video (TikTok, Reels, Shorts)
  | "long_video" // >60s horizontal video (YouTube)
  | "static_post" // Single image + caption
  | "carousel" // Multi-image swipe post
  | "story" // 15s ephemeral vertical
  | "text_post" // Text-only post (Twitter, Threads, LinkedIn)
  | "thread" // Multi-part text sequence
  | "google_post" // Google Business Profile post
  | "ad_banner" // Paid ad creative
  | "ad_video"; // Paid video ad

export interface PlatformSpec {
  platform: SupportedPlatform;
  displayName: string;
  captionMaxChars: number;
  hashtagMaxCount: number;
  hashtagPosition: "inline" | "end" | "first_comment";
  videoAspectRatios: string[];
  videoMaxDurationSeconds: number;
  videoMinDurationSeconds: number;
  imageAspectRatios: string[];
  supportedSlots: ContentSlot[];
  emojiSupported: boolean;
  linksInCaption: boolean;
  mentionFormat: string; // e?.g. "@username"
  hashtagFormat: string; // e?.g. "#tag"
  bestPostingDays: string[];
  bestPostingHours: number[]; // UTC hours
  contentNotes: string[];
  adFormats: string[];
}

export interface FormattedContent {
  platform: SupportedPlatform;
  slot: ContentSlot;
  caption: string;
  hashtags: string[];
  hook: string;
  cta: string;
  visualSpec: VisualSpec;
  adCopy?: AdCopy;
  schedulingHint: SchedulingHint;
}

export interface VisualSpec {
  aspectRatio: string;
  durationSeconds?: number;
  overlayText?: string;
  thumbnailText?: string;
  backgroundStyle: string;
  colorPalette: string[];
  fontStyle: string;
  logoPlacement:
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "none";
}

export interface AdCopy {
  headline: string;
  body: string;
  cta: string;
  disclaimer?: string;
}

export interface SchedulingHint {
  preferredDays: string[];
  preferredUTCHours: number[];
  frequencyPerWeek: number;
  notes: string;
}

// ─── Platform Specifications ──────────────────────────────────────────────────

export const PLATFORM_SPECS: Record<SupportedPlatform, PlatformSpec> = {
  tiktok: {
    platform: "tiktok",
    displayName: "TikTok",
    captionMaxChars: 2200,
    hashtagMaxCount: 30,
    hashtagPosition: "end",
    videoAspectRatios: ["9:16", "1:1", "16:9"],
    videoMaxDurationSeconds: 600,
    videoMinDurationSeconds: 1,
    imageAspectRatios: ["9:16", "1:1"],
    supportedSlots: ["short_video", "ad_video", "ad_banner"],
    emojiSupported: true,
    linksInCaption: false,
    mentionFormat: "@username",
    hashtagFormat: "#tag",
    bestPostingDays: ["Tuesday", "Thursday", "Friday"],
    bestPostingHours: [9, 12, 19, 21],
    contentNotes: [
      "Hook must appear in first 1–3 seconds",
      "Trending audio dramatically boosts distribution",
      "Use #FYP and #ForYou sparingly — 1 max per post",
      "Text overlays keep eyes on screen → higher completion rate",
      "Captions display only first 3 lines — put CTA in line 1 or 2",
    ],
    adFormats: ["TopView", "In-Feed Ad", "Spark Ad", "Brand Takeover"],
  },

  instagram: {
    platform: "instagram",
    displayName: "Instagram",
    captionMaxChars: 2200,
    hashtagMaxCount: 30,
    hashtagPosition: "end",
    videoAspectRatios: ["9:16", "4:5", "1:1", "16:9"],
    videoMaxDurationSeconds: 90,
    videoMinDurationSeconds: 3,
    imageAspectRatios: ["1:1", "4:5", "1.91:1"],
    supportedSlots: [
      "short_video",
      "static_post",
      "carousel",
      "story",
      "ad_video",
      "ad_banner",
    ],
    emojiSupported: true,
    linksInCaption: false,
    mentionFormat: "@username",
    hashtagFormat: "#tag",
    bestPostingDays: ["Monday", "Wednesday", "Friday"],
    bestPostingHours: [8, 11, 15, 19],
    contentNotes: [
      "Caption limit 2,200 chars — first 125 chars are above the fold",
      "Reels get 3× organic reach vs static posts",
      "Carousels get 2× engagement vs single images",
      "Stories: 15s per frame, max 100 frames",
      "Hashtags in first comment avoid visual clutter",
    ],
    adFormats: [
      "Photo Ad",
      "Video Ad",
      "Carousel Ad",
      "Stories Ad",
      "Reels Ad",
    ],
  },

  youtube: {
    platform: "youtube",
    displayName: "YouTube",
    captionMaxChars: 5000,
    hashtagMaxCount: 15,
    hashtagPosition: "end",
    videoAspectRatios: ["16:9", "9:16"],
    videoMaxDurationSeconds: 43200,
    videoMinDurationSeconds: 1,
    imageAspectRatios: ["16:9"],
    supportedSlots: ["long_video", "short_video", "ad_video"],
    emojiSupported: true,
    linksInCaption: true,
    mentionFormat: "@username",
    hashtagFormat: "#tag",
    bestPostingDays: ["Thursday", "Friday", "Saturday"],
    bestPostingHours: [14, 17, 20],
    contentNotes: [
      "Title: 60 chars max for full display in search",
      "Thumbnail text: ≤5 words, large font, high contrast",
      "First 24 hours velocity determines long-term ranking",
      "Shorts (≤60s) are served in a separate algorithm feed",
      "Chapter timestamps in description improve watch time",
    ],
    adFormats: [
      "Skippable In-stream",
      "Non-skippable In-stream",
      "Bumper Ad",
      "Discovery Ad",
    ],
  },

  twitter: {
    platform: "twitter",
    displayName: "X (Twitter)",
    captionMaxChars: 280,
    hashtagMaxCount: 2,
    hashtagPosition: "inline",
    videoAspectRatios: ["16:9", "1:1", "9:16"],
    videoMaxDurationSeconds: 140,
    videoMinDurationSeconds: 1,
    imageAspectRatios: ["16:9", "1:1"],
    supportedSlots: [
      "text_post",
      "thread",
      "static_post",
      "short_video",
      "ad_video",
      "ad_banner",
    ],
    emojiSupported: true,
    linksInCaption: true,
    mentionFormat: "@username",
    hashtagFormat: "#tag",
    bestPostingDays: ["Wednesday", "Thursday", "Friday"],
    bestPostingHours: [9, 12, 15, 18],
    contentNotes: [
      "280 char hard limit — URLs count as 23 chars",
      "Max 2 hashtags for organic reach (more hurts)",
      "Threads: up to 25 connected tweets",
      "Alt text on images improves accessibility and indexing",
      "Polls and questions drive the highest reply rates",
    ],
    adFormats: [
      "Promoted Tweet",
      "Promoted Trend",
      "Promoted Account",
      "Twitter Amplify",
    ],
  },

  facebook: {
    platform: "facebook",
    displayName: "Facebook",
    captionMaxChars: 63206,
    hashtagMaxCount: 10,
    hashtagPosition: "end",
    videoAspectRatios: ["16:9", "9:16", "1:1", "4:5"],
    videoMaxDurationSeconds: 14400,
    videoMinDurationSeconds: 1,
    imageAspectRatios: ["1:1", "16:9", "4:5"],
    supportedSlots: [
      "static_post",
      "long_video",
      "short_video",
      "carousel",
      "ad_video",
      "ad_banner",
    ],
    emojiSupported: true,
    linksInCaption: true,
    mentionFormat: "@Page Name",
    hashtagFormat: "#tag",
    bestPostingDays: ["Wednesday", "Thursday", "Friday"],
    bestPostingHours: [9, 13, 15],
    contentNotes: [
      "Organic reach is low — groups and events outperform pages",
      "Video watch time past 3 seconds triggers algorithm boost",
      "Facebook Stories shown to 70% of followers (vs 5% feed)",
      "Ad text: <20% of image area for full distribution",
    ],
    adFormats: [
      "Image Ad",
      "Video Ad",
      "Carousel Ad",
      "Collection Ad",
      "Instant Experience",
    ],
  },

  threads: {
    platform: "threads",
    displayName: "Threads",
    captionMaxChars: 500,
    hashtagMaxCount: 5,
    hashtagPosition: "end",
    videoAspectRatios: ["9:16", "1:1"],
    videoMaxDurationSeconds: 300,
    videoMinDurationSeconds: 1,
    imageAspectRatios: ["1:1", "4:5"],
    supportedSlots: ["text_post", "static_post", "short_video"],
    emojiSupported: true,
    linksInCaption: false,
    mentionFormat: "@username",
    hashtagFormat: "#tag",
    bestPostingDays: ["Tuesday", "Wednesday", "Friday"],
    bestPostingHours: [8, 12, 19],
    contentNotes: [
      "500 char limit — concise, punchy posts outperform essays",
      "Replies and conversations drive discovery",
      "Cross-posting from Instagram Reels auto-syncs",
      "Hashtags have limited algorithmic weight vs Twitter",
    ],
    adFormats: [],
  },

  linkedin: {
    platform: "linkedin",
    displayName: "LinkedIn",
    captionMaxChars: 3000,
    hashtagMaxCount: 5,
    hashtagPosition: "end",
    videoAspectRatios: ["16:9", "1:1", "9:16"],
    videoMaxDurationSeconds: 600,
    videoMinDurationSeconds: 3,
    imageAspectRatios: ["1.91:1", "1:1"],
    supportedSlots: [
      "text_post",
      "static_post",
      "long_video",
      "carousel",
      "ad_video",
      "ad_banner",
    ],
    emojiSupported: true,
    linksInCaption: true,
    mentionFormat: "@Name",
    hashtagFormat: "#tag",
    bestPostingDays: ["Tuesday", "Wednesday", "Thursday"],
    bestPostingHours: [8, 10, 12, 17],
    contentNotes: [
      "Professional tone — but authentic personal stories outperform corporate copy",
      "Documents (PDF carousels) get 3× the impressions of standard posts",
      "First 3 lines are above the fold — lead with the insight",
      "Video native upload outperforms YouTube links 5×",
    ],
    adFormats: ["Sponsored Content", "Message Ad", "Dynamic Ad", "Text Ad"],
  },

  google_business: {
    platform: "google_business",
    displayName: "Google Business",
    captionMaxChars: 1500,
    hashtagMaxCount: 0,
    hashtagPosition: "end",
    videoAspectRatios: ["16:9", "1:1"],
    videoMaxDurationSeconds: 30,
    videoMinDurationSeconds: 1,
    imageAspectRatios: ["4:3", "1:1", "16:9"],
    supportedSlots: ["google_post", "static_post", "ad_banner"],
    emojiSupported: true,
    linksInCaption: true,
    mentionFormat: "",
    hashtagFormat: "",
    bestPostingDays: ["Tuesday", "Wednesday", "Thursday"],
    bestPostingHours: [9, 11, 14],
    contentNotes: [
      "Posts expire after 7 days (standard) or 6 months (Events/Offers)",
      "CTA button types: Book, Order, Learn more, Sign up, Get offer, Call now",
      "Photos minimum 250×250px; recommended 1200×900px (4:3)",
      "Keyword-rich descriptions improve Local SEO ranking",
      "Event and Offer post types get higher visibility than standard updates",
    ],
    adFormats: [
      "Local Services Ad",
      "Smart Campaign",
      "Performance Max",
      "Display Ad",
    ],
  },
};

// ─── Formatter Functions ──────────────────────────────────────────────────────

/**
 * Enforces platform caption limits. Truncates at word boundary and appends
 * an ellipsis if the raw text exceeds the platform maximum.
 */
export function enforceCharLimit(
  text: string,
  platform: SupportedPlatform,
): string {
  const _spec = PLATFORM_SPECS[platform];
  if (spec?.captionMaxChars === 0) return "";
  if (text?.length <= spec?.captionMaxChars) return text;
  const _truncated = text?.slice(0, spec?.captionMaxChars - 3);
  const _lastSpace = truncated?.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated?.slice(0, lastSpace) : truncated) + "...";
}

/**
 * Enforces hashtag count limits and ensures correct format for each platform.
 */
export function enforceHashtagLimit(
  hashtags: string[],
  platform: SupportedPlatform,
): string[] {
  const _spec = PLATFORM_SPECS[platform];
  const _capped = hashtags?.slice(0, spec?.hashtagMaxCount);
  return capped?.map((tag) => {
    const _clean = tag?.replace(/^#+/, "").trim();
    return `${spec?.hashtagFormat.replace("tag", clean)}`;
  });
}

/**
 * Assembles a final caption string obeying platform rules for hashtag placement.
 */
export function assembleCaption(
  body: string,
  hashtags: string[],
  platform: SupportedPlatform,
): { caption: string; firstComment?: string } {
  const _spec = PLATFORM_SPECS[platform];
  const _limitedTags = enforceHashtagLimit(hashtags, platform);
  const _tagString = limitedTags?.join(" ");

  if (spec?.hashtagPosition === "first_comment") {
    return {
      caption: enforceCharLimit(body, platform),
      firstComment: tagString,
    };
  }

  const _combined =
    spec?.hashtagPosition === "end" ? `${body}\n\n${tagString}` : body;

  return { caption: enforceCharLimit(combined, platform) };
}

/**
 * Returns the best visual spec for a given platform and slot combination.
 */
export function getVisualSpec(
  platform: SupportedPlatform,
  slot: ContentSlot,
  colorPalette: string[] = ["#1a1a2e", "#16213e", "#0f3460", "#e94560"],
): VisualSpec {
  const _spec = PLATFORM_SPECS[platform];

  const _isVertical =
    ["tiktok", "instagram", "threads"].includes(platform) ||
    slot === "story" ||
    slot === "short_video";

  return {
    aspectRatio: isVertical ? "9:16" : spec?.imageAspectRatios[0],
    durationSeconds:
      slot === "short_video" ? 30 : slot === "story" ? 15 : undefined,
    overlayText: undefined,
    thumbnailText: undefined,
    backgroundStyle: "gradient",
    colorPalette,
    fontStyle: "bold-sans",
    logoPlacement: "bottom-right",
  };
}

/**
 * Returns all platforms that support a given content slot.
 */
export function platformsForSlot(slot: ContentSlot): SupportedPlatform[] {
  return (Object?.keys(PLATFORM_SPECS) as SupportedPlatform[]).filter((p) =>
    PLATFORM_SPECS[p].supportedSlots?.includes(slot),
  );
}

export const ALL_PLATFORMS: SupportedPlatform[] = Object?.keys(
  PLATFORM_SPECS,
) as SupportedPlatform[];
