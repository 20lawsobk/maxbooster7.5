# Targeted component-behavior E2E

## Run

- Scope: targeted admin dashboard follow-up only; no route-tour repeat.
- Account: authenticated admin role only (personal identifiers omitted).
- Mutations: none. No reset, bypass, demo login, campaign, purchase, OAuth, save, delete, or generation action.

## Result

| Target | Result | Evidence |
|---|---|---|
| `/admin/dashboard` Audit/Testing panels | **Pass** | After reload/HMR, authenticated dashboard rendered without the old recovery boundary. Audit rendered six category scores, 15 checks, two recommendations, and compliance statuses. Testing rendered the no-suite state safely. |
| Audit response normalization (`auditItems`, `summary`, `testSuites`, `coverage: null`) | **Pass** | Audit data rendered without `undefined.map`; Testing showed em-dash overall score, zero statistics, `No test suites were recorded`, and `Coverage was not included in this test result.` |
| Admin Dashboard Compliance | **Pass** | Compliance Overview rendered 16 checks; ARIA Labels was `warning`, remaining displayed checks were `Compliant`. No stale helper/runtime error. |
| Settings readonly tabs | **Partial / fail** | Profile, Account, and Notifications rendered. Platforms rendered via `/settings?tab=platforms` with 7/8 connected and eight platform cards. Security independently crashed the global boundary: `LoginHistory.tsx:299`, `TypeError: sessions.map is not a function`. No recovery control was clicked; no settings were changed. |
| Royalties period selector | **Pass** | Opened the selector and changed `Current Month` to `Last Month`; page remained stable with zero/no-data metrics. No export, payout, bank, or save action was used. |
| Distribution readonly tabs | **Partial / pass with display issue** | Artist Profiles, Earnings, Platforms, and My Releases rendered. Earnings showed safe empty states but displayed `Avg. per Stream $NaN` with zero streams (non-blocking data-format defect). Platforms rendered a connected sandbox account and platform catalog; an SVG `<path>` attribute console warning appeared without visible breakage. |
| Social Media platform aliases/cards | **Pass with status inconsistency** | After initial loading skeleton settled, eight cards rendered: two Meta cards, Twitter (X), YouTube, TikTok (Sandbox), LinkedIn, Threads, and Google Business. Connection cards showed Connected; overview metrics separately showed `Reconnect needed` for Twitter/TikTok/Threads. No OAuth action was used. |
| Marketplace browse | **Pass with asset warning** | After initialization, Browse rendered 20 beat results, filters, and pricing cards; cart remained 0. No purchase/follow/like/rate/share/cart action was used. CSP blocked several `http://127.0.0.1:8090` image loads, but listings rendered. |
| `/press-kit`, `/publishing` body/headings check | **Pass** | `/press-kit` rendered `Press Kit (EPK)`, General/Media/Links/Performance tabs, and form/action controls without interaction. `/publishing` rendered `Publishing Rights`, zero saved works, empty split breakdown, and PRO registration guide; no work was added or saved. |

## Browser evidence

- Admin dashboard recovery regression was cleared by reload/HMR; evidence screenshots: `kpra4z` (Audit), `wc6d29` (Testing), `190gl3` (Compliance).
- Settings Security remained an independent application bug; evidence screenshot: `nj70vp`.
- Safe readonly evidence includes Platforms settings `0vquq7`, Royalties period `a6ww85`, Distribution `dsy28n`/`df8cfl`/`ukrvh9`, Social Media `3e6b6t`, Marketplace `cmt9s2`, Press Kit `zty5zy`, and Publishing `ctr2bs`.
- Transient WebSocket reconnects and font preload warnings occurred on several pages; they did not cause the tested page failures.
- Visible recovery controls were not clicked. No file was generated, purchased, followed, liked, connected, disconnected, saved, published, deleted, or otherwise mutated during this follow-up.

## Final narrow regression checks (job2144 continuation)

These three checks were already completed in the retained authorized browser session; they were not repeated.

| Check | Result | Evidence |
|---|---|---|
| Settings Security session envelope | **Fail** | One bounded direct navigation plus one Security-tab click still replaced Settings with the global recovery screen. No session list or explicit query-error state rendered. Browser evidence: `wuq3bb`; visible error was `Something went wrong` / `unknown`. No recovery control was clicked. |
| Distribution Earnings zero-stream rate | **Pass** | One bounded navigation/tab selection rendered Earnings & Royalties with zero streams and `Earnings per 1,000 Streams —` (no `$NaN`). Evidence: `gws7my`. An unrelated `ApiKeyManagement.tsx` null-name console error was logged, but the requested panel rendered. |
| Marketplace MaxCore image proxy | **Fail** | One bounded marketplace navigation and DOM/network inspection found no `/api/maxcore-media` image (`proxyImages []`). Listings rendered, but browser logs still showed CSP-blocked `http://127.0.0.1:8090/uploads/images/...` image URLs and related 404s. Evidence: `0elp7h`. No purchase, cart, like, rating, share, or upload action was used. |

No saves, revokes, purchases, OAuth changes, generations, logout, reset, demo login, or bypass actions were performed during these final checks.

## Final Settings Security recheck

| Check | Result | Evidence |
|---|---|---|
| Fresh `/settings` reload, then Security | **Unable / blocked by fresh-session app failure** | The prior notebook/browser worker was lost, so a fresh browser context was created without the retained session. `/settings` remained in bootstrap for ~6 seconds, then rendered the global recovery boundary. Browser console identified `Settings.tsx:167:21`, `TypeError: Cannot read properties of null (reading 'firstName')`; no Settings tabs or Security sessions were available. Cookie notice was visible but was not accepted, and no recovery control or authentication bypass was used. Evidence: `sgdkb4`. |

This narrow recheck did not exercise the fixed Security session parser because the fresh context did not reach authenticated Settings. No marketplace or earnings checks were rerun, per instruction.

## Continuation: corrections and current evidence

Earlier failures above are retained as historical observations, not overwritten with passes.

- **Marketplace corrected and live HTTP verification passed.** Two unmatched parentheses in the route module prevented registration. After correction and restart, `/api/marketplace/beats?limit=20` returned HTTP 200, with no internal-origin media references and 30 same-origin proxy references. A referenced image returned HTTP 200, `image/png`, and 1,997,502 bytes. No catalog records were edited.
- **API-key dialog crash corrected.** Both closed action-dialog subtrees had evaluated `selectedKey.name` with no selection. They now render only with an actual selected key. Rendering the real component with no selected key passes; existing mutation guards remain intact.
- **Settings authentication bootstrap corrected.** Profile initializers no longer dereference an unresolved user. The page shows a session-checking state rather than rendering an editable form while unauthenticated. Existing full-profile hydration and authentication redirects remain in place.
- **Focused verification:** 28 contract/proxy tests plus 6 actual-component render/entry-point compilation checks passed. The marketplace route itself is now included in compilation coverage.
- **Security browser status remains unconfirmed.** The remote worker lost its authorized session and could not access the workspace's existing credential environment. A local browser used those credentials for normal sign-in (HTTP 200), but the bounded confirmation did not reach the Security tab. This is not recorded as a browser pass, nor as proof of a remaining application defect.
- **Earnings:** the previously observed zero-stream em-dash result remains valid; that flow was not repeated.

The development app is running. This does not change the separate production simulation verdict: capsule checks passed, but initialized production readiness was blocked by deliberately unavailable mock dependencies; historical subsystem capsules only establish restore compatibility.
