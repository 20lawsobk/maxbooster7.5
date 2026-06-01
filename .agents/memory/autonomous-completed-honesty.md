---
name: Autonomous "completed" honesty
description: Why an autonomous loop step must gate its success status on a real side-effect, and the activateCampaign create-as-draft gotcha
---

# Autonomous "completed" must mean a real side-effect happened

**Rule:** When an autonomous/background loop reports a step as `completed`/`success`,
that status MUST be gated on the real downstream side-effect actually occurring —
never on merely reaching the end of the function without throwing.

**Why:** The Beat Money Loop marked every cycle `status='completed'` even though the
ADVERTISE step never ran (campaignId was always absent). Beat generation + marketplace
listing were genuinely happening, but the "completed" badge made the whole pipeline
look like it worked, so a silently-broken advertise stage went unnoticed for a long
time. The user noticed only because they cross-checked and saw "uploadings that aren't
really happening." False-positive success is worse than an honest failure because it
hides the broken stage.

**How to apply:**
- Have the worker return an explicit outcome object (e.g. `{posted, reason}`) and set
  the terminal status from it: `completed` only when the side-effect is confirmed
  (`results.postsCreated > 0`), otherwise a distinct honest status (`listed`) carrying
  the reason. A partial-but-real outcome can still count as "success" for scheduling
  cadence while being clearly distinguished from a fully-completed one.
- Keep downstream aggregations/backfills consistent with that modeling: if a non-
  `completed` status still represents a live, revenue-earning artifact, include it in
  the queries (`inArray(['completed','listed'])`) or you will undercount.

## activateCampaign create-as-draft gotcha

`advertisingDispatchService.activateCampaign(campaignId, userId)` is the ONLY real ad
dispatch path (there is no `startCampaign`). It **rejects** campaigns whose status is
already `active`/`running`, and it is the function that flips status to `active` after a
successful post. So any caller that creates a campaign as `status:'active'` and then
calls `activateCampaign` gets a silent no-op dispatch. **Always create campaigns as
`draft` before activating.**

Real column names (easy to get wrong): `adCampaigns.platform` is **singular** (extra
fan-out platforms live in `metadata.fanOutPlatforms`); `adCampaigns.id` is a **varchar
uuid** (string, not number). `adCreatives` stores copy in `description`/`headline` and
media in `mediaUrl` — there are no `normalizedContent`/`rawContent`/`assetUrls` columns.
