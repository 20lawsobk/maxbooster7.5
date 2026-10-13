# Unified ecosystem: current verification record

## Verdict

**Not ready for unattended activation.** This is a bounded inspection and
verification record, not a certification of every endpoint or every workflow.
No live posts, advertising purchases, releases, payments, or production publish
were deliberately triggered during this work.

## Inspected architecture

| Area | UI / public boundary | Execution / persistence |
|---|---|---|
| Social management | `SocialMedia.tsx`, autopilot dashboard, `/api/autopilot`, `/api/autopilot/knowledge`, social bulk routes | User-owned knowledge in PDIM, MaxCore control transport, `autoPostingServiceV2`, persisted `posts`, `scheduled-posts` queue |
| Advertising | `Advertisement.tsx`, autonomous dashboard, `/api/advertising` | MaxCore domain adapter, owned promotable-content resolution, campaigns/creatives, `advertisingDispatchService` |
| Beat revenue loop | Admin dashboard, `/api/admin/beat-money-loop` | MaxCore generation, PDIM audio, marketplace listings, organic campaign dispatch, verified marketplace sale reconciliation |
| Workflow automation | `MusicWorkflowAutomations.tsx`, `/api/music-workflow-automations` | Per-user configuration, event dispatch, execution logs, individual template handlers |

The beat loop's promotion step calls advertising dispatch. Completed marketplace
orders call the beat loop's sale reconciliation. Social and advertising
autopilots use a common posting service. Music workflow handlers are not uniformly
connected to that service; their success messages are not evidence of execution.

## Corrections in this pass

1. `BoosterQueue.add` now accepts omitted optional options without throwing before
   enqueueing. Explicit priority, delay and job ID are preserved.
2. Social work statistics query persisted post/batch states, scoped to the
   requesting owner in **both** queries. They no longer return constant zeros.
3. The bulk status endpoint reads the nested social-post counters rather than
   nonexistent top-level properties and identifies its source as persisted work.
4. Backoff and rate-limit read failures now propagate an unavailable-state error
   rather than granting permission to publish.
5. The disposable publishing copy preserves public Python certifi trust bundles.
   Omitting those files changed the Python capsule identity during rehearsal.
6. Autonomous scheduling delegates to the shared publisher without first
   overwriting the persisted delivery status. Published, in-flight, and uncertain
   deliveries retain their duplicate-delivery guards; missing posts fail.
7. Removed a call to the nonexistent `storage.trackSocialPost` method after
   publishing. Existing durable receipts are the delivery record. Follow-up
   errors can no longer relabel an already-checkpointed delivery as failed.
8. Beat-loop failure recovery now requests the updated row from PostgreSQL
   before inspecting its status; destructuring a non-returning update previously
   threw while handling the original failure.
9. PDIM named-object retirement now resolves the existing owner's pocket and
   delegates matching versions to authoritative reference-counted deletion.
   Missing pockets are not created, other names are untouched, and errors propagate.
10. Refresh-token validation rejects malformed stored rows and invalid issuance
    timestamps while preserving valid legacy and current timestamp formats.
    Snapshot-worker errors are normalized without suppressing failures. Unused
    Lua-worker helpers/imports and server imports were removed.

## Remaining demonstrated gaps

| Evidence | Impact | Required structural correction |
|---|---|---|
| `handleReleaseCountdownPosts` only builds strings and sends a notification | Reports scheduled posts that were never persisted or queued | Resolve owned release/date, validate eligible connected platforms, persist each deterministic countdown slot and enqueue with stable idempotency keys |
| `handleSmartCaptionRepurpose` only builds strings and sends a notification | No caption adaptation or scheduled post exists | Resolve the owned published source, generate via MaxCore, persist drafts or enqueue with explicit publishing consent; add a durable event emission/consumption path |
| `handleSocialBioUpdate` only builds strings and sends a notification | Claims remote profile updates and future reversions without either | Implement only documented supported provider operations, persist original profile/reversion work, expose unsupported platforms explicitly |
| `handleLowEngagementRescue` only adds action descriptions | Claims A/B tests and posting-time changes that were not performed | Persist actual experiment/configuration changes and connect outcome ingestion before reporting applied actions |
| Beat-loop pricing/trend defaults remain in the inspected service | Conflicts with the requested no-fallback behavior | Define explicit data-sufficiency gates or an operator-approved initial pricing policy, rather than presenting default values as measured optimization |

These gaps are not fixed by the queue corrections above. Additional inspected
handlers also swallow errors; a complete handler-by-handler audit remains.
All live ingestion streams, pricing/scaling feedback loops, and continuous-load
behavior have **not** been comprehensively validated.

### Observed generation blocker

After the latest preview restart, existing scheduled automation resumed without
a manual test trigger. MaxCore repeatedly logged:
`Prompt loses over 40% of its tokens to checkpoint <UNK>`.
The loaded model reported a 443-token vocabulary. The active ScriptAgent captures
awareness and adds conditioning to a checkpoint prompt, then requires model
generation. Its awareness-only composition method explicitly raises an error;
it is not an independent generation path. This contradicts the assumption that
this implementation can currently generate without a compatible checkpoint.
No quality guard was bypassed, fallback re-enabled, or model replaced.

## Evidence and measurement limits

- Focused verification: 62/62 test cases passed across social queue integrity,
  posting recovery/delivery guards, PostgreSQL statistics, and advertising
  MaxCore contracts. Provider boundaries use isolated test doubles, not real
  deliveries. Three tests execute the actual statistics queries against a
  newly initialized temporary PostgreSQL database, including two-owner isolation
  and a real missing-table failure. No shared Neon data is used by those tests.
  The additional 30 cases cover beat-loop observations/channel boundaries,
  named-object retirement, snapshot writing, and refresh-token row validation.
  Tests ran in separate focused invocations, not as a complete repository suite.
- Authenticated HTTP checks using the configured test account returned 200 for
  social bulk status, music workflow statistics, advertising status, and the
  admin beat-loop status. Bulk status included its `persisted-work` source.
  These checks prove authenticated reads, not successful autonomous actions.
- A broader test invocation exceeded its command deadline. Its partial output
  is not a passing complete test run.
- Previous disposable shell build: exited 1 because `pack_python` exceeded its
  task deadline. The copy had omitted public Python CA bundles, creating an
  avoidable cache miss. The corrected copy has not completed a fresh full
  build/restore/start verification.
- An initial server-wide native TypeScript check was killed with exit 137.
  After pausing the preview and using `GOMEMLIMIT=3GiB GOGC=50`, full server and
  client checks both completed with exit 0. Thirteen server diagnostics were
  corrected before the final server pass. No blanket suppressions were added.
- The restarted preview rendered its public landing page and `/api/ready`
  returned HTTP 200 with `status: "ok"`. Neither proves autonomous provider flows.
  The latest restart initially returned 503 while MaxCore warmed; a subsequent
  check returned 200 with all six reported subsystems `ok`, despite the separate
  generation failures above. Health therefore does not establish generation quality.
- No continuous-load benchmark, provider-wide security assessment, or real
  publication success is claimed by this record.

## Requested percentage reporting

Correctness, stability, scalability, security and production readiness do not
yet have a complete enumerated acceptance matrix or measured denominator.
Assigning project-wide percentages would be invented. The only scoped
percentage justified here is **100% of the 62 focused test cases passing**;
it must not be interpreted as 100% subsystem or production readiness.
