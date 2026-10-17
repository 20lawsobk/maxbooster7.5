# Dashboard / SimplifiedDashboard / Projects review

## Scope and implementation

Only the three assigned page files, the focused regression test, and this review were edited. Shared components, backend, schema, configuration, packages, pricing, and the 90-day guarantee were not changed.

- Dashboard now reads `/api/countdowns`' actual `{ success, data }` envelope; the previous `countdowns` property silently hid persisted releases. Countdown and recent-project failures have explicit retry states.
- Both full-dashboard entry points persist `preferSimplifiedView: false`, update both experience-level keys, and reject an unsuccessful persistence response. Following the coordinator's atomic server merge, they send only these intentionally changed preference keys, never a stale copy of unrelated onboarding metadata. The standalone simplified page now reads preferences from the authenticated user (the onboarding-status endpoint returns only completion and step), refreshes `/api/auth/me` before navigating, and uses the same subscription guard as Dashboard and Projects. Mode-switch success copy no longer implies a subscription upgrade.
- Dashboard excludes the backend's `free` tier from paid AI affordances, remounts account-specific state on user changes, removes the browser-global onboarding skip flag, and invalidates authenticated user/status after a persisted skip.
- Projects rebinds audio completion/error callbacks even when projects share an audio URL. Selecting a project without audio no longer stops another preview. Late draft recovery cannot overwrite a subsequently opened project's form, and closing/unmounting invalidates recovery. A second unversioned draft deletion was removed: the existing acknowledged-version listener remains responsible for cleanup. Editing close controls and delete actions are guarded while their requests are pending; titles are trimmed and the input respects the server's 255-character limit. Unauthenticated users no longer render project controls while redirecting.

## Read-only API/auth/ownership/persistence trace

| Path | Evidence inspected |
| --- | --- |
| Auth | `useRequireAuth.ts` redirects anonymous users and non-active/non-trialing subscribers (with existing admin/demo exceptions). `AuthProvider.tsx` sources `/api/auth/me`, fences offline identity, and clears private cache on account transitions. These guards are navigation UX, not backend subscription enforcement. |
| Onboarding | `server/routes.ts`'s GET `/api/auth/onboarding-status` checks `req.user` and returns completion/step only. At initial inspection POST `/api/auth/update-onboarding` replaced the user's onboarding JSON. The coordinator subsequently reported validated completion/step/object input, an atomic PostgreSQL merge of supplied preference keys, and 404 for a missing owned user. Both pages now send only the changed preference keys to avoid stale concurrent-tab metadata overwrites. |
| Dashboard | GET `/api/dashboard/comprehensive` checks `req.user` and scopes its inspected project/release/social-account/analytics queries to that ID. Existing metric availability handling was retained. |
| Projects list | GET `/api/projects` checks `req.user`, calls `getProjectsByUserId`, and returns `{ data }`; storage filters `projects.userId`, orders by update time, and limits the result to 500. |
| Project mutations | `server/routes/studio.ts` POST duplicate passes the authenticated ID to `duplicateProject`. PATCH validates its allowed schema, verifies ownership and constrains the final update by project/user ID. DELETE verifies ownership before removing tracks, royalty splits and the project. No requests were sent to these routes. |
| Offline edits/deletes | Page queue payloads retain expected update timestamps and account identity assertions. `server/routes/sync.ts`'s inspected handlers validate payloads, lock/read owned rows, compare timestamps, and use allowlisted changes. The page's completion listener deletes only the acknowledged local draft version. |
| Countdowns | `releaseCountdown.ts` authenticates and obtains only the authenticated user's countdowns from `releaseCountdownService`; tasks are fetched using those selected countdown IDs. The route returns `{ success: true, data: countdownsWithProgress }`. |
| AI | Dashboard retains normalized insight handling. `/api/ai/insights` authenticates and calls the controller; `aiAnalyticsService.generateInsights` immediately invokes `missingMaxCoreAnalyticsContract`, so this remains an explicitly unavailable capability, not fabricated insight data. `/api/ai/optimize-content` authenticates, checks tier, verifies existing draft ownership/state/content, and is explicitly draft-only; the page's existing persistence checks and draft review flow were retained. |

## Coordinator-owned follow-ups / exact patch targets

1. **Onboarding validation/concurrent preference updates — coordinator addressed:** the coordinator reports validation of boolean/step/object shape, atomic PostgreSQL preference merging, and 404 for a missing owned user. This page follow-up removes full-object spreads from both mode-switch requests. Backend changes are coordinator-owned and were not modified by this workstream.
2. **Direct project fallback concurrency:** in `server/routes/studio.ts`, PATCH and DELETE lack the queued handlers' `expectedUpdatedAt` check. Extend their request contract to accept the expected timestamp, lock and compare the owned row in a transaction, and return 409 before modification on mismatch. Then coordinator can request a corresponding page fallback-payload update. Offline queue conflict handling was not weakened.
3. **Project deletion atomicity:** direct DELETE in `server/routes/studio.ts` performs separate deletes. Wrap owned-row verification and dependent deletes in one transaction and keep the final project delete user-constrained. This prevents partially removed projects if a dependent deletion fails.
4. **Project-count source alignment:** `/api/projects` reads `projects`, while comprehensive Dashboard's “Studio Projects” count reads the distinct `studioProjects` table. Confirm the intended cross-table definition before changing the backend aggregate; this review did not invent a merged count.
5. **AI insight availability:** keep the current explicit unavailability until an authenticated, user-scoped MaxCore insight contract exists. The unreachable legacy implementation below the guard aggregates platform-wide users/projects and must not simply be re-enabled for customer dashboards.
6. **Subscription authorization:** page hooks redirect but do not prevent requests before their redirect effect; inspected comprehensive/project routes enforce authentication, not subscription status. If subscriber-only access is a server requirement, add a shared backend subscription middleware with the intended admin/demo exceptions rather than relying on UI redirects.

## Verification and limitations

- Focused command: `node_modules/.bin/vitest run --config vitest.config.ts tests/unit/dashboard-projects-page-regressions.test.ts`.
- Result: **13 tests passed, 1 test file passed**. Only the existing Vitest `poolOptions` deprecation warning was emitted.
- Tests compile the actual three TSX pages for syntax and execute extracted actual callbacks with isolated dependencies: changed-key-only full-mode payloads (excluding stale persona/goals), rejected saves, shared-audio completion, no-audio playback preservation, and out-of-order draft recovery. Source-contract assertions cover endpoint envelopes, auth refresh/guard, and acknowledged-version cleanup.
- `git diff --check` was run on the owned implementation/test files.
- A screenshot of the already-running `/dashboard` preview showed the loading skeleton only. The signed-in dashboard, dialogs, and navigation were **not visually verified**; no auth was bypassed.
- No full build/typecheck, workflow restart, DB mutation, live transaction, external message, deployment, or secrets read was performed. No claim of production readiness is made.
