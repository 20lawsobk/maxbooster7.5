# MaxCore platform-source rights review

**Reviewed:** 2026-11-12  
**Scope:** The eight canonical platforms in Max Booster's registry. This is an
operational source-policy review, not legal advice or a guarantee that any
particular use is lawful.

## Enforced handling

- Public visibility does not establish permission to automate collection,
  retain content, redistribute it, or train a model. No personal owner consent
  is required merely to read a public page in a browser, but this server's
  automated use must still comply with the platform, API, search-provider,
  privacy, and content-rights rules that apply to the chosen access path.
- Native direct-page crawling is disabled for all eight platforms. The server
  does not bypass login, robots, CAPTCHA, rate limits, access denials, or API
  scopes. The YouTube Atom adapter rechecks the live robots file and then still
  fails closed unless its source-policy gate is satisfied.
- Optional Exa/Tavily discovery returns bounded, sanitized search-index
  metadata/snippets only. The adapter does not fetch result pages. These rows
  have unknown reuse rights, are short-lived awareness context, and are
  excluded from training. Provider availability is not a platform connection.
- Platform-derived material cannot enter the training corpus from this source
  path. A user/owner grant cannot replace the original rightsholder's permission
  or override a platform contract. Separately, MaxCore-authored owner output and
  simulator records can use the existing signed internal training receipts;
  those receipts do not cover third-party posts.

## Platform matrix

| Platform | Official policy reviewed | Server policy |
| --- | --- | --- |
| Facebook | [Meta Platform Terms](https://developers.facebook.com/terms/) | No anonymous page scraping. Require an approved Meta access path and scoped permissions before collecting first-party data. Keep search snippets awareness-only; honor applicable data deletion and consent requirements. |
| Instagram | [Meta Platform Terms](https://developers.facebook.com/terms/) and [Instagram Terms](https://help.instagram.com/581066165581870) | No anonymous page scraping. The Meta terms require rights to content supplied through an app and restrict certain user-profile processing. The Instagram consumer-terms page did not yield readable content in this check, so its additional terms remain unverified; this does not loosen the block. |
| X / Twitter | [X Developer Agreement](https://developer.x.com/en/developer-terms/agreement) | No direct collection without a verified authorized API path. The agreement explicitly forbids using X API or X Content to fine-tune or train a foundation or frontier model. Training stays blocked for all X-derived material here; removal and location rules must be honored for any future approved API integration. |
| YouTube | [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service) | The configured Atom feed is gated by a fresh robots check and source-policy approval. No API access is configured in this awareness adapter. API terms do not provide a general content-reuse license; preserve attribution and deletion requirements if an approved API source is added. |
| TikTok | [TikTok Terms of Service](https://www.tiktok.com/legal/terms-of-service) | Automated scraping, crawling, exporting, or extraction is blocked absent TikTok's written approval. Search-index results, if supplied by an enabled provider, are not treated as permission to fetch the page or train on its content. |
| LinkedIn | [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement) | Crawlers and other automated means to scrape or copy Services are blocked. Third-party search results do not establish content-owner consent or reuse rights. |
| Threads | [Threads API overview](https://developers.facebook.com/docs/threads/overview/) | No general public-feed reader is configured. The reviewed API overview describes displaying posts created through the API to the person who created them; any API use must be limited to verified scopes and that documented purpose. |
| Google Business Profile | [Business Profile API policies](https://developers.google.com/my-business/content/policies) | API access is limited to profiles owned or authorized for management. API content has restricted storage (temporary, no more than 30 calendar days, secure, and not manipulated or aggregated); this source is excluded from durable history and training. |

## Evidence limits and maintenance

Official pages were fetched on the review date. The Instagram consumer-terms
page did not produce readable text in this environment; the linked Meta
developer terms were readable. This check did not establish a grant for any
specific connected Max Booster account, and it did not test provider API
credentials or fetch actual platform posts. Current robots rules are checked
at request time by the guarded YouTube adapter; the static admin matrix is an
application-policy status, not a live robots claim. Re-review this matrix when
platform terms, API scopes, source contracts, or data-handling behavior change.
