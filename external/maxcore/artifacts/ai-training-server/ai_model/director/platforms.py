"""Platform strategies — 8 platforms, each with modality-specific direction.

Derived from research/organic-social-algorithms-2026.md (20 sources,
2026-09-11) and shared/social-platform-optimization.json. Each platform
gets a Director's brief: what the algorithm rewards, what it punishes,
and how each modality should respond.
"""
from __future__ import annotations

from typing import Dict


# Per-platform Director briefs. Each has:
# - algorithm: one-line essence of what the ranking system rewards
# - audio: mastering/generation notes
# - video: scene/visual strategy
# - social: copy strategy
# - ads: paid strategy
# - avoid: what triggers negative signals
PLATFORM_DIRECTIVES: Dict[str, Dict[str, str]] = {
    "tiktok": {
        "algorithm": "Full video completion is the strong signal. Followers don't matter. Every video judged alone.",
        "audio": "Phone-speaker master, vocal-forward, hook in first 2 seconds. Drop must loop seamlessly for rewatches.",
        "video": "Hook text ≤5 words, first frame. Payoff must be rewatchable — something you miss the first time. Scene 5 loops to scene 1.",
        "social": "Caption is secondary. 3-5 hashtags (2 niche + 2 trend). CTA: duet/stitch — offer identity performance, not just 'link in bio'.",
        "ads": "Spark Ads on best organic. Must not look like an ad — native style, same hook.",
        "avoid": "Same-sound repetition (algorithm diversifies away). Clickbait that causes swipe-away (negative signal).",
    },
    "instagram": {
        "algorithm": "Four separate systems (Feed/Stories/Explore/Reels). Reels wants saves+shares. Penalizes low-res/watermarked/text-heavy.",
        "audio": "Clip the most save-worthy 15 seconds (cleverest lyric, hardest drop), not necessarily the hook.",
        "video": "First frame is everything. No watermarks, no heavy text overlay. High-res native — not a TikTok repost.",
        "social": "300-1200 chars. Caption IS content for Feed — carousel-worthy insights. CTA: 'save this' / 'share to someone'. 3-5 precise hashtags, searchable terms in caption.",
        "ads": "Carousel for saves. Story ads for swipe-up. Polished, not raw — must feel native to Feed.",
        "avoid": "Watermarks, low resolution, muted audio, text-covered video (all explicitly penalized).",
    },
    "youtube": {
        "algorithm": "'Valued watch time' — satisfaction-adjusted, not raw minutes. CTR gets them in, retention keeps them.",
        "audio": "Full-length master at -14 LUFS (YouTube normalizes). Preserve dynamic range — this is the audiophile platform.",
        "video": "Title IS the hook. Title-thumbnail promise must pay off in frame one. Opening 30 seconds determine retention.",
        "social": "Searchable descriptions: genre, mood, similar artists. Chapters for long-form. Title: '[Artist] - [Track]' + emotional hook.",
        "ads": "First 5 seconds unskippable — hook lands BEFORE the skip button. Clear branding early.",
        "avoid": "Clickbait titles that don't deliver (kills retention, the core signal).",
    },
    "facebook": {
        "algorithm": "Predicts YOUR like/comment/share probability. Scroll-past is a negative signal. Replies resurrect old posts.",
        "audio": "Skews older — translate to laptop/car speakers. Warmth over harshness.",
        "video": "Native upload (not YouTube link). Square 1:1 for Feed. First 3 seconds must stop the scroll — pattern interrupt.",
        "social": "80-120 words. Story-driven narrative. Ask questions earning MEANINGFUL comments (not engagement bait). 2-5 hashtags. Tag collaborators.",
        "ads": "Broad targeting + great creative beats narrow + mediocre. Social proof in copy ('12K shares').",
        "avoid": "Generic content that gets scrolled past (modeled as negative). Off-platform links.",
    },
    "threads": {
        "algorithm": "Replies are the signal, but engagement bait is suppressed. Authenticity or death.",
        "audio": "Text-first platform — the STORY behind the audio matters more than the audio. 'The 3am session that made this.'",
        "video": "Minimal — 10-second supplementary clip, not the main event.",
        "social": "40-500 chars. One honest question. Max 1 hashtag. No promo language. 'What was the last song that gave you chills?' beats 'Stream my track!'",
        "ads": "Experimental. Native, conversational, not polished.",
        "avoid": "Engagement bait ('comment YES if...'). Promotional tone. The algorithm knows the difference.",
    },
    "x": {
        "algorithm": "Open-source pipeline. 48-hour recency filter. Diversity re-ranking punishes repetitive takes. New authors boosted.",
        "audio": "Clip the most quotable 30 seconds — the lyric that becomes a meme. X is about the moment.",
        "video": "Under 2:20. Captions burned in (muted autoplay). Must work as a GIF — loopable, punchy.",
        "social": "40-280 chars. Hot take or sharp observation. 0-2 hashtags. Quote-tweet bait. Polls for engagement.",
        "ads": "Promoted posts that don't look promoted. Artist personal account outperforms brand account (novelty boost).",
        "avoid": "Repetitive takes (diversity re-ranker suppresses). Old content (>48h).",
    },
    "linkedin": {
        "algorithm": "Dwell time kills clickbait. Expertise + meaningful comments from topic experts win.",
        "audio": "The BUSINESS of music. 'How we produced this' — process content, not the song itself.",
        "video": "Talking head or studio footage. 1-3 min. Subtitles essential. Professional thumbnail.",
        "social": "400-1500 chars. Industry insight: '3 things I learned producing this.' 2-4 professional hashtags. End with genuine question.",
        "ads": "Sponsored content for music industry pros. Lead gen (sync licensing, production). Case study format.",
        "avoid": "Clickbait (dwell time punishes bounce). Consumer promo tone. Shallow content.",
    },
    "google_business": {
        "algorithm": "Relevance + Distance + Prominence. Reviews are ranking fuel. Can't buy organic placement.",
        "audio": "Event-associated. If artist plays local shows, audio becomes venue-linked.",
        "video": "30-second venue/show clips. Photo-rich. Proves 'this business is active.'",
        "social": "80-1500 chars. Event announcements, releases, studio behind-the-scenes. Natural location keywords. 'Recorded at [Studio] in [City].'",
        "ads": "Local Services Ads (separate from organic). But profile must be COMPLETE first or ads underperform.",
        "avoid": "Incomplete profile. Fake reviews (spam update targets this). Keyword stuffing.",
    },
}


def get_platform_directive(platform: str) -> Dict[str, str]:
    """Get the Director's brief for a platform."""
    key = (platform or "").lower().replace(" ", "_")
    # Normalize aliases.
    aliases = {
        "twitter": "x",
        "ig": "instagram",
        "yt": "youtube",
        "fb": "facebook",
        "tiktok": "tiktok",
    }
    key = aliases.get(key, key)
    return PLATFORM_DIRECTIVES.get(key, PLATFORM_DIRECTIVES["instagram"])


def platform_list() -> list:
    return list(PLATFORM_DIRECTIVES.keys())
