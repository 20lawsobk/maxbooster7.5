# Endpoint Audit Report

Generated 2026-09-04T09:39:47.612Z against `http://127.0.0.1:5000`.

Backend routes statically found: 2240 (unique method+path: 2232). Frontend `/api/*` call sites found: 2174 (unique method+path: 1087). Unresolved dynamic registrations: 1.

**Findings: 159 total — 17 high, 1 medium, 141 low.**

## HIGH severity (17)

### missing-route-31: missing-route — GET /api/search/similar
- **Location:** client/src/components/search/DiscoveryFeed.tsx:460
- **Description:** The frontend calls GET /api/search/similar (methodConfidence: detected) from client/src/components/search/DiscoveryFeed.tsx:460. Live evidence: a live GET probe to the same path also hit this server's generic "route does not exist" handler, and no static registration for GET at this path was found either. This endpoint will 404 for every real user.
- **Recommendation:** Register a matching route in the appropriate server/routes/*.ts file (no similarly-named existing route was found, so this is likely an entirely unbuilt endpoint, not a typo).

### missing-route-66: missing-route — GET /api/analytics-alerts/
- **Location:** client/src/hooks/useAnalyticsInvalidation.ts:6
- **Description:** The frontend calls GET /api/analytics-alerts/ (methodConfidence: assumed) from client/src/hooks/useAnalyticsInvalidation.ts:6. Live evidence: a live GET probe to the same path also hit this server's generic "route does not exist" handler, and no static registration for GET at this path was found either. This endpoint will 404 for every real user.
- **Recommendation:** Register a matching route in the appropriate server/routes/*.ts file, or fix the frontend call -- closest existing registered path(s): /api/analytics-alerts/alerts.

### missing-route-67: missing-route — GET /api/dashboard/
- **Location:** client/src/hooks/useAnalyticsInvalidation.ts:7, client/src/hooks/useAnalyticsInvalidation.ts:64
- **Description:** The frontend calls GET /api/dashboard/ (methodConfidence: assumed) from client/src/hooks/useAnalyticsInvalidation.ts:7, client/src/hooks/useAnalyticsInvalidation.ts:64. Live evidence: a live GET probe to the same path also hit this server's generic "route does not exist" handler, and no static registration for GET at this path was found either. This endpoint will 404 for every real user.
- **Recommendation:** Register a matching route in the appropriate server/routes/*.ts file (no similarly-named existing route was found, so this is likely an entirely unbuilt endpoint, not a typo).

### missing-route-68: missing-route — GET /api/artist-progress/
- **Location:** client/src/hooks/useAnalyticsInvalidation.ts:8
- **Description:** The frontend calls GET /api/artist-progress/ (methodConfidence: assumed) from client/src/hooks/useAnalyticsInvalidation.ts:8. Live evidence: a live GET probe to the same path also hit this server's generic "route does not exist" handler, and no static registration for GET at this path was found either. This endpoint will 404 for every real user.
- **Recommendation:** Register a matching route in the appropriate server/routes/*.ts file, or fix the frontend call -- closest existing registered path(s): /api/artist-profiles/.

### missing-route-86: missing-route — GET /api/releases
- **Location:** client/src/lib/prefetch.ts:251
- **Description:** The frontend calls GET /api/releases (methodConfidence: assumed) from client/src/lib/prefetch.ts:251. Live evidence: a live GET probe to the same path also hit this server's generic "route does not exist" handler, and no static registration for GET at this path was found either. This endpoint will 404 for every real user.
- **Recommendation:** Register a matching route in the appropriate server/routes/*.ts file (no similarly-named existing route was found, so this is likely an entirely unbuilt endpoint, not a typo).

### missing-route-116: missing-route — GET /api/press-kit/public
- **Location:** client/src/pages/PublicPressKit.tsx:16
- **Description:** The frontend calls GET /api/press-kit/public (methodConfidence: detected) from client/src/pages/PublicPressKit.tsx:16. Live evidence: a live GET probe to the same path also hit this server's generic "route does not exist" handler, and no static registration for GET at this path was found either. This endpoint will 404 for every real user.
- **Recommendation:** Register a matching route in the appropriate server/routes/*.ts file, or fix the frontend call -- closest existing registered path(s): /api/press-kit/publish, /api/press-kit/photo, /api/press-kit/.

### live-error-141: live-error — GET /s/:label
- **Location:** server/index.ts:1354
- **Description:** A live GET probe to /s/:label did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X GET http://127.0.0.1:5000/s/1 and check server logs for a hang or unhandled rejection in the handler at server/index.ts:1354.

### live-error-142: live-error — GET /:id
- **Location:** server/middleware/requestValidation.ts:31
- **Description:** A live GET probe to /:id did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X GET http://127.0.0.1:5000/1 and check server logs for a hang or unhandled rejection in the handler at server/middleware/requestValidation.ts:31.

### live-error-143: live-error — GET /:slug
- **Location:** server/middleware/requestValidation.ts:50
- **Description:** A live GET probe to /:slug did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X GET http://127.0.0.1:5000/1 and check server logs for a hang or unhandled rejection in the handler at server/middleware/requestValidation.ts:50.

### live-error-144: live-error — GET /api/achievements/user
- **Location:** server/routes/achievements.ts:19
- **Description:** A live GET probe to /api/achievements/user did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X GET http://127.0.0.1:5000/api/achievements/user and check server logs for a hang or unhandled rejection in the handler at server/routes/achievements.ts:19.

### live-error-145: live-error — GET /api/achievements/unnotified
- **Location:** server/routes/achievements.ts:31
- **Description:** A live GET probe to /api/achievements/unnotified did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X GET http://127.0.0.1:5000/api/achievements/unnotified and check server logs for a hang or unhandled rejection in the handler at server/routes/achievements.ts:31.

### live-error-146: live-error — GET /api/achievements/leaderboard
- **Location:** server/routes/achievements.ts:71
- **Description:** A live GET probe to /api/achievements/leaderboard did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X GET http://127.0.0.1:5000/api/achievements/leaderboard and check server logs for a hang or unhandled rejection in the handler at server/routes/achievements.ts:71.

### live-error-147: live-error — GET /api/achievements/streaks
- **Location:** server/routes/achievements.ts:87
- **Description:** A live GET probe to /api/achievements/streaks did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X GET http://127.0.0.1:5000/api/achievements/streaks and check server logs for a hang or unhandled rejection in the handler at server/routes/achievements.ts:87.

### live-error-148: live-error — POST /api/achievements/streaks/:type
- **Location:** server/routes/achievements.ts:97
- **Description:** A live POST probe to /api/achievements/streaks/:type did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X POST http://127.0.0.1:5000/api/achievements/streaks/1 and check server logs for a hang or unhandled rejection in the handler at server/routes/achievements.ts:97.

### live-error-149: live-error — GET /api/adaptive-pricing/history
- **Location:** server/routes/adaptivePricing.ts:39
- **Description:** A live GET probe to /api/adaptive-pricing/history did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X GET http://127.0.0.1:5000/api/adaptive-pricing/history and check server logs for a hang or unhandled rejection in the handler at server/routes/adaptivePricing.ts:39.

### live-error-150: live-error — GET /api/admin/audit-log/
- **Location:** server/routes/admin/auditLog.ts:30
- **Description:** A live GET probe to /api/admin/audit-log/ did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X GET http://127.0.0.1:5000/api/admin/audit-log/ and check server logs for a hang or unhandled rejection in the handler at server/routes/admin/auditLog.ts:30.

### live-error-151: live-error — GET /api/admin/audit-log/summary
- **Location:** server/routes/admin/auditLog.ts:84
- **Description:** A live GET probe to /api/admin/audit-log/summary did not complete: timeout.
- **Recommendation:** Reproduce with curl -i -X GET http://127.0.0.1:5000/api/admin/audit-log/summary and check server logs for a hang or unhandled rejection in the handler at server/routes/admin/auditLog.ts:84.

## MEDIUM severity (1)

### duplicate-registration-153: duplicate-registration — GET /health
- **Location:** server/diffusion-gateway/index.ts:540, server/startup-probes.ts:441
- **Description:** GET /health is registered 2 times: server/diffusion-gateway/index.ts:540, server/startup-probes.ts:441. Express dispatches to the first matching registration only.
- **Recommendation:** Keep the intended handler and delete, rename, or remount the others -- the later registration(s) are unreachable dead code today.

## LOW severity (141)

### method-unconfirmed-1: method-unconfirmed — GET /api/pocket/create
- **Location:** client/src/components/PocketDimensionDashboard.tsx:103
- **Description:** The frontend calls GET /api/pocket/create from client/src/components/PocketDimensionDashboard.tsx:103. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-2: method-unconfirmed — GET /api/pocket/:param/write
- **Location:** client/src/components/PocketDimensionDashboard.tsx:145
- **Description:** The frontend calls GET /api/pocket/:param/write from client/src/components/PocketDimensionDashboard.tsx:145. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-3: method-unconfirmed — POST /api/auth/me
- **Location:** client/src/components/auth/AuthProvider.tsx:80, client/src/pages/Settings.tsx:2157
- **Description:** The frontend calls POST /api/auth/me from client/src/components/auth/AuthProvider.tsx:80, client/src/pages/Settings.tsx:2157. this audit found no statically-registered POST route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-4: method-unconfirmed — GET /api/auth/heartbeat
- **Location:** client/src/components/auth/InactivityManager.tsx:49
- **Description:** The frontend calls GET /api/auth/heartbeat from client/src/components/auth/InactivityManager.tsx:49. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-5: method-unconfirmed — PUT /api/batch/templates
- **Location:** client/src/components/batch/BatchTemplateManager.tsx:147
- **Description:** The frontend calls PUT /api/batch/templates from client/src/components/batch/BatchTemplateManager.tsx:147. this audit found no statically-registered PUT route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-6: method-unconfirmed — DELETE /api/batch/templates
- **Location:** client/src/components/batch/BatchTemplateManager.tsx:164
- **Description:** The frontend calls DELETE /api/batch/templates from client/src/components/batch/BatchTemplateManager.tsx:164. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-7: method-unconfirmed — GET /api/social/generate-image
- **Location:** client/src/components/content/AIImageGenerator.tsx:181, client/src/pages/SocialMedia.tsx:2217, client/src/pages/SocialMedia.tsx:3031
- **Description:** The frontend calls GET /api/social/generate-image from client/src/components/content/AIImageGenerator.tsx:181, client/src/pages/SocialMedia.tsx:2217, client/src/pages/SocialMedia.tsx:3031. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-8: method-unconfirmed — GET /api/social/generate-video
- **Location:** client/src/components/content/ServerVideoGenerator.tsx:55, client/src/components/content/ServerVideoGenerator.tsx:535
- **Description:** The frontend calls GET /api/social/generate-video from client/src/components/content/ServerVideoGenerator.tsx:55, client/src/components/content/ServerVideoGenerator.tsx:535. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-9: method-unconfirmed — GET /api/social/analyze-audio
- **Location:** client/src/components/content/ServerVideoGenerator.tsx:742
- **Description:** The frontend calls GET /api/social/analyze-audio from client/src/components/content/ServerVideoGenerator.tsx:742. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-10: method-unconfirmed — GET /api/social/analyze-image
- **Location:** client/src/components/content/ServerVideoGenerator.tsx:810
- **Description:** The frontend calls GET /api/social/analyze-image from client/src/components/content/ServerVideoGenerator.tsx:810. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-11: method-unconfirmed — GET /api/social/beat-analyze
- **Location:** client/src/components/content/ServerVideoGenerator.tsx:873
- **Description:** The frontend calls GET /api/social/beat-analyze from client/src/components/content/ServerVideoGenerator.tsx:873. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-12: method-unconfirmed — GET /api/social/generate-music-video
- **Location:** client/src/components/content/ServerVideoGenerator.tsx:910, client/src/pages/Distribution.tsx:6316
- **Description:** The frontend calls GET /api/social/generate-music-video from client/src/components/content/ServerVideoGenerator.tsx:910, client/src/pages/Distribution.tsx:6316. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-13: method-unconfirmed — POST /api/career-coach/recommendations
- **Location:** client/src/components/dashboard/AICareerCoach.tsx:272, client/src/components/dashboard/AICareerCoach.tsx:287
- **Description:** The frontend calls POST /api/career-coach/recommendations from client/src/components/dashboard/AICareerCoach.tsx:272, client/src/components/dashboard/AICareerCoach.tsx:287. this audit found no statically-registered POST route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-14: method-unconfirmed — DELETE /api/artist-profiles
- **Location:** client/src/components/distribution/ArtistProfileManager.tsx:167
- **Description:** The frontend calls DELETE /api/artist-profiles from client/src/components/distribution/ArtistProfileManager.tsx:167. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-15: method-unconfirmed — GET /api/distribution/profiles/link
- **Location:** client/src/components/distribution/DataTransferWizard.tsx:201
- **Description:** The frontend calls GET /api/distribution/profiles/link from client/src/components/distribution/DataTransferWizard.tsx:201. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-16: method-unconfirmed — GET /api/distribution/profiles/:param/sync
- **Location:** client/src/components/distribution/DataTransferWizard.tsx:232
- **Description:** The frontend calls GET /api/distribution/profiles/:param/sync from client/src/components/distribution/DataTransferWizard.tsx:232. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-17: method-unconfirmed — GET /api/distribution/profiles/:param
- **Location:** client/src/components/distribution/DataTransferWizard.tsx:249
- **Description:** The frontend calls GET /api/distribution/profiles/:param from client/src/components/distribution/DataTransferWizard.tsx:249. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-18: method-unconfirmed — GET /api/distribution/profiles/:param/import-catalog
- **Location:** client/src/components/distribution/DataTransferWizard.tsx:273
- **Description:** The frontend calls GET /api/distribution/profiles/:param/import-catalog from client/src/components/distribution/DataTransferWizard.tsx:273. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-19: method-unconfirmed — GET /api/distribution/profiles/:param/scan-releases
- **Location:** client/src/components/distribution/DataTransferWizard.tsx:316
- **Description:** The frontend calls GET /api/distribution/profiles/:param/scan-releases from client/src/components/distribution/DataTransferWizard.tsx:316. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-20: method-unconfirmed — GET /api/custom-workflows/:param/enable
- **Location:** client/src/components/distribution/EmbedCodeGenerator.tsx:519
- **Description:** The frontend calls GET /api/custom-workflows/:param/enable from client/src/components/distribution/EmbedCodeGenerator.tsx:519. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-21: method-unconfirmed — GET /api/export/data
- **Location:** client/src/components/export/ExportDialog.tsx:245
- **Description:** The frontend calls GET /api/export/data from client/src/components/export/ExportDialog.tsx:245. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-22: method-unconfirmed — DELETE /api/export/history
- **Location:** client/src/components/export/ExportHistory.tsx:367
- **Description:** The frontend calls DELETE /api/export/history from client/src/components/export/ExportHistory.tsx:367. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-23: method-unconfirmed — GET /api/files/bulk-delete
- **Location:** client/src/components/files/BulkFileManager.tsx:197
- **Description:** The frontend calls GET /api/files/bulk-delete from client/src/components/files/BulkFileManager.tsx:197. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-24: method-unconfirmed — GET /api/files/:param/restore
- **Location:** client/src/components/files/FileOperationsMenu.tsx:147
- **Description:** The frontend calls GET /api/files/:param/restore from client/src/components/files/FileOperationsMenu.tsx:147. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-25: method-unconfirmed — GET /api/storage/upload
- **Location:** client/src/components/files/FileUploader.tsx:118, client/src/lib/imageUpload.ts:8, client/src/pages/Advertisement.tsx:3046, client/src/pages/Marketplace.tsx:729, client/src/pages/Marketplace.tsx:3485, client/src/pages/Marketplace.tsx:6126, client/src/pages/Marketplace.tsx:6741, client/src/pages/Marketplace.tsx:7197, client/src/pages/Marketplace.tsx:7231, client/src/pages/MerchStore.tsx:221, client/src/pages/PressKit.tsx:172, client/src/pages/SocialMedia.tsx:1139, client/src/pages/SocialMedia.tsx:4859
- **Description:** The frontend calls GET /api/storage/upload from client/src/components/files/FileUploader.tsx:118, client/src/lib/imageUpload.ts:8, client/src/pages/Advertisement.tsx:3046, client/src/pages/Marketplace.tsx:729, client/src/pages/Marketplace.tsx:3485, client/src/pages/Marketplace.tsx:6126, client/src/pages/Marketplace.tsx:6741, client/src/pages/Marketplace.tsx:7197, client/src/pages/Marketplace.tsx:7231, client/src/pages/MerchStore.tsx:221, client/src/pages/PressKit.tsx:172, client/src/pages/SocialMedia.tsx:1139, client/src/pages/SocialMedia.tsx:4859. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-26: method-unconfirmed — GET /api/files/validate
- **Location:** client/src/components/files/FileValidationStatus.tsx:198
- **Description:** The frontend calls GET /api/files/validate from client/src/components/files/FileValidationStatus.tsx:198. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-27: method-unconfirmed — PUT /api/notifications
- **Location:** client/src/components/notifications/NotificationCenter.tsx:226, client/src/components/notifications/NotificationCenter.tsx:253, client/src/components/notifications/useNotifications.ts:68, client/src/components/notifications/useNotifications.ts:100, client/src/pages/NotificationDetail.tsx:52, client/src/pages/Notifications.tsx:123, client/src/pages/Notifications.tsx:150
- **Description:** The frontend calls PUT /api/notifications from client/src/components/notifications/NotificationCenter.tsx:226, client/src/components/notifications/NotificationCenter.tsx:253, client/src/components/notifications/useNotifications.ts:68, client/src/components/notifications/useNotifications.ts:100, client/src/pages/NotificationDetail.tsx:52, client/src/pages/Notifications.tsx:123, client/src/pages/Notifications.tsx:150. this audit found no statically-registered PUT route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-28: method-unconfirmed — DELETE /api/notifications
- **Location:** client/src/components/notifications/NotificationCenter.tsx:268, client/src/components/notifications/NotificationCenter.tsx:295, client/src/components/notifications/useNotifications.ts:134, client/src/components/notifications/useNotifications.ts:168, client/src/pages/NotificationDetail.tsx:60, client/src/pages/Notifications.tsx:165, client/src/pages/Notifications.tsx:192
- **Description:** The frontend calls DELETE /api/notifications from client/src/components/notifications/NotificationCenter.tsx:268, client/src/components/notifications/NotificationCenter.tsx:295, client/src/components/notifications/useNotifications.ts:134, client/src/components/notifications/useNotifications.ts:168, client/src/pages/NotificationDetail.tsx:60, client/src/pages/Notifications.tsx:165, client/src/pages/Notifications.tsx:192. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-29: method-unconfirmed — GET /api/users/complete-onboarding
- **Location:** client/src/components/onboarding/QuickStartWizard.tsx:95
- **Description:** The frontend calls GET /api/users/complete-onboarding from client/src/components/onboarding/QuickStartWizard.tsx:95. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-30: method-unconfirmed — GET /api/auth/avatar
- **Location:** client/src/components/onboarding/WelcomeFlow.tsx:256, client/src/components/onboarding/WelcomeWizard.tsx:220, client/src/lib/imageUpload.ts:8
- **Description:** The frontend calls GET /api/auth/avatar from client/src/components/onboarding/WelcomeFlow.tsx:256, client/src/components/onboarding/WelcomeWizard.tsx:220, client/src/lib/imageUpload.ts:8. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-32: method-unconfirmed — GET /api/search/filter-presets/:param
- **Location:** client/src/components/search/FilterPresetsManager.tsx:129
- **Description:** The frontend calls GET /api/search/filter-presets/:param from client/src/components/search/FilterPresetsManager.tsx:129. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-33: method-unconfirmed — GET /api/search/filter-presets/:param/default
- **Location:** client/src/components/search/FilterPresetsManager.tsx:160
- **Description:** The frontend calls GET /api/search/filter-presets/:param/default from client/src/components/search/FilterPresetsManager.tsx:160. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-34: method-unconfirmed — GET /api/search/history/:param
- **Location:** client/src/components/search/GlobalSearch.tsx:132, client/src/components/search/RecentSearches.tsx:107
- **Description:** The frontend calls GET /api/search/history/:param from client/src/components/search/GlobalSearch.tsx:132, client/src/components/search/RecentSearches.tsx:107. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-35: method-unconfirmed — DELETE /api/auth/api-keys
- **Location:** client/src/components/settings/ApiKeyManagement.tsx:152
- **Description:** The frontend calls DELETE /api/auth/api-keys from client/src/components/settings/ApiKeyManagement.tsx:152. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-36: method-unconfirmed — GET /api/platform-sync/devices/register
- **Location:** client/src/components/settings/CrossPlatformSync.tsx:145
- **Description:** The frontend calls GET /api/platform-sync/devices/register from client/src/components/settings/CrossPlatformSync.tsx:145. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-37: method-unconfirmed — GET /api/platform-sync/devices/:param
- **Location:** client/src/components/settings/CrossPlatformSync.tsx:177
- **Description:** The frontend calls GET /api/platform-sync/devices/:param from client/src/components/settings/CrossPlatformSync.tsx:177. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-38: method-unconfirmed — GET /api/platform-sync/sync/push
- **Location:** client/src/components/settings/CrossPlatformSync.tsx:216
- **Description:** The frontend calls GET /api/platform-sync/sync/push from client/src/components/settings/CrossPlatformSync.tsx:216. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-39: method-unconfirmed — POST /api/auth/sessions
- **Location:** client/src/components/settings/LoginHistory.tsx:125, client/src/components/settings/LoginHistory.tsx:147
- **Description:** The frontend calls POST /api/auth/sessions from client/src/components/settings/LoginHistory.tsx:125, client/src/components/settings/LoginHistory.tsx:147. this audit found no statically-registered POST route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-40: method-unconfirmed — GET /api/social/approvals/:param/submit
- **Location:** client/src/components/social/ApprovalDashboard.tsx:179
- **Description:** The frontend calls GET /api/social/approvals/:param/submit from client/src/components/social/ApprovalDashboard.tsx:179. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-41: method-unconfirmed — GET /api/social/approvals/:param/approve
- **Location:** client/src/components/social/ApprovalDashboard.tsx:215
- **Description:** The frontend calls GET /api/social/approvals/:param/approve from client/src/components/social/ApprovalDashboard.tsx:215. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-42: method-unconfirmed — GET /api/social/approvals/:param/reject
- **Location:** client/src/components/social/ApprovalDashboard.tsx:257
- **Description:** The frontend calls GET /api/social/approvals/:param/reject from client/src/components/social/ApprovalDashboard.tsx:257. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-43: method-unconfirmed — GET /api/social/bulk/validate
- **Location:** client/src/components/social/BulkScheduler.tsx:132
- **Description:** The frontend calls GET /api/social/bulk/validate from client/src/components/social/BulkScheduler.tsx:132. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-44: method-unconfirmed — GET /api/social/bulk/schedule
- **Location:** client/src/components/social/BulkScheduler.tsx:166
- **Description:** The frontend calls GET /api/social/bulk/schedule from client/src/components/social/BulkScheduler.tsx:166. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-45: method-unconfirmed — GET /api/social/bulk/:param
- **Location:** client/src/components/social/BulkScheduler.tsx:207
- **Description:** The frontend calls GET /api/social/bulk/:param from client/src/components/social/BulkScheduler.tsx:207. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-46: method-unconfirmed — GET /api/social/inbox/bulk/archive
- **Location:** client/src/components/social/UnifiedInbox.tsx:279
- **Description:** The frontend calls GET /api/social/inbox/bulk/archive from client/src/components/social/UnifiedInbox.tsx:279. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-47: method-unconfirmed — GET /api/social/inbox/bulk/read
- **Location:** client/src/components/social/UnifiedInbox.tsx:280
- **Description:** The frontend calls GET /api/social/inbox/bulk/read from client/src/components/social/UnifiedInbox.tsx:280. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-48: method-unconfirmed — GET /api/social/inbox/bulk/unread
- **Location:** client/src/components/social/UnifiedInbox.tsx:281
- **Description:** The frontend calls GET /api/social/inbox/bulk/unread from client/src/components/social/UnifiedInbox.tsx:281. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-49: method-unconfirmed — GET /api/social/inbox/bulk/delete
- **Location:** client/src/components/social/UnifiedInbox.tsx:282
- **Description:** The frontend calls GET /api/social/inbox/bulk/delete from client/src/components/social/UnifiedInbox.tsx:282. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-50: method-unconfirmed — GET /api/storage/hybrid/auto-tier
- **Location:** client/src/components/storage/HybridStorageStats.tsx:116
- **Description:** The frontend calls GET /api/storage/hybrid/auto-tier from client/src/components/storage/HybridStorageStats.tsx:116. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-51: method-unconfirmed — GET /api/assets/upload
- **Location:** client/src/components/studio/AssetUploadDialog.tsx:40
- **Description:** The frontend calls GET /api/assets/upload from client/src/components/studio/AssetUploadDialog.tsx:40. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-52: method-unconfirmed — GET /api/studio/upload
- **Location:** client/src/components/studio/FileUploadZone.tsx:132, client/src/components/studio/FlowStateImportAudio.tsx:39, client/src/components/studio/StudioProjectDialog.tsx:221
- **Description:** The frontend calls GET /api/studio/upload from client/src/components/studio/FileUploadZone.tsx:132, client/src/components/studio/FlowStateImportAudio.tsx:39, client/src/components/studio/StudioProjectDialog.tsx:221. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-53: method-unconfirmed — GET /api/studio/tracks
- **Location:** client/src/components/studio/FlowStateAddTrack.tsx:108, client/src/components/studio/RecordingPanel.tsx:229
- **Description:** The frontend calls GET /api/studio/tracks from client/src/components/studio/FlowStateAddTrack.tsx:108, client/src/components/studio/RecordingPanel.tsx:229. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-54: method-unconfirmed — GET /api/studio/projects/:param/render
- **Location:** client/src/components/studio/FlowStateExport.tsx:190, client/src/lib/daw/AudioRenderEngine.ts:536
- **Description:** The frontend calls GET /api/studio/projects/:param/render from client/src/components/studio/FlowStateExport.tsx:190, client/src/lib/daw/AudioRenderEngine.ts:536. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-55: method-unconfirmed — GET /api/studio/generation/audio-to-melody
- **Location:** client/src/components/studio/FlowStateLyricsToMelody.tsx:291
- **Description:** The frontend calls GET /api/studio/generation/audio-to-melody from client/src/components/studio/FlowStateLyricsToMelody.tsx:291. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-56: method-unconfirmed — GET /api/studio/plugins/instantiate/:param?projectId=:param
- **Location:** client/src/components/studio/FlowStatePluginBrowser.tsx:232
- **Description:** The frontend calls GET /api/studio/plugins/instantiate/:param?projectId=:param from client/src/components/studio/FlowStatePluginBrowser.tsx:232. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-57: method-unconfirmed — DELETE /api/studio/projects
- **Location:** client/src/components/studio/FlowStateProjectSelector.tsx:109, client/src/hooks/useFlowStateAdapter.ts:202, client/src/hooks/useStudioController.ts:304, client/src/hooks/useStudioController.ts:334
- **Description:** The frontend calls DELETE /api/studio/projects from client/src/components/studio/FlowStateProjectSelector.tsx:109, client/src/hooks/useFlowStateAdapter.ts:202, client/src/hooks/useStudioController.ts:304, client/src/hooks/useStudioController.ts:334. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-58: method-unconfirmed — GET /api/studio/templates/:param/create-project
- **Location:** client/src/components/studio/FlowStateTemplateDialog.tsx:80
- **Description:** The frontend calls GET /api/studio/templates/:param/create-project from client/src/components/studio/FlowStateTemplateDialog.tsx:80. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-59: method-unconfirmed — GET /api/uploads/chunk
- **Location:** client/src/components/studio/StudioProjectDialog.tsx:122
- **Description:** The frontend calls GET /api/uploads/chunk from client/src/components/studio/StudioProjectDialog.tsx:122. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-60: method-unconfirmed — GET /api/uploads/assemble
- **Location:** client/src/components/studio/StudioProjectDialog.tsx:163
- **Description:** The frontend calls GET /api/uploads/assemble from client/src/components/studio/StudioProjectDialog.tsx:163. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-61: method-unconfirmed — GET /api/studio/upload-from-url
- **Location:** client/src/components/studio/StudioProjectDialog.tsx:197
- **Description:** The frontend calls GET /api/studio/upload-from-url from client/src/components/studio/StudioProjectDialog.tsx:197. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-62: method-unconfirmed — GET /api/studio/record/upload
- **Location:** client/src/components/studio/UltimateDAW.tsx:474, client/src/hooks/useAudioRecorder.ts:303, client/src/hooks/useMultiTrackRecorder.ts:339
- **Description:** The frontend calls GET /api/studio/record/upload from client/src/components/studio/UltimateDAW.tsx:474, client/src/hooks/useAudioRecorder.ts:303, client/src/hooks/useMultiTrackRecorder.ts:339. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-63: method-unconfirmed — GET /api/assistant/chat
- **Location:** client/src/components/support/AIAssistantBubble.tsx:192, client/src/components/support/AIAssistantPublic.tsx:49, client/src/pages/Assistant.tsx:200
- **Description:** The frontend calls GET /api/assistant/chat from client/src/components/support/AIAssistantBubble.tsx:192, client/src/components/support/AIAssistantPublic.tsx:49, client/src/pages/Assistant.tsx:200. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-64: method-unconfirmed — GET /api/personalization/track-batch
- **Location:** client/src/contexts/PersonalizationContext.tsx:484
- **Description:** The frontend calls GET /api/personalization/track-batch from client/src/contexts/PersonalizationContext.tsx:484. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-65: method-unconfirmed — GET /api/uploads/request-url
- **Location:** client/src/hooks/use-upload.ts:65, client/src/hooks/use-upload.ts:165
- **Description:** The frontend calls GET /api/uploads/request-url from client/src/hooks/use-upload.ts:65, client/src/hooks/use-upload.ts:165. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-69: method-unconfirmed — GET /api/batch/:param/:param
- **Location:** client/src/hooks/useBatchAction.ts:168, client/src/hooks/useBatchActions.ts:226
- **Description:** The frontend calls GET /api/batch/:param/:param from client/src/hooks/useBatchAction.ts:168, client/src/hooks/useBatchActions.ts:226. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-70: method-unconfirmed — GET /api/batch/:param/delete
- **Location:** client/src/hooks/useBulkAction.ts:132
- **Description:** The frontend calls GET /api/batch/:param/delete from client/src/hooks/useBulkAction.ts:132. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-71: method-unconfirmed — GET /api/batch/:param/update
- **Location:** client/src/hooks/useBulkAction.ts:138
- **Description:** The frontend calls GET /api/batch/:param/update from client/src/hooks/useBulkAction.ts:138. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-72: method-unconfirmed — GET /api/batch/:param/export
- **Location:** client/src/hooks/useBulkAction.ts:143
- **Description:** The frontend calls GET /api/batch/:param/export from client/src/hooks/useBulkAction.ts:143. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-73: method-unconfirmed — GET /api/batch/:param/submit
- **Location:** client/src/hooks/useBulkAction.ts:148
- **Description:** The frontend calls GET /api/batch/:param/submit from client/src/hooks/useBulkAction.ts:148. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-74: method-unconfirmed — GET /api/batch/:param/withdraw
- **Location:** client/src/hooks/useBulkAction.ts:153
- **Description:** The frontend calls GET /api/batch/:param/withdraw from client/src/hooks/useBulkAction.ts:153. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-75: method-unconfirmed — GET /api/batch/:param/schedule
- **Location:** client/src/hooks/useBulkAction.ts:158
- **Description:** The frontend calls GET /api/batch/:param/schedule from client/src/hooks/useBulkAction.ts:158. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-76: method-unconfirmed — GET /api/batch/:param/process
- **Location:** client/src/hooks/useBulkAction.ts:163
- **Description:** The frontend calls GET /api/batch/:param/process from client/src/hooks/useBulkAction.ts:163. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-77: method-unconfirmed — GET /api/:param
- **Location:** client/src/hooks/useBulkAction.ts:286, client/src/hooks/useBulkAction.ts:310, client/src/hooks/useBulkAction.ts:357
- **Description:** The frontend calls GET /api/:param from client/src/hooks/useBulkAction.ts:286, client/src/hooks/useBulkAction.ts:310, client/src/hooks/useBulkAction.ts:357. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-78: method-unconfirmed — GET /api/retention/feature-event
- **Location:** client/src/hooks/useFeatureTracking.ts:34
- **Description:** The frontend calls GET /api/retention/feature-event from client/src/hooks/useFeatureTracking.ts:34. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-79: method-unconfirmed — GET /api/personalization/track-feature
- **Location:** client/src/hooks/useFeatureUsage.ts:280
- **Description:** The frontend calls GET /api/personalization/track-feature from client/src/hooks/useFeatureUsage.ts:280. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-80: method-unconfirmed — GET /api/studio/projects/:param/save-daw-state
- **Location:** client/src/hooks/useProjectSync.ts:430, client/src/lib/daw/ProjectManager.ts:507
- **Description:** The frontend calls GET /api/studio/projects/:param/save-daw-state from client/src/hooks/useProjectSync.ts:430, client/src/lib/daw/ProjectManager.ts:507. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-81: method-unconfirmed — GET /api/
- **Location:** client/src/hooks/useProjectSync.ts:647, client/src/lib/audioEngine.ts:765, client/src/lib/daw/AudioWorkletEngine.ts:760, client/src/pages/Marketplace.tsx:2146, client/src/pages/Projects.tsx:236, client/src/pages/Storefront.tsx:211
- **Description:** The frontend calls GET /api/ from client/src/hooks/useProjectSync.ts:647, client/src/lib/audioEngine.ts:765, client/src/lib/daw/AudioWorkletEngine.ts:760, client/src/pages/Marketplace.tsx:2146, client/src/pages/Projects.tsx:236, client/src/pages/Storefront.tsx:211. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-82: method-unconfirmed — PATCH /api/studio/projects
- **Location:** client/src/hooks/useStudioController.ts:322
- **Description:** The frontend calls PATCH /api/studio/projects from client/src/hooks/useStudioController.ts:322. this audit found no statically-registered PATCH route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-83: method-unconfirmed — DELETE /api/studio/templates
- **Location:** client/src/hooks/useTemplate.ts:209
- **Description:** The frontend calls DELETE /api/studio/templates from client/src/hooks/useTemplate.ts:209. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-84: method-unconfirmed — GET /api/errors
- **Location:** client/src/lib/errorService.ts:523
- **Description:** The frontend calls GET /api/errors from client/src/lib/errorService.ts:523. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-85: method-unconfirmed — GET /api/notifications/unread
- **Location:** client/src/lib/prefetch.ts:247
- **Description:** The frontend calls GET /api/notifications/unread from client/src/lib/prefetch.ts:247. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-87: method-unconfirmed — GET /api/metrics/web-vitals
- **Location:** client/src/lib/reportWebVitals.ts:3
- **Description:** The frontend calls GET /api/metrics/web-vitals from client/src/lib/reportWebVitals.ts:3. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-88: method-unconfirmed — POST /api/admin/users/:param/suspend
- **Location:** client/src/pages/Admin.tsx:367
- **Description:** The frontend calls POST /api/admin/users/:param/suspend from client/src/pages/Admin.tsx:367. this audit found no statically-registered POST route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-89: method-unconfirmed — POST /api/admin/users/:param/reactivate
- **Location:** client/src/pages/Admin.tsx:385
- **Description:** The frontend calls POST /api/admin/users/:param/reactivate from client/src/pages/Admin.tsx:385. this audit found no statically-registered POST route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-90: method-unconfirmed — POST /api/admin/chain-fixer/force-check
- **Location:** client/src/pages/AdminAutonomy.tsx:331
- **Description:** The frontend calls POST /api/admin/chain-fixer/force-check from client/src/pages/AdminAutonomy.tsx:331. this audit found no statically-registered POST route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-91: method-unconfirmed — POST /api/admin/platform-fixer/scan
- **Location:** client/src/pages/AdminAutonomy.tsx:345
- **Description:** The frontend calls POST /api/admin/platform-fixer/scan from client/src/pages/AdminAutonomy.tsx:345. this audit found no statically-registered POST route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-92: method-unconfirmed — GET /api/auth/token
- **Location:** client/src/pages/AdminDashboard.tsx:1564
- **Description:** The frontend calls GET /api/auth/token from client/src/pages/AdminDashboard.tsx:1564. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-93: method-unconfirmed — GET /api/auth/token/revoke
- **Location:** client/src/pages/AdminDashboard.tsx:1586
- **Description:** The frontend calls GET /api/auth/token/revoke from client/src/pages/AdminDashboard.tsx:1586. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-94: method-unconfirmed — GET /api/advertising/upload-image
- **Location:** client/src/pages/Advertisement.tsx:568
- **Description:** The frontend calls GET /api/advertising/upload-image from client/src/pages/Advertisement.tsx:568. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-95: method-unconfirmed — GET /api/multimodal/generate
- **Location:** client/src/pages/Advertisement.tsx:2112
- **Description:** The frontend calls GET /api/multimodal/generate from client/src/pages/Advertisement.tsx:2112. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-96: method-unconfirmed — GET /api/collaborations/connect
- **Location:** client/src/pages/Collaborations.tsx:247
- **Description:** The frontend calls GET /api/collaborations/connect from client/src/pages/Collaborations.tsx:247. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-97: method-unconfirmed — GET /api/collaborations/accept/:param
- **Location:** client/src/pages/Collaborations.tsx:284
- **Description:** The frontend calls GET /api/collaborations/accept/:param from client/src/pages/Collaborations.tsx:284. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-98: method-unconfirmed — GET /api/collaborations/decline/:param
- **Location:** client/src/pages/Collaborations.tsx:301
- **Description:** The frontend calls GET /api/collaborations/decline/:param from client/src/pages/Collaborations.tsx:301. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-99: method-unconfirmed — GET /api/contracts/:param/send-for-signature
- **Location:** client/src/pages/Contracts.tsx:342
- **Description:** The frontend calls GET /api/contracts/:param/send-for-signature from client/src/pages/Contracts.tsx:342. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-100: method-unconfirmed — GET /api/contracts/:param/sign
- **Location:** client/src/pages/Contracts.tsx:386
- **Description:** The frontend calls GET /api/contracts/:param/sign from client/src/pages/Contracts.tsx:386. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-101: method-unconfirmed — GET /api/contracts/:param/decline
- **Location:** client/src/pages/Contracts.tsx:438
- **Description:** The frontend calls GET /api/contracts/:param/decline from client/src/pages/Contracts.tsx:438. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-102: method-unconfirmed — GET /api/contracts/:param/void
- **Location:** client/src/pages/Contracts.tsx:478
- **Description:** The frontend calls GET /api/contracts/:param/void from client/src/pages/Contracts.tsx:478. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-103: method-unconfirmed — GET /api/distribution/export-report
- **Location:** client/src/pages/Distribution.tsx:2001
- **Description:** The frontend calls GET /api/distribution/export-report from client/src/pages/Distribution.tsx:2001. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-104: method-unconfirmed — DELETE /api/fan-hub/subscribers
- **Location:** client/src/pages/FanHub.tsx:169
- **Description:** The frontend calls DELETE /api/fan-hub/subscribers from client/src/pages/FanHub.tsx:169. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-105: method-unconfirmed — GET /api/auth/forgot-password
- **Location:** client/src/pages/ForgotPassword.tsx:71, client/src/pages/ForgotPassword.tsx:120
- **Description:** The frontend calls GET /api/auth/forgot-password from client/src/pages/ForgotPassword.tsx:71, client/src/pages/ForgotPassword.tsx:120. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-106: method-unconfirmed — GET /api/invoices/:param/send
- **Location:** client/src/pages/Invoices.tsx:156
- **Description:** The frontend calls GET /api/invoices/:param/send from client/src/pages/Invoices.tsx:156. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-107: method-unconfirmed — GET /api/auth/demo
- **Location:** client/src/pages/Landing.tsx:357, client/src/pages/Login.tsx:307
- **Description:** The frontend calls GET /api/auth/demo from client/src/pages/Landing.tsx:357, client/src/pages/Login.tsx:307. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-108: method-unconfirmed — GET /api/auth/login
- **Location:** client/src/pages/Login.tsx:222
- **Description:** The frontend calls GET /api/auth/login from client/src/pages/Login.tsx:222. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-109: method-unconfirmed — DELETE /api/merch
- **Location:** client/src/pages/Marketplace.tsx:887, client/src/pages/MerchStore.tsx:212
- **Description:** The frontend calls DELETE /api/merch from client/src/pages/Marketplace.tsx:887, client/src/pages/MerchStore.tsx:212. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-110: method-unconfirmed — GET /api/marketplace/upload
- **Location:** client/src/pages/Marketplace.tsx:1224, client/src/pages/Marketplace.tsx:2525
- **Description:** The frontend calls GET /api/marketplace/upload from client/src/pages/Marketplace.tsx:1224, client/src/pages/Marketplace.tsx:2525. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-111: method-unconfirmed — GET /api/marketplace/interaction
- **Location:** client/src/pages/Marketplace.tsx:2090
- **Description:** The frontend calls GET /api/marketplace/interaction from client/src/pages/Marketplace.tsx:2090. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-112: method-unconfirmed — PUT /api/merch
- **Location:** client/src/pages/MerchStore.tsx:167
- **Description:** The frontend calls PUT /api/merch from client/src/pages/MerchStore.tsx:167. this audit found no statically-registered PUT route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-113: method-unconfirmed — GET /api/music-workflow-automations/:param/disable
- **Location:** client/src/pages/MusicWorkflowAutomations.tsx:244
- **Description:** The frontend calls GET /api/music-workflow-automations/:param/disable from client/src/pages/MusicWorkflowAutomations.tsx:244. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-114: method-unconfirmed — POST /api/music-workflow-automations
- **Location:** client/src/pages/MusicWorkflowAutomations.tsx:250
- **Description:** The frontend calls POST /api/music-workflow-automations from client/src/pages/MusicWorkflowAutomations.tsx:250. this audit found no statically-registered POST route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-115: method-unconfirmed — DELETE /api/songwriting
- **Location:** client/src/pages/Projects.tsx:883
- **Description:** The frontend calls DELETE /api/songwriting from client/src/pages/Projects.tsx:883. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-117: method-unconfirmed — DELETE /api/publishing
- **Location:** client/src/pages/Publishing.tsx:130
- **Description:** The frontend calls DELETE /api/publishing from client/src/pages/Publishing.tsx:130. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-118: method-unconfirmed — GET /api/auth/register
- **Location:** client/src/pages/Register.tsx:242
- **Description:** The frontend calls GET /api/auth/register from client/src/pages/Register.tsx:242. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-119: method-unconfirmed — GET /api/countdowns/:param/tasks/:param
- **Location:** client/src/pages/ReleaseCountdown.tsx:171
- **Description:** The frontend calls GET /api/countdowns/:param/tasks/:param from client/src/pages/ReleaseCountdown.tsx:171. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-120: method-unconfirmed — GET /api/auth/reset-password
- **Location:** client/src/pages/ResetPassword.tsx:112
- **Description:** The frontend calls GET /api/auth/reset-password from client/src/pages/ResetPassword.tsx:112. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-121: method-unconfirmed — DELETE /api/auth/me
- **Location:** client/src/pages/Settings.tsx:523
- **Description:** The frontend calls DELETE /api/auth/me from client/src/pages/Settings.tsx:523. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-122: method-unconfirmed — DELETE /api/shows
- **Location:** client/src/pages/Shows.tsx:161
- **Description:** The frontend calls DELETE /api/shows from client/src/pages/Shows.tsx:161. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-123: method-unconfirmed — DELETE /api/sync-licensing
- **Location:** client/src/pages/SyncLicensing.tsx:135
- **Description:** The frontend calls DELETE /api/sync-licensing from client/src/pages/SyncLicensing.tsx:135. this audit found no statically-registered DELETE route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-124: method-unconfirmed — GET /api/workspace/:param/presence/heartbeat
- **Location:** client/src/pages/Workspaces.tsx:123
- **Description:** The frontend calls GET /api/workspace/:param/presence/heartbeat from client/src/pages/Workspaces.tsx:123. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-125: method-unconfirmed — GET /api/workspace/:param/invite
- **Location:** client/src/pages/Workspaces.tsx:177
- **Description:** The frontend calls GET /api/workspace/:param/invite from client/src/pages/Workspaces.tsx:177. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-126: method-unconfirmed — GET /api/workspace/:param/members/:param/role
- **Location:** client/src/pages/Workspaces.tsx:215
- **Description:** The frontend calls GET /api/workspace/:param/members/:param/role from client/src/pages/Workspaces.tsx:215. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-127: method-unconfirmed — GET /api/workspace/:param/members/:param
- **Location:** client/src/pages/Workspaces.tsx:249
- **Description:** The frontend calls GET /api/workspace/:param/members/:param from client/src/pages/Workspaces.tsx:249. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-128: method-unconfirmed — GET /api/workspace/:param/roles/:param
- **Location:** client/src/pages/Workspaces.tsx:316, client/src/pages/Workspaces.tsx:350
- **Description:** The frontend calls GET /api/workspace/:param/roles/:param from client/src/pages/Workspaces.tsx:316, client/src/pages/Workspaces.tsx:350. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-129: method-unconfirmed — GET /api/support/tickets/:param/messages
- **Location:** client/src/pages/admin/SupportTicketDetail.tsx:84
- **Description:** The frontend calls GET /api/support/tickets/:param/messages from client/src/pages/admin/SupportTicketDetail.tsx:84. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-130: method-unconfirmed — GET /api/support/tickets/:param/tags
- **Location:** client/src/pages/admin/SupportTicketDetail.tsx:115
- **Description:** The frontend calls GET /api/support/tickets/:param/tags from client/src/pages/admin/SupportTicketDetail.tsx:115. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-131: method-unconfirmed — GET /api/support/tickets/:param/tags/:param
- **Location:** client/src/pages/admin/SupportTicketDetail.tsx:144
- **Description:** The frontend calls GET /api/support/tickets/:param/tags/:param from client/src/pages/admin/SupportTicketDetail.tsx:144. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-132: method-unconfirmed — GET /api/training/start
- **Location:** client/src/pages/admin/TrainingDashboard.tsx:245
- **Description:** The frontend calls GET /api/training/start from client/src/pages/admin/TrainingDashboard.tsx:245. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-133: method-unconfirmed — GET /api/training/stop
- **Location:** client/src/pages/admin/TrainingDashboard.tsx:253
- **Description:** The frontend calls GET /api/training/stop from client/src/pages/admin/TrainingDashboard.tsx:253. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### method-unconfirmed-134: method-unconfirmed — GET /api/ai/analytics/insights
- **Location:** client/src/pages/analytics/AIDashboard.tsx:22, client/src/pages/analytics/AIDashboard.tsx:48
- **Description:** The frontend calls GET /api/ai/analytics/insights from client/src/pages/analytics/AIDashboard.tsx:22, client/src/pages/analytics/AIDashboard.tsx:48. this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.
- **Recommendation:** Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.

### stub-handler-135: stub-handler — GET /api/boot-status
- **Location:** server/index.ts:365
- **Description:** The handler registered at server/index.ts:365 for GET /api/boot-status contains the word(s) "stub" nearby. This codebase also uses these words to NAME deliberate, documented infrastructure (e.g. an early-boot handoff stub) as well as genuine placeholders, so this keyword match alone does not distinguish the two -- read the surrounding code before treating it as unfinished work.
- **Recommendation:** Read server/index.ts around line 365 to confirm whether this is a deliberate, documented shim (leave it) or genuinely incomplete work (replace it or gate the calling UI feature).

### stub-handler-136: stub-handler — POST /api/errors
- **Location:** server/index.ts:375
- **Description:** The handler registered at server/index.ts:375 for POST /api/errors contains the word(s) "stub" nearby. This codebase also uses these words to NAME deliberate, documented infrastructure (e.g. an early-boot handoff stub) as well as genuine placeholders, so this keyword match alone does not distinguish the two -- read the surrounding code before treating it as unfinished work.
- **Recommendation:** Read server/index.ts around line 375 to confirm whether this is a deliberate, documented shim (leave it) or genuinely incomplete work (replace it or gate the calling UI feature).

### stub-handler-137: stub-handler — GET /api/auth/me
- **Location:** server/index.ts:390
- **Description:** The handler registered at server/index.ts:390 for GET /api/auth/me contains the word(s) "stub" nearby. This codebase also uses these words to NAME deliberate, documented infrastructure (e.g. an early-boot handoff stub) as well as genuine placeholders, so this keyword match alone does not distinguish the two -- read the surrounding code before treating it as unfinished work.
- **Recommendation:** Read server/index.ts around line 390 to confirm whether this is a deliberate, documented shim (leave it) or genuinely incomplete work (replace it or gate the calling UI feature).

### stub-handler-138: stub-handler — POST /api/dev/trigger-beat
- **Location:** server/index.ts:402
- **Description:** The handler registered at server/index.ts:402 for POST /api/dev/trigger-beat contains the word(s) "stub" nearby. This codebase also uses these words to NAME deliberate, documented infrastructure (e.g. an early-boot handoff stub) as well as genuine placeholders, so this keyword match alone does not distinguish the two -- read the surrounding code before treating it as unfinished work.
- **Recommendation:** Read server/index.ts around line 402 to confirm whether this is a deliberate, documented shim (leave it) or genuinely incomplete work (replace it or gate the calling UI feature).

### stub-handler-139: stub-handler — GET /api/ready
- **Location:** server/index.ts:441
- **Description:** The handler registered at server/index.ts:441 for GET /api/ready contains the word(s) "stub" nearby. This codebase also uses these words to NAME deliberate, documented infrastructure (e.g. an early-boot handoff stub) as well as genuine placeholders, so this keyword match alone does not distinguish the two -- read the surrounding code before treating it as unfinished work.
- **Recommendation:** Read server/index.ts around line 441 to confirm whether this is a deliberate, documented shim (leave it) or genuinely incomplete work (replace it or gate the calling UI feature).

### stub-handler-140: stub-handler — GET /api/health/ready
- **Location:** server/index.ts:442
- **Description:** The handler registered at server/index.ts:442 for GET /api/health/ready contains the word(s) "stub" nearby. This codebase also uses these words to NAME deliberate, documented infrastructure (e.g. an early-boot handoff stub) as well as genuine placeholders, so this keyword match alone does not distinguish the two -- read the surrounding code before treating it as unfinished work.
- **Recommendation:** Read server/index.ts around line 442 to confirm whether this is a deliberate, documented shim (leave it) or genuinely incomplete work (replace it or gate the calling UI feature).

### service-unavailable-152: service-unavailable — GET /api/ai/diffusion/ready
- **Location:** server/routes/ai.ts:1086
- **Description:** A live GET probe to /api/ai/diffusion/ready returned HTTP 503. Response snippet: "{\"success\":false,\"data\":{\"ready\":false,\"reason\":\"gateway_offline\"}}". 503 is the conventional "not ready / dependency unavailable" status, so this may be this handler correctly reporting a degraded or still-starting dependency rather than a code bug -- but it also means that dependency is genuinely down or slow right now.
- **Recommendation:** Confirm which dependency this handler checks and whether it is expected to be unavailable in this environment right now. If the dependency should be up, fix that dependency; if this is working as designed, no code change is needed here.

### duplicate-registration-154: duplicate-registration — POST /api/errors
- **Location:** server/index.ts:375, server/routes.ts:7518
- **Description:** POST /api/errors is registered 2 times: server/index.ts:375, server/routes.ts:7518. At least one registration calls next() conditionally, which is this codebase's pattern for a deliberate early/fallback handler that hands off to a later one rather than a true conflicting duplicate -- likely intentional, but verify the handoff condition is actually correct.
- **Recommendation:** Confirm the earlier handler's next()-handoff condition genuinely defers to the later handler in every case it should (e.g. it doesn't stay "active" forever due to a flag that's never flipped); if it does, no change is needed.

### duplicate-registration-155: duplicate-registration — GET /api/auth/me
- **Location:** server/index.ts:390, server/routes.ts:295
- **Description:** GET /api/auth/me is registered 2 times: server/index.ts:390, server/routes.ts:295. At least one registration calls next() conditionally, which is this codebase's pattern for a deliberate early/fallback handler that hands off to a later one rather than a true conflicting duplicate -- likely intentional, but verify the handoff condition is actually correct.
- **Recommendation:** Confirm the earlier handler's next()-handoff condition genuinely defers to the later handler in every case it should (e.g. it doesn't stay "active" forever due to a flag that's never flipped); if it does, no change is needed.

### duplicate-registration-156: duplicate-registration — GET /api/ready
- **Location:** server/index.ts:441, server/routes.ts:7644
- **Description:** GET /api/ready is registered 2 times: server/index.ts:441, server/routes.ts:7644. At least one registration calls next() conditionally, which is this codebase's pattern for a deliberate early/fallback handler that hands off to a later one rather than a true conflicting duplicate -- likely intentional, but verify the handoff condition is actually correct.
- **Recommendation:** Confirm the earlier handler's next()-handoff condition genuinely defers to the later handler in every case it should (e.g. it doesn't stay "active" forever due to a flag that's never flipped); if it does, no change is needed.

### duplicate-registration-157: duplicate-registration — GET /api/health/ready
- **Location:** server/index.ts:442, server/routes.ts:7645
- **Description:** GET /api/health/ready is registered 2 times: server/index.ts:442, server/routes.ts:7645. At least one registration calls next() conditionally, which is this codebase's pattern for a deliberate early/fallback handler that hands off to a later one rather than a true conflicting duplicate -- likely intentional, but verify the handoff condition is actually correct.
- **Recommendation:** Confirm the earlier handler's next()-handoff condition genuinely defers to the later handler in every case it should (e.g. it doesn't stay "active" forever due to a flag that's never flipped); if it does, no change is needed.

### duplicate-registration-158: duplicate-registration — POST /api/metrics/web-vitals
- **Location:** server/index.ts:444, server/index.ts:1052
- **Description:** POST /api/metrics/web-vitals is registered 2 times: server/index.ts:444, server/index.ts:1052. At least one registration calls next() conditionally, which is this codebase's pattern for a deliberate early/fallback handler that hands off to a later one rather than a true conflicting duplicate -- likely intentional, but verify the handoff condition is actually correct.
- **Recommendation:** Confirm the earlier handler's next()-handoff condition genuinely defers to the later handler in every case it should (e.g. it doesn't stay "active" forever due to a flag that's never flipped); if it does, no change is needed.

### unresolved-dynamic-registration-159: unresolved-dynamic-registration — GET (path unresolved)
- **Location:** server/routes.ts:7507
- **Description:** server/routes.ts:7507 registers a GET route whose path is computed from an expression this audit could not statically resolve: `path, (req: Request, res: Response) => {`.
- **Recommendation:** Trace the expression to its source and confirm it resolves to the intended path(s); re-run this audit's static extractor logic manually against it if it represents many routes.

## Methodology and honesty notes

- This server answers every `OPTIONS` request identically (204, empty body) via a global CORS middleware, confirmed empirically before this audit was built, so `OPTIONS` cannot distinguish a real route from a fake one here. Reachability is instead checked with real requests: GET routes are hit directly; non-GET routes are hit with their real method plus a self-consistent CSRF double-submit token (satisfying `server/middleware/csrf.ts`, which does not verify the token was server-issued), but ONLY when this audit statically detected `requireAuth`/`requireAuthOnly`/`requireAdmin`/`require2FA` on that exact registration -- the auth middleware then rejects with a clean 401/403 before the handler's own logic runs (confirmed by reading `server/middleware/auth.ts`), so no side effects occur. "Route exists" vs "route does not exist" is judged against this server's actual 404 body template (`API endpoint <path> does not exist`), not a fixed baseline, because that template echoes the requested path.
- Non-GET routes with NO detected auth marker (e.g. login, register, webhooks, public contact/verify endpoints) are never invoked live, by design -- there is no safe way to test them without risking a real side effect. Their presence in this report comes from static source analysis only; treat any finding that touches one of these paths as needing manual confirmation, and note that the absence of a finding does NOT mean this audit confirmed them working.
- Frontend calls with a detected non-GET method that this audit could not safely live-probe are reported as `method-unconfirmed` (low severity) rather than asserted as broken or working, when a live GET to the same path suggests something is registered there.
- Only `/api/*`-style paths reachable through a statically-extractable string literal or a simple array+for-loop pattern are covered. Routes built from more dynamic expressions are listed under `unresolved-dynamic-registration`, not silently skipped.
- Router mount prefixes are resolved by tracing imports and `.use(` calls; entries marked with medium/low confidence could not be resolved with full certainty and are flagged as such in their own description rather than asserted as confirmed bugs.
- A route can pass every check in this audit and still contain a functional bug that only appears with real authenticated data (e.g. a wrong SQL join, an incorrect calculation) -- this audit verifies routing-layer reachability and obvious stub/crash signals, not business-logic correctness.
