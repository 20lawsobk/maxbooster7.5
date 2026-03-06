import { logger } from '../logger.js';
import { db } from '../db';
import { userBrandVoices, autopilotPreferences } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { aiService } from './aiService';
import { advancedSocialAIService, type AdvancedContentRequest, type ContentScoring as AdvancedScoring } from './advancedSocialAIService.js';
import { pythonAIService } from './pythonAIService.js';

export interface ContentVariant {
  id: string;
  content: string;
  headline: string;
  hashtags: string[];
  callToAction: string;
  scores: ContentScores;
  platformOptimizations: PlatformOptimization;
}

export interface ContentScores {
  overall: number;
  engagement: number;
  clarity: number;
  sentiment: number;
  brandAlignment: number;
  hookStrength: number;
  callToActionEffectiveness: number;
}

export interface PlatformOptimization {
  platform: string;
  characterCount: number;
  maxCharacters: number;
  hashtagCount: number;
  optimalHashtags: number;
  emojiCount: number;
  optimalEmojis: number;
  isValid: boolean;
  issues: string[];
}

export interface ContentContext {
  userId: string;
  artistName: string;
  genre?: string;
  topic: string;
  objective: 'awareness' | 'engagement' | 'conversions' | 'viral';
  platform: string;
  tone?: string;
  targetAudience?: string;
  brandVoice?: BrandVoiceData;
  recentPerformance?: RecentPerformance;
  avoidTopics?: string[];
  preferredHashtags?: string[];
}

export interface BrandVoiceData {
  tone: 'formal' | 'casual' | 'mixed';
  emojiUsage: 'none' | 'light' | 'moderate' | 'heavy';
  hashtagFrequency: number;
  avgSentenceLength: number;
  vocabularyComplexity: 'simple' | 'moderate' | 'advanced';
  commonPhrases: string[];
}

export interface RecentPerformance {
  avgEngagementRate: number;
  topPerformingHashtags: string[];
  topPerformingTopics: string[];
  bestPostingTimes: { day: number; hour: number }[];
}

const PLATFORM_CONSTRAINTS: Record<string, {
  maxCharacters: number;
  optimalHashtags: { min: number; max: number };
  optimalEmojis: { min: number; max: number };
  features: string[];
}> = {
  twitter: {
    maxCharacters: 280,
    optimalHashtags: { min: 1, max: 3 },
    optimalEmojis: { min: 0, max: 2 },
    features: ['threads', 'polls', 'mentions'],
  },
  instagram: {
    maxCharacters: 2200,
    optimalHashtags: { min: 5, max: 15 },
    optimalEmojis: { min: 2, max: 5 },
    features: ['carousels', 'reels', 'stories', 'shoppable'],
  },
  facebook: {
    maxCharacters: 63206,
    optimalHashtags: { min: 1, max: 3 },
    optimalEmojis: { min: 1, max: 3 },
    features: ['events', 'groups', 'live', 'stories'],
  },
  tiktok: {
    maxCharacters: 2200,
    optimalHashtags: { min: 3, max: 5 },
    optimalEmojis: { min: 1, max: 3 },
    features: ['duets', 'stitches', 'sounds', 'effects'],
  },
  linkedin: {
    maxCharacters: 3000,
    optimalHashtags: { min: 3, max: 5 },
    optimalEmojis: { min: 0, max: 2 },
    features: ['articles', 'newsletters', 'polls'],
  },
  youtube: {
    maxCharacters: 5000,
    optimalHashtags: { min: 3, max: 15 },
    optimalEmojis: { min: 1, max: 3 },
    features: ['shorts', 'community', 'premiere'],
  },
};

const HOOK_PATTERNS = [
  /^(🔥|💥|⚡|🚀|✨|🎵|🎶|🚨|💀|🤯|👀|💯|🎤|🎧)/,
  /^(Breaking|NEW|Just dropped|Finally|Here's|This is|You won't believe)/i,
  /\?$/,
  /^[A-Z]{2,}/,
  /^(Unpopular opinion|Hot take|Real talk|POV:|Nobody talks about)/i,
  /^(Out now|It'?s (finally|officially) here|I (almost|nearly) didn'?t)/i,
  /^(The #1|The truth about|They don'?t want you to know)/i,
  /^(From (zero|bedroom|nothing) to|How I (went|got|grew))/i,
  /^(Wait till|Rate this|Be honest|Let me (tell|show) you)/i,
  /^(I wrote this when|This song (saved|changed|came from))/i,
  /(\d+k|\d+ million) (streams?|plays?|followers?)/i,
];

const CTA_PATTERNS = [
  /(check it out|listen now|stream now|watch now|link in bio|tap the link)/i,
  /(share|comment|tag|follow|subscribe|like)/i,
  /(don't miss|limited time|exclusive|first to hear)/i,
];

class ContentQualityPipeline {
  async buildContext(userId: string, baseContext: Partial<ContentContext>): Promise<ContentContext> {
    try {
      const [brandVoiceResult] = await db
        .select()
        .from(userBrandVoices)
        .where(eq(userBrandVoices.userId, userId))
        .limit(1);

      const [preferencesResult] = await db
        .select()
        .from(autopilotPreferences)
        .where(eq(autopilotPreferences.userId, userId))
        .limit(1);

      const brandVoice = brandVoiceResult?.voiceProfile as BrandVoiceData | undefined;

      return {
        userId,
        artistName: preferencesResult?.artistName || baseContext.artistName || 'Artist',
        genre: preferencesResult?.genre || baseContext.genre,
        topic: baseContext.topic || 'new music',
        objective: baseContext.objective || 'engagement',
        platform: baseContext.platform || 'instagram',
        tone: preferencesResult?.contentTone || baseContext.tone || 'casual',
        targetAudience: baseContext.targetAudience,
        brandVoice,
        avoidTopics: (preferencesResult?.avoidTopics as string[]) || [],
        preferredHashtags: (preferencesResult?.preferredHashtags as string[]) || [],
      };
    } catch (error) {
      logger.error('Error building content context:', error);
      return {
        userId,
        artistName: baseContext.artistName || 'Artist',
        topic: baseContext.topic || 'new music',
        objective: baseContext.objective || 'engagement',
        platform: baseContext.platform || 'instagram',
      };
    }
  }

  async generateVariants(context: ContentContext, count: number = 3): Promise<ContentVariant[]> {
    const variants: ContentVariant[] = [];
    const strategies = this.getGenerationStrategies(context.objective);

    for (let i = 0; i < count; i++) {
      const strategy = strategies[i % strategies.length];
      const variant = await this.generateSingleVariant(context, strategy, i);
      variants.push(variant);
    }

    return variants.sort((a, b) => b.scores.overall - a.scores.overall);
  }

  private getGenerationStrategies(objective: string): string[] {
    const strategies: Record<string, string[]> = {
      awareness: ['storytelling', 'announcement', 'teaser', 'milestone', 'journey', 'exclusivity'],
      engagement: ['question', 'poll-style', 'behind-the-scenes', 'challenge', 'opinion', 'community'],
      conversions: ['urgency', 'social-proof', 'benefit-focused', 'scarcity', 'value-stack', 'first-mover'],
      viral: ['controversial', 'emotional', 'relatable', 'pov', 'transformation', 'industry-truth'],
    };
    return strategies[objective] || strategies.engagement;
  }

  private async generateSingleVariant(
    context: ContentContext,
    strategy: string,
    index: number
  ): Promise<ContentVariant> {
    let headline: string;
    let body: string;
    let cta: string;
    let hashtags: string[];

    let usedAI = false;
    if (await pythonAIService.isAvailable()) {
      try {
        const goalMap: Record<string, string> = {
          awareness: 'growth', engagement: 'engagement', conversions: 'conversion', viral: 'growth',
        };
        const aiResult = await pythonAIService.generateContent(
          context.platform, context.topic, context.tone || 'energetic',
          goalMap[context.objective] || 'growth', true
        );
        if (aiResult.success && aiResult.data && aiResult.data.hook && aiResult.data.body && aiResult.data.cta) {
          headline = aiResult.data.hook;
          body = aiResult.data.body;
          cta = aiResult.data.cta;
          hashtags = aiResult.data.hashtags || this.generateOptimizedHashtags(context);
          usedAI = true;
        }
      } catch (err) {
        logger.warn('[ContentQuality] Python AI failed for variant, using templates:', err);
      }
    }

    if (!usedAI) {
      const generated = this.generateContentByStrategy(context, strategy);
      headline = generated.headline;
      body = generated.body;
      cta = generated.cta;
      hashtags = this.generateOptimizedHashtags(context);
    }

    const fullContent = `${headline!}\n\n${body!}`;
    const platformOpt = this.validatePlatformConstraints(fullContent, hashtags!, context.platform);
    const scores = this.scoreContent(fullContent, headline!, cta!, context, platformOpt);

    return {
      id: `variant_${index}_${Date.now()}`,
      content: body!,
      headline: headline!,
      hashtags: hashtags!,
      callToAction: cta!,
      scores,
      platformOptimizations: platformOpt,
    };
  }

  private generateContentByStrategy(
    context: ContentContext,
    strategy: string
  ): { headline: string; body: string; cta: string } {
    const { artistName, topic, objective, tone, genre } = context;
    const genreTag = genre ? ` #${genre.replace(/\s+/g, '')}` : '';

    const rnd = (arr: Array<{ headline: string; body: string; cta: string }>) =>
      arr[Math.floor(Math.random() * arr.length)];

    const templates: Record<string, Record<string, Array<{ headline: string; body: string; cta: string }>>> = {
      awareness: {
        storytelling: [
          {
            headline: `🎵 The story behind "${topic}"`,
            body: `Every song has a story. "${topic}" came from a place of pure ${tone === 'casual' ? 'vibes' : 'inspiration'}. I poured months of work into this, and today I finally get to share it with you.${genreTag}`,
            cta: 'Listen and let me know if you feel it too!',
          },
          {
            headline: `How "${topic}" came to life 🎶`,
            body: `"${topic}" started as a voice memo at 3 AM. What you're hearing now is the result of that one unplanned moment turning into something real. Music works in mysterious ways.${genreTag}`,
            cta: 'Press play and feel what I felt making it.',
          },
          {
            headline: `The real story behind "${topic}" 🎵`,
            body: `Every lyric in "${topic}" is from a real experience. Nothing was manufactured. ${artistName} made this from the most honest place possible — and it shows.${genreTag}`,
            cta: 'Stream it and tell me which lyric hits hardest.',
          },
        ],
        announcement: [
          {
            headline: `📢 ${artistName} - ${topic} is officially HERE`,
            body: `The wait is over! "${topic}" just dropped on all platforms. This one's special - it's everything I've been working toward. Thank you for being on this journey with me.${genreTag}`,
            cta: 'Stream it now - link in bio!',
          },
          {
            headline: `🚨 ${topic} just dropped — don't sleep`,
            body: `No more waiting. "${topic}" is on every platform right now. ${artistName} went all in on this one — from the production to the final mix. This is the one.${genreTag}`,
            cta: 'Link in bio. Go stream it NOW.',
          },
          {
            headline: `${artistName} just entered a new era: "${topic}"`,
            body: `"${topic}" is the announcement of a new chapter. Different sound, same soul. This is ${artistName} at their most unfiltered, and the result is something you need to hear.${genreTag}`,
            cta: 'Stream it now. New era starts today.',
          },
        ],
        teaser: [
          {
            headline: `Something big is coming... 👀`,
            body: `I've been keeping this quiet, but "${topic}" drops soon and I can't contain my excitement. ${artistName} has never done anything like this before.${genreTag}`,
            cta: "Stay tuned - you don't want to miss this!",
          },
          {
            headline: `I've been sitting on this for months... 👀`,
            body: `"${topic}" has been done for a while. I kept holding it back, perfecting it, second-guessing it. No more waiting. It drops soon and I promise it was worth it.${genreTag}`,
            cta: 'Turn on notifications. Drop date coming.',
          },
        ],
        milestone: [
          {
            headline: `We hit a milestone worth celebrating 🎉`,
            body: `"${topic}" just crossed a number I'm genuinely proud of. None of this happens without you. This is what it looks like when a community believes in something together.${genreTag}`,
            cta: 'Keep streaming — we are just getting started.',
          },
          {
            headline: `${artistName} just hit a major milestone 🏆`,
            body: `"${topic}" has done something I honestly didn't expect this fast. The support has been overwhelming and I want to say thank you — for real. More coming very soon.${genreTag}`,
            cta: 'Follow to stay in the loop. Big things incoming.',
          },
        ],
        journey: [
          {
            headline: `From bedroom to everywhere — the ${artistName} story 🎤`,
            body: `A year ago, "${topic}" didn't exist. Six months ago, I almost quit. Today, it's everywhere. The journey to this moment was anything but straight, but I wouldn't change a second of it.${genreTag}`,
            cta: 'Follow for more of the journey. The best is ahead.',
          },
        ],
        exclusivity: [
          {
            headline: `First look: "${topic}" before the official drop 🔒`,
            body: `You're getting this early because you've been here since the beginning. "${topic}" is almost out — but my core community gets a preview first. That's how it should be.${genreTag}`,
            cta: 'Hit follow and turn on notifications for the drop.',
          },
        ],
      },
      engagement: {
        question: [
          {
            headline: `Quick question for you all... 🤔`,
            body: `What's the first thing you look for in a new track? The beat, the lyrics, or the vibe? I'm curious because "${topic}" has all three, and I want to know what hits first for you.${genreTag}`,
            cta: 'Drop your answer in the comments!',
          },
          {
            headline: `Be honest with me — does "${topic}" hit? 🤔`,
            body: `I made "${topic}" for a very specific feeling. I want to know: did it land for you? What was your first reaction? I read every comment. Real ones only.${genreTag}`,
            cta: 'Tell me in the comments — no filter.',
          },
        ],
        'poll-style': [
          {
            headline: `Help me decide! 🎯`,
            body: `Working on the visuals for "${topic}" and I'm stuck between two concepts. Should I go moody and cinematic, or bright and energetic? Your vote matters!${genreTag}`,
            cta: 'Vote below - moody or bright?',
          },
          {
            headline: `I need a decision and you're helping me make it 🎯`,
            body: `Working on the next drop after "${topic}" and I'm torn between two directions. Do you want more of the same energy, or something completely different? Your answer changes what comes next.${genreTag}`,
            cta: 'Same energy or switch it up? Comment below.',
          },
        ],
        'behind-the-scenes': [
          {
            headline: `Studio diaries 🎧`,
            body: `Here's something you don't usually see - the raw creation process for "${topic}". 47 takes, 3 rewrites, and one moment where everything just clicked. That's what you're hearing in the final version.${genreTag}`,
            cta: 'Want more BTS content like this?',
          },
          {
            headline: `Nobody sees what goes into a record like "${topic}" 🎚️`,
            body: `The sessions for "${topic}" were messy, late, and sometimes frustrating. But there was one moment in that booth where everything aligned — and that take is in the final version. You can hear it.${genreTag}`,
            cta: 'Like this if you want the full making-of breakdown.',
          },
        ],
        challenge: [
          {
            headline: `I dare you to listen to "${topic}" without replaying it 😤`,
            body: `People have been telling me "${topic}" has insane replay value. I think they might be right. Challenge: listen once and see if you can stop there. Report back.${genreTag}`,
            cta: 'Take the challenge. Link in bio. Go.',
          },
        ],
        opinion: [
          {
            headline: `Hot take about "${topic}" 🌶️`,
            body: `Unpopular opinion: "${topic}" is the best thing in the ${genre || 'music'} space right now, and I'll defend that. Not because I made it — because I genuinely believe it. Fight me in the comments.${genreTag}`,
            cta: 'Agree or disagree? Drop it below.',
          },
        ],
        community: [
          {
            headline: `This is for my community first 🙏`,
            body: `"${topic}" didn't chart because of algorithms or playlists. It moved because of YOU — the people who share, comment, and tell their friends. That kind of support changes careers. Thank you.${genreTag}`,
            cta: 'Drop a comment if you\'ve been here from the start.',
          },
        ],
      },
      conversions: {
        urgency: [
          {
            headline: `⏰ "${topic}" is LIVE right now`,
            body: `This is it - "${topic}" by ${artistName} is officially streaming everywhere. The first 24 hours are crucial, and your support means everything. Every stream, every save, every share counts.${genreTag}`,
            cta: "Stream now - let's make this one count!",
          },
          {
            headline: `⏰ First 24 hours only — "${topic}" needs you now`,
            body: `The first 24 hours determine everything — playlisting, algorithm push, charting. "${topic}" is live and every play right now has 10x the impact it will have next week. Don't wait.${genreTag}`,
            cta: 'Stream it right now. Link in bio. Go.',
          },
        ],
        'social-proof': [
          {
            headline: `🔥 "${topic}" is catching fire`,
            body: `The response to "${topic}" has been incredible. Seeing all your stories, hearing how it's hitting different - this is why I make music. Join the thousands who are already playing it on repeat.${genreTag}`,
            cta: "Don't miss what everyone's talking about!",
          },
          {
            headline: `Everyone's adding "${topic}" to their rotation 🔥`,
            body: `The messages about "${topic}" have been flooding in. People are adding it to workout playlists, late night drives, everything. When music finds its way into people's real lives — that's when you know it worked.${genreTag}`,
            cta: "Add it to your playlist. Join the movement.",
          },
        ],
        'benefit-focused': [
          {
            headline: `Need that perfect ${genre || 'vibe'} track?`,
            body: `"${topic}" is that song you add to every playlist. Whether you're working out, driving, or just vibing, this track elevates the moment. ${artistName} made this one for YOU.${genreTag}`,
            cta: 'Add it to your playlist now!',
          },
          {
            headline: `"${topic}" goes with everything 🎧`,
            body: `Gym playlist. Late night drive. Study session. Morning routine. "${topic}" fits every context because it was built from a feeling that everyone knows. Add it and see for yourself.${genreTag}`,
            cta: 'Add it now. You already know the vibe.',
          },
        ],
        scarcity: [
          {
            headline: `The window to support "${topic}" is NOW 📈`,
            body: `First week chart positions and playlist placements are decided in the first 7 days. "${topic}" is in that window right now. Every stream today counts more than 10 streams next month.${genreTag}`,
            cta: "Stream it, save it, share it. Do it today.",
          },
        ],
        'value-stack': [
          {
            headline: `"${topic}" + exclusive content = follow ${artistName} now`,
            body: `Stream "${topic}", follow ${artistName}, and turn on notifications. The next exclusive drop is going to your feed first — not the algorithm, not ads. Your feed. Only if you follow.${genreTag}`,
            cta: 'Follow + stream = exclusive access. Simple.',
          },
        ],
        'first-mover': [
          {
            headline: `Get on "${topic}" before it blows up 📈`,
            body: `"${topic}" is building momentum fast. The people who share this early are the ones who get to say they were there first. Be that person. Early supporters shape the whole trajectory.${genreTag}`,
            cta: 'Share it now. Be the first in your circle.',
          },
        ],
      },
      viral: {
        controversial: [
          {
            headline: `Unpopular opinion... 💭`,
            body: `"${topic}" breaks every rule in the ${genre || 'music'} playbook - and that's exactly why it works. Some people won't get it, and that's okay. This one's for the ones who do.${genreTag}`,
            cta: 'Agree or disagree? Let me know!',
          },
          {
            headline: `Hot take: "${topic}" is the best ${genre || 'track'} this year 🌶️`,
            body: `I know that's a bold claim. But I'm standing on it. "${topic}" does everything a great ${genre || 'song'} should do — and then some. Come argue with me in the comments.${genreTag}`,
            cta: "Tell me I'm wrong. I dare you.",
          },
        ],
        emotional: [
          {
            headline: `This song saved my life 💔`,
            body: `I don't usually share this, but "${topic}" came from my darkest moment. Writing it was therapy. If you're going through something, I hope this reaches you at the right time.${genreTag}`,
            cta: 'Share if this resonates with someone you know.',
          },
          {
            headline: `I wrote "${topic}" when I almost quit music 💔`,
            body: `There was a period where I was done. Done with the industry, the grind, the silence. "${topic}" is what came out when I had nothing left to lose. Those tracks always hit the hardest.${genreTag}`,
            cta: 'Share with someone who needs to hear this.',
          },
        ],
        relatable: [
          {
            headline: `POV: It's 2 AM and you can't stop replaying "${topic}" 😅`,
            body: `No one asked for this much replay value but ${artistName} delivered anyway. Sorry not sorry for the earworm. You've been warned.${genreTag}`,
            cta: 'Tag someone who needs this chaos!',
          },
          {
            headline: `POV: "${topic}" just became your personality 😩`,
            body: `You played it once. Then twice. Now it's on every playlist, every drive, every workout. ${artistName} has done it again. Your recommendations are never going to be the same.${genreTag}`,
            cta: 'Tag someone you already sent this to.',
          },
        ],
        pov: [
          {
            headline: `POV: You discovered "${topic}" on a random Tuesday and your week is saved 😮‍💨`,
            body: `This is how it starts. One random play, then the repeat button breaks. "${topic}" has that effect on people and honestly — ${artistName} planned it that way.${genreTag}`,
            cta: 'Press play. You already know what happens next.',
          },
        ],
        transformation: [
          {
            headline: `Before and after discovering "${topic}" 😭`,
            body: `Before: regular playlist, regular vibes. After "${topic}": everything sounds different. Your standards are higher. You can't go back. ${artistName} is responsible for this.${genreTag}`,
            cta: 'Experience the transformation yourself. Link in bio.',
          },
        ],
        'industry-truth': [
          {
            headline: `Nobody in the industry tells you this about "${topic}" 🤫`,
            body: `"${topic}" was made completely independently. No label money, no industry connections, no marketing budget. Just the music. And somehow it's doing numbers. Take notes, because this is what the future looks like.${genreTag}`,
            cta: "Share if you believe in the independent movement.",
          },
        ],
      },
    };

    const objectiveTemplates = templates[objective] || templates.engagement;
    const strategyTemplates = objectiveTemplates[strategy] || Object.values(objectiveTemplates)[0];

    return rnd(strategyTemplates);
  }

  private generateOptimizedHashtags(context: ContentContext): string[] {
    const { platform, genre, objective, preferredHashtags = [] } = context;
    const constraints = PLATFORM_CONSTRAINTS[platform] || PLATFORM_CONSTRAINTS.instagram;

    const baseHashtags: string[] = [];

    if (genre) {
      baseHashtags.push(`#${genre.replace(/\s+/g, '')}`);
      baseHashtags.push(`#${genre.replace(/\s+/g, '')}Music`);
    }

    const objectiveHashtags: Record<string, string[]> = {
      awareness: ['#NewMusic', '#MusicRelease', '#OutNow', '#NewArtist', '#Discover'],
      engagement: ['#MusicCommunity', '#MusicLovers', '#ShareYourThoughts', '#MusicTalk'],
      conversions: ['#StreamNow', '#LinkInBio', '#MusicStreaming', '#SpotifyPlaylist', '#AppleMusic'],
      viral: ['#Viral', '#Trending', '#ForYou', '#FYP', '#MusicViral'],
    };

    baseHashtags.push(...(objectiveHashtags[objective] || objectiveHashtags.engagement));

    const platformHashtags: Record<string, string[]> = {
      tiktok: ['#FYP', '#ForYou', '#TikTokMusic', '#MusicTok'],
      instagram: ['#InstaMusic', '#MusicOfInstagram', '#Reels', '#Explore'],
      twitter: ['#NowPlaying', '#MusicTwitter'],
      youtube: ['#YouTubeMusic', '#Shorts', '#Subscribe'],
      facebook: ['#FacebookMusic', '#MusicVideo'],
      linkedin: ['#MusicIndustry', '#IndependentArtist', '#MusicBusiness'],
    };

    baseHashtags.push(...(platformHashtags[platform] || []));
    baseHashtags.push(...preferredHashtags.slice(0, 3));

    const uniqueHashtags = [...new Set(baseHashtags)];
    return uniqueHashtags.slice(0, constraints.optimalHashtags.max);
  }

  validatePlatformConstraints(
    content: string,
    hashtags: string[],
    platform: string
  ): PlatformOptimization {
    const constraints = PLATFORM_CONSTRAINTS[platform] || PLATFORM_CONSTRAINTS.instagram;
    const issues: string[] = [];

    const characterCount = content.length;
    const hashtagCount = hashtags.length;
    const emojiRegex = new RegExp('[\\u{1F300}-\\u{1F9FF}]', 'gu');
    const emojiCount = (content.match(emojiRegex) || []).length;

    if (characterCount > constraints.maxCharacters) {
      issues.push(`Content exceeds ${platform} limit (${characterCount}/${constraints.maxCharacters})`);
    }

    if (hashtagCount < constraints.optimalHashtags.min) {
      issues.push(`Too few hashtags (${hashtagCount} < ${constraints.optimalHashtags.min})`);
    } else if (hashtagCount > constraints.optimalHashtags.max) {
      issues.push(`Too many hashtags (${hashtagCount} > ${constraints.optimalHashtags.max})`);
    }

    if (emojiCount < constraints.optimalEmojis.min) {
      issues.push(`Consider adding emojis for ${platform}`);
    } else if (emojiCount > constraints.optimalEmojis.max) {
      issues.push(`Too many emojis for ${platform} (${emojiCount} > ${constraints.optimalEmojis.max})`);
    }

    return {
      platform,
      characterCount,
      maxCharacters: constraints.maxCharacters,
      hashtagCount,
      optimalHashtags: constraints.optimalHashtags.max,
      emojiCount,
      optimalEmojis: constraints.optimalEmojis.max,
      isValid: issues.length === 0,
      issues,
    };
  }

  scoreContent(
    content: string,
    headline: string,
    cta: string,
    context: ContentContext,
    platformOpt: PlatformOptimization
  ): ContentScores {
    const hookStrength = this.scoreHook(headline);
    const ctaEffectiveness = this.scoreCTA(cta);
    const clarity = this.scoreClarity(content);
    const sentiment = this.scoreSentiment(content, context.objective);
    const brandAlignment = this.scoreBrandAlignment(content, context);
    const engagement = this.predictEngagement(content, headline, context);

    const weights = {
      engagement: 0.25,
      clarity: 0.15,
      sentiment: 0.15,
      brandAlignment: 0.15,
      hookStrength: 0.15,
      callToActionEffectiveness: 0.15,
    };

    const platformPenalty = platformOpt.isValid ? 0 : 15;

    const overall = Math.max(0, Math.min(100,
      engagement * weights.engagement +
      clarity * weights.clarity +
      sentiment * weights.sentiment +
      brandAlignment * weights.brandAlignment +
      hookStrength * weights.hookStrength +
      ctaEffectiveness * weights.callToActionEffectiveness -
      platformPenalty
    ));

    return {
      overall,
      engagement,
      clarity,
      sentiment,
      brandAlignment,
      hookStrength,
      callToActionEffectiveness: ctaEffectiveness,
    };
  }

  private scoreHook(headline: string): number {
    let score = 45;

    for (const pattern of HOOK_PATTERNS) {
      if (pattern.test(headline)) {
        score += 12;
      }
    }

    if (headline.length > 10 && headline.length < 70) score += 10;
    if (headline.includes('...') || headline.includes('👀')) score += 5;
    if (/\d/.test(headline)) score += 6;
    if (headline.includes('"') || headline.includes('\u201c')) score += 4;
    const capsWords = (headline.match(/\b[A-Z]{2,}\b/g) || []).length;
    if (capsWords === 1) score += 4;
    else if (capsWords === 2) score += 2;

    return Math.min(100, score);
  }

  private scoreCTA(cta: string): number {
    let score = 40;

    for (const pattern of CTA_PATTERNS) {
      if (pattern.test(cta)) {
        score += 15;
      }
    }

    if (cta.length > 10 && cta.length < 60) score += 10;
    if (cta.includes('!')) score += 5;
    if (/\b(now|today|tonight|right now)\b/i.test(cta)) score += 8;
    if (/\b(link in bio|tap|click|swipe)\b/i.test(cta)) score += 6;
    if (/\b(first|limited|exclusive|only)\b/i.test(cta)) score += 5;
    if (/[🔥🎵🎧🔗🎟️🎤⏰📈]/u.test(cta)) score += 4;

    return Math.min(100, score);
  }

  private scoreClarity(content: string): number {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim());
    const avgLength = content.length / Math.max(sentences.length, 1);

    let score = 70;

    if (avgLength > 20 && avgLength < 100) score += 15;
    if (sentences.length >= 2 && sentences.length <= 5) score += 10;

    const complexWords = content.match(/\b\w{10,}\b/g) || [];
    if (complexWords.length < 3) score += 5;

    return Math.min(100, score);
  }

  private scoreSentiment(content: string, objective: string): number {
    const positiveWords = [
      'love', 'amazing', 'incredible', 'excited', 'beautiful', 'perfect', 'best', 'fire', 'vibes',
      'banger', 'legendary', 'iconic', 'brilliant', 'outstanding', 'exceptional', 'phenomenal',
      'proud', 'grateful', 'honored', 'blessed', 'inspired', 'powerful', 'authentic', 'real',
      'slaps', 'hard', 'heat', 'gas', 'dope', 'insane', 'crazy', 'wild', 'epic', 'goated',
      'hit', 'anthemic', 'unforgettable', 'magnetic', 'raw', 'honest', 'genuine', 'moving',
      'touching', 'heartfelt', 'soulful', 'groovy', 'infectious', 'addictive', 'catchy',
    ];
    const negativeWords = ['hate', 'worst', 'terrible', 'boring', 'bad', 'disappointing', 'skip'];
    const urgentWords = [
      'now', 'today', 'tonight', 'limited', 'exclusive', 'first', "don't miss",
      '24 hours', 'this week', 'right now', 'immediately', 'before', 'last chance',
    ];
    const emotionalWords = [
      'heart', 'soul', 'life', 'journey', 'saved', 'feel', 'moment', 'real', 'honest',
      'therapy', 'healing', 'darkest', 'struggle', 'vulnerable', 'personal', 'authentic',
      'connection', 'community', 'family', 'roots', 'home', 'truth', 'story', 'chapter',
      'changed', 'transformed', 'overcome', 'survived', 'resilient', 'legacy', 'purpose',
    ];
    const viralWords = [
      'everyone', 'share', 'tag', 'viral', 'trending', 'blowing up', 'going crazy',
      'everybody', 'movement', 'phenomenon', 'explosion', 'taking over',
    ];
    const musicWords = [
      'stream', 'playlist', 'spotify', 'apple music', 'tiktok', 'youtube', 'album',
      'single', 'ep', 'bars', 'hook', 'chorus', '808', 'beat', 'drop', 'vocals',
      'lyrics', 'production', 'mix', 'master', 'studio', 'recording',
    ];

    const lower = content.toLowerCase();
    let score = 58;

    const positiveCount = positiveWords.filter(w => lower.includes(w)).length;
    const negativeCount = negativeWords.filter(w => lower.includes(w)).length;
    const urgentCount = urgentWords.filter(w => lower.includes(w)).length;
    const emotionalCount = emotionalWords.filter(w => lower.includes(w)).length;
    const viralCount = viralWords.filter(w => lower.includes(w)).length;
    const musicCount = musicWords.filter(w => lower.includes(w)).length;

    score += Math.min(20, positiveCount * 4);
    score -= Math.min(25, negativeCount * 8);
    score += Math.min(8, musicCount * 2);

    if (objective === 'conversions') score += Math.min(15, urgentCount * 5);
    if (objective === 'viral') score += Math.min(15, emotionalCount * 4) + Math.min(10, viralCount * 3);
    if (objective === 'engagement') score += Math.min(10, emotionalCount * 3);
    if (objective === 'awareness') score += Math.min(8, positiveCount * 2);

    return Math.max(0, Math.min(100, score));
  }

  private scoreBrandAlignment(content: string, context: ContentContext): number {
    let score = 70;

    if (context.brandVoice) {
      const emojiRegex = new RegExp('[\\u{1F300}-\\u{1F9FF}]', 'gu');
      const emojiCount = (content.match(emojiRegex) || []).length;

      const expectedEmojis: Record<string, number> = {
        none: 0,
        light: 1,
        moderate: 3,
        heavy: 5,
      };

      const expected = expectedEmojis[context.brandVoice.emojiUsage] || 2;
      const emojiDiff = Math.abs(emojiCount - expected);
      score -= emojiDiff * 3;

      if (context.brandVoice.commonPhrases.some(phrase => 
        content.toLowerCase().includes(phrase.toLowerCase())
      )) {
        score += 10;
      }
    }

    if (context.avoidTopics?.some(topic => 
      content.toLowerCase().includes(topic.toLowerCase())
    )) {
      score -= 30;
    }

    return Math.max(0, Math.min(100, score));
  }

  private predictEngagement(content: string, headline: string, context: ContentContext): number {
    let score = 60;

    if (content.includes('?')) score += 10;
    if (content.match(/\btag\b|\bshare\b|\bcomment\b/i)) score += 8;
    if (headline.match(/^(🔥|💥|⚡|🚀)/)) score += 5;

    const engagementMultipliers: Record<string, number> = {
      awareness: 0.9,
      engagement: 1.1,
      conversions: 0.85,
      viral: 1.2,
    };

    score *= engagementMultipliers[context.objective] || 1;

    if (content.length > 50 && content.length < 300) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  async selectBestVariant(
    variants: ContentVariant[],
    minScore: number = 60
  ): Promise<ContentVariant | null> {
    const validVariants = variants.filter(v => 
      v.scores.overall >= minScore && v.platformOptimizations.isValid
    );

    if (validVariants.length === 0) {
      const best = variants.sort((a, b) => b.scores.overall - a.scores.overall)[0];
      if (best && best.scores.overall >= minScore * 0.8) {
        logger.warn(`Selected variant with platform issues: ${best.platformOptimizations.issues.join(', ')}`);
        return best;
      }
      return null;
    }

    return validVariants[0];
  }

  async generateAndSelect(
    userId: string,
    baseContext: Partial<ContentContext>,
    variantCount: number = 3,
    minScore: number = 60
  ): Promise<{ selected: ContentVariant | null; variants: ContentVariant[]; context: ContentContext }> {
    const context = await this.buildContext(userId, baseContext);
    const variants = await this.generateVariants(context, variantCount);
    const selected = await this.selectBestVariant(variants, minScore);

    logger.info(`Generated ${variants.length} variants, selected: ${selected?.id || 'none'} (score: ${selected?.scores.overall.toFixed(1) || 'N/A'})`);

    return { selected, variants, context };
  }

  /**
   * Generate content using Advanced Social AI (GPT-5.2 Level)
   * Provides deep semantic understanding, viral pattern analysis,
   * and multi-dimensional content scoring
   */
  async generateWithAdvancedAI(
    userId: string,
    baseContext: Partial<ContentContext>,
    variantCount: number = 3
  ): Promise<{
    selected: ContentVariant | null;
    variants: ContentVariant[];
    context: ContentContext;
    advancedInsights: {
      viralPotential: number;
      audienceResonance: number;
      optimalTiming: { day: number; hour: number };
      mediaRecommendation: string;
      improvements: string[];
    };
  }> {
    const context = await this.buildContext(userId, baseContext);
    
    try {
      const advancedRequest: AdvancedContentRequest = {
        userId,
        topic: context.topic,
        platforms: [context.platform],
        objective: context.objective,
        tone: context.tone as any,
        targetAudience: context.targetAudience,
        genre: context.genre,
        artistName: context.artistName,
        contentType: this.mapObjectiveToContentType(context.objective),
        includeHashtags: true,
        includeEmojis: true,
        variantCount,
      };

      const advancedResult = await advancedSocialAIService.generateAdvancedContent(advancedRequest);

      const variants: ContentVariant[] = advancedResult.variants.map((v, i) => ({
        id: v.id,
        content: v.content.split('\n\n')[1] || v.content,
        headline: v.headline,
        hashtags: v.hashtags,
        callToAction: v.cta,
        scores: {
          overall: v.predictedScore,
          engagement: advancedResult.scoring.engagement,
          clarity: advancedResult.scoring.clarity,
          sentiment: advancedResult.scoring.sentiment,
          brandAlignment: advancedResult.scoring.brandAlignment,
          hookStrength: advancedResult.scoring.hookStrength,
          callToActionEffectiveness: advancedResult.scoring.ctaEffectiveness,
        },
        platformOptimizations: {
          platform: context.platform,
          characterCount: v.content.length,
          maxCharacters: 2200,
          hashtagCount: v.hashtags.length,
          optimalHashtags: 10,
          emojiCount: 3,
          optimalEmojis: 3,
          isValid: true,
          issues: [],
        },
      }));

      variants.push({
        id: 'advanced_primary',
        content: advancedResult.primary.body,
        headline: advancedResult.primary.headline,
        hashtags: advancedResult.primary.hashtags,
        callToAction: advancedResult.primary.callToAction,
        scores: {
          overall: advancedResult.scoring.overall,
          engagement: advancedResult.scoring.engagement,
          clarity: advancedResult.scoring.clarity,
          sentiment: advancedResult.scoring.sentiment,
          brandAlignment: advancedResult.scoring.brandAlignment,
          hookStrength: advancedResult.scoring.hookStrength,
          callToActionEffectiveness: advancedResult.scoring.ctaEffectiveness,
        },
        platformOptimizations: {
          platform: context.platform,
          characterCount: advancedResult.primary.body.length,
          maxCharacters: 2200,
          hashtagCount: advancedResult.primary.hashtags.length,
          optimalHashtags: 10,
          emojiCount: advancedResult.primary.emojis.length,
          optimalEmojis: 3,
          isValid: true,
          issues: [],
        },
      });

      variants.sort((a, b) => b.scores.overall - a.scores.overall);
      const selected = variants[0] || null;

      logger.info(`[AdvancedAI] Generated ${variants.length} variants with GPT-5.2 level AI, best score: ${selected?.scores.overall.toFixed(1)}`);

      return {
        selected,
        variants,
        context,
        advancedInsights: {
          viralPotential: advancedResult.viralPotential.score,
          audienceResonance: advancedResult.audienceResonance.resonanceScore,
          optimalTiming: {
            day: advancedResult.optimalTiming.bestDays[0] || 3,
            hour: advancedResult.optimalTiming.bestHours[0] || 12,
          },
          mediaRecommendation: advancedResult.mediaGuidance.recommendedType,
          improvements: advancedResult.insights
            .filter(i => i.type === 'improvement')
            .map(i => i.message),
        },
      };
    } catch (error) {
      logger.error('[AdvancedAI] Error generating advanced content, falling back:', error);
      const variants = await this.generateVariants(context, variantCount);
      const selected = await this.selectBestVariant(variants, 50);
      
      return {
        selected,
        variants,
        context,
        advancedInsights: {
          viralPotential: 50,
          audienceResonance: 60,
          optimalTiming: { day: 3, hour: 12 },
          mediaRecommendation: 'image',
          improvements: [],
        },
      };
    }
  }

  private mapObjectiveToContentType(objective: string): 'announcement' | 'behind_scenes' | 'engagement' | 'promotional' | 'storytelling' {
    const mapping: Record<string, 'announcement' | 'behind_scenes' | 'engagement' | 'promotional' | 'storytelling'> = {
      awareness: 'announcement',
      engagement: 'engagement',
      conversions: 'promotional',
      viral: 'storytelling',
    };
    return mapping[objective] || 'announcement';
  }
}

export const contentQualityPipeline = new ContentQualityPipeline();
