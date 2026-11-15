# Accessibility launch audit and shared navigation repair

The focused shared navigation acceptance passes **nine product leaf checks** in actual Chromium. The current fixture also passes two startup diagnostics; these add no product accessibility coverage. **All 80 full-page accessibility gates remain UNVERIFIED.** This audit retains all 80 route declarations and all 2,162 existing business sections; it does not replace their detailed implementation or acceptance work.

The existing assembled80-page suite checks hydration, route identity and selected authentication/business journeys. Its route sweep reads visible body text and detects crashes. Those observations do not establish keyboard operation, contrast, screen-reader usability or WCAG2.2AA compliance. No installed axe-core package was found. The focused regression uses Chromium's actual accessibility tree and keyboard events rather than inventing an automated compliance score.

## Confirmed defects repaired

| Finding | Observed defect and consequence | Repair | Acceptance |
| --- | --- | --- | --- |
| NAV01 | At390CSSpx the menu, Settings and Sign Out controls all had an empty actual accessibility name. Icons were decorative and responsive text was hidden. WCAG4.1.2. | Stable accessible names survive responsive text hiding; signing-out state keeps its meaningful label. | Actual Chromium Accessibility domain names exactly match all 3 controls. |
| NAV02 | Settings rendered a button inside a link, creating nested interactive semantics. | Button asChild styles the real Settings link; one link retains its actual destination. | DOM has one A with href=/settings and no nested button/link. |
| NAV03 | A real Tab from before the layout focused the offscreen sidebar close control while its ancestor had aria-hidden=true. WCAG2.4.3/2.4.7 and hidden-focus risk. | Closed mobile sidebar is inert; desktop and open navigation remain interactive. | Actual Tab reaches the visible menu trigger, never the closed aside; desktop resize restores a focusable navigation link. |
| NAV04 | Menu control had no programmatic expanded state or controlled region. WCAG4.1.2. | Actual AppLayout state flows to aria-expanded and aria-controls references the real sidebar. | Closed=false, opened=true and controlled element is the actual ASIDE. |
| NAV05 | Keyboard opening did not move focus into the navigation; closing lacked explicit opener restoration. | Opening focuses the named close control; Escape closes and restores a connected opener. Desktop resizing preserves visible navigation focus and releases mobile body scroll lock. | Actual Enter opens/focuses, Escape restores focus/scroll, desktop resize exposes the navigation. |

The paired final test runs the same exact test source against the original3 files at HEADc06 and the repaired files: **before2PASS/7FAIL; after 9PASS/0FAIL/0SKIP**. TAP reports10 because it includes the parent; JUnit contains9 actual leaf cases. Source before/after hashes match in the final focused run. The client type check and three-file lint check also pass. An earlier incomplete CDP Enter event caused an intermediate focus failure; that attempt is retained, the event was corrected, and the original source was rerun with the same final test. No failure was removed from the evidence.

Current registry reachability associates the shared layout with47 of80 declarations. Reachability alone does not prove that each exact page/state rendered the component. No page is automatically marked accessible because its shared component passes this test.

## Replay and what the test covers

Run from the repository root with Node22, installed root dependencies, an actual Chromium binary and a completed production frontend build:

```sh
npm run build
env -i PATH="$PATH" HOME=/tmp CHROMIUM_PATH=/usr/bin/chromium \
  LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" \
  node --test tests/layout-navigation-accessibility-browser.test.mjs
```

The test executes actual AppLayout, TopBar, Sidebar, Button, icons, Wouter links and the built production stylesheet at 390px and 1280px. Authentication, translation text and unrelated notification/pending/language/theme widgets are controlled fixture boundaries. It creates one owned loopback HTTP server and Chromium profile and cleans up its owned browser descendants. It starts no application backend, provider or database and passes no application credentials to Chromium. The headless container's --no-sandbox test flag is not a product launch configuration.

The permanent regression retains the nine navigation cases in the finding table and now adds two startup diagnostics for a real early-exit child and a missing executable. Its TAP total 12 includes the navigation parent and is not12 product journeys. It is discovered by the ordinary canonical Node runner, without adding a duplicate browser-group invocation. Missing Chromium or built styles fails rather than silently skipping.

The completed a160 master exposed a fixture-only startup failure before those assertions: nested sealed TMPDIR paths exceeded Chromium's Unix SingletonSocket limit. The cb783f1f correction supplies a short private owned browser temporary directory, preserves the startup deadline and original assertions, and reports bounded stderr on spawn/early exit. The exact nested reproduction changes from failure in10.804s to pass in2.287s. The subsequent complete122-file Node group also passes with unchanged cb inputs. The final 10d full master additionally passes all 124 Node files from unchanged current inputs, including the same nine product checks and two fixture diagnostics; this still grants no complete-page conformance. The [sealed-startup cohort](../../reports/accessibility-audit/2026-10-28-sealed-startup/README.md) and [full Node recheck](../../reports/test-rechecks/2026-10-28-node-final/README.md) preserve both outcomes; the original a160 full master remains failed.

The retained versioned cohort also includes a reproduction wrapper:

```sh
python3 reports/accessibility-audit/2026-10-28/build-evidence.py
```

That environment-specific wrapper selects the prepared cloud Node/Chromium/library paths, reruns the exact focused test, binds source hashes and rebuilds its80-row audit. Existing historical before receipts are retained. For a later source checkpoint, create a new versioned cohort rather than overwrite this historical evidence. The ordinary test command above is the portable selector; the wrapper is the recorded cloud recipe.

## Complete per-page acceptance requirements

Every A01–A18 criterion below applies to **each exact route and every named section**, including pending, loaded, empty, error, denied, success, modal, timeout and recovery states. Applicability exceptions need an explicit reviewed reason and evidence; unknown does not mean not applicable. A pass requires current-source automated interaction/DOM/AX evidence plus the manual keyboard, screen-reader and device checks applicable to that criterion. A failed required state is FAIL. Missing, skipped, stale or incomplete evidence is UNVERIFIED. Either prevents page accessibility Green.

| ID | Area / WCAG2.2AA | Explicit pass criterion |
| --- | --- | --- |
| A01 | Non-text alternatives / 1.1.1 | Every informative image/icon/canvas/audio visualizer has an equivalent meaningful name/description; decorative media is excluded from the accessibility tree. No required information only in a waveform/canvas. |
| A02 | Media alternatives / 1.2.1–1.2.5 | Prerecorded required audio/video has equivalent transcript/captions/audio description as applicable; live synchronized audio has captions. Test actual media controls and captions. Mark applicability only with explicit reviewed reason. |
| A03 | Semantics and relationships / 1.3.1–1.3.3 | Headings, landmarks, form labels/instructions, table headers and groups expose correct programmatic relationships; no duplicated/nested interactive controls or hidden required information. |
| A04 | Orientation and input purpose / 1.3.4–1.3.5 | Supported tasks work in portrait and landscape without a justified essential lock; personal-data inputs expose correct autocomplete purpose. |
| A05 | Color, contrast, audio and text / 1.4.1–1.4.3,1.4.5,1.4.11 | Information does not rely on color alone; ordinary text contrast >=4.5:1, large text >=3:1 and essential controls/focus graphics >=3:1 in every enabled theme/state. Autoplay audio longer than3seconds has independent stop/pause/volume control. Use actual text rather than images of text except reviewed customizable/essential exceptions. |
| A06 | Resize and reflow / 1.4.4,1.4.10,1.4.12 | Text at 200% and layout at 320CSSpx/400% zoom retain all information and controls without two-dimensional scrolling except explicitly essential content; WCAG text-spacing overrides cause no clipping/loss. |
| A07 | Hover/focus additional content / 1.4.13 | Every tooltip/popover shown by hover or focus is dismissible, hoverable and persistent until dismissed or its trigger is invalidated. |
| A08 | Keyboard operation / 2.1.1–2.1.2 | Every action and parameter adjustment completes with keyboard; no trap; drag-only/time-critical gestures have a keyboard path unless the exact criterion exception is documented. |
| A09 | Shortcuts, timing and animation / 2.1.4,2.2.1–2.2.2,2.3.1 | Single-character shortcuts can be disabled/remapped/focus-scoped; time limits can be adjusted as required; moving/auto-updating content can pause; no prohibited flashing. |
| A10 | Bypass and page identity / 2.4.1–2.4.2 | First-keyboard bypass skips repeated navigation into actual page content; each direct route has an accurate programmatic document title and logical landmark/heading structure. |
| A11 | Focus order and visibility / 2.4.3,2.4.7,2.4.11 | Sequential focus follows meaningful task order; closed/hidden panels receive no keyboard focus; focus is visible and not entirely obscured by sticky UI, modal or overlay. |
| A12 | Link purpose and navigation consistency / 2.4.4–2.4.6,3.2.3–3.2.4 | Link/control names identify their purpose in context; multiple required ways to locate pages exist; navigation and repeated components remain consistently named/ordered. |
| A13 | Pointer, drag and target size / 2.5.1–2.5.4,2.5.7–2.5.8 | Multipoint/path/drag actions have single-pointer alternatives; cancellation works; accessible name contains visible label; no mandatory motion actuation; targets meet24x24CSSpx or explicit spacing/exception rule. |
| A14 | Language and locale / 3.1.1–3.1.2 | Actual document language and language changes are programmatic; translated/RTL states keep names, reading/focus order and complete content without clipping. |
| A15 | Predictability and consistent help / 3.2.1–3.2.2,3.2.6 | Focus/input changes do not unexpectedly navigate or submit; help mechanisms retain consistent relative order when repeated. |
| A16 | Form errors, labels and financial safety / 3.3.1–3.3.4 | Required fields and errors are named, linked and announced; suggestions are available when known; financial/legal/deletion submissions support correction, reversal or reviewed confirmation. |
| A17 | Redundant entry and accessible authentication / 3.3.7–3.3.8 | Same-session entry is reused/selectable where required; login/recovery permit password-manager/autofill/paste and avoid unsupported cognitive-function tests without an accessible alternative. |
| A18 | Name, role, value and status / 4.1.2–4.1.3 | All components expose meaningful name/role/state/value; expanded/control/selection/error/busy changes match real behavior; results/errors/progress announcements work without unexpected focus loss. |

The machine requirements explicitly map all 55 WCAG2.2 levelA/AA success-criterion IDs (4.1.1 was removed in WCAG2.2). The18 work groups cover those55 criteria; no criterion is considered passed by enumeration. Full-page conformance still requires the applicable complete processes and supported technologies to satisfy them.

Automated engine results must retain rule IDs, affected selectors, route, viewport/theme/state, source/build identity and original failures. Automated results alone do not establish compliance. Manual evidence must identify browser/OS, keyboard/screen-reader/device combination, exact steps, expected behavior and actual results. Required mobile/desktop combinations must be selected from the actual supported browser/device policy, not inferred from a single Chromium run. Every enabled language must be checked for actual document language, labeling, reading direction and reflow; translated string availability is not usability proof.

## All 80 route declarations

Every row links its unchanged detailed page ledger. “Shared” denotes static AppLayout reachability and makes only the focused shared regression relevant. It is not a page acceptance result. Each row still requires A01–A18 across all its listed business sections. The machine matrix retains every exact page and section ID in [page-matrix.json](../../reports/accessibility-audit/2026-10-28/page-matrix.json).

| # | Exact route / page | Existing sections | Shared navigation reachable | Full accessibility | Required action |
| --- | --- | ---: | --- | --- | --- |
| 01 | [`/` — Landing](platform-pages/01-page-cf4f3530c8ccde8f.md) | 18 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 02 | [`/login` — Login](platform-pages/02-page-23ce7c7e997981d4.md) | 3 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 03 | [`/forgot-password` — ForgotPassword](platform-pages/03-page-7f17f36f4a6d3aed.md) | 3 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 04 | [`/reset-password` — ResetPassword](platform-pages/04-page-2a2c17c232b5fcd5.md) | 5 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 05 | [`/register` — Register](platform-pages/05-page-9da19c6eee5bd969.md) | 4 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 06 | [`/register/payment/:tier` — RegisterPayment](platform-pages/06-page-a60277a4e056b8ab.md) | 5 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 07 | [`/register/success` — RegisterSuccess](platform-pages/07-page-75dbcc7fada78c89.md) | 5 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 08 | [`/dashboard` — Dashboard](platform-pages/08-page-f754bab3b8d528f4.md) | 93 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 09 | [`/simplified-dashboard` — SimplifiedDashboard](platform-pages/09-page-dc3bfa7924ddde50.md) | 14 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 10 | [`/projects` — Projects](platform-pages/10-page-df5f01b0d874ceee.md) | 42 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 11 | [`/desktop-app` — DesktopApp](platform-pages/11-page-aeb90701dc33c8a1.md) | 24 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 12 | [`/analytics/ai` — AIDashboard](platform-pages/12-page-ad4acc42ba6a751c.md) | 5 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 13 | [`/analytics` — Analytics](platform-pages/13-page-3cfc55ed26d03472.md) | 175 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 14 | [`/developer-api` — DeveloperApi](platform-pages/14-page-a0ed6ee11074e449.md) | 24 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 15 | [`/social-media` — SocialMedia](platform-pages/15-page-e56b9766f2945aa7.md) | 189 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 16 | [`/advertising` — Advertisement](platform-pages/16-page-0f978b2bf973cf34.md) | 148 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 17 | [`/marketplace` — Marketplace](platform-pages/17-page-3e2b4173745cfa8c.md) | 145 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 18 | [`/marketplace/beat/:beatId` — Marketplace](platform-pages/18-page-02a207e3438be3a7.md) | 145 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 19 | [`/marketplace/producer/:producerId` — ProducerProfilePage](platform-pages/19-page-58f548116a3234eb.md) | 17 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 20 | [`/royalties` — Royalties](platform-pages/20-page-635fc99b3b741b66.md) | 67 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 21 | [`/studio/:projectId` — Studio](platform-pages/21-page-ed7827b964a45e80.md) | 113 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 22 | [`/studio` — Studio](platform-pages/22-page-026dde28daf442a3.md) | 113 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 23 | [`/show` — ShowPage](platform-pages/23-page-c36c8bd3a09d63ad.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 24 | [`/distribution` — Distribution](platform-pages/24-page-0126aa06ffb28787.md) | 255 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 25 | [`/pricing` — Pricing](platform-pages/25-page-8d22e7cc7b3446a6.md) | 8 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 26 | [`/subscribe/:tier` — Subscribe](platform-pages/26-page-c6d13b43c7cc4e76.md) | 12 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 27 | [`/admin/security` — SecurityDashboard](platform-pages/27-page-b8b0cddfa14cdfd8.md) | 22 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 28 | [`/admin/audit-log` — AuditLogPage](platform-pages/28-page-fc92c038f0b85867.md) | 3 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 29 | [`/admin/support/tickets/:ticketId` — SupportTicketDetail](platform-pages/29-page-5bce414955386b94.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 30 | [`/admin/support` — SupportDashboard](platform-pages/30-page-5c7b3ab32229f8ec.md) | 7 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 31 | [`/support/tickets/:ticketId` — CustomerSupportTicket](platform-pages/31-page-560c7763a9e7fb51.md) | 3 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 32 | [`/admin/kyc` — KYCReview](platform-pages/32-page-8a9ccd0f03ea5557.md) | 9 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 33 | [`/admin/training` — TrainingDashboard](platform-pages/33-page-e3111bc7fe578d2b.md) | 16 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 34 | [`/admin/content-sampler` — ContentSampler](platform-pages/34-page-8b397f43d79dce6f.md) | 15 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 35 | [`/admin/dashboard` — AdminDashboard](platform-pages/35-page-0fda85c2efe41c4f.md) | 49 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 36 | [`/admin/beat-money-loop` — AdminDashboard](platform-pages/36-page-55dfad22454614e1.md) | 49 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 37 | [`/admin` — Admin](platform-pages/37-page-715e8f99c3094ef7.md) | 37 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 38 | [`/settings` — Settings](platform-pages/38-page-012f330aa8bcebbd.md) | 118 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 39 | [`/features` — Features](platform-pages/39-page-dcf4f11657afd2e8.md) | 17 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 40 | [`/api-docs` — API](platform-pages/40-page-2893f5cb89784c41.md) | 15 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 41 | [`/documentation` — Documentation](platform-pages/41-page-1ab9e38dce5a27a6.md) | 3 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 42 | [`/about` — About](platform-pages/42-page-8fbf33216fa51488.md) | 3 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 43 | [`/blog` — Blog](platform-pages/43-page-6d90853e7d127d50.md) | 3 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 44 | [`/blog/:slug` — BlogPost](platform-pages/44-page-11667d7488854b85.md) | 4 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 45 | [`/solo-founder-story` — SoloFounderStory](platform-pages/45-page-ff5f662c60cf94de.md) | 2 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 46 | [`/security` — SecurityPage](platform-pages/46-page-16afca09e75cb31a.md) | 4 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 47 | [`/dmca` — DMCA](platform-pages/47-page-4876fa83f37dea71.md) | 2 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 48 | [`/terms` — Terms](platform-pages/48-page-c2e85ad263dd6056.md) | 5 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 49 | [`/privacy` — Privacy](platform-pages/49-page-bc81104f0950b549.md) | 4 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 50 | [`/onboarding` — Onboarding](platform-pages/50-page-8701ce23cc0ec64d.md) | 5 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 51 | [`/help` — Help](platform-pages/51-page-d13f0763357fd628.md) | 3 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 52 | [`/storefront` — Storefront](platform-pages/52-page-d7d0ea0e035959d6.md) | 6 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 53 | [`/storefront/:slug` — Storefront](platform-pages/53-page-b35c432dacd654e6.md) | 6 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 54 | [`/store/:slug` — Storefront](platform-pages/54-page-cfdecadd0884ff0b.md) | 6 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 55 | [`/s/:label` — StorefrontShortLink](platform-pages/55-page-09185942073c1f46.md) | 3 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 56 | [`/admin/autonomy` — AdminAutonomy](platform-pages/56-page-2b833f3df51626a9.md) | 7 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 57 | [`/verification` — Verification](platform-pages/57-page-c034adbaa56b9257.md) | 5 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 58 | [`/contracts` — Contracts](platform-pages/58-page-ead45c538b390b5e.md) | 6 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 59 | [`/workspaces` — Workspaces](platform-pages/59-page-1b2415b660b26090.md) | 5 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 60 | [`/collaborations` — Collaborations](platform-pages/60-page-99d4f7970ff660eb.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 61 | [`/career-coach` — CareerCoach](platform-pages/61-page-a1c10f86781e3d23.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 62 | [`/assistant` — Assistant](platform-pages/62-page-5625b47daf44c540.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 63 | [`/release-countdown` — ReleaseCountdown](platform-pages/63-page-ab75b2cc5959692e.md) | 3 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 64 | [`/invoices` — Invoices](platform-pages/64-page-1b23e8ec1db53b5f.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 65 | [`/handle-link` — HandleLink](platform-pages/65-page-df08d75ba4d0bf2b.md) | 2 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 66 | [`/notifications/:id` — NotificationDetail](platform-pages/66-page-63589cd4ecb0fe7e.md) | 3 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 67 | [`/notifications` — Notifications](platform-pages/67-page-7af4f1aeb5f034dc.md) | 3 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 68 | [`/workflow-automations` — MusicWorkflowAutomations](platform-pages/68-page-5c924cf1d9d52f74.md) | 5 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 69 | [`/shows` — Shows](platform-pages/69-page-f029c2cf04b24a04.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 70 | [`/fan-hub` — FanHub](platform-pages/70-page-bcd2ea6a168949e5.md) | 5 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 71 | [`/fan-memberships` — FanMemberships](platform-pages/71-page-f23716ac1d13c11e.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 72 | [`/ar-intelligence` — ARIntelligence](platform-pages/72-page-ac42bdc76322f85e.md) | 3 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 73 | [`/outreach` — OutreachCRM](platform-pages/73-page-823d585c797a15c2.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 74 | [`/merch` — MerchStore](platform-pages/74-page-25ba331df6c4bb6f.md) | 6 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 75 | [`/press-kit` — PressKit](platform-pages/75-page-baeb2a65a1758f27.md) | 5 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 76 | [`/playlist-pitching` — PlaylistPitching](platform-pages/76-page-f7b5f6c0875c088f.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 77 | [`/publishing` — Publishing](platform-pages/77-page-1a0c0cf086ddf173.md) | 4 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 78 | [`/sync-licensing` — SyncLicensing](platform-pages/78-page-35864bad10b44dc7.md) | 3 | Yes | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 79 | [`/epk/:slug` — PublicPressKit](platform-pages/79-page-cbeaedba40fda3f6.md) | 3 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |
| 80 | [`*` — NotFound](platform-pages/80-page-226db30da46a5ec6.md) | 3 | No | UNVERIFIED | Execute A01–A18 for every section/state; retain exact evidence. |

## Remaining blockers and dependency order

1. Preserve the completed 10d master and unchanged-source receipt alongside the historical a160 master, original nine-case before/after cohort, exact nested startup failure/correction and cb Node recheck. All 124 Node files pass in10d, but no failed earlier full-master result is rewritten as passing and no full-page conformance follows.
2. Preserve the refreshed platform register, all 80-page plan and launch matrix after the completed 10d master. All 80 pages remain Red: source inputs match, but coverage/full-feature/accessibility and deployed gates remain incomplete. Current-source cold startup passes all four commands and 37 independent checks, still with productionReady:false and no page-conformance claim. The initial accessibility audit register remains historical; source freshness, startup or focused navigation success cannot establish full-page conformance.
3. Execute A01–A18 on every exact page and section with owned backend fixtures and real frontend behavior. Missing seeded records, roles, integration error states, locales or native media/device capabilities are dependencies to implement or provision, not reasons to drop a page or mark it passed.
4. Add an actual automated accessibility engine to the owned page fixture only with a pinned compatible dependency and reviewed integration; retain all rules/results and repair real violations. This remains open and was not replaced by the nine focused checks.
5. Complete manual keyboard, screen-reader, zoom/reflow, contrast/theme, pointer/drag, captions/transcripts, accessible-auth and translated/RTL checks. Track every failure with affected page/section/source, fix, dependencies, risk and exact acceptance receipt. Browser accessibility-tree correctness does not guarantee screen-reader announcement timing or usable workflows.
6. Review the root bypass/landmark relationship: App.tsx currently nests SkipLinks and Router inside the outer role=main, while AppLayout renders another main. Verify actual skip activation and subsequent Tab order on authenticated/public routes before deciding a repair. Static source suggests a risk; no focused runtime proof or compliance conclusion is claimed here.
7. Green requires all applicable A01–A18 states passed with current evidence, no unresolved accessibility blockers, and all other production gates passed. Any regression reopens affected pages. The all 80 matrix and global launch register remain authoritative about missing proof.

The repair is reversible as one source/test change. Before reverting inert or labels, retain a fixed alternative that prevents the reproduced hidden-focus and empty-name failures. No schema/provider migration is involved. A later regression can be isolated by running this test against the relevant source snapshot and retaining both results.

Evidence: [cohort README](../../reports/accessibility-audit/2026-10-28/README.md), [source-bound focused receipt](../../reports/accessibility-audit/2026-10-28/focused-receipt.json), [final JUnit](../../reports/accessibility-audit/2026-10-28/after-final.junit.xml), [all 80 matrix](../../reports/accessibility-audit/2026-10-28/page-matrix.json), [summary](../../reports/accessibility-audit/2026-10-28/summary.json), [artifact hashes](../../reports/accessibility-audit/2026-10-28/manifest.json).
