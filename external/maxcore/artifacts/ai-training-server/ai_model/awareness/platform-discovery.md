# MaxCore platform discovery

The canonical platform set comes from `ai_model.platform_optimization.PLATFORMS`:
Facebook, Instagram, X (including the Twitter alias), YouTube, TikTok, LinkedIn,
Threads, and Google Business Profile. Platform-specific domains, indexed-content
paths, and topic terms live together in `platform_discovery.py`.

## Search and collection policy

- The existing local observatory searches only observations already stored by
  MaxCore; it does not crawl the open web.
- The existing Exa/Tavily adapters are the only broad-web discovery providers
  in this checkout. New per-platform provider queries are disabled unless
  `MAXCORE_AWARENESS_PLATFORM_DISCOVERY=1` is explicitly set. When both providers
  are available, Exa is selected unless
  `MAXCORE_AWARENESS_PLATFORM_DISCOVERY_PROVIDER` selects `exa` or `tavily`.
- `MAXCORE_AWARENESS_SEARCH_INTERVAL_SECONDS` sets the minimum interval for all
  Exa/Tavily awareness sources. It defaults to 3600 seconds and is bounded to
  900–3600 seconds. The last-attempt ledger is persisted with each source's
  existing awareness observation document so restarts do not reset the quota.
- Search results are never fetched as pages by this adapter. First-party
  platform URLs are labeled `index_snippet`; non-platform URLs are labeled
  `third_party_search` because the result alone does not verify editorial
  independence. Search relevance is not engagement.
- The existing official YouTube Atom feeds remain direct-public feed ingestion.
  Direct page crawling for all eight platforms is disabled until platform
  terms, robots rules, and allowed paths have been reviewed and encoded.
- Search-index text and public feed content have unknown reuse rights and are
  explicitly training-ineligible. They may contribute cited awareness context
  only; they cannot become model-training examples through this source path.
- Each accepted observation carries its canonical platform, retrieval method,
  citation, original publication time when available, actual scan time,
  source-attribution confidence, explicit unknown region/unclassified genre,
  sanitized-content SHA-256, redaction policy, and observation expiry. Search
  relevance is kept separate from measured social engagement.

The admin-only diagnostics route is
`GET /api/awareness/unified/admin/source-status`. It reports configuration,
scan outcome, freshness, source failures, and schedule state without returning
provider credentials or raw search snippets. The profile-discovery route
searches the persisted local index and does not make request-time web calls.
