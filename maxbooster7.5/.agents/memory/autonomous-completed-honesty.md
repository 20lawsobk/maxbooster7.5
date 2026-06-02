---
name: Autonomous "completed"/"applied" honesty
description: Why an autonomous step must gate its success/applied status on a real side-effect a live consumer reads, the effective-field rule, and the activateCampaign create-as-draft gotcha
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

## "applied" must mean a live consumer actually reads the output (effective-field rule)

Same trap, one level deeper. The Self-Evolution Engine produced bounded "enhancement"
payloads into an applied-registry and reported them `applied=true` simply because the
payload's _category_ was in the consumed set. But an enhancement only changes behavior
if it carries a payload **field a live consumer actually reads**. Example: a
`posting_optimization` payload with `contentFormatPriority`/`engagementTargeting` was
marked applied, yet the only field any consumer read was `optimalHours` — so it changed
nothing while reporting success.

**Rule:** gate `applied` on `consumed && payloadHasEffectiveField`, where
_effective field_ = a field with a real runtime reader today. Maintain an explicit
`EFFECTIVE_FIELDS` map per category (the fields a consumer reads). Category membership
is necessary but NOT sufficient. When consumed-but-not-effective, store the entry as
honest advisory with a `notAppliedReason`, never as applied.

**Also:** when the engine generates the payload, make it emit an effective field
(e.g. posting → `optimalHours`) so the action is genuinely real, not just honestly-advisory.
Heuristic values are fine as long as they're read and sit below learned data / above
static defaults and are reversible — heuristic ≠ fake; unread ≠ applied.
