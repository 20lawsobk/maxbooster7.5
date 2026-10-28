# Assembled application acceptance drill

Decision: **PASS_WITH_UNTESTED_CATEGORIES**

Artifact label: **sealed non-ML source application acceptance; not full-stack or packed acceptance**

## Replay

`env -i PATH="$PATH" HOME=/tmp node scripts/testing/page80-acceptance.mjs`

Run started: 2026-10-28T09:28:00.765Z

Report generated: 2026-10-28T09:30:25.509Z

## Safety boundary

- The runner refuses inherited database, provider, token, key, secret, Sentry, Redis, and Node preload variables.
- The child receives an allowlisted environment, a generated one-run session secret, an ephemeral local PostgreSQL URL, and no provider credentials.
- The real application runs from a disposable working directory. PostgreSQL contains only a generated empty schema; no shared/live database or production data is read.
- A pre-import guard rejects non-loopback TCP/TLS (including direct Socket.connect), all UDP, and child processes. MaxCore local startup, fan delivery, ACME, DNS local startup, and clustering are explicitly off; none is counted as accepted.
- Chromium is launched headless with external host resolution denied. Screenshot capture is attempted before credentials are entered; its exact result is recorded in the browser evidence.
- Temporary database, logs, credentials, and working files are removed after the bounded run.

## Executed evidence

```json
{
  "capacityAdmission": "not_run",
  "schemaGeneration": "pass",
  "postgres": "pass",
  "appProcess": "pass",
  "health": {
    "status": 200,
    "contentType": "application/json; charset=utf-8"
  },
  "readiness": {
    "scope": "sealed non-ML authentication, projects, and frontend acceptance",
    "fullStackReadiness": "NOT_PROVEN: separate real imported MaxCore/model acceptance required",
    "expectedDegradedReadinessAsserted": true,
    "unifiedAwarenessReady": false,
    "status": 503,
    "aggregate": "degraded",
    "subsystems": {
      "database": {
        "status": "ok"
      },
      "redis": {
        "status": "ok"
      },
      "routes": {
        "status": "ok",
        "detail": "critical routes registered; route loading complete"
      },
      "audit": {
        "status": "unknown",
        "detail": "initializing"
      },
      "automation": {
        "status": "ok",
        "detail": "workflows=0"
      },
      "maxcore": {
        "status": "unknown",
        "detail": "MaxCore not configured (no URL/key)"
      }
    }
  },
  "frontend": {
    "status": 200,
    "contentType": "text/html; charset=utf-8",
    "bytes": 16213,
    "sha256": "4d53766a59955ff8973471d72ac9f3d1e6c7efcc4d9af8c2b7d393977373d804"
  },
  "authHttp": {
    "csrfCookieHeaderBinding": "pass",
    "register": "pass",
    "registrationSession": "pass",
    "login": "pass",
    "sessionPersistence": "pass",
    "logoutInvalidation": "pass",
    "syntheticUserRemovedWithDatabase": true
  },
  "httpLoad": "not_requested",
  "browser": {
    "engine": "Chromium CDP",
    "hydrated": true,
    "formLogin": true,
    "sessionPersisted": true,
    "logout": true,
    "documentGeneration": 85,
    "contextTransitionsRecovered": 0,
    "screenshot": "/workspace/maxbooster7.5/reports/test-verification/integration-browser/page80/login-before-credentials.png"
  },
  "egressGuard": "pass (external net.connect, direct Socket.connect, UDP, and child processes denied in preflight)",
  "cleanup": "pass",
  "syntheticEntitlement": "paid entitlement provisioned only in disposable local database; no provider or payment bypass in application",
  "projectCrud": {
    "create": true,
    "read": true,
    "update": true,
    "delete": true,
    "missingVersion428": true,
    "staleVersion409": true,
    "crossOwnerReadUpdateDelete404": true,
    "deletedRead404": true
  },
  "savedDataJourneys": {
    "preferences": {
      "browserSessionWrite": true,
      "independentReadPersisted": true
    },
    "workspace": {
      "browserSessionCreate": true,
      "independentReadPersisted": true,
      "ownerMembership": true,
      "nonmemberReadUpdateDelete403": true,
      "savedNameRendered": true
    },
    "pressKit": {
      "actualFormSubmit": true,
      "savedFieldsRehydrated": true,
      "publicProjection": true,
      "cacheInvalidatedAfterEdit": true,
      "unpublishRevokesAnonymousRead": true
    }
  },
  "page80Seeds": {
    "ownedProject": true,
    "ownedNotification": true,
    "ownedSupportTicket": true,
    "publicPressKit": true,
    "scope": "disposable PostgreSQL only"
  },
  "page80AdminAssurance": {
    "realPasswordLogin": true,
    "realSessionBoundFactorSetup": true,
    "realTotpVerification": true,
    "roleGrantedOnlyInDisposableDatabase": true
  },
  "pageRoutes": {
    "authenticated": [
      {
        "canonicalRoute": "/dashboard",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nWelcome to Max Booster\n\nYour simplified music career management dashboard\n\nbeginner Mode\nUpgrade to Full Mode\nYour Progress\nGetting Started\n0/65 points\n100% to completion\nQuick Actions\n\nStart with these essential tasks\n\nUpload Your Music\n\nPrepare and distribute your music\n\nGet Started\nCreate a Beat\n\nOpen the production studio\n\nGet Started\nShare on Social\n\nCreate and manage social drafts\n\nGet Started\nBoost Your Reach\n\nPlan and manage advertising campaigns\n\nGet Started\nGetting Started\n\nComplete these tasks to build your setup\n\nUpload Your First Track\n\nStart your firs",
        "requestedPath": "/dashboard",
        "expectedPath": "/dashboard",
        "finalPath": "/dashboard",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/simplified-dashboard",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Simplified Dashboard\nWelcome to Max Booster\n\nYour simplified music career management dashboard\n\nbeginner Mode\nUpgrade to Full Mode\nYour Progress\nGetting Started\n0/65 points\n100% to completion\nQuick Actions\n\nStart with these essential tasks\n\nUpload Your Music\n\nPrepare and distribute your music\n\nGet Started\nCreate a Beat\n\nOpen the production studio\n\nGet Started\nShare on Social\n\nCreate and manage social drafts\n\nGet Started\nBoost Your Reach\n\nPlan and manage advertising campaigns\n\nGet Started\nGetting Started\n\nComplete these tasks to build your setup\n\nUpload Your First Track\n\nStart your first music ",
        "requestedPath": "/simplified-dashboard",
        "expectedPath": "/simplified-dashboard",
        "finalPath": "/simplified-dashboard",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/projects",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Projects\nYour Projects\n\n1 project total\n\nNew Project\nMy Projects\nSongwriting\nReview sync conflicts\nPage80 studio fixture\n\n10/28/2026\n\nSETUP\n10% Complete\n\nDisposable owned project\n\nPlay\nContinue",
        "requestedPath": "/projects",
        "expectedPath": "/projects",
        "finalPath": "/projects",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/analytics/ai",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Analytics\nAi\nAI Analytics Dashboard\n\nMeasured summaries of your recorded analytics, computed by MaxCore.\n\nGenerate analysis\nYour performance summary\nSummaries use complete UTC days. Missing days remain unknown, and listener observations are not unique audience counts.\nAI analysis unavailable\nMaxCore analytics is temporarily unavailable",
        "requestedPath": "/analytics/ai",
        "expectedPath": "/analytics/ai",
        "finalPath": "/analytics/ai",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/analytics",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Analytics\n📊 Analytics Dashboard\n\nReal-time updates • Updated 0s ago\n\nAuto Refresh\nRefresh\nLast 30 days\nExport\nAccount Readiness Score\n\nBased on the setup information available in your account\n\n70%\n\nThis is not a streaming-performance measurement\n\nTOTAL STREAMS\n\nUnavailable\n\nTOTAL REVENUE\n\nUnavailable\n\nTOTAL LISTENERS\n\nUnavailable\n\nAVG LISTEN TIME\n\nUnavailable\n\nCOMPLETION RATE\n\nUnavailable\n\nSHARE RATE\n\nUnavailable\n\nOverview\nCross-Platform\nHotspots\nFan Journey\nForecasting\nGeographic\nPlaylists\nPlaylists+\nRevenue\nAlerts\nStreaming+\nRevenue+\nAudience+\nA&R Discovery\nGlobal Ranking\nHistorical\nAsk AI\n",
        "requestedPath": "/analytics",
        "expectedPath": "/analytics",
        "finalPath": "/analytics",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/developer-api",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Developer Api\nDeveloper API\n\nAccess your music analytics data programmatically with our powerful REST API\n\nAPI Keys\nUsage\nDocumentation\nYour API Keys\nCreate and manage API keys to access the Max Booster Analytics API\nCreate API Key\n\nNo API keys yet\n\nCreate your first API key to get started",
        "requestedPath": "/developer-api",
        "expectedPath": "/developer-api",
        "finalPath": "/developer-api",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/social-media",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Social Media\nSocial Media Management\n\nAI-Powered Content Creation & Multi-Platform Publishing\n\nAI Content Generation\nMulti-Platform Publishing\nAdvanced Analytics\nCreate Content\nPlatform Connections\n\nFacebook\n\nConnect\n\nInstagram\n\nConnect\n\nTwitter (X)\n\nConnect\n\nYouTube\n\nConnect\n\nTikTok\n\nConnect\n\nLinkedIn\n\nConnect\n\nThreads\n\nConnect\n\nGoogle Business\n\nConnect\nOverview\nInbox\nCreate\nCalendar\nSchedule\nListening\nCompetitors\nAnalytics\nAI Insights\nAutopilot\nPress Kit\nRadio & Press\nFan Campaigns\nFacebook\n\nNot Connected\n\nInstagram\n\nNot Connected\n\nTwitter (X)\n\nNot Connected\n\nYouTube\n\nNot Connected\n\nTikTok\n\n",
        "requestedPath": "/social-media",
        "expectedPath": "/social-media",
        "finalPath": "/social-media",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/advertising",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Advertising\n🚀 AI-Powered Organic Advertising\n\nMaxCore AI generates peak-performance content distributed through your connected social profiles — no ad spend required\n\nCreate Campaign Draft\n🎯 How the AI Advertising System Works\n\nMaxCore AI replicates peak paid-ad performance using your connected social profiles as organic distribution channels\n\nAI\nCreative Automation\nMTA\nMulti-Touch\nA/B\nTesting\nLAL\nLookalike\n🔗\nPersonal Ads\n⚡\nAuto-Optimize\n🔍\nFatigue Detection\n🎯\nCompetitor Intel\nOverview\nCreative AI\nA/B Testing\nAudience\nIntel\nOptimize\nAutopilot\nPress Kit\nOrganic Reach\n0\nAI-amplified audience",
        "requestedPath": "/advertising",
        "expectedPath": "/advertising",
        "finalPath": "/advertising",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/marketplace",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Marketplace\nMax Booster Marketplace\n\nBuy & Sell Beats with AI Discovery\n\nStandard Checkout\nAI Discovery\nSmart Contracts\nCollaborations\nBulk Upload\nUpload Beat\nCart (0)\nGenre\nMood\nNewest\nAll\nHip-Hop\nTrap\nR&B\nPop\nRock\nElectronic\nJazz\nBlues\nCountry\nReggae\nFolk\nAlternative\nIndie\nPunk\nMetal\nFunk\nSoul\nGospel\nWorld\nLatin\nAmbient\nExperimental\nBrowse\nProducers\nMy Beats\nMy Store\nMerch\nPurchases\nAnalytics\nEscrow\nLicenses\nAffiliates\nContracts\nCollabs\n0 results\nClear filters\nNo beats found\n\nTry adjusting your filters or search with different keywords\n\nPopular searches:\n\nTrap\nHip-Hop\nR&B\nLo-Fi\nPop\nDrill\nCle",
        "requestedPath": "/marketplace",
        "expectedPath": "/marketplace",
        "finalPath": "/marketplace",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/royalties",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Royalties\nRoyalty Management\n\nTrack your earnings and manage payouts across all platforms\n\nCurrent Month\nExport Report\nConnect Bank Account\nRequest Payout\n\nTotal Earnings\n\n$0.00\n\nNo earnings yet\n\nPending Payouts\n\n$0.00\n\n0 payouts\n\nTotal Streams\n\n0\n\nStart streaming to earn\n\nAvg. RPM\n\n$0.00\n\nRevenue per 1K streams\n\nOverview\nPayouts\nStatements\nCollaborators\nPublishing\nDisputes\nSettings\nTax & Revenue\nEarnings by Platform\n\nNo platform data yet\n\nRoyalty breakdowns will appear once your first statement is processed.\n\nRecent Payouts\n\nNo payouts yet\n\nYour first payout will appear here once earnings rea",
        "requestedPath": "/royalties",
        "expectedPath": "/royalties",
        "finalPath": "/royalties",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/studio/:projectId",
        "scenario": "owned-record-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": true,
        "textSample": "P.In\nP.Out\nLoop Rec\nTIME\n00:00.000\nBARS\n1.1.000\nBPM\nSIG\n4/4\nMASTER\n80\nPlugins\nAI Co-Producer\nGenerate\nPage80 studio fixture\nVersions\nSimple\nTRACKS\nFILES\nPLUGINS\nPRESETS\nAdd Track\n\nNo tracks yet.\n\nI/O\nKeys\nTimeline\nMixer\nFlow\n100%\nTrack\nAuto\nEditor\nLyrics\nAI\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n20\n21\n22\n23\n24\n25\n26\n27\n28\n29\n30\n31\n32\n33\n34\n35\n36\n37\n38\n39\n40\n41\n42\n43\n44\n45\n46\n47\n48\n49\n50\n51\n52\n53\n54\n55\n56\n57\n58\n59\n60\n\nStart Your Session\n\nAdd your first track to begin composing\n\nAudio\nInstrument\nMIDI\nBus\nINSPECTOR\n\nSelect a track to inspect its properties and plugin chain.",
        "requestedPath": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
        "expectedPath": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
        "finalPath": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/studio",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "A\naccept_2a2ad7e6599ee1bf\nPro\n1\nSongs\n0\nProjects\n0\nShows\nCREATE NEW\nSong\nMulti-track recording & arrangement\nProject\nAlbum mastering & production\nShow\nLive performance setlist\nDOCUMENTS\nRecent\n1\nSongs\n1\nProjects\n0\nShows\n0\nHelp & Tutorials\nRecent Documents\n\nPick up where you left off\n\nPage80 studio fixture\n0 tracks\nTemplates\nView All\nAll Templates\nRecording\nProduction\nMastering\nMy Templates\nEmpty Song\n0\nBuilt-in\nHip Hop Beat\n8 tracks\nBuilt-in\nPop Production\n10 tracks\nBuilt-in\nElectronic/EDM\n12 tracks\nBuilt-in\nR&B Soul\n8 tracks\nBuilt-in\nPodcast/Voice Recording\n4 tracks\nBuilt-in\nMastering Session",
        "requestedPath": "/studio",
        "expectedPath": "/studio",
        "finalPath": "/studio",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/show",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Show Mode\nLIVE\n120\nBPM\nNow Playing\nOpening Track\n0:00\n/\n4:00\nSetlist\nSave\n1\nOpening Track\n4:00\n•\n120 BPM\n•\nC Major\nHigh energy opener - full band intro\n2\nCrowd Favorite\n3:30\n•\n128 BPM\n•\nG Major\nExtended outro - crowd sing-along\n3\nBallad\n5:00\n•\n72 BPM\n•\nA Minor\nAcoustic intro - dimmed lights\nClick Track\nEMERGENCY STOP\nTeleprompter\nA-\nA+\nHigh energy opener - full band intro\nSong Markers\n0:00 - Intro\n0:30 - Verse 1\n1:00 - Chorus\nEffects Control\nQuick Presets\nClean\nCrunch\nLead\nVocal Dry\nVocal Wet\nMaster Volume80%\nReverb Mix30%\nDelay Mix20%\nCompression50%\nEQ\nLow\n0dB\nMid\n0dB\nHigh\n0dB",
        "requestedPath": "/show",
        "expectedPath": "/show",
        "finalPath": "/show",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/distribution",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Distribution\nMusic Distribution\n\nGet your music on 150+ platforms including Spotify, Apple Music, and TikTok\n\nNo annual fees\nKeep 100% royalties\nHyperFollow pre-saves\nUpload Music\n\nToo Lost Lifetime Sales\n\nUnavailable\n\nProvider summary unavailable\n\nDetailed Stream Counts\n\nNot available\n\nToo Lost does not provide this total\n\nLive Releases\n\n0\n\n0 processing\n\nPlatforms\n\n0\n\nToo Lost catalog stores\n\nMy Releases\nArtist Profiles\nNew Release\nQC\nISRC/UPC\nSplits\nEarnings\nTakedowns\nPre-Save\nShare & Embed\nAnalytics\nPlatforms\nData Transfer\nStatus\nContent ID\nPlaylist Pitching\nShows & Tours\nSync Licensing\nA&R",
        "requestedPath": "/distribution",
        "expectedPath": "/distribution",
        "finalPath": "/distribution",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/subscribe/:tier",
        "scenario": "provider-configuration-state",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nPayment Service Unavailable\n\nThe secure payment service is unavailable. Please try again later or contact support. No payment has been confirmed by this page.\n\nTry AgainBack to Pricing\n\nIf this issue persists, please contact support atour help center.",
        "requestedPath": "/subscribe/monthly",
        "expectedPath": "/subscribe/monthly",
        "finalPath": "/subscribe/monthly",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/support/tickets/:ticketId",
        "scenario": "owned-record-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": true,
        "textSample": "Support\nTickets\nDetails\nPage80 owned support ticket\n\nStatus: open\n\nDisposable local support fixture\n\nSend reply",
        "requestedPath": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
        "expectedPath": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
        "finalPath": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/settings",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Settings\nSettings\n\nManage your account settings and preferences\n\nProfile\nAccount\nNotifications\nPreferences\nBilling\nSecurity\nPrivacy\nPlatforms\nSync\nShortcuts\nProfile Information\nAU\nUpload Photo\nRemove\nFirst Name\nLast Name\nArtist Name\nEmail Address\nBio\nWebsite\nLocation\nSave Changes",
        "requestedPath": "/settings",
        "expectedPath": "/settings",
        "finalPath": "/settings",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/onboarding",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Max Booster Setup\nSkip setup\nNewcomer\n0 / 700 XP\n1\nChoose\n2\nSet\n3\nAssess\n4\nActivate\nSTEP 1 OF 4\n+150 XP\nChoose Your Class\n\nWho are you in the music world?\n\nTHE PERFORMER\n\nSolo Artist\n\nIndependent musician creating your own music\n\nMusic distribution\nSocial autopilot\nAnalytics\n\nTHE ARCHITECT\n\nProducer\n\nCreating beats and producing tracks\n\nBeat marketplace\nStudio DAW\nCollaboration\n\nTHE EMPIRE\n\nRecord Label\n\nManaging multiple artists and releases\n\nMulti-artist dashboard\nRoyalty splits\nCatalog\n\nTHE STRATEGIST\n\nArtist Manager\n\nGrowing and managing artist careers\n\nCampaign management\nFinancial tracki",
        "requestedPath": "/onboarding",
        "expectedPath": "/onboarding",
        "finalPath": "/onboarding",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/storefront",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nStorefront Not Found\n\nThis storefront doesn't exist or is not publicly available.",
        "requestedPath": "/storefront",
        "expectedPath": "/storefront",
        "finalPath": "/storefront",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/verification",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Verification\nIdentity Verification\n\nVerify your identity to enable payouts and advanced features\n\nNot Started\nChoose Verification Type\nSelect whether you're verifying as an individual artist or a business entity\nIndividual\nBusiness\nIndividual Verification\nGovernment-issued photo ID (passport, driver's license)\nProof of address (utility bill, bank statement)\nSelfie for facial verification\nTax information (W-9 for US residents)\nStart Verification\nWhy Verify?\nEnable instant payouts to your bank account\nAccess higher payout limits\nComply with financial regulations\nBuild trust with collaborators an",
        "requestedPath": "/verification",
        "expectedPath": "/verification",
        "finalPath": "/verification",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/contracts",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Contracts\nContracts\n\nCreate, manage, and sign legal contracts for your music business\n\nNew Contract\n0\nTotal\n0\nDrafts\n0\nPending\n0\nPartial\n0\nActive\n0\nVoided\n0\nExpired\nMy Contracts\nTemplates\nPending Signatures\nAll Contracts\n0 contracts\nNo contracts yet\n\nCreate your first contract using one of our templates\n\nCreate Contract",
        "requestedPath": "/contracts",
        "expectedPath": "/contracts",
        "finalPath": "/contracts",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/workspaces",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Workspaces\nWorkspaces\n\nCollaborate with your team, label, or management\n\nCreate Workspace\nYour Workspaces\n\nAcceptance workspace 31828969\n\nmembers\n\nMember\nSelect a workspace\n\nChoose a workspace from the list to view details",
        "requestedPath": "/workspaces",
        "expectedPath": "/workspaces",
        "finalPath": "/workspaces",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/collaborations",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Collaborations\nCollaborations\n\nConnect with artists, producers, and industry professionals\n\nMy Network (0)\nDiscover\nCollab Projects\nNo connections yet\n\nDiscover and connect with other artists and professionals",
        "requestedPath": "/collaborations",
        "expectedPath": "/collaborations",
        "finalPath": "/collaborations",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/career-coach",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Career Coach\nAI Career Coach\n\nPersonalized guidance to accelerate your music career\n\nRecommendations\nGoals\nInsights\nRecommendations unavailable\n\nCareer coaching is temporarily unavailable. Please try again.\n\nTry again\nChat with Max\n\nHi! I'm Max, your AI Career Coach. I analyze your music career data to provide personalized recommendations. Ask me anything about growing your career, releasing music, building your fan base, or running your business as an artist.\n\nHow do I grow my fan base?\nDistribute my music\nBoost my streams\nStart earning royalties\nQuick Questions\nSet a career goal\nAnalyze my p",
        "requestedPath": "/career-coach",
        "expectedPath": "/career-coach",
        "finalPath": "/career-coach",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/assistant",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Assistant\nMax\nIn-House AI\n\nFull history saved across sessions\n\nHey accept_2a2ad7e6599ee1bf! I'm Max — your in-house AI assistant, built by the B-Lawz Music team. I remember our full conversation history across every session. Ask me anything about Max Booster — Studio, distribution, royalties, marketplace, social media, advertising, analytics, and more. What can I help you with today?\nHow do I use the DAW studio?\nHow does music distribution work?\nTell me about the AI autopilot system\nHow do I monetize my music?\nWhat can Max Booster do for my career?\nHow does the beat marketplace work?",
        "requestedPath": "/assistant",
        "expectedPath": "/assistant",
        "finalPath": "/assistant",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/release-countdown",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Release Countdown\nRelease Countdown\n\nTrack your upcoming releases and manage pre-release tasks\n\nNew Countdown\nUpcoming (0)\nPast Releases (0)\nNo upcoming releases\n\nCreate a countdown to track your next release and manage all your pre-release tasks in one place\n\nCreate Your First Countdown",
        "requestedPath": "/release-countdown",
        "expectedPath": "/release-countdown",
        "finalPath": "/release-countdown",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/invoices",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Invoices\nInvoices\n\nCreate and manage invoices for your music services\n\nNew Invoice\nTotal Invoiced\n$0\nPaid\n$0\nPending\n$0\nOverdue\n$0\nAll\nNo invoices yet\n\nCreate your first invoice to start tracking payments for your music services\n\nCreate Your First Invoice",
        "requestedPath": "/invoices",
        "expectedPath": "/invoices",
        "finalPath": "/invoices",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/handle-link",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Link not found\n\nThis Max Booster link is invalid or is no longer available.\n\nGo to dashboard",
        "requestedPath": "/handle-link",
        "expectedPath": "/handle-link",
        "finalPath": "/handle-link",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/notifications/:id",
        "scenario": "owned-record-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": true,
        "textSample": "Notifications\nDetails\nNotification\nSystem & Platform\nRead\nPage80 owned notification\n\n10/28/2026, 9:28:15 AM\n\nDisposable local notification\n\nDelete",
        "requestedPath": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
        "expectedPath": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
        "finalPath": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/notifications",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Notifications\nNotifications\n\n2 unread\n\nMark all read\nClear all\nAll (3)\nUnread\n2\nSecurity & Account\n2\nDistribution\nSocial Scheduling\nDirect Interactions\nPlatform Suggestions\nContent Updates\nEngagement Summaries\nLocation & Local\nMarketplace\nRoyalties & Payments\nCollaboration\nAchievements\nSystem & Platform\nPlatform Admin\n\nPage80 owned notification\n\nDisposable local notification\n\nless than a minute ago\n\nNew Login Detected\n\nYour account was accessed from a new session (IP: 127.0.0.1). If this wasn't you, change your password immediately.\n\nless than a minute ago\n\nNew Login Detected\n\nYour account was",
        "requestedPath": "/notifications",
        "expectedPath": "/notifications",
        "finalPath": "/notifications",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/workflow-automations",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Workflow Automations\nWorkflow Automations\n\nFrom first recording to first stream — automate your entire music career.\n\nActive Automations\n0 / 21\nautomations running\nTotal Runs\n0\nevents processed\nSuccess Rate\n0%\n0 succeeded · 0 failed\nLast Run\nNever\nEnable automations to start\nOverview\nAutomations\nRun History\nSchedule\nCustom\n\nYou have 21 automations ready to activate\n\nEnable them all at once, or turn on only what you need from the Automations tab.\n\nEnable All\nMusic Creation\n0/4 active\n\nFrom the first idea to finished recordings — studio, collaboration, and analysis automations.\n\nPre-Release\n0/4 ",
        "requestedPath": "/workflow-automations",
        "expectedPath": "/workflow-automations",
        "finalPath": "/workflow-automations",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/shows",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Shows\nShows & Tour\n\nManage your live performances, ticket sales, and setlists.\n\nList\nCalendar\nAdd Show\nUpcoming Shows\n0\nTotal Revenue\n$0\nAvg. Attendance\n0\nUpcoming\nPast Shows\nSetlists\nNo upcoming shows\n\nYou haven't scheduled any upcoming shows yet. Time to hit the stage!\n\nSchedule First Show",
        "requestedPath": "/shows",
        "expectedPath": "/shows",
        "finalPath": "/shows",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/fan-hub",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Fan Hub\nTotal Fans\n0\n\n0\nnew in the last 30 days\n\nVIP Fans\n0\n\n0% of your fan base\n\nAvg. Spend\n$\n$0.00\n\nAcross all subscribers\n\nEmail Open Rate\n0%\n\nAcross tracked broadcasts\n\nExport CSV\nAdd Fan\nBroadcast\nAll Fans\nVIPs\nHistory\nImport\nFan\tStatus\tJoined\tTotal Spent\tActions\n\nBuild Your Fan Base\n\nYou don't have any fans yet. Here are some ways to grow your community:\n\nRelease Music\n\nDistribute on all platforms to reach new listeners and convert them into fans.\n\nShare Your EPK\n\nSend your press kit link to blogs, playlists, and venues to build awareness.\n\nImport Existing Fans\n\nAlready have fans elsewhe",
        "requestedPath": "/fan-hub",
        "expectedPath": "/fan-hub",
        "finalPath": "/fan-hub",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/fan-memberships",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Fan Memberships\nFan Memberships\n\nRecurring fan subscriptions with tiered perks + loyalty credits\n\nNew Tier\n\nMRR\n\n$0.00\n\nARR\n\n$0.00\n\nActive Members\n\n0\n\nTiers\nMembers\nLoyalty Wallet\n\nNo membership tiers yet\n\nCreate your first fan club tier to start earning recurring revenue.\n\nCreate First Tier",
        "requestedPath": "/fan-memberships",
        "expectedPath": "/fan-memberships",
        "finalPath": "/fan-memberships",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/ar-intelligence",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Ar Intelligence\nA&R Intelligence\n\nLive music industry signals for catalog gaps. Trend forecasts and release timing require connected performance data.\n\nTrend Forecast\nCatalog Gaps\nRelease Timing\nTrend forecasting is not yet available\nRetry",
        "requestedPath": "/ar-intelligence",
        "expectedPath": "/ar-intelligence",
        "finalPath": "/ar-intelligence",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/outreach",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Outreach\nOutreach CRM\n\nTrack every pitch from draft to placement — blog, playlist, sync, press, radio\n\nNew Campaign\n\nCAMPAIGNS\n\nNo campaigns yet\nSelect a campaign to view pitches",
        "requestedPath": "/outreach",
        "expectedPath": "/outreach",
        "finalPath": "/outreach",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/merch",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Merch\nMerch Store\n\nManage your physical and digital merchandise.\n\nAdd Product\nVerified collected, less refunds\n$0.00\n\nLifetime earnings\n\nOrders (Month)\n0\n\nOrders this month\n\nTotal Orders\n0\n\nAll time orders\n\nLow Stock\n0\n\nItems needing restock\n\nProducts\nOrders\nAnalytics\nNo products yet\n\nAdd your first product to start selling merch.\n\nAdd Product",
        "requestedPath": "/merch",
        "expectedPath": "/merch",
        "finalPath": "/merch",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/press-kit",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Press Kit\nPress Kit (EPK)\n\nBuild and manage your professional Electronic Press Kit.\n\nPreview EPK\nView Live\nDownload PDF\nCopy EPK Link\nGeneral\nMedia\nLinks\nPerformance\nArtist Information\nEssential details about your musical project.\nArtist/Band Name\nGenres (comma separated)\nShort Pitch (One sentence)\nFull Biography\nContact Information\nGeneral Contact Email\nBooking Email\nOfficial Website URL\n\nPublic Visibility\n\nWhen on, your EPK is viewable via a public link.\n\nCustom URL Slug\nhttp://localhost:34731/epk/\n\nLowercase letters, numbers and hyphens only. Will be applied when you save.\n\nhttp://localhost",
        "requestedPath": "/press-kit",
        "expectedPath": "/press-kit",
        "finalPath": "/press-kit",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/playlist-pitching",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Playlist Pitching\nPlaylist Pitching\n\nTrack your submissions and find the right curators for your music.\n\nTrack New Pitch\n\nTotal Pitches\n\n0\n\nAccepted\n\n0\n\nPending\n\n0\n\nConversion Rate\n\n0.0%\n\nMy Pitches\nFind Curators\nStart tracking your pitches\n\nLog every playlist submission you make — accepted, rejected, or still waiting. Build a real picture of what's working.\n\n1\n\nFind a curator in the \"Find Curators\" tab\n\n2\n\nSubmit your music via their submission link\n\n3\n\nTrack the pitch here and update its status\n\nTrack Your First Pitch",
        "requestedPath": "/playlist-pitching",
        "expectedPath": "/playlist-pitching",
        "finalPath": "/playlist-pitching",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/publishing",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Publishing\nPublishing Rights\n\nStore work details and publishing splits before submitting to your PRO\n\nAdd Work Details\nSaved Works\n0\nMarked Confirmed\n0\nSaved Locally\n0\nSplit Breakdown\nAdd a work to see its split data.\nSaved Work Details\nNo saved works yet\n\nSave your details here, then submit each track directly to your PRO to collect performance royalties.\n\nASCAP\nBMI\nSESAC\nPRS\nSOCAN\nAPRA\nAdd Your First Work\nPRO Registration Guide\n\nMax Booster stores your work details and split information; it does not submit registrations to a PRO. Submit your work directly through your PRO's official portal t",
        "requestedPath": "/publishing",
        "expectedPath": "/publishing",
        "finalPath": "/publishing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/sync-licensing",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Sync Licensing\nSync Licensing\n\nPut Your Music in TV, Film & Ads\n\nAdd to Catalog\nCatalog Size\n0\nLicensed Tracks\n0\nTotal Earnings\n$0\nPending\n0\nSync Catalog\nYour sync catalog is empty\n\nAdd tracks to license your music to TV shows, films, ads, and video games. Include mood tags and BPM to help music supervisors find your work.\n\n🎬\n\nTV & Film\n\nScore your music for television and movies\n\n📢\n\nAdvertising\n\nLicense tracks for brand campaigns\n\n🎮\n\nVideo Games\n\nProvide music for gaming environments\n\nAdd Your First Track",
        "requestedPath": "/sync-licensing",
        "expectedPath": "/sync-licensing",
        "finalPath": "/sync-licensing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "*",
        "scenario": "catchall-not-found",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\n404\nPage Not Found\n\nLooks like this page took a vacation! The page you're looking for doesn't exist or has been moved.\n\nGo Back\nGo to Dashboard\nSearch\nPopular Pages\n\nDashboard\n\nYour main workspace\n\nStudio\n\nCreate and edit music\n\nAnalytics\n\nTrack your performance\n\nMarketplace\n\nBrowse beats and sounds\n\nCollaborations\n\nWork with others\n\nSettings\n\nManage your account\n\nNeed Help?\n\nIf you believe this is an error or need assistance, our support team is here to help.\n\nHelp Center\nContact Support\nDocumentation\n\nError Code: 404 • Page Not Found\n\nURL: /page80-unmatched\n\nStil",
        "requestedPath": "/page80-unmatched",
        "expectedPath": "/page80-unmatched",
        "finalPath": "/page80-unmatched",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      }
    ],
    "administrator": [
      {
        "canonicalRoute": "/admin/security",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Admin\nSecurity\nSecurity Dashboard\n\nReal-time security monitoring and threat intelligence\n\nLive Monitoring\nRefresh\nSystem Uptime\n\n0m\n\nStatus: healthy\n\nActive Sessions\n\n0\n\nusers\n\nLogin Success Rate\n\n—\n\n%\n\nSuccessful logins are not recorded separately.\n\nFailed Login Attempts (24h)\n\n0\n\nattempts\n\nSuccessful Logins (24h)\n\n—\n\nnot recorded\n\nSuspicious Activity\n\n0\n\nevents\n\nBehavioral Alerts\nAnomalies\nSecurity Assessment\nBehavioral Analytics Alerts\nAI-detected unusual user behavior patterns\n\nNo Security Alerts\n\nSystem is operating normally with no unusual behavior detected",
        "requestedPath": "/admin/security",
        "expectedPath": "/admin/security",
        "finalPath": "/admin/security",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/admin/audit-log",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Admin\nAudit Log\nAudit Log\n\nImmutable record of all sensitive platform actions\n\nRefresh\n\nEvents (24h)\n\n0\n\nFailures (24h)\n\n0\n\nHigh/Critical (24h)\n\n0\n\nTop Action\n\n—\n\nAll Risks\nTime\tAction\tResource\tUser\tIP\tResult\tRisk\nNo audit events found\n\nPage 1 — showing up to 50 entries\n\nPrevious\nNext",
        "requestedPath": "/admin/audit-log",
        "expectedPath": "/admin/audit-log",
        "finalPath": "/admin/audit-log",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/admin/support/tickets/:ticketId",
        "scenario": "owned-record-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": true,
        "textSample": "Admin\nSupport\nTickets\nDetails\nBack to tickets\nPage80 owned support ticket\nOpen\nMEDIUM\nDisposable local support fixture\nAdd\nConversation\n\nNo replies yet.\n\nSend reply",
        "requestedPath": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
        "expectedPath": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
        "finalPath": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/admin/support",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Admin\nSupport\nOpen Tickets\n1\nIn Progress\n0\nAvg Response Time\n0h\nSatisfaction\n0%\nSupport Tickets\nView and manage customer support requests\nAll Status\nAll Priority\nSubject\tStatus\tPriority\tCategory\tCreated\tActions\nPage80 owned support ticket\tOPEN\tMEDIUM\tGeneral\t10/28/2026\t\nStart\nView",
        "requestedPath": "/admin/support",
        "expectedPath": "/admin/support",
        "finalPath": "/admin/support",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/admin/kyc",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nKYC Verification Review\n\nReview and approve identity verification requests\n\nUnder Review\n0 under review\nNo under review Verifications\n\nThere are no verification requests matching this filter.",
        "requestedPath": "/admin/kyc",
        "expectedPath": "/admin/kyc",
        "finalPath": "/admin/kyc",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/admin/training",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Admin\nTraining\nModel Training\n\nUNetV4 · 463M params · 30-day curriculum\n\nUnable to load trainer status: MaxCore unavailableRetry\nPHASE\n—/4\nNot started\nLOSS\n—\n0 sessions completed\nSAMPLES\n—\ntotal trained\nTIME\n—\ntraining time\nControl\nLoss Curve\nDatasets\nCurriculum\nStart Training\nRuns the curriculum trainer which automatically advances through phases\nMode\nSingle Session\nSessions (Day mode)\n3\nStart Training\nCurrent Session\nStatus\n—\nPhase\n—\nCurrent Loss\n—\nSessions Done\n0\nLast Weights Save\n—\nWeights File\nweights_v4.npz",
        "requestedPath": "/admin/training",
        "expectedPath": "/admin/training",
        "finalPath": "/admin/training",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/admin/content-sampler",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Admin\nContent Sampler\nContent Sampler\n\nIllustrative genre and platform planning samples — not live performance analytics\n\nSummary\nBeats (96)\nPosts (24)\nMatrix\n\nThese rankings are generated from static planning assumptions, not live market, audience, or sales data.\n\nBEAT SAMPLES\n96\nPOST SAMPLES\n24\nTOP GENRE\nAFROBEATS\nTOP PLATFORM\nTIKTOK\nTop Genres by Combined Score\n1\n🌍\nAfrobeats\n91\nBest mood: energetic\nAvg price: $58\nMomentum: 95\n2\n🎤\nHiphop\n89\nBest mood: empowering\nAvg price: $45\nMomentum: 80\n3\n🔥\nTrap\n87\nBest mood: dark\nAvg price: $49\nMomentum: 85\n4\n⭐\nPop\n87\nBest mood: energetic\nAvg price: $",
        "requestedPath": "/admin/content-sampler",
        "expectedPath": "/admin/content-sampler",
        "finalPath": "/admin/content-sampler",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/admin/dashboard",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Admin\nDashboard\nSystem Overview\n\nMonitor system health, security, and performance\n\nRefresh\n\nAudit Score\n\n92/100\n\nSecurity & Compliance\n\nTest Score\n\n/100\n\nQuality Assurance\n\nSystem Uptime\n\n56%\n\nAvailability\n\nActive Users\n\n0\n\nCurrently Online\n\nOverview\nBeat Loop\nAudit\nTesting\nPerformance\nUsers\nCompliance\nTokens\nWebhooks\nLogs\nSystem Metrics\nCPU Usage\n4%\nMemory Usage\n72%\nDisk Usage\n71%\nNetwork I/O\nUnavailable\nUser Analytics\n\n3\n\nNew Users Today\n\n0\n\nTotal Revenue\n\nMonthly Growth\n+100%\nTop Countries\n\nNo data available\n\nRecent Activity\n\nNew user registered: workspace-7493da41e7d17e29@example.invalid\n\n",
        "requestedPath": "/admin/dashboard",
        "expectedPath": "/admin/dashboard",
        "finalPath": "/admin/dashboard",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/admin/beat-money-loop",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Admin\nBeat Money Loop\nSystem Overview\n\nMonitor system health, security, and performance\n\nRefresh\n\nAudit Score\n\n92/100\n\nSecurity & Compliance\n\nTest Score\n\n/100\n\nQuality Assurance\n\nSystem Uptime\n\n56%\n\nAvailability\n\nActive Users\n\n0\n\nCurrently Online\n\nOverview\nBeat Loop\nAudit\nTesting\nPerformance\nUsers\nCompliance\nTokens\nWebhooks\nLogs\nBeat Money Loop\nPAUSED\nEnable\nRun cycle now\nAutonomous: scan trending music context → generate beat → list on the marketplace at a competitive price → optional organic promotion (MaxCore/PDIM, no paid spend) → wait for a completed marketplace order before marking the c",
        "requestedPath": "/admin/beat-money-loop",
        "expectedPath": "/admin/beat-money-loop",
        "finalPath": "/admin/beat-money-loop",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/admin",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nAdmin Panel\n\nMax Booster Control Center\n\nOverview\nUser Management\nContent Moderation\nSystem Health\nPlatform Analytics\nFinancial Config\nKill Switch\nPayment Bypass\nSettings\n\nTotal Users\n\n3\n\n+3 this month\n\nTotal Revenue\n\n$0\n\n+0% growth\n\nTotal Projects\n\n1\n\n+0% growth\n\nSystem Uptime\n\n0m\n\nSince last restart\n\nQuick System Status\nDatabase\nconnected\nCPU Usage\n4%\nMemory Usage\n74%\nError Rate (24h)\n0.00%\nModeration Queue\nPending Reports\n0\nReviewed Today\n0\nView All Reports",
        "requestedPath": "/admin",
        "expectedPath": "/admin",
        "finalPath": "/admin",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/admin/autonomy",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\n\nInitializing autonomy controls…",
        "requestedPath": "/admin/autonomy",
        "expectedPath": "/admin/autonomy",
        "finalPath": "/admin/autonomy",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      }
    ],
    "public": [
      {
        "canonicalRoute": "/",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nFeatures\nPricing\nSign In\nGet Started\nAI-powered tools — 90-Day Money-Back Guarantee\nMusic Career\nManagement\nPowered by AI\n\nThe most advanced music career platform ever built — AI Studio, Social Media Autopilot, Beat Marketplace, Analytics, and Distribution all in one place.\n\nGet Started — 90-Day Guarantee\nTry Live Demo\nAI-assisted\nMusic creation\nCross-platform\nConnected workflow\n90 days\nRefund policy\nAll-in-one\nCreator tools\nCutting-Edge Technology\nEverything You Need to Succeed\n\nFrom creation to monetization — Max Booster is the unfair ",
        "requestedPath": "/",
        "expectedPath": "/",
        "finalPath": "/",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/login",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nSign In\nWelcome back to Max Booster\nUsername or Email\nPassword\nSign In\nForgot your password?\nContinue with Google\nTry Demo Mode\nDon't have an account? Sign up here",
        "requestedPath": "/login",
        "expectedPath": "/login",
        "finalPath": "/login",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/forgot-password",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nForgot Password?\n\nEnter your email and we'll send you a reset link\n\nEmail Address\nSend Reset Link\nBack to Login",
        "requestedPath": "/forgot-password",
        "expectedPath": "/forgot-password",
        "finalPath": "/forgot-password",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/reset-password",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nInvalid Reset Link\n\nNo reset token provided. Please request a new password reset link.\n\nRequest New Reset Link\nBack to Login",
        "requestedPath": "/reset-password",
        "expectedPath": "/reset-password",
        "finalPath": "/reset-password",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/register",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nStart Your Music Empire Today\n\nJoin thousands of artists using AI to 10x their career growth\n\nAI-powered music creation\n1000+ professional plugins\n10x growth acceleration\nAutomated social media\nRevenue optimization\n90-Day Money Back Guarantee\n\nPurchase Max Booster with confidence. If you're not completely satisfied within 90 days, get a full refund - no questions asked!\n\nCreate Your Account\nStart your journey to music success\n90-Day Money Back Guarantee\n\n100% Risk-Free\n\nYour purchase is protected for 90 days. If you're not satisfied, get",
        "requestedPath": "/register",
        "expectedPath": "/register",
        "finalPath": "/register",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/register/payment/:tier",
        "scenario": "provider-configuration-state",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nSign In\nMonthly Plan\n$49\n/month\nPerfect for getting started\nProfessional AI Music Studio (DAW)\nAutonomous Social Media Autopilot (24/7)\nAI-Enhanced Organic Advertisement Autopilot\nBeat Marketplace & Licensing\nProfessional Analytics Dashboard\nDistribution to 150+ Platforms\nAI Mixing & Mastering\nRoyalty Tracking & Splits\nEmail Marketing System\nUnlimited Active Projects\nPremium Content Library\nCloud Storage (50GB)\nEmail Support\n90-Day Money-Back Guarantee\n\nIf you're not completely satisfied, we'll refund your entire payment within 90 days o",
        "requestedPath": "/register/payment/monthly",
        "expectedPath": "/register/payment/monthly",
        "finalPath": "/register/payment/monthly",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/register/success",
        "scenario": "invalid-payment-session-error-state",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nPayment Verification Failed\n\nNo valid payment session found. If you already paid, contact support before purchasing again.\n\nAlready paid? Contact support before starting another purchase. Already registered? Sign in.\n\nBack to Pricing",
        "requestedPath": "/register/success",
        "expectedPath": "/register/success",
        "finalPath": "/register/success",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/desktop-app",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nSign In\nWelcome back to Max Booster\nUsername or Email\nPassword\nSign In\nForgot your password?\nContinue with Google\nTry Demo Mode\nDon't have an account? Sign up here",
        "requestedPath": "/desktop-app",
        "expectedPath": "/login",
        "finalPath": "/login",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/marketplace/beat/:beatId",
        "scenario": "missing-resource-error-state",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Marketplace\nBeat\nPage80 Missing\nMax Booster Marketplace\n\nBuy & Sell Beats with AI Discovery\n\nStandard Checkout\nAI Discovery\nSmart Contracts\nCollaborations\nGenre\nMood\nNewest\nAll\nHip-Hop\nTrap\nR&B\nPop\nRock\nElectronic\nJazz\nBlues\nCountry\nReggae\nFolk\nAlternative\nIndie\nPunk\nMetal\nFunk\nSoul\nGospel\nWorld\nLatin\nAmbient\nExperimental\nBrowse\nProducers\n\nThis beat is unavailable or no longer listed. You can browse other beats below.\n\n0 results\nClear filters\nNo beats found\n\nTry adjusting your filters or search with different keywords\n\nPopular searches:\n\nTrap\nHip-Hop\nR&B\nLo-Fi\nPop\nDrill\nClear all filters",
        "requestedPath": "/marketplace/beat/page80-missing",
        "expectedPath": "/marketplace/beat/page80-missing",
        "finalPath": "/marketplace/beat/page80-missing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/marketplace/producer/:producerId",
        "scenario": "missing-resource-error-state",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Marketplace\nProducer\nPage80 Missing\nProducer Not Found\n\nThe producer you're looking for doesn't exist.\n\nBack to Marketplace",
        "requestedPath": "/marketplace/producer/page80-missing",
        "expectedPath": "/marketplace/producer/page80-missing",
        "finalPath": "/marketplace/producer/page80-missing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/pricing",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "90-Day Money-Back Guarantee\n\nA full refund is available within 90 days of your initial purchase. You can cancel recurring plans anytime to prevent future charges.\n\nChoose Your Plan\nSimple, Transparent Pricing\n\nReplace $45,000+/year in tools and labor. Get professional AI studio, autonomous autopilots for social media & advertising, marketplace, analytics, and distribution.\n\n90-Day Money-Back Guarantee\n•\nNo setup fees\n•\nCancel anytime\n90-Day Money-Back Guarantee\nMonthly\n$49\n/month\n\nPerfect for getting started\n\nProfessional AI Music Studio (DAW)\nAutonomous Social Media Autopilot (24/7)\nAI-Enhanc",
        "requestedPath": "/pricing",
        "expectedPath": "/pricing",
        "finalPath": "/pricing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/features",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nPricing\nSign In\nGet Started\nAll Features\nBuilt for Artists\n\nComprehensive tools for creation, distribution, promotion, and monetization\n\nAI Music Studio\n\nProfessional production tools with AI assistance\n\nMixing Controls\n\nAdjust track levels, panning, and EQ in the browser-based studio\n\nAI-Assisted Mixing & Mastering\n\nAnalyze your track and apply adaptive, genre-aware mixing and mastering processing\n\nDAW Workspace\n\nBrowser-based DAW with multi-track editing and effects\n\nProject Storage\n\nCloud-based storage for your studio projects\n\nAudio ",
        "requestedPath": "/features",
        "expectedPath": "/features",
        "finalPath": "/features",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/api-docs",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Authentication\n\nUser authentication and sessions\n\nStudio\n\nDAW and audio processing\n\nDistribution\n\nMusic distribution and releases\n\nMarketplace\n\nBuy and sell beats, stems, and tracks\n\nSocial Media\n\nMulti-platform social management\n\nAnalytics\n\nInsights and metrics\n\nPayments\n\nStripe payments and royalties\n\nAdmin\n\nAdmin panel operations\n\nSchemas\nUser\nError\nTrack",
        "requestedPath": "/api-docs",
        "expectedPath": "/api-docs",
        "finalPath": "/api-docs/",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/documentation",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nAPI\nGet Started\nDocumentation\nEverything You Need to Know\n\nAn overview of Max Booster features and links to the currently published technical resources.\n\nQuick Start Guides\nGetting Started\n\nSet up your account and start creating music in 5 minutes\n\n• Account Setup\n• First Project\n• Profile Configuration\n• Payment Setup\nStudio Basics\n\nLearn the DAW workspace and production tools\n\n• Track Creation\n• Audio Recording\n• AI Mixing\n• Plugin Usage\nDistribution\n\nRelease your music to streaming platforms worldwide\n\n• Release Setup\n• DSP Selection\n",
        "requestedPath": "/documentation",
        "expectedPath": "/documentation",
        "finalPath": "/documentation",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/about",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nFounder Story\nGet Started\nAbout Max Booster\nBuilt by Musicians, for Musicians\n\nThe complete platform for independent artists to create, distribute, promote, and monetize their music\n\nOur Mission\n\nTo democratize the music industry by providing independent artists with professional-grade tools that were previously only accessible to major label artists—all in one affordable platform.\n\nOur Values\nArtist-First\n\nEvery decision is made with independent artists in mind. Your success is our success.\n\nInnovation\n\nWe leverage cutting-edge AI and a",
        "requestedPath": "/about",
        "expectedPath": "/about",
        "finalPath": "/about",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/blog",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nPricing\nSign In\nGet Started\nMax Booster Blog\nInsights for Artists\n\nTips, tutorials, and industry insights to help you grow your music career\n\nFeatured Post\nWelcome to Max Booster: AI-Powered Music Career Management\n4 min read\nProduct\nApril 17, 2026\nB-Lawz Music\n\nMax Booster brings every tool you need to write, produce, distribute, and grow your music career into a single AI-driven workspace.\n\nRead Article\nLatest Articles\nAll\nProduct\nGuides\nGuides\nGetting Started: Your First 30 Minutes in Max Booster\n\nA focused walkthrough of the most imp",
        "requestedPath": "/blog",
        "expectedPath": "/blog",
        "finalPath": "/blog",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/blog/:slug",
        "scenario": "published-record-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nAll Articles\nGet Started\nProduct\nWelcome to Max Booster: AI-Powered Music Career Management\n\nMax Booster brings every tool you need to write, produce, distribute, and grow your music career into a single AI-driven workspace.\n\nB-Lawz Music — Founder, Max Booster\nApril 17, 2026\n4 min read\n\nMax Booster is the AI-native command center for independent artists, producers, and labels. Everything you need to plan, create, release, and grow lives in one place.\n\nWhat you can do today\n\nOut of the box, Max Booster covers the full music career loop:\n",
        "requestedPath": "/blog/welcome-to-max-booster",
        "expectedPath": "/blog/welcome-to-max-booster",
        "finalPath": "/blog/welcome-to-max-booster",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/solo-founder-story",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nGet Started\nBuilt by a Musician\nFor Musicians\n\nThe story of how frustration became innovation\n\nThe Problem\n\nAs an independent artist, I spent years juggling multiple expensive platforms just to manage my music career. DistroKid for distribution, BeatStars for selling beats, Hootsuite for social media, expensive DAWs for production, and countless ad platforms for promotion. The costs added up to over $500/month, and nothing talked to each other.\n\nI watched talented artists give up not because they lacked skill, but because they couldn't a",
        "requestedPath": "/solo-founder-story",
        "expectedPath": "/solo-founder-story",
        "finalPath": "/solo-founder-story",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/security",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nPrivacy\nGet Started\nSecurity & Trust\nYour Data is Safe with Us\n\nEnterprise-grade security measures to protect your music, data, and financial information\n\nEnd-to-End Encryption\n\nAll data transmitted to and from Max Booster is encrypted using TLS 1.3, the latest industry standard.\n\nSecure Infrastructure\n\nOur servers are hosted on enterprise-grade infrastructure with 24/7 monitoring and automatic failover.\n\nTwo-Factor Authentication\n\nOptional 2FA adds an extra layer of security to protect your account from unauthorized access.\n\nPrivacy by ",
        "requestedPath": "/security",
        "expectedPath": "/security",
        "finalPath": "/security",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/dmca",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nMax Booster\nby B-Lawz Music\nTerms\nGet Started\nDMCA Policy\nProtecting Intellectual Property\n\nMax Booster respects the intellectual property rights of others and expects our users to do the same\n\nCopyright Infringement Policy\n\nMax Booster complies with the Digital Millennium Copyright Act (DMCA) and will respond to valid notices of copyright infringement. If you believe that your copyrighted work has been copied in a way that constitutes copyright infringement and is accessible on our platform, please notify us.\n\nWe take copyright infringement seriously and will prom",
        "requestedPath": "/dmca",
        "expectedPath": "/dmca",
        "finalPath": "/dmca",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/terms",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Back\nTerms and Conditions\n\nPlease review these terms before using the Service.\n\n1. Agreement to Terms\n\nBy accessing and using Max Booster (\"the Service\"), you agree to be bound by these Terms and Conditions. If you disagree with any part of these terms, you may not access the Service.\n\n2. Use License\n\nMax Booster grants you a personal, non-transferable, non-exclusive license to use the Service subject to these Terms. This license includes:\n\nAccess to the AI-powered music creation and distribution platform\nUse of the proprietary AI tools for music analysis and enhancement\nDistribution services ",
        "requestedPath": "/terms",
        "expectedPath": "/terms",
        "finalPath": "/terms",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/privacy",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Back\nPrivacy Policy\n\nLast updated: November 11, 2025\n\nProtected in Transit\n\nSafeguards are used to protect your data in transit\n\nTransparent\n\nFull transparency about what's collected and why\n\nNo Selling\n\nYour personal data is never sold\n\n1. Introduction\n\nMax Booster, operated by B-Lawz Music LLC, is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the AI-powered music platform and distribution services.\n\n2. Information Collected\nPersonal Information\n\nWhen you register and use Max Booster's services, th",
        "requestedPath": "/privacy",
        "expectedPath": "/privacy",
        "finalPath": "/privacy",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "canonicalRoute": "/help",
        "scenario": "normal-route-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nBack\nHelp Center\n\nFind answers to common questions, explore tutorials, and get the most out of Max Booster\n\nDocumentation\n\nBrowse product guides and technical documentation\n\nExplore\nDeveloper API\n\nRead API endpoints, authentication, and integration guides\n\nExplore\nProduct Updates\n\nRead the latest Max Booster news and announcements\n\nExplore\nExplore Features\n\nSee the tools available to grow your music career\n\nExplore\nEmail Support\nGet personalized help and support\n\nSend an email and I'll personally get back to you within 24 hours\n\nsupport@maxbooster.ai\nAI Assistant \"",
        "requestedPath": "/help",
        "expectedPath": "/help",
        "finalPath": "/help",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/storefront/:slug",
        "scenario": "seeded-public-storefront-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": true,
        "textSample": "Skip to main content\n(Alt+1)\nPage80 public storefront\nFollow\nviews\n0\nlikes\n0\nfollowers\n0\nproducts\n0\nmembership tiers\nProducts\n\nNo products available yet",
        "requestedPath": "/storefront/page80-store-22248f599acf",
        "expectedPath": "/storefront/page80-store-22248f599acf",
        "finalPath": "/storefront/page80-store-22248f599acf",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/store/:slug",
        "scenario": "seeded-public-storefront-alias-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": true,
        "textSample": "Skip to main content\n(Alt+1)\nPage80 public storefront\nFollow\nviews\n0\nlikes\n0\nfollowers\n0\nproducts\n0\nmembership tiers\nProducts\n\nNo products available yet",
        "requestedPath": "/store/page80-store-22248f599acf",
        "expectedPath": "/store/page80-store-22248f599acf",
        "finalPath": "/store/page80-store-22248f599acf",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/s/:label",
        "scenario": "missing-resource-error-state",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": null,
        "textSample": "Skip to main content\n(Alt+1)\nStorefront link unavailable\n\nThis storefront link could not be opened. Check the link or contact the creator.\n\nGo to Max Booster",
        "requestedPath": "/s/page80-missing",
        "expectedPath": "/s/page80-missing",
        "finalPath": "/s/page80-missing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "canonicalRoute": "/epk/:slug",
        "scenario": "published-record-render",
        "businessJourney": "NOT_PROVEN_BY_ROUTE_RENDER",
        "expectedFixtureContentRendered": true,
        "textSample": "Skip to main content\n(Alt+1)\n\nELECTRONIC PRESS KIT\n\nAcceptance artist a372ada5\nElectronic\n\nA saved browser press kit\n\nBiography\n\nDisposable artist biography saved through the actual browser form. Updated after the anonymous cache was populated.\n\nContact & Booking\n\nGENERAL\n\nartist@example.test\n\nBOOKING\n\nbooking@example.test\n\nWEBSITE\n\nexample.test\n\nPress kit powered by\n\nMax Booster",
        "requestedPath": "/epk/acceptance-5b7ebe7d35f51d04",
        "expectedPath": "/epk/acceptance-5b7ebe7d35f51d04",
        "finalPath": "/epk/acceptance-5b7ebe7d35f51d04",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      }
    ]
  },
  "page80ThrottleWaits": [
    {
      "path": "/api/auth/logout",
      "seconds": 60
    }
  ],
  "nativeSignedOutLogin": {
    "electronBridgePresent": true,
    "hydratedLoginRemainsAccessible": true
  },
  "page80ApiResponses": [
    {
      "route": "/login",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/login",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/login",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/login",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/user/preferences",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/user/preferences",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/onboarding-status",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/dashboard/comprehensive",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/ai/insights",
      "status": 503
    },
    {
      "route": "/login",
      "path": "/api/studio/projects",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/analytics/dashboard",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/workspace/create",
      "status": 201
    },
    {
      "route": "/login",
      "path": "/api/workspace/85354569-fc88-4a5a-bcc2-9efa08779493",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/workspace/85354569-fc88-4a5a-bcc2-9efa08779493/members",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/login",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/workspace/user/workspaces",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/login",
      "path": "/api/press-kit",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/press-kit",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/press-kit",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/login",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/press-kit",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/press-kit/publish",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/press-kit/public/acceptance-5b7ebe7d35f51d04",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/press-kit",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/press-kit/public/acceptance-5b7ebe7d35f51d04",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/press-kit/publish",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/press-kit/public/acceptance-5b7ebe7d35f51d04",
      "status": 404
    },
    {
      "route": "/login",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/press-kit/publish",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/dashboard",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/dashboard",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/auth/onboarding-status",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/dashboard/comprehensive",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/studio/projects",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/ai/insights",
      "status": 503
    },
    {
      "route": "/dashboard",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/dashboard",
      "path": "/api/analytics/dashboard",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/dashboard/comprehensive",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/auth/onboarding-status",
      "status": 200
    },
    {
      "route": "/simplified-dashboard",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/projects",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/projects",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/studio/projects",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/projects",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/analytics/ai",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/analytics/ai",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/ai/analytics/insights",
      "status": 503
    },
    {
      "route": "/analytics/ai",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/analytics/ai",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/analytics",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/analytics",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/onboarding/progress",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/analytics/dashboard/30d",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/analytics/anomalies/summary",
      "status": 403
    },
    {
      "route": "/analytics",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/analytics-alerts/alerts/summary",
      "status": 200
    },
    {
      "route": "/analytics",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/developer-api",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/developer-api",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/developer/keys",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/developer/usage",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/developer-api",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/social-media",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/social-media",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/onboarding/progress",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/social/platform-status",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/social/metrics",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/social/posts",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/social/ai-insights",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/social/activity",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/social/calendar",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/social/weekly-stats",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/social/calendar/stats",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/analytics/dashboard",
      "status": 200
    },
    {
      "route": "/social-media",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/advertising",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/social/promotable-content",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/onboarding/progress",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/advertising/audience-segments",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/advertising/creative-fatigue",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/advertising/lookalike-audiences",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/organic/metrics",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/advertising/forecasts",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/organic/recommendations",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/advertising/competitor-insights",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/advertising/campaigns",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/advertising",
      "path": "/api/advertising/ai-insights",
      "status": 200
    },
    {
      "route": "/advertising",
      "path": "/api/social/platform-status",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/marketplace",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/marketplace",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/marketplace/producers",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/marketplace/beats",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/marketplace/sales-analytics",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/marketplace/purchases",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/marketplace/ai-recommendations",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/marketplace",
      "path": "/api/studio/projects",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/royalties",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/royalties",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/royalties",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/royalties/payment-methods",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/royalties/top-tracks",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/royalties/platform-breakdown",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/royalties/payout-settings",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/royalties/splits",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/publishing",
      "status": 200
    },
    {
      "route": "/royalties",
      "path": "/api/publishing/stats",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/studio/projects/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b/daw-state",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/studio/projects/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/studio/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b",
      "path": "/api/studio/projects/fe42a564-6a0b-40f0-a8dc-19fc1f4a339b/tracks",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/studio",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/studio",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/studio/start-hub/summary",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/studio",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/show",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/show",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/show",
      "path": "/api/shows/setlists",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/distribution",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/distribution",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/distribution/releases",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/distribution/hyperfollow",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/distribution/earnings/summary",
      "status": 409
    },
    {
      "route": "/distribution",
      "path": "/api/distribution/hyperfollow/analytics",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/distribution",
      "path": "/api/distribution/platforms",
      "status": 409
    },
    {
      "route": "/distribution",
      "path": "/api/distribution/toolost/status",
      "status": 200
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/subscribe/monthly",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/support/my/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/settings",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/settings",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/onboarding/progress",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/auth/profile",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/auth/notifications",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/billing/subscription",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/billing/payment-method",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/billing/history",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/auth/sessions",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/settings",
      "path": "/api/auth/update-onboarding",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/onboarding",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/onboarding",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/onboarding",
      "path": "/api/auth/update-onboarding",
      "status": 200
    },
    {
      "route": "/storefront",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/storefront",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/storefront",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/storefront",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/storefront",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/storefront",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/storefront",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/storefront",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/storefront",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/storefront",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/storefront",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/storefront",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/verification",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/verification",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/kyc/status",
      "status": 200
    },
    {
      "route": "/verification",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/contracts",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/contracts",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/contracts/stats/summary",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/contracts/templates",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/contracts/my-contracts",
      "status": 200
    },
    {
      "route": "/contracts",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/workspaces",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/workspaces",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/workspace/user/workspaces",
      "status": 200
    },
    {
      "route": "/workspaces",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/collaborations",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/collaborations",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/collaborations/connections",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/collaborations/connections/pending",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/collaborations/suggestions",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/collaborations/projects",
      "status": 200
    },
    {
      "route": "/collaborations",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/career-coach",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/career-coach",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/career-coach/goals",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/career-coach/insights",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/assistant/history",
      "status": 200
    },
    {
      "route": "/career-coach",
      "path": "/api/career-coach/recommendations",
      "status": 503
    },
    {
      "route": "/career-coach",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/assistant",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/assistant",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/assistant/history",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/assistant",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/release-countdown",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/release-countdown",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/countdowns",
      "status": 200
    },
    {
      "route": "/release-countdown",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/invoices",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/invoices",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/invoices",
      "status": 200
    },
    {
      "route": "/invoices",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/handle-link",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/handle-link",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/handle-link",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/handle-link",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/handle-link",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/handle-link",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/handle-link",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/handle-link",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/handle-link",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/handle-link",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/handle-link",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/handle-link",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/notifications/32051a8e-9beb-4f92-801a-48803bde7076/read",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "path": "/api/notifications/32051a8e-9beb-4f92-801a-48803bde7076",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/notifications",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/notifications",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/notifications",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/workflow-automations",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/workflow-automations",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/music-workflow-automations",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/music-workflow-automations/stats",
      "status": 200
    },
    {
      "route": "/workflow-automations",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/shows",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/shows",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/shows",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/shows/stats",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/shows/setlists",
      "status": 200
    },
    {
      "route": "/shows",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/fan-hub",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/fan-hub",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/fan-hub/subscribers",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/fan-hub/stats",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/fan-hub/messages",
      "status": 200
    },
    {
      "route": "/fan-hub",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/fan-memberships",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/fan-memberships",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/fan-memberships/tiers",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/fan-memberships/revenue",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/fan-memberships/members",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/fan-memberships/wallet-config",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/fan-memberships",
      "path": "/api/fan-memberships/wallet-leaderboard",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/ar-intelligence/trend-forecast",
      "status": 501
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/ar-intelligence/catalog-gap",
      "status": 503
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/ar-intelligence/release-timing",
      "status": 501
    },
    {
      "route": "/ar-intelligence",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/outreach",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/outreach/campaigns",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/outreach/follow-ups",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/outreach",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/outreach",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/merch",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/merch",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/merch",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/merch/orders",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/merch",
      "path": "/api/merch/stats",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/press-kit",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/press-kit",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/press-kit",
      "status": 200
    },
    {
      "route": "/press-kit",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/playlist-pitching",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/playlist-pitching/curators",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/playlist-pitching/stats",
      "status": 200
    },
    {
      "route": "/playlist-pitching",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/publishing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/publishing",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/publishing",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/publishing/stats",
      "status": 200
    },
    {
      "route": "/publishing",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/sync-licensing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/sync-licensing",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/sync-licensing",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/sync-licensing/stats",
      "status": 200
    },
    {
      "route": "/sync-licensing",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/auth/login",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/auth/2fa/setup",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/auth/2fa/verify",
      "status": 200
    },
    {
      "route": "/page80-unmatched",
      "path": "/api/auth/update-onboarding",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/security",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/security",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/security/behavioral-alerts",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/security/metrics",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/security/anomaly-detection",
      "status": 200
    },
    {
      "route": "/admin/security",
      "path": "/api/security/pentest-results",
      "status": 501
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/admin/audit-log",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/admin/audit-log",
      "path": "/api/admin/audit-log/summary",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/admin/support/tickets/91827a7d-7769-4a82-86fb-151827c20f6f",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/support",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/support",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/support/tickets/all",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/support/stats",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/admin/support",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/kyc",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/kyc",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/kyc/admin/pending",
      "status": 200
    },
    {
      "route": "/admin/kyc",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/training",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/training",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/training/datasets",
      "status": 503
    },
    {
      "route": "/admin/training",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/admin/training",
      "path": "/api/training/status",
      "status": 503
    },
    {
      "route": "/admin/training",
      "path": "/api/training/schedule",
      "status": 503
    },
    {
      "route": "/admin/training",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/admin/content-sampler/summary",
      "status": 200
    },
    {
      "route": "/admin/content-sampler",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/admin/metrics",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/audit/results",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/testing/results",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/admin/analytics",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/admin/activity",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/admin/users",
      "status": 200
    },
    {
      "route": "/admin/dashboard",
      "path": "/api/admin/system-health",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/notifications",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/notifications/preferences",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/audit/results",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/admin/beat-money-loop/status",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/testing/results",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/admin/metrics",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/admin/analytics",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/admin/activity",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/admin/system-health",
      "status": 200
    },
    {
      "route": "/admin/beat-money-loop",
      "path": "/api/admin/users",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/admin",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/admin/users",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/dns/resolver/status",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/admin/analytics",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/admin/system-health",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/admin/moderation/reports",
      "status": 200
    },
    {
      "route": "/admin",
      "path": "/api/admin/settings",
      "status": 429,
      "retryAfter": "60"
    },
    {
      "route": "/admin",
      "path": "/api/admin/payment-bypass/status",
      "status": 429,
      "retryAfter": "60"
    },
    {
      "route": "/admin",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/metrics/web-vitals",
      "status": 429,
      "retryAfter": "60"
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/me",
      "status": 429,
      "retryAfter": "60"
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/metrics/web-vitals",
      "status": 429,
      "retryAfter": "60"
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/kill-switch/status",
      "status": 429,
      "retryAfter": "60"
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/logout",
      "status": 429,
      "retryAfter": "60"
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/kill-switch/status",
      "status": 403
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/heartbeat",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/preferences",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/refresh-token",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/onboarding-status",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/dashboard/comprehensive",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/bootstrap",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/studio/projects",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/ai/insights",
      "status": 503
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/projects",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/analytics/dashboard",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/logout",
      "status": 200
    },
    {
      "route": "/admin/autonomy",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/login",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/login",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/forgot-password",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/forgot-password",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/forgot-password",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/forgot-password",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/forgot-password",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/reset-password",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/reset-password",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/reset-password",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/reset-password",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/reset-password",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/register",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/register",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/register",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/register",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/register",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/register",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/register/payment/monthly",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/register/payment/monthly",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/register/payment/monthly",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/register/payment/monthly",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/register/payment/monthly",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/register/payment/monthly",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/register/success",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/register/success",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/register/success",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/register/success",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/register/success",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/register/success",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/desktop-app",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/desktop-app",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/desktop-app",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/desktop-app",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/desktop-app",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/desktop-app",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/marketplace/beat/page80-missing",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/marketplace/beat/page80-missing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/marketplace/beat/page80-missing",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/marketplace/beat/page80-missing",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/marketplace/beat/page80-missing",
      "path": "/api/marketplace/beats/page80-missing",
      "status": 404
    },
    {
      "route": "/marketplace/beat/page80-missing",
      "path": "/api/marketplace/producers",
      "status": 200
    },
    {
      "route": "/marketplace/beat/page80-missing",
      "path": "/api/marketplace/beats",
      "status": 200
    },
    {
      "route": "/marketplace/beat/page80-missing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/marketplace/beat/page80-missing",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/marketplace/producer/page80-missing",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/marketplace/producer/page80-missing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/marketplace/producer/page80-missing",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/marketplace/producer/page80-missing",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/marketplace/producer/page80-missing",
      "path": "/api/marketplace/producers/page80-missing",
      "status": 404
    },
    {
      "route": "/marketplace/producer/page80-missing",
      "path": "/api/marketplace/producers",
      "status": 200
    },
    {
      "route": "/marketplace/producer/page80-missing",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/marketplace/producer/page80-missing",
      "path": "/api/marketplace/beats",
      "status": 200
    },
    {
      "route": "/marketplace/producer/page80-missing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/pricing",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/pricing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/pricing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/pricing",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/pricing",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/features",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/features",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/features",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/features",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/features",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/documentation",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/documentation",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/documentation",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/documentation",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/documentation",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/about",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/about",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/about",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/about",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/about",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/blog",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/blog",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/blog",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/blog",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/blog",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/blog/welcome-to-max-booster",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/blog/welcome-to-max-booster",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/blog/welcome-to-max-booster",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/blog/welcome-to-max-booster",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/blog/welcome-to-max-booster",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/solo-founder-story",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/solo-founder-story",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/solo-founder-story",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/solo-founder-story",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/solo-founder-story",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/security",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/security",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/security",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/security",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/security",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/dmca",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/dmca",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/dmca",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/dmca",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/dmca",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/terms",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/terms",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/terms",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/terms",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/terms",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/privacy",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/privacy",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/privacy",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/privacy",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/privacy",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/help",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/help",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/help",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/help",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/help",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/storefront/page80-store-22248f599acf",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/storefront/page80-store-22248f599acf",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/storefront/page80-store-22248f599acf",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/storefront/page80-store-22248f599acf",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/storefront/page80-store-22248f599acf",
      "path": "/api/storefront/public/page80-store-22248f599acf",
      "status": 200
    },
    {
      "route": "/storefront/page80-store-22248f599acf",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/storefront/page80-store-22248f599acf",
      "path": "/api/storefront/b5073e03-6c7a-495c-b1e3-35c98dc0e71b/membership-tiers/public",
      "status": 200
    },
    {
      "route": "/storefront/page80-store-22248f599acf",
      "path": "/api/storefront/b5073e03-6c7a-495c-b1e3-35c98dc0e71b/bogo-promotions",
      "status": 200
    },
    {
      "route": "/storefront/page80-store-22248f599acf",
      "path": "/api/storefront/b5073e03-6c7a-495c-b1e3-35c98dc0e71b/listings",
      "status": 200
    },
    {
      "route": "/storefront/page80-store-22248f599acf",
      "path": "/api/storefront/b5073e03-6c7a-495c-b1e3-35c98dc0e71b/social",
      "status": 200
    },
    {
      "route": "/store/page80-store-22248f599acf",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/store/page80-store-22248f599acf",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/store/page80-store-22248f599acf",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/store/page80-store-22248f599acf",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/store/page80-store-22248f599acf",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/store/page80-store-22248f599acf",
      "path": "/api/storefront/public/page80-store-22248f599acf",
      "status": 200
    },
    {
      "route": "/store/page80-store-22248f599acf",
      "path": "/api/storefront/b5073e03-6c7a-495c-b1e3-35c98dc0e71b/membership-tiers/public",
      "status": 200
    },
    {
      "route": "/store/page80-store-22248f599acf",
      "path": "/api/storefront/b5073e03-6c7a-495c-b1e3-35c98dc0e71b/listings",
      "status": 200
    },
    {
      "route": "/store/page80-store-22248f599acf",
      "path": "/api/storefront/b5073e03-6c7a-495c-b1e3-35c98dc0e71b/social",
      "status": 200
    },
    {
      "route": "/store/page80-store-22248f599acf",
      "path": "/api/storefront/b5073e03-6c7a-495c-b1e3-35c98dc0e71b/bogo-promotions",
      "status": 200
    },
    {
      "route": "/s/page80-missing",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/s/page80-missing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/s/page80-missing",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/s/page80-missing",
      "path": "/api/storefront-domains/resolve/page80-missing",
      "status": 404
    },
    {
      "route": "/s/page80-missing",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/s/page80-missing",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/press-kit/public/acceptance-5b7ebe7d35f51d04",
      "status": 200
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/version",
      "status": 200
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/auth/me",
      "status": 200
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/metrics/web-vitals",
      "status": 204
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/health",
      "status": 200
    },
    {
      "route": "/epk/acceptance-5b7ebe7d35f51d04",
      "path": "/api/auth/me",
      "status": 200
    }
  ],
  "lastReadinessObservation": {
    "status": 503,
    "aggregate": "degraded",
    "unifiedAwarenessReady": false,
    "subsystems": [
      {
        "name": "database",
        "status": "ok"
      },
      {
        "name": "redis",
        "status": "ok"
      },
      {
        "name": "routes",
        "status": "ok"
      },
      {
        "name": "audit",
        "status": "unknown"
      },
      {
        "name": "automation",
        "status": "ok"
      },
      {
        "name": "maxcore",
        "status": "unknown"
      }
    ],
    "routeRegistrationDetail": "critical routes registered; route loading complete"
  }
}
```


## Interpretation

- Real application routes and production static frontend were served from the assembled server process.
- Normal registration/login used the real password hashing, CSRF, session store, and logout paths with a synthetic user; no auth bypass was used.
- A real headless Chromium page hydrated the login UI, submitted the login form, persisted its cookie session, logged out, and captured a pre-credential screenshot.
- A 200 liveness response alone is not treated as readiness. Frontend acceptance requires a real HTML response after the production static handler is active.
- `frontend` records the raw production HTML response; `browser` separately records JavaScript hydration and the real browser form/session journey.
- This result does not disable a failed critical readiness dependency or relabel degraded provider behavior as a pass.
- Passing load thresholds proves only this bounded source-app/ephemeral-PostgreSQL run. It does not prove PDIM, MaxCore, a packed artifact, production capacity, or provider acceptance.

## Still untested

- authenticated business journeys beyond login/session/logout, project CRUD, preferences persistence, workspace ownership/list rendering, and press-kit form/publish/cache/unpublish checks
- provider sandbox delivery, OAuth, webhooks, messaging, push, email, social posting, and DSP contracts
- real-money payment, payout, refund, royalty, and financial reconciliation
- production-source restore/upgrade/rollback and durable backup recovery
- local MaxCore inference/model behavior (the only MaxCore implementation; intentionally not started in this bounded non-ML drill)
- Redis/PDIM loss recovery, load/soak, multi-worker clustering, DNS/TLS, and packed cold-image startup
