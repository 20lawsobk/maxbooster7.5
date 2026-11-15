---
name: Awareness profile sources
description: MaxCore awareness collection should follow public music-profile content across the configured platforms.
---

MaxCore server awareness may register sources only for the eight selected canonical platforms: Facebook, Instagram, X/Twitter, YouTube, TikTok, LinkedIn, Threads, and Google Business Profile. Exclude charts, industry/news feeds, blogs, Mastodon, Bluesky, generic landscape endpoints, and every other source, even if public. The four awareness “domains” are internal analysis categories, not websites or source targets. The platform optimization registry contains content guidance and research citations, not profile targets or live fetch adapters.

For MaxCore awareness profile sourcing, apply a provisional global 0–100 match-potential range to public content observations and report score distributions over the discovery cohort. Do not set account/profile-specific thresholds or grades; profile identity is provenance and diversity context only. The minimum eligible score is 70, the preferred band is 80–95, and scores above 95 remain eligible. Exact content matches are not required. Require measured creative quality, music relevance, and platform fit; report missing evidence instead of imputing it. This is not yet an empirically calibrated equivalence to Google Veo output.

Only claim a platform is supported when its public profile records can be read through a real authorized or anonymous source. If access or required factors are unavailable, report that platform or candidate as unsupported/insufficient; do not scrape around access controls or invent factor scores.

The owner approves public search-index snippets from Google Business Profile place pages as post content for MaxCore awareness. Keep the source domain and platform allowlists; do not fetch the destination page.

**Why:** the owner explicitly chose to count these public Google Business Profile snippets as posts while keeping awareness limited to publicly accessible post content from the eight selected platforms.

**How to apply:** Treat the provider's public index snippet as the observation, retain its platform-specific citation and provenance, and continue to reject results outside the approved Google Business Profile domain/path policy.

**Why:** the user specified that only the selected eight social platforms are approved MaxCore server awareness sources, narrowing earlier read-only permission for public-source tests. The canonical platform registry identifies the eight names above. No actual Veo/profile calibration set was established, so the default quality range remains explicitly provisional.

**How to apply:** enforce the eight-platform allowlist at source registration, before any network request, and test the actual configured source IDs. Keep platform-specific access and rights checks; read-only approval does not authorize training or reuse. Do not treat profile discovery results as retrieved post content or engagement evidence. Apply the global quality band and summarize score distributions across source/platform cohorts; report platform support and candidate-factor gaps in awareness status.
