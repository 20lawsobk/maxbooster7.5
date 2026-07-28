/**
 * Content Sampler — Admin Route
 *
 * Generates sample beats (all genres × moods) and social posts
 * (all platforms × content types), scores each combination for
 * engagement AND purchase conversion in-process (no MaxCore required),
 * and returns a ranked report.
 */

import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import { logger } from "../../logger.js";

const router = Router();
router.use(requireAdmin);

// ─── Domain constants ────────────────────────────────────────────────────────

const BEAT_GENRES = [
  "trap", "hiphop", "r&b", "drill", "lofi", "pop",
  "electronic", "indie", "afrobeats", "dancehall", "lo_fi", "jazz",
] as const;

const BEAT_MOODS = [
  "dark", "empowering", "chill", "aggressive",
  "melancholic", "energetic", "nostalgic", "euphoric",
] as const;

const PLATFORMS = [
  "instagram", "tiktok", "twitter", "youtube", "facebook", "linkedin",
] as const;

const CONTENT_TYPES_BY_PLATFORM: Record<string, string[]> = {
  instagram: ["reel", "carousel", "image", "story"],
  tiktok:    ["video", "duet", "stitch", "live"],
  twitter:   ["thread", "text", "poll", "video"],
  youtube:   ["video", "short", "live", "community"],
  facebook:  ["video", "text", "image", "event"],
  linkedin:  ["article", "video", "poll", "document"],
};

const MUSICAL_KEYS = [
  "C Major","C Minor","C# Minor","Db Major",
  "D Major","D Minor","Eb Major","Eb Minor",
  "E Major","E Minor","F Major","F Minor",
  "F# Minor","G Major","G Minor",
  "Ab Major","Ab Minor","A Major","A Minor",
  "Bb Major","Bb Minor","B Major","B Minor",
];

// ─── Platform benchmark data (2024 industry averages) ────────────────────────

const PLATFORM_BENCHMARKS: Record<string, {
  avgEngagementRate: number; reachMultiplier: number;
  idealHashtagCount: [number, number]; idealCaptionLength: [number, number];
  peakHours: number[]; bestContentType: string; adConversionRate: number;
}> = {
  instagram: { avgEngagementRate: 0.0122, reachMultiplier: 1.0,  idealHashtagCount: [3,8],   idealCaptionLength: [138,200], peakHours:[11,13,19], bestContentType:"reel",     adConversionRate: 0.021 },
  tiktok:    { avgEngagementRate: 0.0569, reachMultiplier: 3.2,  idealHashtagCount: [3,5],   idealCaptionLength: [100,150], peakHours:[19,20,21], bestContentType:"video",    adConversionRate: 0.038 },
  twitter:   { avgEngagementRate: 0.00045,reachMultiplier: 0.8,  idealHashtagCount: [1,2],   idealCaptionLength: [71,100],  peakHours:[8,9,12],   bestContentType:"thread",   adConversionRate: 0.009 },
  youtube:   { avgEngagementRate: 0.041,  reachMultiplier: 2.1,  idealHashtagCount: [3,5],   idealCaptionLength: [250,400], peakHours:[15,16,20], bestContentType:"short",    adConversionRate: 0.044 },
  facebook:  { avgEngagementRate: 0.0064, reachMultiplier: 0.6,  idealHashtagCount: [1,3],   idealCaptionLength: [40,80],   peakHours:[13,15,16], bestContentType:"video",    adConversionRate: 0.016 },
  linkedin:  { avgEngagementRate: 0.054,  reachMultiplier: 1.4,  idealHashtagCount: [3,5],   idealCaptionLength: [150,300], peakHours:[7,8,12],   bestContentType:"article",  adConversionRate: 0.062 },
};

// ─── Genre market data ────────────────────────────────────────────────────────

const GENRE_DATA: Record<string, {
  marketDemand: number; avgSalePrice: number; monthlySearchVolume: number;
  trendMomentum: number; bestPlatforms: string[]; tempoRange: [number, number];
  popularKeys: string[]; topAudiencePlatform: string;
}> = {
  trap:       { marketDemand:88, avgSalePrice:49,  monthlySearchVolume:2100000, trendMomentum:85, bestPlatforms:["tiktok","instagram","youtube"],     tempoRange:[130,160], popularKeys:["F# Minor","G Minor","C Minor","A Minor"],  topAudiencePlatform:"tiktok" },
  hiphop:     { marketDemand:85, avgSalePrice:45,  monthlySearchVolume:3800000, trendMomentum:80, bestPlatforms:["youtube","instagram","tiktok"],      tempoRange:[85,110],  popularKeys:["C Minor","D Minor","G Minor","Bb Major"],  topAudiencePlatform:"youtube" },
  "r&b":      { marketDemand:78, avgSalePrice:55,  monthlySearchVolume:1600000, trendMomentum:82, bestPlatforms:["instagram","tiktok","youtube"],      tempoRange:[60,95],   popularKeys:["Db Major","Ab Major","F Minor","Bb Major"], topAudiencePlatform:"instagram" },
  drill:      { marketDemand:82, avgSalePrice:42,  monthlySearchVolume:1900000, trendMomentum:88, bestPlatforms:["tiktok","youtube","instagram"],      tempoRange:[130,145], popularKeys:["C Minor","F# Minor","G Minor","Eb Minor"],  topAudiencePlatform:"tiktok" },
  lofi:       { marketDemand:62, avgSalePrice:28,  monthlySearchVolume:2900000, trendMomentum:70, bestPlatforms:["youtube","instagram","tiktok"],      tempoRange:[70,90],   popularKeys:["C Major","G Major","F Major","Db Major"],   topAudiencePlatform:"youtube" },
  pop:        { marketDemand:80, avgSalePrice:52,  monthlySearchVolume:5200000, trendMomentum:78, bestPlatforms:["instagram","tiktok","youtube"],      tempoRange:[95,130],  popularKeys:["C Major","G Major","A Major","E Major"],    topAudiencePlatform:"instagram" },
  electronic: { marketDemand:75, avgSalePrice:48,  monthlySearchVolume:1400000, trendMomentum:76, bestPlatforms:["tiktok","instagram","youtube"],      tempoRange:[120,145], popularKeys:["A Minor","F Minor","G Minor","D Minor"],    topAudiencePlatform:"tiktok" },
  indie:      { marketDemand:65, avgSalePrice:38,  monthlySearchVolume:980000,  trendMomentum:68, bestPlatforms:["instagram","youtube","tiktok"],      tempoRange:[90,125],  popularKeys:["D Major","A Major","E Major","G Major"],    topAudiencePlatform:"instagram" },
  afrobeats:  { marketDemand:92, avgSalePrice:58,  monthlySearchVolume:1800000, trendMomentum:95, bestPlatforms:["tiktok","instagram","youtube"],      tempoRange:[95,115],  popularKeys:["A Minor","E Minor","D Minor","F Major"],    topAudiencePlatform:"tiktok" },
  dancehall:  { marketDemand:72, avgSalePrice:44,  monthlySearchVolume:1100000, trendMomentum:74, bestPlatforms:["tiktok","instagram","youtube"],      tempoRange:[65,90],   popularKeys:["G Minor","C Minor","F Minor","Bb Minor"],   topAudiencePlatform:"tiktok" },
  lo_fi:      { marketDemand:62, avgSalePrice:25,  monthlySearchVolume:2700000, trendMomentum:69, bestPlatforms:["youtube","instagram","tiktok"],      tempoRange:[70,90],   popularKeys:["C Major","G Major","F Major","Db Major"],   topAudiencePlatform:"youtube" },
  jazz:       { marketDemand:55, avgSalePrice:62,  monthlySearchVolume:850000,  trendMomentum:60, bestPlatforms:["youtube","instagram","linkedin"],    tempoRange:[80,140],  popularKeys:["Bb Major","F Major","Eb Major","Ab Major"], topAudiencePlatform:"youtube" },
};

// ─── Mood × Genre scoring matrix (0–30 bonus points) ─────────────────────────

const MOOD_GENRE_FIT: Record<string, Record<string, number>> = {
  dark:        { trap:28, drill:30, hiphop:22, "r&b":12, lofi:10, lo_fi:10, pop:8,  electronic:18, indie:14, afrobeats:8,  dancehall:6,  jazz:10 },
  empowering:  { trap:20, drill:15, hiphop:28, "r&b":24, lofi:8,  lo_fi:8,  pop:26, electronic:20, indie:22, afrobeats:28, dancehall:22, jazz:18 },
  chill:       { trap:10, drill:5,  hiphop:18, "r&b":26, lofi:30, lo_fi:30, pop:18, electronic:14, indie:24, afrobeats:16, dancehall:20, jazz:28 },
  aggressive:  { trap:26, drill:30, hiphop:20, "r&b":8,  lofi:4,  lo_fi:4,  pop:12, electronic:22, indie:10, afrobeats:14, dancehall:12, jazz:8  },
  melancholic: { trap:14, drill:10, hiphop:16, "r&b":28, lofi:24, lo_fi:24, pop:18, electronic:16, indie:28, afrobeats:10, dancehall:8,  jazz:26 },
  energetic:   { trap:22, drill:20, hiphop:24, "r&b":18, lofi:8,  lo_fi:8,  pop:28, electronic:28, indie:18, afrobeats:30, dancehall:28, jazz:16 },
  nostalgic:   { trap:12, drill:8,  hiphop:22, "r&b":28, lofi:26, lo_fi:26, pop:24, electronic:14, indie:28, afrobeats:16, dancehall:14, jazz:28 },
  euphoric:    { trap:16, drill:12, hiphop:18, "r&b":20, lofi:12, lo_fi:12, pop:26, electronic:28, indie:20, afrobeats:30, dancehall:28, jazz:20 },
};

// ─── Content type × platform fit bonus ───────────────────────────────────────

const CONTENT_TYPE_FIT: Record<string, Record<string, number>> = {
  instagram: { reel:30, carousel:24, image:16, story:18 },
  tiktok:    { video:30, duet:22, stitch:20, live:18 },
  twitter:   { thread:28, text:20, poll:22, video:24 },
  youtube:   { video:24, short:30, live:20, community:18 },
  facebook:  { video:28, text:16, image:18, event:20 },
  linkedin:  { article:30, video:24, poll:22, document:20 },
};

// ─── Sample content generators ────────────────────────────────────────────────

function buildBeatHooks(genre: string, mood: string): string[] {
  const map: Record<string, Record<string, string[]>> = {
    trap: {
      dark:       ["Shadows on the 808","Midnight trap sessions","The void calls"],
      empowering: ["Built different","Level up on the low-end","Trap to the top"],
      aggressive: ["No mercy on the hi-hats","War drums at 140","Pure pressure"],
      default:    ["Trap heat incoming","808s never lie","Low freq energy"],
    },
    drill: {
      dark:       ["Slide on the dark side","Gritty street narratives","Cold strings cold world"],
      aggressive: ["Pressure from the borough","Drill or be drilled","Street science"],
      default:    ["Drill season open","Strings of the streets","Borough certified"],
    },
    "r&b": {
      chill:      ["Smooth like Sunday","Late night feelings","Silk vocal canvas"],
      melancholic:["3am confessions","Wounds that sing","Hurt so beautifully"],
      default:    ["Soul sessions","Feel it in your chest","Velvet vibes"],
    },
    hiphop: {
      empowering: ["Bars for the culture","Words with weight","Built to last"],
      nostalgic:  ["Golden era reimagined","Boom-bap soul","Classic reborn"],
      default:    ["Lyricist canvas","Hip-hop at its finest","Craft before clout"],
    },
    pop: {
      euphoric:   ["Chart-bound energy","Radio-ready heat","Anthem incoming"],
      energetic:  ["Stadium moment","The drop hits different","Feel-good peak"],
      default:    ["Pop perfection","Hook machine","Streaming gold"],
    },
    afrobeats: {
      energetic:  ["Afro swing unleashed","Lagos to the world","Dance floor certified"],
      euphoric:   ["Sun and 808s","African heat worldwide","Afro peak season"],
      empowering: ["African excellence","Culture moves markets","Roots to rhythm"],
      default:    ["Afrobeats everywhere","Percussive fire","Groove that travels"],
    },
    electronic: {
      energetic:  ["Festival-ready drop","Four-on-the-floor anthem","Rave certified"],
      euphoric:   ["The peak is here","Club chemistry","Euphoria in 4/4"],
      dark:       ["Underground techno energy","Midnight set closer","Bass pressure"],
      default:    ["Electronic magic","Synth architecture","Digital emotion"],
    },
    dancehall: {
      euphoric:   ["Caribbean heat","Dancehall riddim fire","Island frequency"],
      energetic:  ["Bashment certified","Yard vibes worldwide","Dance and connect"],
      default:    ["Riddim culture","Caribbean crossover","Dancehall global"],
    },
    lofi: {
      chill:      ["Chill and create","Study with soul","Slow it all down"],
      nostalgic:  ["Cassette warmth","Vintage frequency","Remember this feeling"],
      default:    ["Lo-fi mornings","Background feels","Dusty and perfect"],
    },
    lo_fi: {
      chill:      ["Chill and create","Study with soul","Slow it all down"],
      nostalgic:  ["Cassette warmth","Vintage frequency","Remember this feeling"],
      default:    ["Lo-fi mornings","Background feels","Dusty and perfect"],
    },
    indie: {
      melancholic:["Indie soul searching","Guitar-adjacent feelings","Bedroom pop depth"],
      nostalgic:  ["Indie nostalgia wave","Indie hearts aligned","Feeling everything"],
      default:    ["Indie textures","Alternative canvas","Authentic sound"],
    },
    jazz: {
      chill:      ["Neo-soul jazz fusion","Blue notes at midnight","Jazz morning ritual"],
      melancholic:["Melancholy in major","Blues within jazz","Feels like Coltrane"],
      default:    ["Jazz consciousness","Neo-soul canvas","Chords with character"],
    },
  };
  const genreMap = map[genre] || {};
  return genreMap[mood] || genreMap.default || [`${genre} ${mood} energy`,"Premium sample","Ready to record"];
}

function buildBeatDescription(genre: string, mood: string, bpm: number, key: string, price: number): string {
  const tempoDesc = bpm < 90 ? "slow-burning" : bpm < 115 ? "mid-tempo" : bpm < 135 ? "uptempo" : "high-energy";
  const moodAdjectives: Record<string, string> = {
    dark:"cinematic and brooding", empowering:"uplifting and anthemic",
    chill:"laid-back and smooth", aggressive:"hard-hitting and relentless",
    melancholic:"introspective and emotional", energetic:"driving and explosive",
    nostalgic:"warm and nostalgic", euphoric:"euphoric and infectious",
  };
  const adj = moodAdjectives[mood] || `${mood}`;
  const genreMap: Record<string, string> = {
    trap:"rolling 808s and layered trap textures", drill:"dark sliding 808s and cinematic strings",
    "r&b":"smooth chord stabs and warm neo-soul production", hiphop:"sampled-feel drums and deep sub bass",
    pop:"punchy drums and radio-ready arrangement", afrobeats:"percussive rhythm beds and afro-swing groove",
    electronic:"synthesized textures and precise drum programming", indie:"live-textured production with organic warmth",
    dancehall:"riddim-ready percussion and catchy melody loops", lofi:"dusty samples and mellow swing",
    lo_fi:"dusty samples and mellow swing", jazz:"neo-soul chord progressions and melodic bass",
  };
  const prodDetail = genreMap[genre] || "professional studio-grade production";
  return `A ${adj}, ${tempoDesc} ${genre} beat built around ${prodDetail} at ${bpm} BPM in ${key}. Non-exclusive lease from $${price} — exclusive rights available on request.`;
}

function buildPostCaption(platform: string, contentType: string, genre: string): {
  caption: string; hashtags: string[]; cta: string;
} {
  const bench = PLATFORM_BENCHMARKS[platform];
  const [minH, maxH] = bench.idealHashtagCount;
  const hashtagCount = Math.round((minH + maxH) / 2);

  const genreHashtags: Record<string, string[]> = {
    trap:["#trapbeats","#trapmusic","#808s","#beatmaker","#trapproducer"],
    hiphop:["#hiphopbeats","#hiphopproducer","#rap","#freestylebeats","#boombapenergy"],
    "r&b":["#rnbbeats","#rnbproducer","#soulmusic","#neosoul","#smooth"],
    drill:["#drillbeats","#ukdrill","#drillproducer","#streetmusic","#bx"],
    lofi:["#lofi","#lofihiphop","#chillbeats","#studymusic","#lofiproducer"],
    lo_fi:["#lofi","#lofihiphop","#chillbeats","#studymusic","#lofiproducer"],
    pop:["#popbeats","#popproducer","#chartmusic","#mainstream","#radioready"],
    electronic:["#electronicmusic","#edm","#beatproducer","#synthwave","#clubmusic"],
    indie:["#indiebeats","#indieproducer","#alternativemusic","#bedroom","#authentic"],
    afrobeats:["#afrobeats","#afropop","#afroswing","#naijasound","#afrobeatsproducer"],
    dancehall:["#dancehall","#reggae","#caribbeanmusic","#riddim","#bashment"],
    jazz:["#jazzbeats","#neosoul","#jazzproducer","#smoothjazz","#jazzfusion"],
  };

  const platformHashtags: Record<string, string[]> = {
    instagram:["#beatsforsale","#musicproducer","#newbeat"],
    tiktok:["#beatmaker","#producertok","#fyp"],
    twitter:["#beats","#producer","#music"],
    youtube:["#freebeats","#typebeat","#newmusic"],
    facebook:["#beatsforsale","#musicproduction","#independent"],
    linkedin:["#musicindustry","#musicbusiness","#independentartist"],
  };

  const genreTags = (genreHashtags[genre] || ["#beats","#producer"]).slice(0, 3);
  const platTags = (platformHashtags[platform] || ["#music"]).slice(0, Math.max(1, hashtagCount - 3));
  const hashtags = [...genreTags, ...platTags].slice(0, hashtagCount);

  const ctaByPlatform: Record<string, string> = {
    instagram:"🔗 Link in bio to license",
    tiktok:"⬇️ DM to license or grab the link",
    twitter:"🔗 Link in thread — grab the lease",
    youtube:"📥 License link in description",
    facebook:"💬 Comment BEAT or DM for pricing",
    linkedin:"📩 Connect and message for licensing details",
  };

  const contentTypePitch: Record<string, string> = {
    reel:"🎬 New beat just dropped — this one moves different.",
    carousel:"Swipe through the full breakdown of this beat →",
    image:"New production. Ready to record. 🎧",
    story:"🎵 Tap to hear the new drop",
    video:"New beat just dropped. Full version in the link.",
    duet:"Drop your verse on this — duet it 🎤",
    stitch:"Stitch this with your heat 🎵",
    live:"🔴 Caught this live — the energy was real",
    thread:"Full breakdown of my new beat in this thread ⬇️",
    text:"Fresh out the DAW. This ${genre} heat is going on the store today.",
    poll:"Which direction do you want next? Vote below 👇",
    short:"30 seconds of the new drop 👀",
    community:"Behind-the-scenes on this one. Left the raw session notes below.",
    article:"The anatomy of a chart-ready ${genre} beat — what I learned building this one.",
    document:"Session notes + licensing breakdown — download attached.",
    event:"🎧 Live listening session — come hear the new tape",
  };

  const openLine = contentTypePitch[contentType] || `New ${genre} beat available for licensing.`;
  const [minL, maxL] = bench.idealCaptionLength;
  const targetLen = Math.round((minL + maxL) / 2);

  let caption = openLine.replace(/\${genre}/g, genre);
  // Pad to target length naturally
  if (caption.length < minL) {
    caption += ` Produced entirely in-house — ${genre} energy, studio quality, ready to record over.`;
  }
  caption = caption.slice(0, maxL);

  return { caption, hashtags, cta: ctaByPlatform[platform] || "🔗 License now" };
}

// ─── Scoring functions ────────────────────────────────────────────────────────

function scoreBeat(genre: string, mood: string): {
  engagementScore: number; salesScore: number; combinedScore: number;
  viralPotential: number; conversionRate: number; estimatedMonthlyRevenue: number;
  topPlatform: string; bpm: number; key: string; price: number;
} {
  const gd = GENRE_DATA[genre] || GENRE_DATA.pop;
  const moodFit = (MOOD_GENRE_FIT[mood] || {})[genre] || 10;

  // Engagement score — how likely this beat gets saved/shared/used
  const engagementScore = Math.min(100, Math.round(
    (gd.marketDemand * 0.35) +
    (moodFit * 1.2) +
    (gd.trendMomentum * 0.25) +
    (Math.min(gd.monthlySearchVolume / 100000, 30) * 0.5)
  ));

  // Sales score — how likely this converts to a purchase
  const salesScore = Math.min(100, Math.round(
    (gd.marketDemand * 0.4) +
    (gd.avgSalePrice * 0.3) +
    (moodFit * 0.8) +
    (gd.trendMomentum * 0.3)
  ));

  const combinedScore = Math.round(engagementScore * 0.6 + salesScore * 0.4);
  const viralPotential = Math.round((engagementScore + gd.trendMomentum) / 2);
  const bench = PLATFORM_BENCHMARKS[gd.topAudiencePlatform] || PLATFORM_BENCHMARKS.tiktok;
  const conversionRate = bench.adConversionRate * (salesScore / 100) * 1.8;
  const estimatedMonthlyRevenue = Math.round(
    gd.monthlySearchVolume * 0.0001 * conversionRate * gd.avgSalePrice
  );

  // Pick BPM within genre range
  const [bpmMin, bpmMax] = gd.tempoRange;
  const moodBpmOffset: Record<string, number> = {
    dark:-5, empowering:5, chill:-10, aggressive:10, melancholic:-8, energetic:8, nostalgic:-5, euphoric:8
  };
  const bpm = Math.min(bpmMax, Math.max(bpmMin, Math.round((bpmMin+bpmMax)/2 + (moodBpmOffset[mood] || 0))));
  const key = gd.popularKeys[Math.floor(Math.abs(mood.charCodeAt(0) + genre.charCodeAt(0)) % gd.popularKeys.length)];

  return {
    engagementScore, salesScore, combinedScore, viralPotential,
    conversionRate: Math.round(conversionRate * 10000) / 100,
    estimatedMonthlyRevenue, topPlatform: gd.topAudiencePlatform,
    bpm, key, price: gd.avgSalePrice,
  };
}

function scoreContent(platform: string, contentType: string, genre: string): {
  engagementScore: number; salesScore: number; combinedScore: number;
  predictedReach: number; predictedLikes: number; predictedShares: number;
  conversionRate: number; estimatedRevenue: number;
} {
  const bench = PLATFORM_BENCHMARKS[platform] || PLATFORM_BENCHMARKS.instagram;
  const typeFit = (CONTENT_TYPE_FIT[platform] || {})[contentType] || 10;
  const gd = GENRE_DATA[genre] || GENRE_DATA.pop;
  const genreBonus: Record<string, number> = {
    afrobeats:18, "hip-hop":15, pop:12, electronic:13, trap:14, drill:12,
    "r&b":10, hiphop:13, dancehall:12, indie:8, lofi:7, lo_fi:7, jazz:6,
  };
  const gb = genreBonus[genre] || 10;
  const followerBase = 1000;

  const hashtagScore = 25; // using ideal hashtag count in generator
  const lengthScore = 25;  // using ideal caption length in generator
  const emojiBonus = 10;

  const rawViral = Math.round((hashtagScore + lengthScore + emojiBonus + gb) * (bench.reachMultiplier * 0.8));
  const engagementScore = Math.min(100, Math.round(rawViral * (typeFit / 30)));

  const salesScore = Math.min(100, Math.round(
    (bench.adConversionRate * 1000) * (typeFit / 30) * (gd.marketDemand / 100) * 80
  ));

  const combinedScore = Math.round(engagementScore * 0.6 + salesScore * 0.4);
  const modifier = engagementScore / 60;
  const engRate = bench.avgEngagementRate * modifier * bench.reachMultiplier;
  const reach = Math.round(followerBase * bench.reachMultiplier * (0.15 + modifier * 0.35));
  const likes = Math.round(reach * engRate * 0.6);
  const shares = Math.round(reach * engRate * 0.15);
  const conversionRate = bench.adConversionRate * (salesScore / 100) * 2;
  const estimatedRevenue = Math.round(reach * conversionRate * (gd.avgSalePrice || 45));

  return {
    engagementScore, salesScore, combinedScore,
    predictedReach: reach, predictedLikes: likes, predictedShares: shares,
    conversionRate: Math.round(conversionRate * 10000) / 100,
    estimatedRevenue,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /api/admin/content-sampler/beats
 *  Returns all genre×mood beat samples ranked by combined score.
 */
router.get("/beats", (_req, res) => {
  try {
    const results = [];
    for (const genre of BEAT_GENRES) {
      for (const mood of BEAT_MOODS) {
        const scores = scoreBeat(genre, mood);
        const hooks = buildBeatHooks(genre, mood);
        const description = buildBeatDescription(genre, mood, scores.bpm, scores.key, scores.price);
        results.push({
          id: `beat-${genre}-${mood}`,
          genre, mood,
          bpm: scores.bpm,
          key: scores.key,
          price: scores.price,
          hooks,
          description,
          ...scores,
        });
      }
    }
    results.sort((a, b) => b.combinedScore - a.combinedScore);
    res.json({ total: results.length, genres: BEAT_GENRES.length, moods: BEAT_MOODS.length, results });
  } catch (err) {
    logger.warn({ err }, "[ContentSampler] /beats failed");
    res.status(500).json({ error: "Failed to generate beat samples" });
  }
});

/** GET /api/admin/content-sampler/posts
 *  Returns all platform×contentType post samples ranked by combined score.
 */
router.get("/posts", (req, res) => {
  try {
    const genre = (req.query.genre as string) || "trap";
    const results = [];
    for (const platform of PLATFORMS) {
      for (const contentType of CONTENT_TYPES_BY_PLATFORM[platform]) {
        const scores = scoreContent(platform, contentType, genre);
        const { caption, hashtags, cta } = buildPostCaption(platform, contentType, genre);
        const bench = PLATFORM_BENCHMARKS[platform];
        results.push({
          id: `post-${platform}-${contentType}`,
          platform, contentType, genre,
          caption, hashtags, cta,
          peakHours: bench.peakHours,
          bestContentType: bench.bestContentType,
          isBestContentType: contentType === bench.bestContentType,
          ...scores,
        });
      }
    }
    results.sort((a, b) => b.combinedScore - a.combinedScore);
    res.json({ total: results.length, platforms: PLATFORMS.length, genre, results });
  } catch (err) {
    logger.warn({ err }, "[ContentSampler] /posts failed");
    res.status(500).json({ error: "Failed to generate post samples" });
  }
});

/** GET /api/admin/content-sampler/matrix
 *  Full cross-product: all genres × all platforms — best content type per combo.
 */
router.get("/matrix", (_req, res) => {
  try {
    const matrix: Record<string, Record<string, {
      bestContentType: string; combinedScore: number;
      engagementScore: number; salesScore: number; estimatedRevenue: number;
    }>> = {};

    for (const genre of BEAT_GENRES) {
      matrix[genre] = {};
      for (const platform of PLATFORMS) {
        let best: { contentType: string; combinedScore: number; engagementScore: number; salesScore: number; estimatedRevenue: number } | null = null;
        for (const ct of CONTENT_TYPES_BY_PLATFORM[platform]) {
          const s = scoreContent(platform, ct, genre);
          if (!best || s.combinedScore > best.combinedScore) {
            best = { contentType: ct, ...s };
          }
        }
        if (best) {
          matrix[genre][platform] = {
            bestContentType: best.contentType,
            combinedScore: best.combinedScore,
            engagementScore: best.engagementScore,
            salesScore: best.salesScore,
            estimatedRevenue: best.estimatedRevenue,
          };
        }
      }
    }

    // Top combos globally
    const top: Array<{ genre: string; platform: string; contentType: string; combinedScore: number; estimatedRevenue: number }> = [];
    for (const [genre, platforms] of Object.entries(matrix)) {
      for (const [platform, data] of Object.entries(platforms)) {
        top.push({ genre, platform, contentType: data.bestContentType, combinedScore: data.combinedScore, estimatedRevenue: data.estimatedRevenue });
      }
    }
    top.sort((a, b) => b.combinedScore - a.combinedScore);

    res.json({ matrix, topCombinations: top.slice(0, 20), platforms: PLATFORMS, genres: BEAT_GENRES });
  } catch (err) {
    logger.warn({ err }, "[ContentSampler] /matrix failed");
    res.status(500).json({ error: "Failed to generate matrix" });
  }
});

/** GET /api/admin/content-sampler/summary
 *  High-level summary: top genres, top platforms, top content types.
 */
router.get("/summary", (_req, res) => {
  try {
    // Top genres by combined beat score across all moods
    const genreTotals: Record<string, { total: number; count: number; topMood: string; topScore: number }> = {};
    for (const genre of BEAT_GENRES) {
      genreTotals[genre] = { total: 0, count: 0, topMood: "", topScore: 0 };
      for (const mood of BEAT_MOODS) {
        const s = scoreBeat(genre, mood);
        genreTotals[genre].total += s.combinedScore;
        genreTotals[genre].count++;
        if (s.combinedScore > genreTotals[genre].topScore) {
          genreTotals[genre].topScore = s.combinedScore;
          genreTotals[genre].topMood = mood;
        }
      }
    }
    const topGenres = Object.entries(genreTotals)
      .map(([genre, d]) => ({ genre, avgScore: Math.round(d.total / d.count), topMood: d.topMood, topScore: d.topScore, ...GENRE_DATA[genre] }))
      .sort((a, b) => b.avgScore - a.avgScore);

    // Top platform × content type combos (genre-agnostic average)
    const platformContentTotals: Record<string, { total: number; count: number }> = {};
    for (const platform of PLATFORMS) {
      for (const ct of CONTENT_TYPES_BY_PLATFORM[platform]) {
        const key = `${platform}::${ct}`;
        platformContentTotals[key] = { total: 0, count: 0 };
        for (const genre of BEAT_GENRES) {
          const s = scoreContent(platform, ct, genre);
          platformContentTotals[key].total += s.combinedScore;
          platformContentTotals[key].count++;
        }
      }
    }
    const topContentCombos = Object.entries(platformContentTotals)
      .map(([key, d]) => {
        const [platform, contentType] = key.split("::");
        return { platform, contentType, avgScore: Math.round(d.total / d.count), ...PLATFORM_BENCHMARKS[platform] };
      })
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);

    res.json({
      topGenres,
      topContentCombos,
      totalBeatSamples: BEAT_GENRES.length * BEAT_MOODS.length,
      totalPostSamples: PLATFORMS.reduce((n, p) => n + CONTENT_TYPES_BY_PLATFORM[p].length, 0),
    });
  } catch (err) {
    logger.warn({ err }, "[ContentSampler] /summary failed");
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

export default router;
