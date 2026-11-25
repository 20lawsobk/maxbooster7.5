# Research Notes: Organic Social Platform Algorithm Signals (2025-2026)

**Status:** complete
**Depth:** Standard

## Plan

- **Question:** What are the real, currently-documented ranking/distribution mechanics of each major platform's ORGANIC (non-paid) content algorithm — Instagram, TikTok, YouTube, Facebook, Threads, X, LinkedIn, and Google Business Profile — as of 2025-2026?
- **Scope:** Organic/algorithmic content ranking, distribution, and engagement signals only. Explicitly OUT of scope: paid advertising, ad auctions, ad targeting/bidding — this product has a separate paid-ad research subsystem and the two must never be merged.
- **Audience:** Internal engineering use. This will be synthesized into a structured, source-cited configuration file consumed by an AI content-generation "awareness" layer that gives platform-specific guidance to content generators (replacing an existing config that has no citations or research provenance).
- **Deliverable:** A cited research report (research/organic-social-algorithms-2026.md) plus a structured data file wired into server/services/platformAwarenessOptimization.ts afterward.

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Instagram & TikTok (short-form/visual discovery ranking) | done | 6 |
| 2 | YouTube (watch time, session, Shorts vs long-form) | done | 4 |
| 3 | Facebook & Threads (meaningful interactions, community ranking) | done | 4 |
| 4 | X & LinkedIn (real-time relevance, professional feed ranking) | done | 3 |
| 5 | Google Business Profile (local search ranking factors) | done | 4 |

## Coverage Checklist

- [x] What specific engagement signals does each platform's own documentation/engineering blog say it weighs (e.g. watch completion, saves, shares, replies)? — Instagram (per-surface predicted actions) [@ig-ranking-explained]; TikTok (completion, negative feedback) [@tiktok-newsroom-fyp]; YouTube ("valued watch time") [@youtube-recommendation-system]; Facebook (multitask like/comment/share prediction) [@fb-newsfeed-ranking-engineering]
- [x] What has each platform officially said about how it ranks Reels/Shorts/short-form video specifically vs. static posts? — Instagram Reels penalizes low-res/watermarked/muted/text-heavy video [@ig-ranking-explained]; TikTok completion outweighs weak contextual signals [@tiktok-newsroom-fyp]; YouTube does not publicly disclose Shorts-specific weights (gap, see below)
- [x] What do platforms say about the role of early engagement velocity / first-hour or first-minutes performance? — Not confirmed by any official source for any platform in this pass; only unverified secondary claims exist (moved to Limitations)
- [x] What are Google's documented local ranking factors (relevance, distance, prominence) for Business Profile? — Confirmed triad, officially documented [@gbp-official-local-ranking], corroborated independently [@gbp-moz-local-algorithm]
- [x] What algorithm changes have been documented/announced in the last 12-18 months per platform? — Facebook same-day Reels boost (Oct 2025, reported) [@fb-buffer-2025-reels]; Threads engagement-bait correction (2024, official acknowledgment) [@threads-verge-engagement-bait]; X open-sourced its ranking pipeline (2026) [@x-algorithm-github]; Google 3 core updates + 1 spam update in 2025, not confirmed local-pack-specific [@gbp-sel-2025-updates]
- [x] Where do independent studies/reverse-engineering analyses agree or disagree with platforms' own official statements? — YouTube: an academic study found CTR more associated with views than raw watch time in its sample, which sits alongside rather than contradicts YouTube's official emphasis on watch time/satisfaction [@youtube-ctr-watchtime-study] [@youtube-recommendation-system]
- [x] Is there credible evidence distinguishing organic ranking signals from paid/boosted visibility mechanics? — Yes: every source above describes recommendation/ranking systems distinct from ad auctions; Google explicitly states organic local placement cannot be purchased [@gbp-official-local-ranking]

## Findings Log

_[@key] markers reference sources in research/sources.json; they become numbered citations in the final report._

### Instagram & TikTok

- Instagram ranks Feed, Stories, Explore, and Reels with separate systems, each predicting different actions from activity, post/creator info, and interaction history [@ig-ranking-explained].
- Reels reach is explicitly reduced for low-resolution, watermarked, muted, or heavily text-covered video [@ig-ranking-explained].
- Explore uses a multi-stage pipeline: lightweight candidate generation before heavier ranking models [@ig-explore-engineering].
- Widely reported (not fully confirmed officially) hierarchy for Reels: watch time, likes-per-reach, sends-per-reach [@ig-reels-signals-industry].
- TikTok explicitly names full video completion as a strong signal, outweighing weak contextual signals like geography; follower count and past performance are NOT direct ranking inputs [@tiktok-newsroom-fyp].
- TikTok deliberately diversifies the feed away from same-creator/same-sound repetition; "Not Interested" and hides are negative signals [@tiktok-newsroom-fyp].

### YouTube

- Clicks signal intent but are not equated with watching; "valued watch time" (survey-informed satisfaction) is YouTube's stated higher-order signal [@youtube-recommendation-system].
- Likes/dislikes/shares are satisfaction signals weighted per individual viewer habit, not fixed global weights [@youtube-recommendation-system].
- 2025 leadership commentary describes added context (time of day, device) alongside historical watch behavior [@youtube-sej-2025].
- An academic regression study found CTR more strongly associated with views than raw watch time/retention in its sample — sits alongside YouTube's official framing rather than refuting it (see Conflicts) [@youtube-ctr-watchtime-study].
- No official disclosure of Shorts-specific ranking weights; a "28-30 day freshness" claim is analyst speculation, not confirmed [@youtube-shorts-freshness-sej].

### Facebook & Threads

- Feed ranking is a multi-pass ML pipeline: ~500-candidate lightweight pass, then scoring, then a contextual pass [@fb-newsfeed-ranking-engineering].
- Predicts multiple actions (like/comment/share probability) per user-story pair and blends them into one personalized score — no fixed universal weight per reaction type [@fb-newsfeed-ranking-engineering].
- Explicit (like/comment/share) and implicit (viewing, scrolling past) signals are both modeled; skipping is itself a negative signal [@fb-newsfeed-ranking-engineering] [@fb-transparency-feed-ranking].
- New replies can re-bump an older post back into ranking consideration [@fb-newsfeed-ranking-engineering].
- Meta reported (Oct 2025) surfacing more same-day creator Reels [@fb-buffer-2025-reels].
- Threads: Meta confirmed reply count, recency, and interaction history as real ranking inputs; independent reporting found comments/replies outweigh likes/reposts, which Meta itself flagged as an exploitable "engagement bait" problem [@threads-verge-engagement-bait].

### X & LinkedIn

- X's open-sourced pipeline blends in-network (Thunder) and out-of-network (Phoenix embeddings + SimClusters) candidates, filters out posts older than 48h, scores multiple action families, then re-ranks for diversity (VMRanker) [@x-algorithm-github].
- Explicit boosts exist for author diversity, out-of-network discovery, and newer authors [@x-algorithm-github].
- LinkedIn ranks around relevance, demonstrated expertise, and meaningful comments from topically-engaged people, not raw comment volume [@linkedin-buffer-algorithm-2026].
- LinkedIn dwell time is a confirmed signal: in-feed visible time (once ≥50% on-screen) plus post-click time on destination content; discourages clickbait bounce-backs [@linkedin-dwell-time-smt].

### Google Business Profile

- Three official organic local ranking factors: relevance, distance, prominence [@gbp-official-local-ranking], corroborated independently [@gbp-moz-local-algorithm].
- Prominence draws on web-wide information, links/mentions, and review quantity+quality [@gbp-official-local-ranking].
- Google explicitly states there is no way to pay for better organic local placement [@gbp-official-local-ranking].
- Review count and score are a confirmed local-ranking input [@gbp-sel-reviews-2020].
- No official confirmation that posting frequency/Business Profile "Posts" is a direct ranking factor — treat as unverified marketing advice.

## Conflicts & Open Questions

- **YouTube CTR vs. watch time:** an academic regression study [@youtube-ctr-watchtime-study] found CTR more associated with views than raw watch time/retention in its sample, while YouTube's own material [@youtube-recommendation-system] frames watch time and satisfaction ("valued watch time") as the core signals. Resolution: not a direct contradiction — correlation-with-views in one observational sample is not the same claim as ranking weight, and YouTube's "watch time" explicitly includes satisfaction-adjusted time, not just raw minutes. The report presents both and flags the distinction rather than picking a winner.
- **Instagram Reels signal hierarchy** (watch time > likes-per-reach > sends-per-reach): repeated across multiple 2026 industry sources but not verified against an official Instagram-published weighting [@ig-reels-signals-industry]. Reported as industry-attributed, not confirmed.
- **Threads comment-weighting:** Meta confirmed reply count as an input but did not publish that it outranks likes/reposts; that specific ordering is independent reporting/observation, corroborated by Meta's own acknowledgment of an "engagement bait" side effect [@threads-verge-engagement-bait]. Treated as reported, not officially quantified.
- **Google Business Profile Posts/posting frequency:** no official source found confirming this as a ranking factor, despite common marketing claims. Explicitly called out as unverified in the report.

## Gaps

- Early engagement velocity (first-hour/first-minutes performance) as a distinct ranking factor: no official platform source confirmed or denied this directly for any platform in two search passes. Moved to Limitations rather than pursued further (Standard-tier stop rule).
- Exact numeric signal weights for any platform's production ranking model: no platform publishes these (by design, to deter gaming). Moved to Limitations.
- YouTube Shorts-specific and Instagram Stories-specific ranking detail beyond what's in the Findings Log: thin official coverage. Moved to Limitations.
