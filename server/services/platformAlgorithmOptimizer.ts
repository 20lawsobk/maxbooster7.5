/**
 * Platform Algorithm Optimizer
 *
 * Each social platform's ranking algorithm rewards fundamentally different
 * engagement signals.  This service encodes that knowledge so the autopilot
 * engineers content to trigger the exact signals each platform's algorithm
 * values most — turning the algorithm from an obstacle into an amplifier.
 *
 * ── Why each platform ranks differently ──────────────────────────────────────
 *
 *  Twitter/X  — Follow-based, chronological-leaning feed.
 *               Reply VELOCITY in the first 30 min determines amplification.
 *               Content that provokes a reaction (question, hot take, debate)
 *               gets pushed.  External links are penalised.
 *
 *  Instagram  — Mixed algo + follow.  SAVES are the #1 weighted signal —
 *               they tell the algorithm "this content was worth keeping."
 *               Shares to DMs are second.  Reels get 3-5x organic reach
 *               over static posts.  Comments > 4 words signal quality.
 *
 *  TikTok     — For You Page exposes content to complete strangers.
 *               WATCH COMPLETION RATE is king.  Rewatches are heavily
 *               weighted.  First 2-3 seconds determine whether the algo
 *               serves the video to a wider audience.  Loop structure
 *               drives rewatches.
 *
 *  LinkedIn   — Professional network.  DWELL TIME (cursor hover duration)
 *               is the primary signal.  Long-form content broken into short
 *               paragraphs maximises it.  External links in post body are
 *               penalised — put them in the first comment.  Comments in
 *               first hour are heavily weighted.
 *
 *  Facebook   — Heavily pay-to-play for pages.  EMOTIONAL REACTIONS
 *               (Love, Care, Wow) outweigh standard likes.  Story-driven
 *               content and "tag someone" hooks drive organic reach.
 *               Native video is strongly prioritised over link posts.
 *
 *  Threads    — Relatively new algo still maturing.  REPLIES drive
 *               distribution.  Conversational, question-based posts
 *               outperform promotional ones.
 *
 *  YouTube    — CTR × WATCH TIME determines ranking.  Thumbnail + title
 *               must earn the click AND hold attention.  Watch percentage
 *               matters more than total views.  End screens and cards
 *               extend session time, which the algo rewards.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { logger } from "../logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlgorithmDirectives {
  platform: string;
  primarySignal: string;
  hookRequirement: string;
  contentStructure: string;
  ctaStyle: string;
  avoidPatterns: string[];
  boostPatterns: string[];
  idealLength: { min: number; max: number };
  specialRules: string[];
}

export interface AlgorithmAlignmentScore {
  score: number; // 0–100
  primarySignal: number; // how well it targets the #1 algo lever
  hookStrength: number; // hook optimised for this platform
  ctaAlignment: number; // CTA drives the right engagement type
  structureScore: number; // content structure fits the platform
  penalties: string[]; // what's hurting the score
  boosts: string[]; // what's helping the score
}

// ─── Algorithm Directives per Platform ───────────────────────────────────────

const ALGORITHM_DIRECTIVES: Record<string, AlgorithmDirectives> = {
  twitter: {
    platform: "twitter",
    primarySignal: "reply_velocity",
    hookRequirement:
      'Open with a strong take, question, or "Unpopular opinion:" to trigger immediate replies. First tweet must work as a standalone statement.',
    contentStructure:
      "Single punchy statement or thread-teaser. Under 240 characters ideally. No external links in the tweet body.",
    ctaStyle:
      'Ask for a reply — "What do you think?", "Agree or disagree?", "Drop your take below."',
    avoidPatterns: [
      "external links in body",
      "promotional language",
      "hashtag spam",
      'generic CTAs like "follow me"',
    ],
    boostPatterns: [
      "question at the end",
      "controversial but fair statement",
      "industry hot take",
      "relatable frustration",
      'thread hook ("🧵")',
    ],
    idealLength: { min: 100, max: 240 },
    specialRules: [
      "Put any links in a reply to your own tweet, not the main post",
      "Post when your audience is most active — reply velocity in first 30 min is critical",
      "Engagement in first 30 minutes determines whether the algo amplifies the tweet",
    ],
  },

  x: {
    platform: "x",
    primarySignal: "reply_velocity",
    hookRequirement:
      'Open with a strong take, question, or "Unpopular opinion:" to trigger immediate replies.',
    contentStructure:
      "Single punchy statement or thread-teaser. Under 240 characters ideally.",
    ctaStyle: 'Ask for a reply — "What do you think?", "Agree or disagree?"',
    avoidPatterns: [
      "external links in body",
      "promotional language",
      "hashtag spam",
    ],
    boostPatterns: [
      "question at the end",
      "controversial but fair statement",
      "hot take",
      "relatable frustration",
    ],
    idealLength: { min: 100, max: 240 },
    specialRules: [
      "Put any links in a reply to your own tweet",
      "Reply velocity in first 30 min determines amplification",
    ],
  },

  instagram: {
    platform: "instagram",
    primarySignal: "saves",
    hookRequirement:
      'Open with the value proposition immediately — something worth saving. "Save this for later" or lead with the payoff, not the build-up.',
    contentStructure:
      'List or step-by-step format drives saves (reference content). 3–7 clear points. Medium length caption. Strong first line visible without tapping "more".',
    ctaStyle:
      'Explicitly ask for saves: "Save this post", "Bookmark this for later", "Come back to this when you\'re ready to release."',
    avoidPatterns: [
      "burying the value",
      "long preamble before the point",
      'generic "follow me" CTAs',
      "more than 15 hashtags",
    ],
    boostPatterns: [
      "save-triggering hook",
      "educational list format",
      "step-by-step breakdown",
      "share-to-DM prompt",
      "Reels format",
    ],
    idealLength: { min: 300, max: 1200 },
    specialRules: [
      "Saves outweigh likes by a significant margin in the algo",
      "Shares to DMs are the second-highest signal",
      "Reels get 3–5x the organic reach of static posts",
      "Comments longer than 4 words are weighted higher than short reactions",
    ],
  },

  tiktok: {
    platform: "tiktok",
    primarySignal: "watch_completion",
    hookRequirement:
      "Pattern interrupt in the FIRST 3 WORDS. Start with a shock, a strong claim, a question, or a visual disruption. The algorithm decides in 2–3 seconds whether to push the video.",
    contentStructure:
      "Loop structure — end where you began so viewers rewatch. POV format. Before/after reveal. Curiosity gap that pays off at the end. Short caption; the video is the content.",
    ctaStyle:
      'Drive rewatches and duets: "Watch again if you missed it", "Duet this with your reaction", "Follow for part 2."',
    avoidPatterns: [
      "slow buildup",
      "long intro without a hook",
      "mentioning competitors",
      "low-energy opening",
    ],
    boostPatterns: [
      "pattern interrupt in first 3 words",
      "curiosity gap",
      "POV:",
      "loop structure",
      "before/after",
      "trending audio reference",
      "rewatch bait ending",
    ],
    idealLength: { min: 50, max: 300 },
    specialRules: [
      "Watch completion rate is the #1 ranking signal",
      "Rewatches are the #2 signal — loop structure drives them",
      "First 2–3 seconds determine whether the algo serves this to a wider audience",
      "The FYP exposes content to strangers — hook must work with zero prior knowledge of you",
    ],
  },

  linkedin: {
    platform: "linkedin",
    primarySignal: "dwell_time",
    hookRequirement:
      'The first line must stop the scroll — it\'s the only thing visible before "see more". Make it a bold statement, a surprising fact, or a personal revelation. One sentence, maximum impact.',
    contentStructure:
      "Long-form narrative broken into 1–2 sentence paragraphs (readability = dwell time). Personal story → insight → professional lesson. 800–1500 characters optimal.",
    ctaStyle:
      'End with a direct professional question: "What\'s been your experience with this?", "How are you handling this in your career?"',
    avoidPatterns: [
      "external links in post body",
      "promotional tone",
      "hashtag overuse",
      "generic motivational quotes",
      "self-promotion without value",
    ],
    boostPatterns: [
      "first line as a standalone hook",
      "personal story",
      "professional lesson",
      "industry insight",
      "short paragraphs",
      "direct question at end",
      "document/carousel format",
    ],
    idealLength: { min: 800, max: 1800 },
    specialRules: [
      "Dwell time (how long cursor hovers on post) is the primary ranking signal",
      "External links in post body are algorithmically penalised — put them in the first comment",
      "Comments in the first hour after posting are heavily weighted",
      "Document/carousel posts currently get highest organic reach",
    ],
  },

  facebook: {
    platform: "facebook",
    primarySignal: "emotional_reactions",
    hookRequirement:
      "Lead with emotion — a personal story opening, a relatable frustration, or an uplifting moment. The algorithm weights Love, Care and Wow reactions significantly above standard likes.",
    contentStructure:
      'Story-driven narrative. Personal, not corporate. "Tag someone who needs to see this" hooks drive reach. Native video heavily prioritised.',
    ctaStyle:
      '"Tag a friend who needs this", "Share if this resonates", "Drop a ❤️ if you agree."',
    avoidPatterns: [
      "external links (heavily penalised)",
      "overly promotional language",
      'generic "like and share"',
      "plain text posts without story",
    ],
    boostPatterns: [
      "personal story opening",
      "emotional hook",
      "tag-a-friend CTA",
      "native video",
      "community framing",
      "nostalgia triggers",
    ],
    idealLength: { min: 200, max: 800 },
    specialRules: [
      "Love/Care/Wow reactions outweigh standard likes in the ranking algorithm",
      "Native video gets far more reach than link posts or static images",
      '"Tag someone" CTAs are one of the highest-performing reach drivers',
      "External links are penalised — if you must link, put it in the comments",
    ],
  },

  threads: {
    platform: "threads",
    primarySignal: "replies",
    hookRequirement:
      "Conversational opener — not promotional. Ask a question or share a genuine observation that invites a response. Threads rewards dialogue, not broadcasting.",
    contentStructure:
      "Short and punchy. One clear point per post. Dialogue-inviting. Max 2–3 short paragraphs.",
    ctaStyle:
      '"What\'s your take?", "Has anyone else noticed this?", "Reply with yours."',
    avoidPatterns: [
      "promotional tone",
      "long posts",
      "hashtag overuse",
      "one-directional broadcasting",
    ],
    boostPatterns: [
      "genuine question",
      "conversational tone",
      "short punchy take",
      "community-building language",
      "invite dialogue",
    ],
    idealLength: { min: 80, max: 400 },
    specialRules: [
      "Algorithm is still maturing — replies are currently the primary signal",
      "Conversational and authentic beats polished and promotional",
      "Cross-posting from Instagram often feels off — native tone performs better",
    ],
  },

  youtube: {
    platform: "youtube",
    primarySignal: "ctr_x_watch_time",
    hookRequirement:
      "The first 30 seconds must deliver on the exact promise made in the thumbnail and title. State what they're about to learn or see immediately — don't bury the lead.",
    contentStructure:
      "Hook (0–30s) → Problem/context → Tease the solution → Deliver value → CTA. Chapters and timestamps boost session time.",
    ctaStyle:
      '"Subscribe for part 2", "Watch this next [link in description]", "Comment your biggest takeaway."',
    avoidPatterns: [
      "slow intros",
      "long preamble before delivering value",
      "clickbait that doesn't pay off",
      "asking for likes before delivering value",
    ],
    boostPatterns: [
      "promise delivered immediately",
      "strong pattern interrupt in first 10s",
      "chapter markers",
      "end screen CTA",
      "community post tie-in",
      "thumbnail-title synergy",
    ],
    idealLength: { min: 500, max: 2000 },
    specialRules: [
      "CTR × watch time percentage is the primary ranking formula",
      "A high-CTR thumbnail with low watch time gets penalised — both must work together",
      "Watch percentage matters more than total views",
      "End screens that link to another video extend session time — algo rewards this",
    ],
  },
};

// ─── Score: how well does content target the platform's algorithm? ─────────────

const _SAVE_TRIGGERS =
  /save (this|for later)|bookmark|come back to|reference|keep this|screenshot this/i;
const _REPLY_TRIGGERS =
  /what do you think|agree or disagree|drop (your|a)|what'?s your (take|opinion|experience)|comment below|reply with/i;
const _REWATCH_TRIGGERS =
  /watch again|rewatch|loop|duet|part 2|follow for more/i;
const _EMOTIONAL_HOOKS =
  /story|felt|cried|changed (my|everything)|real talk|honest(ly)?|vulnerable|confession/i;
const _THREAD_INVITE =
  /what'?s your (experience|take|story)|has anyone (else|ever)|anyone else notice/i;
const _HOOK_OPENERS =
  /^(unpopular opinion|hot take|pov:|story time|plot twist|nobody talks about|this changed|truth:|real talk:|confession:|fun fact:|did you know)/i;
const _CURIOSITY_GAP =
  /\.\.\.|here'?s why|and it'?s not what you think|but here'?s the thing|the secret|nobody tells you/i;
const _LIST_STRUCTURE = /(\d+\s+(ways|tips|things|steps|reasons)|• |→ |- )/i;
const _DWELL_STRUCTURE = /\n\n|\n/g; // line breaks signal readable structure

export class PlatformAlgorithmOptimizer {
  getDirectives(platform: string): AlgorithmDirectives {
    const _key = platform?.toLowerCase().replace(/[^a-z]/g, "");
    return ALGORITHM_DIRECTIVES[key] ?? ALGORITHM_DIRECTIVES?.instagram;
  }

  /**
   * Score content specifically against the platform's algorithm signals (0–100).
   * This is separate from Veo quality — content can be beautifully written but
   * still fail to trigger the right algorithmic lever for a given platform.
   */
  scoreAlgorithmAlignment(
    content: string,
    headline: string,
    cta: string,
    platform: string,
  ): AlgorithmAlignmentScore {
    const _key = platform?.toLowerCase().replace(/[^a-z]/g, "");
    const _full = `${headline}\n\n${content}\n\n${cta}`;

    switch (key) {
      case "twitter":
      case "x":
        return this?.scoreTwitter(full, headline, cta, content);
      case "instagram":
        return this?.scoreInstagram(full, headline, cta, content);
      case "tiktok":
        return this?.scoreTikTok(full, headline, cta, content);
      case "linkedin":
        return this?.scoreLinkedIn(full, headline, cta, content);
      case "facebook":
        return this?.scoreFacebook(full, headline, cta, content);
      case "threads":
        return this?.scoreThreads(full, headline, cta, content);
      case "youtube":
        return this?.scoreYouTube(full, headline, cta, content);
      default:
        return this?.scoreInstagram(full, headline, cta, content);
    }
  }

  // ── Per-platform scorers ────────────────────────────────────────────────────

  private scoreTwitter(
    full: string,
    headline: string,
    cta: string,
    content: string,
  ): AlgorithmAlignmentScore {
    const penalties: string[] = [];
    const boosts: string[] = [];
    let primarySignal = 50;
    let hookStrength = 50;
    let ctaAlignment = 50;
    let structureScore = 50;

    // Primary signal: reply velocity — does it demand a response?
    if (REPLY_TRIGGERS?.test(full)) {
      primarySignal += 25;
      boosts?.push("reply-triggering language");
    }
    if (HOOK_OPENERS?.test(headline)) {
      primarySignal += 15;
      boosts?.push("strong opinionated hook");
    }
    if (/\?/.test(headline)) {
      primarySignal += 10;
      boosts?.push("question in hook");
    }
    if (/http|www\./i?.test(content)) {
      primarySignal -= 20;
      penalties?.push("external link penalises reply velocity");
    }

    // Hook: punchy opening
    if (headline?.length <= 100) {
      hookStrength += 15;
      boosts?.push("concise hook");
    }
    if (headline?.length > 240) {
      hookStrength -= 20;
      penalties?.push("hook too long for Twitter");
    }
    if (HOOK_OPENERS?.test(headline)) {
      hookStrength += 20;
      boosts?.push("platform-native hook pattern");
    }

    // CTA: drives replies
    if (REPLY_TRIGGERS?.test(cta)) {
      ctaAlignment += 30;
      boosts?.push("reply-driving CTA");
    }
    if (/follow|subscribe/i?.test(cta)) {
      ctaAlignment -= 10;
      penalties?.push("follow CTA does not drive reply velocity");
    }

    // Structure: short and punchy
    const _len = full?.length;
    if (len <= 240) {
      structureScore += 20;
      boosts?.push("optimal tweet length");
    } else if (len > 280) {
      structureScore -= 15;
      penalties?.push("exceeds tweet character limit");
    }
    if (/🧵|thread/i?.test(full)) {
      structureScore += 10;
      boosts?.push("thread signal");
    }

    return this?.buildScore({
      primarySignal,
      hookStrength,
      ctaAlignment,
      structureScore,
      penalties,
      boosts,
    });
  }

  private scoreInstagram(
    full: string,
    headline: string,
    cta: string,
    content: string,
  ): AlgorithmAlignmentScore {
    const penalties: string[] = [];
    const boosts: string[] = [];
    let primarySignal = 50;
    let hookStrength = 50;
    let ctaAlignment = 50;
    let structureScore = 50;

    // Primary signal: saves — does it earn a bookmark?
    if (SAVE_TRIGGERS?.test(full)) {
      primarySignal += 30;
      boosts?.push("save-triggering language");
    }
    if (LIST_STRUCTURE?.test(content)) {
      primarySignal += 20;
      boosts?.push("list/step structure drives saves");
    }
    if (/how to|tips|guide|breakdown|step/i?.test(full)) {
      primarySignal += 10;
      boosts?.push("educational content drives saves");
    }

    // Hook: value-first opener
    if (headline?.length <= 120) {
      hookStrength += 10;
      boosts?.push("concise hook");
    }
    if (SAVE_TRIGGERS?.test(headline)) {
      hookStrength += 20;
      boosts?.push("save-hook in opening");
    }
    if (/\?/.test(headline)) {
      hookStrength += 10;
      boosts?.push("question hook");
    }

    // CTA: explicitly drives saves or DM shares
    if (SAVE_TRIGGERS?.test(cta)) {
      ctaAlignment += 35;
      boosts?.push("explicit save CTA");
    }
    if (/dm|share|send this/i?.test(cta)) {
      ctaAlignment += 15;
      boosts?.push("DM/share CTA");
    }
    if (/follow me/i?.test(cta)) {
      ctaAlignment -= 10;
      penalties?.push("generic follow CTA doesn't drive saves");
    }

    // Structure: readable, medium length
    const _len = content?.length;
    if (len >= 300 && len <= 1200) {
      structureScore += 20;
      boosts?.push("optimal caption length");
    }
    if (len < 100) {
      structureScore -= 15;
      penalties?.push("caption too short — no save value");
    }
    if ((content?.match(DWELL_STRUCTURE) || []).length >= 3) {
      structureScore += 10;
      boosts?.push("readable paragraph breaks");
    }

    return this?.buildScore({
      primarySignal,
      hookStrength,
      ctaAlignment,
      structureScore,
      penalties,
      boosts,
    });
  }

  private scoreTikTok(
    full: string,
    headline: string,
    cta: string,
    content: string,
  ): AlgorithmAlignmentScore {
    const penalties: string[] = [];
    const boosts: string[] = [];
    let primarySignal = 50;
    let hookStrength = 50;
    let ctaAlignment = 50;
    let structureScore = 50;

    // Primary signal: watch completion — does it hook in 3 words and loop?
    const _firstWords = headline?.split(" ").slice(0, 5).join(" ");
    if (HOOK_OPENERS?.test(firstWords)) {
      primarySignal += 25;
      boosts?.push("pattern interrupt in first words");
    }
    if (REWATCH_TRIGGERS?.test(full)) {
      primarySignal += 20;
      boosts?.push("rewatch/loop trigger");
    }
    if (CURIOSITY_GAP?.test(full)) {
      primarySignal += 15;
      boosts?.push("curiosity gap drives completion");
    }
    if (/pov:|this changed|nobody tells/i?.test(headline)) {
      primarySignal += 10;
      boosts?.push("viral TikTok hook format");
    }

    // Hook: strong opening
    if (headline?.length <= 60) {
      hookStrength += 20;
      boosts?.push("short sharp TikTok hook");
    }
    if (HOOK_OPENERS?.test(headline)) {
      hookStrength += 20;
      boosts?.push("platform-native hook");
    }
    if (/slow|anyway|so today|hi guys/i?.test(headline)) {
      hookStrength -= 20;
      penalties?.push("slow opening kills watch completion");
    }

    // CTA: drives rewatches and duets
    if (REWATCH_TRIGGERS?.test(cta)) {
      ctaAlignment += 30;
      boosts?.push("rewatch-driving CTA");
    }
    if (/duet|stitch/i?.test(cta)) {
      ctaAlignment += 15;
      boosts?.push("duet CTA drives UGC");
    }
    if (/follow/i?.test(cta) && !REWATCH_TRIGGERS?.test(cta)) {
      ctaAlignment -= 5;
      penalties?.push("follow CTA alone doesn't boost watch completion");
    }

    // Structure: short caption, loop ending
    const _len = content?.length;
    if (len <= 200) {
      structureScore += 20;
      boosts?.push("short caption — video is the content");
    }
    if (len > 500) {
      structureScore -= 10;
      penalties?.push("long caption competes with the video");
    }

    return this?.buildScore({
      primarySignal,
      hookStrength,
      ctaAlignment,
      structureScore,
      penalties,
      boosts,
    });
  }

  private scoreLinkedIn(
    full: string,
    headline: string,
    cta: string,
    content: string,
  ): AlgorithmAlignmentScore {
    const penalties: string[] = [];
    const boosts: string[] = [];
    let primarySignal = 50;
    let hookStrength = 50;
    let ctaAlignment = 50;
    let structureScore = 50;

    // Primary signal: dwell time — does it earn a long read?
    const _lineBreaks = (content?.match(/\n/g) || []).length;
    if (lineBreaks >= 5) {
      primarySignal += 20;
      boosts?.push("short paragraphs maximise dwell time");
    }
    if (content?.length >= 800) {
      primarySignal += 15;
      boosts?.push("long-form content drives dwell time");
    }
    if (/http|www\./i?.test(content)) {
      primarySignal -= 20;
      penalties?.push("link in post body penalised — move to comments");
    }
    if (/story|learned|realised|mistake|lesson/i?.test(full)) {
      primarySignal += 15;
      boosts?.push("narrative drives dwell time");
    }

    // Hook: first line must stop the scroll
    if (headline?.length <= 100) {
      hookStrength += 15;
      boosts?.push("concise scroll-stopping first line");
    }
    if (
      /i (was|used to|thought|learned)|years ago|this is|the truth/i?.test(
        headline,
      )
    ) {
      hookStrength += 20;
      boosts?.push("personal story hook");
    }

    // CTA: professional question
    if (THREAD_INVITE?.test(cta)) {
      ctaAlignment += 25;
      boosts?.push("professional question drives comments");
    }
    if (/comment|share your/i?.test(cta)) {
      ctaAlignment += 10;
      boosts?.push("comment-driving CTA");
    }
    if (/follow|subscribe/i?.test(cta) && !THREAD_INVITE?.test(cta)) {
      ctaAlignment -= 10;
      penalties?.push("generic follow CTA underperforms on LinkedIn");
    }

    // Structure: long, readable, no external links
    if (content?.length >= 800 && content?.length <= 1800) {
      structureScore += 20;
      boosts?.push("optimal LinkedIn length");
    }
    if (content?.length < 300) {
      structureScore -= 20;
      penalties?.push("too short for LinkedIn dwell time");
    }
    if (lineBreaks >= 5) {
      structureScore += 15;
      boosts?.push("readable paragraph structure");
    }

    return this?.buildScore({
      primarySignal,
      hookStrength,
      ctaAlignment,
      structureScore,
      penalties,
      boosts,
    });
  }

  private scoreFacebook(
    full: string,
    headline: string,
    cta: string,
    content: string,
  ): AlgorithmAlignmentScore {
    const penalties: string[] = [];
    const boosts: string[] = [];
    let primarySignal = 50;
    let hookStrength = 50;
    let ctaAlignment = 50;
    let structureScore = 50;

    // Primary signal: emotional reactions (Love, Care, Wow > Like)
    if (EMOTIONAL_HOOKS?.test(full)) {
      primarySignal += 25;
      boosts?.push("emotional content drives Love/Care reactions");
    }
    if (/tag (a|someone|your)/i?.test(full)) {
      primarySignal += 20;
      boosts?.push("tag-a-friend drives organic reach");
    }
    if (/http|www\./i?.test(content)) {
      primarySignal -= 15;
      penalties?.push("external link penalised in Facebook feed");
    }

    // Hook: emotion-first
    if (EMOTIONAL_HOOKS?.test(headline)) {
      hookStrength += 25;
      boosts?.push("emotional opener");
    }
    if (/real talk|story time|confession/i?.test(headline)) {
      hookStrength += 15;
      boosts?.push("personal story hook");
    }

    // CTA: tag and share
    if (/tag (a|someone|your)/i?.test(cta)) {
      ctaAlignment += 35;
      boosts?.push("tag-a-friend CTA");
    }
    if (/share if|share this/i?.test(cta)) {
      ctaAlignment += 20;
      boosts?.push("share CTA");
    }
    if (/❤️|💕|🙏/.test(cta)) {
      ctaAlignment += 10;
      boosts?.push("reaction emoji CTA");
    }

    // Structure: story-based
    const _len = content?.length;
    if (len >= 200 && len <= 800) {
      structureScore += 20;
      boosts?.push("optimal Facebook caption length");
    }
    if (EMOTIONAL_HOOKS?.test(content)) {
      structureScore += 15;
      boosts?.push("story-driven structure");
    }

    return this?.buildScore({
      primarySignal,
      hookStrength,
      ctaAlignment,
      structureScore,
      penalties,
      boosts,
    });
  }

  private scoreThreads(
    full: string,
    headline: string,
    cta: string,
    _content: string,
  ): AlgorithmAlignmentScore {
    const penalties: string[] = [];
    const boosts: string[] = [];
    let primarySignal = 50;
    let hookStrength = 50;
    let ctaAlignment = 50;
    let structureScore = 50;

    // Primary signal: replies — does it invite dialogue?
    if (THREAD_INVITE?.test(full)) {
      primarySignal += 30;
      boosts?.push("dialogue-inviting language");
    }
    if (REPLY_TRIGGERS?.test(full)) {
      primarySignal += 20;
      boosts?.push("reply-triggering phrasing");
    }
    if (/promotional|buy now|link in bio/i?.test(full)) {
      primarySignal -= 20;
      penalties?.push("promotional language kills Threads replies");
    }

    // Hook: conversational
    if (
      /^(has anyone|anyone else|genuine question|real talk|honest question)/i?.test(
        headline,
      )
    ) {
      hookStrength += 25;
      boosts?.push("conversational opener");
    }
    if (headline?.length <= 100) {
      hookStrength += 15;
      boosts?.push("short punchy hook");
    }

    // CTA: invite dialogue
    if (THREAD_INVITE?.test(cta)) {
      ctaAlignment += 35;
      boosts?.push("dialogue-driving CTA");
    }
    if (REPLY_TRIGGERS?.test(cta)) {
      ctaAlignment += 15;
      boosts?.push("reply-driving CTA");
    }

    // Structure: short and conversational
    const _len = full?.length;
    if (len <= 300) {
      structureScore += 25;
      boosts?.push("optimal Threads length");
    }
    if (len > 500) {
      structureScore -= 15;
      penalties?.push("too long for Threads — loses conversational feel");
    }

    return this?.buildScore({
      primarySignal,
      hookStrength,
      ctaAlignment,
      structureScore,
      penalties,
      boosts,
    });
  }

  private scoreYouTube(
    _full: string,
    headline: string,
    cta: string,
    content: string,
  ): AlgorithmAlignmentScore {
    const penalties: string[] = [];
    const boosts: string[] = [];
    let primarySignal = 50;
    let hookStrength = 50;
    let ctaAlignment = 50;
    let structureScore = 50;

    // Primary signal: CTR × watch time — does it deliver on its promise?
    if (CURIOSITY_GAP?.test(headline)) {
      primarySignal += 20;
      boosts?.push("curiosity gap in title drives CTR");
    }
    if (/how to|why|what|the truth|you\'?ve been doing/i?.test(headline)) {
      primarySignal += 15;
      boosts?.push("high-CTR title format");
    }
    if (
      /in this video|by the end|you\'?ll (learn|discover|see)/i?.test(content)
    ) {
      primarySignal += 15;
      boosts?.push("promise delivered early — watch time");
    }
    if (/slow intro|hi everyone, welcome back/i?.test(content)) {
      primarySignal -= 20;
      penalties?.push("slow intro kills watch percentage");
    }

    // Hook: delivers on title promise in first 30 seconds
    if (
      /first|right away|immediately|let'?s (get into|start|dive)/i?.test(
        content?.substring(0, 200),
      )
    ) {
      hookStrength += 20;
      boosts?.push("fast-paced opening — watch time signal");
    }

    // CTA: subscribe and watch next
    if (/subscribe|watch (this|next|more)/i?.test(cta)) {
      ctaAlignment += 25;
      boosts?.push("subscriber + session time CTA");
    }
    if (/comment (below|your|what)/i?.test(cta)) {
      ctaAlignment += 15;
      boosts?.push("comment CTA");
    }

    // Structure: chapters and clear progression
    if (/chapter|\d+\.|step \d/i?.test(content)) {
      structureScore += 20;
      boosts?.push("chapter structure extends session time");
    }
    if (content?.length >= 500) {
      structureScore += 15;
      boosts?.push("detailed description aids search ranking");
    }

    return this?.buildScore({
      primarySignal,
      hookStrength,
      ctaAlignment,
      structureScore,
      penalties,
      boosts,
    });
  }

  // ── Score assembly ──────────────────────────────────────────────────────────

  private buildScore(input: {
    primarySignal: number;
    hookStrength: number;
    ctaAlignment: number;
    structureScore: number;
    penalties: string[];
    boosts: string[];
  }): AlgorithmAlignmentScore {
    const _clamp = (n: number) => Math?.min(100, Math?.max(0, n));

    const _primarySignal = clamp(input?.primarySignal);
    const _hookStrength = clamp(input?.hookStrength);
    const _ctaAlignment = clamp(input?.ctaAlignment);
    const _structureScore = clamp(input?.structureScore);

    // Weighted composite — primary signal matters most
    const _score = clamp(
      primarySignal * 0.4 +
        hookStrength * 0.25 +
        ctaAlignment * 0.2 +
        structureScore * 0.15,
    );

    return {
      score,
      primarySignal,
      hookStrength,
      ctaAlignment,
      structureScore,
      penalties: input?.penalties,
      boosts: input?.boosts,
    };
  }

  /**
   * Build a generation prompt suffix that tells the AI exactly how to engineer
   * content for this platform's algorithm.  Passed into generation context so
   * every variant is written with the algorithm in mind from the start.
   */
  buildAlgorithmPromptSuffix(platform: string): string {
    const _d = this?.getDirectives(platform);
    return [
      `PLATFORM ALGORITHM DIRECTIVES (${platform?.toUpperCase()}):`,
      `• Primary signal to trigger: ${d?.primarySignal.replace(/_/g, " ")}`,
      `• Hook: ${d?.hookRequirement}`,
      `• Structure: ${d?.contentStructure}`,
      `• CTA style: ${d?.ctaStyle}`,
      `• Avoid: ${d?.avoidPatterns.join(", ")}`,
      `• Boost with: ${d?.boostPatterns.join(", ")}`,
      `• Special rules: ${d?.specialRules.join(" | ")}`,
    ].join("\n");
  }

  logAlignment(platform: string, score: AlgorithmAlignmentScore): void {
    const _icon = score?.score >= 75 ? "✅" : score?.score >= 55 ? "⚠️" : "❌";
    logger?.info(
      `[AlgoOptimizer] ${icon} ${platform} algorithm alignment: ${score?.score.toFixed(1)}/100 ` +
        `(signal=${score?.primarySignal.toFixed(0)} hook=${score?.hookStrength.toFixed(0)} ` +
        `cta=${score?.ctaAlignment.toFixed(0)} structure=${score?.structureScore.toFixed(0)})` +
        (score?.boosts.length ? ` | ✓ ${score?.boosts.join(", ")}` : "") +
        (score?.penalties.length ? ` | ✗ ${score?.penalties.join(", ")}` : ""),
    );
  }
}

export const _platformAlgorithmOptimizer = new PlatformAlgorithmOptimizer();
