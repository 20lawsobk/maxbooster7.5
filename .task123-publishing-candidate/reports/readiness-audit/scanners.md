# Scanner triage and release-readiness audit
Date: 2026-09-19. Read-only source audit; only this report is authored. Scanner output is evidence to investigate, not proof of exploitability, a legal breach, or a complete shipped software inventory. No installation, runtime execution, provider/DB access or secret-value inspection was performed.

## Blocker list

| ID | Classification | Priority / affected release scope | Finding | Confidence |
|---|---|---|---|---|
| SCAN-01 | VERIFICATION GATE; confirmed affected-version lock matches | P1 / web runtime, media/upload and data-import consumers | Current root lock retains scanner-advised runtime packages; advisory applicability and final artifact patches are not demonstrated | High for lock/source presence; medium for exposure; no exploit claim |
| SCAN-02 | VERIFICATION GATE | P1 / whole release portfolio; P0 only if critical AnyIO certificate-spoofing preconditions are confirmed on a shipped consumer | Scanner lacks dependency occurrence paths; nested Python, Rust, developer, Go and duplicate findings cannot be equated to one deployed web service | High for missing provenance; medium for release relevance |
| SCAN-03 | CONFIRMED defect | P1 / server logs and operational tools with personal data | Raw email/IP/username logging is not covered by central key-path redaction, including message interpolation | High for source-level emission; sink retention/access unverified |
| SCAN-04 | CONFIRMED defect | P1 / build/install and any archive consumer; conditional runtime impact | Global tar override substitutes success-returning no-op archive APIs | High for behavior; consumer execution requires acceptance tests |
| SCAN-05 | VERIFICATION GATE | P1 / all production release candidates | SAST is explicitly incomplete, not a clean scan | High |

Five deduplicated roots, not 285 independently proven vulnerabilities. The dependency report contains **206 occurrences: 3 critical, 93 high, 99 moderate, 11 low**, read from severity.level. There are **172 distinct scanner IDs** (IDs include package version); repeated occurrences need provenance rather than assumed deletion. Privacy contains **79 occurrences**. Both critical token-log alerts are false positives for token material at the cited current source. No P0 exploit is established by this audit.

### Evidence, entrypoints, consumers and scope

**SCAN-01.** package-lock.json:12346 (fast-uri 3.1.5), :15223 (multer 2.2.0), :17790 (sharp 0.35.3), :14108 (js-yaml 4.3.1), :8259 (@xmldom/xmldom 0.9.11), :10154 (csv-parse 6.2.1), :16860 (qs 6.15.3) match scanner versions in non-dev root-lock entries. package-lock.json also contains uuid 7.0.3 under xcode as a **dev** occurrence, not an established web runtime dependency. Actual entrypoints: server/middleware/uploadHandler.ts:1,105-114 constructs multer upload middleware; server/routes.ts:4162 begins upload error handling; server/image-generation.ts:6,164 and server/pocket-dimension/fabric/compression/MediaTranscoder.ts:141-142 invoke sharp; server/services/royaltiesCSVImportService.ts:2 imports csv-parse/sync. fast-uri, qs, js-yaml and xmldom match installed dependency graph, but direct hostile-input reachability was not established here. Scanner descriptions include multipart denial of service/descriptor leaks/limit races (multer; proposed fix 2.3.0), image codec vulnerabilities (sharp; 0.35.4), URI normalization/host confusion (fast-uri; 3.1.6), and YAML merge CPU exhaustion (js-yaml; 4.3.2). These are scanner advisory assertions, not independently reproduced exploits. Package versions and exact advisories for all other instances are retained below. Use the largest applicable patched floor, not the first advisory's floor. Consumer limits/authentication can reduce exposure but are not proof a vulnerable parser is fixed.

build.sh:117-138 installs production dependencies then optionally runs script/security-fix.ts, treating failure as nonfatal. Consequently the lock establishes an unresolved verification gate, not definitive proof of the final installed implementation. build.sh:93-99 selects prebuilt artifacts by existence; :159-174 builds/prunes on the alternative path. Rebuild and inspect actual bundled and externalized code. This dependency root is separate from authorization/business-logic findings in [security.md](security.md); do not count parser occurrences as additional auth defects.

**SCAN-02.** Every dependency occurrence omits a file/path field; source only identifies osv-scanner and collection time. Critical GHSA-82r6-8w77-94w6 appears for AnyIO 4.13.0 twice and 4.12.1 once: the described flaw is TLSStream IDNA 2003 hostname encoding permitting potential certificate spoofing, with scanner fix 4.14.2. Current tracked uv.lock:30, external/maxcore/uv.lock:43 and external/maxcore/artifacts/ai-training-server/uv.lock:43 contain AnyIO records; they are separate candidate environments, not proof three live vulnerable services. Root uv.lock also contains click (:52); external/maxcore/uv.lock carries click (:293), setuptools (:1326,1340), and torch (:1467,1498). Its torch markers explicitly split non-Linux 2.12.1 from Linux CPU 2.13.0+cpu (:1167-1168). Do not assert Linux ships the non-Linux torch finding. boosterstate/Cargo.lock:6,191 contains anyhow/fxhash, a distinct Rust sidecar scope. The fxhash maintenance advisory is not by itself an exploitable security bug. No tracked Go application consumer was established for pgx/x/mod/x/net/x/text/stdlib; the 46 stdlib occurrences are **unattributed**, not automatically web-service defects or automatically safe dev tooling.

Tracked manifest/lock families examined by filename: root npm/pnpm/uv; boosterstate Cargo; dns-node; dns-os and its dns-api service; electron; tls-proxy; external/maxcore root and workspace manifests plus two uv locks; external/pdim root/workspace manifests and pnpm lock; stubs/tar. Workspace/cache duplicates may contribute but cannot be assigned without scanner occurrence paths. npm package-lock matching is independently annotated in the inventory; no match means unresolved provenance, not stale by default.

Artifact evidence: Dockerfile:14-20 installs all dependencies/copies context/builds Rust and :22-29 runs development. Dockerfile.prod:21-24 copies dist, node_modules, package.json and the Rust binary, not entire external source trees; this does not prove build execution succeeds. .dockerignore:10-32 excludes named caches/environments/root node_modules and :34-42 excludes desktop/mobile artifacts; these exclusions are not a universal guarantee for nested contexts or other deployment mechanisms. Tracked dist assets exist, so source-only scanning cannot attest committed bundles. package.json:38-48 defines desktop/mobile build paths independently. Final release images, release archives, running environments and provider-installed dependencies were not inspected. External MaxCore integration behavior belongs to [integrations.md](integrations.md); count its underlying dependency upgrade once here, not again as a separate OAuth/integration defect.

**SCAN-03.** server/logger.ts:5-41 lists secret/header key paths but no email, username or IP redaction; :48-55 configures Pino. String interpolation is not redacted by object-key rules. Concrete reachable consumers include admin actions (server/routes/admin.ts:267,317,358,382,405,670,695,717,751,1142), support (server/routes/support.ts:184,221,264,334,384), OAuth success (server/routes.ts:2423,2439; server/routes/socialOAuth.ts:1090), account deletion (server/services/accountDeletionService.ts:103,149,173,230), status subscriptions (server/services/statusPageService.ts:442,470,618,644) and abuse middleware (inventory gives every remaining location). Impact: unnecessary personal-data copying to stdout/log sinks; deletion logs themselves retain identifiers. This is a confirmed minimization/redaction gap, not a conclusion that these logs violate a particular statute. Legal basis, retention, operator access and actual sink exposure are verification gates. Deletion lifecycle findings in security.md and OAuth findings in integrations.md share these data flows; link this logging root rather than duplicating their distinct lifecycle/auth defects.

Critical privacy trace: server/routes/socialOAuth.ts:552-556 builds tokenData. :559-566 logs only two boolean coercions and numeric expiry, never token bytes. :637-641 parses response, :646-654 logs status, ok, token-presence boolean and tokenData.error. Thus **neither cited call logs an access/refresh token as alleged**. However error is provider-controlled and not type/enum constrained at that call: its safety is conditional on upstream error shape, and central redaction does not sanitize arbitrary error strings. Preserve this as a narrow SCAN-03 schema-hardening gate, not a confirmed critical token leak. Nearby failure paths were not exhaustively proven safe. Privacy items for DNS listener addresses, scheduler round budget, registrant code and ID-only login are similarly differentiated below. Phone prefix logging is partial personal data, not a full phone-number leak. GeoDNS logs at debug level, so default info level does not emit that site unless configured otherwise.

**SCAN-04.** package.json:407 overrides tar to file:./stubs/tar. stubs/tar/package.json:2-9 advertises tar 6.2.1 and CommonJS/ESM entrypoints. stubs/tar/index.js:3-13 and index.mjs:1-11 return resolved promises for create/extract/list/update/replace and aliases without doing archive work. Consumers resolving tar through the override can silently accept absent extraction/creation. The stub's comment claims --ignore-scripts, but build.sh:118,159 invokes npm ci without that flag: do not rely on the comment as a consumer proof. The scanner's **17 tar entries** apply upstream tar advisories to a local file dependency; they are **not demonstrated upstream traversal/overwrite exploits in this no-op code**. The independently verified functional defect is the no-op replacement, not 17 extra security bugs. This intersects deployment/build readiness; count this root once.

**SCAN-05.** reports/readiness-audit/scanner-sast.json:2-3 explicitly contains incomplete:true and empty results. No successful language/file coverage, ruleset, revision, or completion evidence is supplied. Its consumer is the release approval decision. Empty findings cannot support a clean security attestation. Manual review and dependency/privacy scanners do not close full SAST coverage.

## Repair playbooks

Each option is an independent implementation strategy; select one per root, coordinate overlapping migration work, and retain acceptance evidence. Steps are proposals, not work performed, and none guarantees a first-attempt fix.

### SCAN-01 — runtime dependency advisories

**A. Upgrade dependency graph (recommended; least bespoke maintenance, possible compatibility changes).**
1. Map each matching package to owning consumer, bundled/external status and all applicable advisory floors; save reproducible current test baselines.
2. Upgrade direct packages and transitive parents to supported patched versions; change overrides only with compatibility evidence and regenerate the authoritative lock.
3. Build clean web/desktop/mobile artifacts as applicable, including native codecs, and replace previously committed bundles through the normal release pipeline.
4. Run upload abort/limit/multipart regressions, image corpus tests, CSV accounting imports and URI/YAML/XML tests at relevant consumers; scan final artifacts.
5. Accept when affected shipped versions are absent, advisory fixtures pass and feature/error behavior matches contracts; retain rollback artifacts and monitor resource use.

**B. Maintained backport (smaller API delta, higher internal security ownership).**
1. Establish which consumers cannot take upstream fixes and obtain exact reviewed patch commits for each applicable advisory.
2. Fork those dependency versions, apply complete fixes with tests and assign patch-maintenance owners.
3. Publish signed internal packages, pin immutable versions and migrate all parent resolutions/bundles to the fork.
4. Exercise advisory-specific regression fixtures and differential consumer tests; verify actual loaded code hashes in release artifacts.
5. Accept only with independent patch review, no unresolved reachable advisory and an upstream convergence deadline; version metadata alone is insufficient.

**C. Replace vulnerable implementations (larger migration, less legacy debt).**
1. Inventory required multipart, image, CSV, URI, XML and YAML semantics and choose maintained alternative implementations per affected consumer.
2. Implement adapters preserving validation, resource bounds, error contracts and cleanup; do not route around validation.
3. Migrate call sites and transitive parents, remove obsolete dependency edges and rebuild every affected target.
4. Compare normal and adversarial corpora, concurrent upload cleanup, format compatibility and accounting results against explicit requirements.
5. Accept when replacement dependencies are scanned, old implementations are absent and all required functionality works with measured bounds.

**D. Hardened service migration (isolation plus patched parsers, operational cost).**
1. Identify exposed parser workloads and define authenticated service contracts, data handling and availability budgets.
2. Implement a separately deployed parser/media service on patched supported libraries with strict input/output schemas and resource limits.
3. Migrate callers and durable jobs to the service; remove vulnerable local parser edges rather than leaving fallback execution.
4. Test malformed payloads, outages, retries, concurrency, cleanup and equivalent output; scan both caller and service artifacts.
5. Accept when all required parsing is served by verified fixed implementations and monitoring proves bounded failure; isolation alone is not acceptance.

### SCAN-02 — occurrence provenance and critical scope

**A. Artifact-first SBOM reconciliation (recommended; strongest shipped-scope evidence, extra build integration).**
1. Enumerate independently released web, Rust, Python, DNS, proxy, desktop/mobile and external-service artifacts with owners and target platforms.
2. Generate per-artifact SBOMs containing package URLs, versions, file locations, dependency chains and digests; retain source scan separately.
3. Reconcile all 206 occurrences to artifacts or documented non-shipping tool environments; upgrade applicable AnyIO to a verified fixed release and rebuild affected environments.
4. Scan each final artifact and test TLS hostname verification plus process-pool cancellation where AnyIO is used; validate OS marker resolution.
5. Accept a signed occurrence ledger with no unattributed critical/high release dependency and tested remediation for every applicable advisory; non-shipping does not excuse vulnerable build tooling.

**B. Component-owned hermetic lock builds (more repositories/jobs, clear ownership).**
1. Partition roots and nested workspaces into actual deployable components and assign one authoritative lock per ecosystem/component.
2. Implement frozen clean builds with explicit OS/architecture resolution and machine-readable resolved dependency export.
3. Update affected component locks, including AnyIO consumers, and migrate releases away from ambiguous shared workspace installations.
4. Reproduce builds from clean checkouts and compare lock/export/artifact identities; run component security regressions and cross-component smoke tests.
5. Accept when every scanner occurrence resolves to a component plus target or documented stale evidence, with fixed artifacts and no unexplained drift.

**C. Curated internal distribution pipeline (supply-chain control, substantial infrastructure).**
1. Define approved dependency sets and owners for each release/toolchain environment, including Go scanner/tool binaries if attribution proves them.
2. Build a signed internal package/image channel with source provenance and security review, upgrading affected packages instead of merely allowlisting alerts.
3. Rebuild components exclusively from this channel and generate installation receipts that preserve nested/transitive identities.
4. Test package authenticity, stale-channel rejection, target platform behavior and the applicable vulnerability fixtures.
5. Accept only when receipts explain all 206 observations, released components use remediated packages and build-tool risks have owners and evidence.

**D. Scanner provenance adapter plus release graph (lighter build changes, scanner integration burden).**
1. Recover scanner invocation and input manifests without secret capture; specify required occurrence fields and duplicate identity rules.
2. Implement collection that records scan root, manifest path, dependency chain, dev/runtime/target markers, binary digest and completion status.
3. Rescan exact release inputs, reconcile duplicate IDs without erasing distinct installations, and upgrade confirmed affected consumers before deployment.
4. Validate with controlled multi-lock workspaces, repeated versions, local packages and OS-specific dependencies; compare against a final artifact sample.
5. Accept when every occurrence is attributable and critical release paths have reviewed reachability plus successful fix tests; unresolved records block approval, not silently disappear.

### SCAN-03 — personal-data logging

**A. Typed allowlisted events (recommended; strongest source control, broad call-site migration).**
1. Classify every inventory location by purpose, personal-data need, retention and incident-response requirement.
2. Introduce typed event schemas allowing event IDs, request correlation and necessary pseudonymous actor references; constrain OAuth upstream errors to safe codes.
3. Migrate string interpolation and raw object logging at every listed application/tool site; centralize residual secret and personal-field redaction.
4. Capture production-format logs for admin/support/OAuth/deletion/rate-limit/error flows using synthetic identifiers; assert identifiers and token material never escape and useful diagnostics remain.
5. Accept after all true sites pass, historical sink retention/deletion is reconciled and ongoing schema enforcement rejects unsafe fields.

**B. Pseudonymous audit identity service (supports investigations, key lifecycle complexity).**
1. Determine which actor/IP relationships must be correlated and approve retention and access rules.
2. Implement scoped rotating keyed pseudonyms and a separately protected identity resolution store; keep raw personal data out of ordinary events.
3. Replace each sensitive interpolation/field with purpose-bound aliases and migrate old log references under an approved deletion schedule.
4. Test rotation, collision handling, unauthorized reidentification, deletion and investigation workflows; schema-bound provider error output as well.
5. Accept only with working audits, restricted resolution access and no raw identity in general sinks; pseudonyms still require privacy controls.

**C. Dedicated privacy-aware audit pipeline (preserves justified raw audits, more infrastructure).**
1. Separate strictly necessary security/legal audit facts from operational diagnostics, documenting lawful purpose and minimum fields.
2. Implement encrypted structured audit storage with scoped access, short purpose-specific retention and deletion/exemption workflows.
3. Route justified records directly to that pipeline, replace general logs with correlation references, and enforce safe OAuth error schemas at emission.
4. Test routing failures, access denial, retention expiry and subject deletion; verify stdout and vendor observability receive no unnecessary raw values.
5. Accept when required investigations remain possible and all inventory sites use the correct verified destination without duplicate copies.

**D. Enforced logging boundary/serialization layer (central rollout, requires careful adapters).**
1. Inventory every Pino, console and stdout producer and define supported event schemas and safe failure behavior.
2. Implement a shared structured logging facade with schema validation, sensitive-key normalization and deterministic removal of personal content before serialization; convert interpolation to named fields.
3. Migrate all inventoried producers, including scripts/DNS tools, and prohibit direct logging outside reviewed infrastructure adapters.
4. Run nested-object, error-message, Unicode, provider-error-object and partial-phone tests across production serialization and transports.
5. Accept when boundary tests and repository checks cover all true sites, diagnostics remain useful, and historical sink handling is approved; regex scrubbing alone is insufficient.

### SCAN-04 — tar no-op override

**A. Restore patched upstream tar (recommended; faithful API, installation compatibility work).**
1. Trace all tar consumers and required API versions during install, desktop packaging and runtime; select a maintained version covering all applicable advisories.
2. Replace the local no-op override with the supported implementation and resolve parent compatibility without suppressing security checks.
3. Regenerate locks and rebuild from clean environments, migrating committed bundles and native installation artifacts.
4. Round-trip archives and verify extracted bytes, permissions and paths; test malicious archives, lifecycle builds and every alias used.
5. Accept only with actual archive output and safe extraction plus artifact scans; remove the obsolete stub after no references remain.

**B. Upgrade tar-dependent parents (less global override risk, multiple upstream migrations).**
1. Inventory dependency chains resolving tar and identify parent releases using supported fixed archive implementations.
2. Upgrade or replace those parents and adapt their integration APIs; remove the global file override.
3. Recreate locks and rebuild all native/desktop/mobile packages with real lifecycle work enabled where required.
4. Test each parent workflow and archive path traversal/symlink protections; inspect resolved dependency graphs for old or stub tar.
5. Accept with functional artifacts and no remaining no-op dependency; assign maintenance ownership for each migrated parent.

**C. Implement a real compatible archive adapter (maximum control, high maintenance).**
1. Document the exact tar API contract and select a secure maintained archive engine; budget independent security review.
2. Implement real creation/extraction/list/update semantics and aliases, with secure path handling, streaming, limits and honest failures.
3. Publish the adapter as an accurately named/versioned package and migrate callers explicitly rather than masquerading as upstream tar.
4. Run contract/differential archive tests, fuzz malformed archives and validate installation/packaging consumers.
5. Accept when byte-level outputs and safety properties are demonstrated and advisory scanners identify the real implementation.

**D. Replace archive-dependent build workflows (larger redesign, removes obsolete dependency paths).**
1. Identify why each installer/packager needs tar and select supported distribution mechanisms providing equivalent required functionality.
2. Implement verified artifact installation or packaging with genuine extraction in a hardened maintained tool, checksum verification and explicit errors.
3. Migrate parent tooling/call sites and remove both tar dependency edges and the stub; regenerate deployment artifacts.
4. Test clean builds, platform variants, integrity failures, malicious archives, interrupted installation and rollback.
5. Accept only with complete native and packaged outputs and no consumer resolving the stub; skipping scripts or archive features is not a fix.

### SCAN-05 — incomplete SAST

**A. Repair and rerun existing scanner (recommended; continuity, tool-specific troubleshooting).**
1. Recover run metadata and failure reason; pin source revision, rule version, language inventory and expected file count.
2. Correct resource/configuration/input problems and implement fail-closed completion validation in CI.
3. Run the full supported language scan on exact release source, including relevant nested components, with documented exclusions only for genuinely non-code artifacts.
4. Verify coverage counts and positive-control detection; manually triage findings against consumers and repair confirmed issues with regression tests.
5. Accept only a completed signed report and reviewed remaining risk; empty results with incomplete=true always fail the gate.

**B. Alternate maintained SAST engine (different coverage, rule migration cost).**
1. Compare required TS/JS/Python/Rust/Go surfaces with engine support and define equivalent security rules and coverage criteria.
2. Integrate the replacement engine with pinned rules, reproducible CI inputs and explicit unsupported-language handling.
3. Scan all released components and migrate prior findings to stable identifiers; fix newly confirmed defects.
4. Validate positive controls, known-source patterns, false-positive triage and nonzero exit on partial scans.
5. Accept with complete coverage artifacts and remediation evidence, not merely a different tool returning fewer results.

**C. Per-language scanner federation (better specialization, orchestration cost).**
1. Partition source inventory by language/component and select maintained analyzers with declared rule coverage.
2. Build a result aggregator retaining revision, paths, rules, completion, severity and ownership without treating failed shards as clean.
3. Run each shard, remediate applicable findings and integrate cross-language trust-boundary review.
4. Test shard timeout/failure, duplicate findings and adversarial fixtures; ensure every released source family has an accountable result.
5. Accept only when all required shards complete and the aggregate release gate reflects actual coverage and reviewed findings.

**D. Independent assessed release pipeline (external expertise, cost and scheduling).**
1. Commission a scoped independent code-security assessment with the release inventory and explicit SAST completion requirements.
2. Provide isolated source/build metadata and integrate the assessor's reproducible automated scan pipeline with manual trust-boundary review.
3. Repair confirmed issues in application code and preserve regression tests, updating the candidate revision for reassessment.
4. Require reruns on the repaired revision, positive-control/coverage evidence and independent verification of each remediation.
5. Accept with completed machine-readable scan evidence and signed residual-risk review, plus an internal recurring scan gate; a manual signoff alone does not close incomplete SAST.

## Full sanitized dependency inventory — all 206 observations

Rows preserve scanner order and duplicates. Advisory IDs and versions are scanner-supplied, not independently validated against the advisory publisher. **No occurrence path was supplied for any row** (shown as —). Root-lock matches below are independent corroboration, not reconstructed scanner provenance. R means non-dev lock entry, not proved execution; D means dev entry. U means no exact root npm match; it may be nested, Python/Rust/Go, stale or tooling and must be attributed via SCAN-02. Local tar is independently identified as the no-op replacement. Fix is the scanner suggestion per observation; unavailable/unspecified is not evidence no future fix exists.

| # | Ecosystem | Package | Version | Advisory | Severity | Scanner fix | Scanner path | Independent root match/scope |
|---|---|---|---|---|---|---|---|---|
| 1 | crates.io | anyhow | 1.0.101 | RUSTSEC-2026-0190 | moderate | 1.0.103 | — | U: provenance gate |
| 2 | crates.io | fxhash | 0.2.1 | RUSTSEC-2025-0057 | moderate | unavailable / not supplied | — | U: provenance gate |
| 3 | npm | fast-uri | 3.1.5 | GHSA-5jgf-p345-68v8 | high | 3.1.6 | — | R: node_modules/fast-uri |
| 4 | npm | fast-uri | 3.1.5 | GHSA-f65p-4m7j-42xc | high | 3.1.6 | — | R: node_modules/fast-uri |
| 5 | npm | fast-uri | 3.1.5 | GHSA-fph4-wmhf-6fwf | high | 3.1.6 | — | R: node_modules/fast-uri |
| 6 | npm | fast-uri | 3.1.5 | GHSA-jqff-g426-hqxp | high | 3.1.6 | — | R: node_modules/fast-uri |
| 7 | npm | fast-uri | 4.1.2 | GHSA-5jgf-p345-68v8 | high | 4.1.3 | — | U: provenance gate |
| 8 | npm | fast-uri | 4.1.2 | GHSA-f65p-4m7j-42xc | high | 4.1.3 | — | U: provenance gate |
| 9 | npm | fast-uri | 4.1.2 | GHSA-fph4-wmhf-6fwf | high | 4.1.3 | — | U: provenance gate |
| 10 | npm | fast-uri | 4.1.2 | GHSA-jqff-g426-hqxp | high | 4.1.3 | — | U: provenance gate |
| 11 | Go | github.com/jackc/pgx/v5 | 5.9.0 | GO-2026-5004 | moderate | 5.9.2 | — | U: provenance gate |
| 12 | Go | github.com/jackc/pgx/v5 | 5.9.0 | GHSA-j88v-2chj-qfwx | low | 5.9.2 | — | U: provenance gate |
| 13 | Go | golang.org/x/mod | 0.35.0 | GO-2026-6179 | moderate | 0.40.0 | — | U: provenance gate |
| 14 | Go | golang.org/x/mod | 0.35.0 | GO-2026-6180 | moderate | 0.40.0 | — | U: provenance gate |
| 15 | Go | golang.org/x/net | 0.54.0 | GO-2026-5025 | moderate | 0.55.0 | — | U: provenance gate |
| 16 | Go | golang.org/x/net | 0.54.0 | GO-2026-5026 | moderate | 0.55.0 | — | U: provenance gate |
| 17 | Go | golang.org/x/net | 0.54.0 | GO-2026-5027 | moderate | 0.55.0 | — | U: provenance gate |
| 18 | Go | golang.org/x/net | 0.54.0 | GO-2026-5028 | moderate | 0.55.0 | — | U: provenance gate |
| 19 | Go | golang.org/x/net | 0.54.0 | GO-2026-5029 | moderate | 0.55.0 | — | U: provenance gate |
| 20 | Go | golang.org/x/net | 0.54.0 | GO-2026-5030 | moderate | 0.55.0 | — | U: provenance gate |
| 21 | Go | golang.org/x/net | 0.54.0 | GO-2026-5942 | moderate | 0.56.0 | — | U: provenance gate |
| 22 | Go | golang.org/x/net | 0.54.0 | GHSA-5cv4-jp36-h3mw | moderate | 0.55.0 | — | U: provenance gate |
| 23 | Go | golang.org/x/text | 0.37.0 | GO-2026-5970 | moderate | 0.39.0 | — | U: provenance gate |
| 24 | Go | stdlib | 1.25.0 | GO-2025-3955 | moderate | 1.25.1 | — | U: provenance gate |
| 25 | Go | stdlib | 1.25.0 | GO-2025-4006 | moderate | 1.25.2 | — | U: provenance gate |
| 26 | Go | stdlib | 1.25.0 | GO-2025-4007 | moderate | 1.25.3 | — | U: provenance gate |
| 27 | Go | stdlib | 1.25.0 | GO-2025-4008 | moderate | 1.25.2 | — | U: provenance gate |
| 28 | Go | stdlib | 1.25.0 | GO-2025-4009 | moderate | 1.25.2 | — | U: provenance gate |
| 29 | Go | stdlib | 1.25.0 | GO-2025-4010 | moderate | 1.25.2 | — | U: provenance gate |
| 30 | Go | stdlib | 1.25.0 | GO-2025-4011 | moderate | 1.25.2 | — | U: provenance gate |
| 31 | Go | stdlib | 1.25.0 | GO-2025-4012 | moderate | 1.25.2 | — | U: provenance gate |
| 32 | Go | stdlib | 1.25.0 | GO-2025-4013 | moderate | 1.25.2 | — | U: provenance gate |
| 33 | Go | stdlib | 1.25.0 | GO-2025-4014 | moderate | 1.25.2 | — | U: provenance gate |
| 34 | Go | stdlib | 1.25.0 | GO-2025-4015 | moderate | 1.25.2 | — | U: provenance gate |
| 35 | Go | stdlib | 1.25.0 | GO-2025-4155 | moderate | 1.25.5 | — | U: provenance gate |
| 36 | Go | stdlib | 1.25.0 | GO-2025-4175 | moderate | 1.25.5 | — | U: provenance gate |
| 37 | Go | stdlib | 1.25.0 | GO-2026-4337 | moderate | 1.25.7 | — | U: provenance gate |
| 38 | Go | stdlib | 1.25.0 | GO-2026-4340 | moderate | 1.25.6 | — | U: provenance gate |
| 39 | Go | stdlib | 1.25.0 | GO-2026-4341 | moderate | 1.25.6 | — | U: provenance gate |
| 40 | Go | stdlib | 1.25.0 | GO-2026-4342 | moderate | 1.25.6 | — | U: provenance gate |
| 41 | Go | stdlib | 1.25.0 | GO-2026-4601 | moderate | 1.25.8 | — | U: provenance gate |
| 42 | Go | stdlib | 1.25.0 | GO-2026-4602 | moderate | 1.25.8 | — | U: provenance gate |
| 43 | Go | stdlib | 1.25.0 | GO-2026-4603 | moderate | 1.25.8 | — | U: provenance gate |
| 44 | Go | stdlib | 1.25.0 | GO-2026-4864 | moderate | 1.25.9 | — | U: provenance gate |
| 45 | Go | stdlib | 1.25.0 | GO-2026-4865 | moderate | 1.25.9 | — | U: provenance gate |
| 46 | Go | stdlib | 1.25.0 | GO-2026-4869 | moderate | 1.25.9 | — | U: provenance gate |
| 47 | Go | stdlib | 1.25.0 | GO-2026-4870 | moderate | 1.25.9 | — | U: provenance gate |
| 48 | Go | stdlib | 1.25.0 | GO-2026-4918 | moderate | 1.25.10 | — | U: provenance gate |
| 49 | Go | stdlib | 1.25.0 | GO-2026-4946 | moderate | 1.25.9 | — | U: provenance gate |
| 50 | Go | stdlib | 1.25.0 | GO-2026-4947 | moderate | 1.25.9 | — | U: provenance gate |
| 51 | Go | stdlib | 1.25.0 | GO-2026-4970 | moderate | 1.25.12 | — | U: provenance gate |
| 52 | Go | stdlib | 1.25.0 | GO-2026-4971 | moderate | 1.25.10 | — | U: provenance gate |
| 53 | Go | stdlib | 1.25.0 | GO-2026-4976 | moderate | 1.25.10 | — | U: provenance gate |
| 54 | Go | stdlib | 1.25.0 | GO-2026-4977 | moderate | 1.25.10 | — | U: provenance gate |
| 55 | Go | stdlib | 1.25.0 | GO-2026-4980 | moderate | 1.25.10 | — | U: provenance gate |
| 56 | Go | stdlib | 1.25.0 | GO-2026-4981 | moderate | 1.25.10 | — | U: provenance gate |
| 57 | Go | stdlib | 1.25.0 | GO-2026-4982 | moderate | 1.25.10 | — | U: provenance gate |
| 58 | Go | stdlib | 1.25.0 | GO-2026-4986 | moderate | 1.25.10 | — | U: provenance gate |
| 59 | Go | stdlib | 1.25.0 | GO-2026-5026 | moderate | 1.25.13 | — | U: provenance gate |
| 60 | Go | stdlib | 1.25.0 | GO-2026-5037 | moderate | 1.25.11 | — | U: provenance gate |
| 61 | Go | stdlib | 1.25.0 | GO-2026-5038 | moderate | 1.25.11 | — | U: provenance gate |
| 62 | Go | stdlib | 1.25.0 | GO-2026-5039 | moderate | 1.25.11 | — | U: provenance gate |
| 63 | Go | stdlib | 1.25.0 | GO-2026-5856 | moderate | 1.25.12 | — | U: provenance gate |
| 64 | Go | stdlib | 1.25.0 | GO-2026-5972 | moderate | 1.25.13 | — | U: provenance gate |
| 65 | Go | stdlib | 1.25.0 | GO-2026-6088 | moderate | 1.25.13 | — | U: provenance gate |
| 66 | Go | stdlib | 1.25.0 | GO-2026-6089 | moderate | 1.25.13 | — | U: provenance gate |
| 67 | Go | stdlib | 1.25.0 | GO-2026-6090 | moderate | 1.25.13 | — | U: provenance gate |
| 68 | Go | stdlib | 1.25.0 | GO-2026-6091 | moderate | 1.25.13 | — | U: provenance gate |
| 69 | Go | stdlib | 1.25.0 | GO-2026-6218 | moderate | 1.25.13 | — | U: provenance gate |
| 70 | PyPI | anyio | 4.13.0 | GHSA-5p39-cfhj-2xmp | moderate | 4.14.2 | — | U: provenance gate |
| 71 | PyPI | anyio | 4.13.0 | GHSA-82r6-8w77-94w6 | critical | 4.14.2 | — | U: provenance gate |
| 72 | PyPI | setuptools | 81.0.0 | PYSEC-2026-3447 | moderate | 83.0.0 | — | U: provenance gate |
| 73 | PyPI | setuptools | 81.0.0 | GHSA-h35f-9h28-mq5c | moderate | 83.0.0 | — | U: provenance gate |
| 74 | PyPI | torch | 2.12.1 | GHSA-rrmf-rvhw-rf47 | moderate | 2.13.0 | — | U: provenance gate |
| 75 | npm | baseline-browser-mapping | 2.10.0 | GHSA-w5vr-8v7q-w6rv | moderate | 2.11.0 | — | U: provenance gate |
| 76 | npm | brace-expansion | 2.1.1 | GHSA-3jxr-9vmj-r5cp | moderate | 2.1.2 | — | U: provenance gate |
| 77 | npm | brace-expansion | 2.1.1 | GHSA-mh99-v99m-4gvg | high | 2.1.3 | — | U: provenance gate |
| 78 | npm | brace-expansion | 2.1.1 | GHSA-rgw5-rvv9-x895 | high | 2.1.4 | — | U: provenance gate |
| 79 | npm | browserslist | 4.28.1 | GHSA-73wf-gq98-2v4g | high | 4.28.7 | — | U: provenance gate |
| 80 | npm | browserslist | 4.28.1 | GHSA-c83g-rgw3-j3cx | high | 4.28.7 | — | U: provenance gate |
| 81 | npm | extract-zip | 2.0.1 | GHSA-7pqw-9j4j-h8q3 | high | unavailable / not supplied | — | U: provenance gate |
| 82 | npm | extract-zip | 2.0.1 | GHSA-jmr9-qjv8-65gv | high | unavailable / not supplied | — | U: provenance gate |
| 83 | npm | fast-uri | 3.1.3 | GHSA-5jgf-p345-68v8 | high | 3.1.6 | — | U: provenance gate |
| 84 | npm | fast-uri | 3.1.3 | GHSA-7p8r-x3mc-p8w7 | high | 3.1.5 | — | U: provenance gate |
| 85 | npm | fast-uri | 3.1.3 | GHSA-f65p-4m7j-42xc | high | 3.1.6 | — | U: provenance gate |
| 86 | npm | fast-uri | 3.1.3 | GHSA-fph4-wmhf-6fwf | high | 3.1.6 | — | U: provenance gate |
| 87 | npm | fast-uri | 3.1.3 | GHSA-jqff-g426-hqxp | high | 3.1.6 | — | U: provenance gate |
| 88 | npm | fast-uri | 3.1.3 | GHSA-v2hh-gcrm-f6hx | high | 3.1.4 | — | U: provenance gate |
| 89 | npm | js-yaml | 4.3.0 | GHSA-2883-xcg3-v3hh | high | 4.3.2 | — | U: provenance gate |
| 90 | npm | js-yaml | 4.3.0 | GHSA-5p4m-2wfm-xmqj | high | 4.3.1 | — | U: provenance gate |
| 91 | npm | nanoid | 3.3.15 | GHSA-28wg-ghj8-5hjv | moderate | 3.3.16 | — | U: provenance gate |
| 92 | npm | nanoid | 3.3.15 | GHSA-2v37-7h3g-55p8 | moderate | 3.3.18 | — | U: provenance gate |
| 93 | npm | postcss | 8.5.16 | GHSA-fxqj-rqcc-2cmp | moderate | 8.5.23 | — | U: provenance gate |
| 94 | npm | postcss | 8.5.16 | GHSA-r28c-9q8g-f849 | high | 8.5.18 | — | U: provenance gate |
| 95 | npm | qs | 6.15.3 | GHSA-4mjr-xmp4-gh2g | moderate | 6.16.0 | — | R: node_modules/qs |
| 96 | npm | qs | 6.15.3 | GHSA-x5fp-wj9c-mxmx | low | 6.16.0 | — | R: node_modules/qs |
| 97 | PyPI | anyio | 4.12.1 | GHSA-5p39-cfhj-2xmp | moderate | 4.14.2 | — | U: provenance gate |
| 98 | PyPI | anyio | 4.12.1 | GHSA-82r6-8w77-94w6 | critical | 4.14.2 | — | U: provenance gate |
| 99 | PyPI | click | 8.3.1 | PYSEC-2026-2132 | high | 8.3.3 | — | U: provenance gate |
| 100 | PyPI | setuptools | 81.0.0 | PYSEC-2026-3447 | moderate | 83.0.0 | — | U: provenance gate |
| 101 | PyPI | setuptools | 81.0.0 | GHSA-h35f-9h28-mq5c | moderate | 83.0.0 | — | U: provenance gate |
| 102 | PyPI | setuptools | 82.0.1 | PYSEC-2026-3447 | moderate | 83.0.0 | — | U: provenance gate |
| 103 | PyPI | setuptools | 82.0.1 | GHSA-h35f-9h28-mq5c | moderate | 83.0.0 | — | U: provenance gate |
| 104 | PyPI | torch | 2.12.1 | GHSA-rrmf-rvhw-rf47 | moderate | 2.13.0 | — | U: provenance gate |
| 105 | npm | @babel/core | 7.29.0 | GHSA-4x5r-pxfx-6jf8 | low | 7.29.6 | — | U: provenance gate |
| 106 | npm | baseline-browser-mapping | 2.10.0 | GHSA-w5vr-8v7q-w6rv | moderate | 2.11.0 | — | U: provenance gate |
| 107 | npm | browserslist | 4.28.1 | GHSA-73wf-gq98-2v4g | high | 4.28.7 | — | U: provenance gate |
| 108 | npm | browserslist | 4.28.1 | GHSA-c83g-rgw3-j3cx | high | 4.28.7 | — | U: provenance gate |
| 109 | npm | esbuild | 0.27.3 | GHSA-g7r4-m6w7-qqqr | low | 0.28.1 | — | U: provenance gate |
| 110 | npm | fast-uri | 3.1.0 | GHSA-4c8g-83qw-93j6 | high | 3.1.3 | — | U: provenance gate |
| 111 | npm | fast-uri | 3.1.0 | GHSA-7p8r-x3mc-p8w7 | high | 3.1.5 | — | U: provenance gate |
| 112 | npm | fast-uri | 3.1.0 | GHSA-f65p-4m7j-42xc | high | 3.1.6 | — | U: provenance gate |
| 113 | npm | fast-uri | 3.1.0 | GHSA-jqff-g426-hqxp | high | 3.1.6 | — | U: provenance gate |
| 114 | npm | fast-uri | 3.1.0 | GHSA-q3j6-qgpj-74h6 | high | 3.1.1 | — | U: provenance gate |
| 115 | npm | fast-uri | 3.1.0 | GHSA-v2hh-gcrm-f6hx | high | 3.1.4 | — | U: provenance gate |
| 116 | npm | fast-uri | 3.1.0 | GHSA-v39h-62p7-jpjc | high | 3.1.2 | — | U: provenance gate |
| 117 | npm | multer | 2.2.0 | GHSA-535w-7cp7-47q4 | high | 2.3.0 | — | R: node_modules/multer |
| 118 | npm | multer | 2.2.0 | GHSA-qfvm-cv95-jqjf | high | 2.3.0 | — | R: node_modules/multer |
| 119 | npm | multer | 2.2.0 | GHSA-qvfw-j98x-7q72 | low | 2.3.0 | — | R: node_modules/multer |
| 120 | npm | multer | 2.2.0 | GHSA-wc9g-mqfw-jrwm | high | 2.3.0 | — | R: node_modules/multer |
| 121 | npm | nanoid | 3.3.11 | GHSA-28wg-ghj8-5hjv | moderate | 3.3.16 | — | U: provenance gate |
| 122 | npm | nanoid | 3.3.11 | GHSA-2v37-7h3g-55p8 | moderate | 3.3.18 | — | U: provenance gate |
| 123 | npm | nanoid | 3.3.11 | GHSA-xwg4-73v4-xw9w | high | 3.3.12 | — | U: provenance gate |
| 124 | npm | postcss | 8.5.8 | GHSA-6g55-p6wh-862q | high | 8.5.12 | — | U: provenance gate |
| 125 | npm | postcss | 8.5.8 | GHSA-fxqj-rqcc-2cmp | moderate | 8.5.23 | — | U: provenance gate |
| 126 | npm | postcss | 8.5.8 | GHSA-qx2v-qp2m-jg93 | moderate | 8.5.10 | — | U: provenance gate |
| 127 | npm | postcss | 8.5.8 | GHSA-r28c-9q8g-f849 | high | 8.5.18 | — | U: provenance gate |
| 128 | npm | qs | 6.15.3 | GHSA-4mjr-xmp4-gh2g | moderate | 6.16.0 | — | R: node_modules/qs |
| 129 | npm | qs | 6.15.3 | GHSA-x5fp-wj9c-mxmx | low | 6.16.0 | — | R: node_modules/qs |
| 130 | npm | @xmldom/xmldom | 0.9.11 | GHSA-27p8-2357-5qqv | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 131 | npm | @xmldom/xmldom | 0.9.11 | GHSA-3px3-54cx-rmw9 | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 132 | npm | @xmldom/xmldom | 0.9.11 | GHSA-6gmq-8vp8-gcm6 | moderate | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 133 | npm | @xmldom/xmldom | 0.9.11 | GHSA-6h8r-xr42-gp59 | moderate | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 134 | npm | @xmldom/xmldom | 0.9.11 | GHSA-6mj3-qw4j-hgrw | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 135 | npm | @xmldom/xmldom | 0.9.11 | GHSA-8344-3jmq-59r6 | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 136 | npm | @xmldom/xmldom | 0.9.11 | GHSA-93r5-fhx6-vmg9 | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 137 | npm | @xmldom/xmldom | 0.9.11 | GHSA-965w-775f-mr7g | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 138 | npm | @xmldom/xmldom | 0.9.11 | GHSA-c7q8-3ch8-vqpv | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 139 | npm | @xmldom/xmldom | 0.9.11 | GHSA-jxjr-3g7g-3944 | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 140 | npm | @xmldom/xmldom | 0.9.11 | GHSA-vr34-hp96-76pp | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 141 | npm | csv-parse | 6.2.1 | GHSA-8cw4-87c7-c6xx | moderate | 7.0.2 | — | R: node_modules/csv-parse |
| 142 | npm | fast-uri | 3.1.5 | GHSA-5jgf-p345-68v8 | high | 3.1.6 | — | R: node_modules/fast-uri |
| 143 | npm | fast-uri | 3.1.5 | GHSA-f65p-4m7j-42xc | high | 3.1.6 | — | R: node_modules/fast-uri |
| 144 | npm | fast-uri | 3.1.5 | GHSA-fph4-wmhf-6fwf | high | 3.1.6 | — | R: node_modules/fast-uri |
| 145 | npm | fast-uri | 3.1.5 | GHSA-jqff-g426-hqxp | high | 3.1.6 | — | R: node_modules/fast-uri |
| 146 | npm | js-yaml | 4.3.1 | GHSA-2883-xcg3-v3hh | high | 4.3.2 | — | R: node_modules/js-yaml |
| 147 | npm | multer | 2.2.0 | GHSA-535w-7cp7-47q4 | high | 2.3.0 | — | R: node_modules/multer |
| 148 | npm | multer | 2.2.0 | GHSA-qfvm-cv95-jqjf | high | 2.3.0 | — | R: node_modules/multer |
| 149 | npm | multer | 2.2.0 | GHSA-qvfw-j98x-7q72 | low | 2.3.0 | — | R: node_modules/multer |
| 150 | npm | multer | 2.2.0 | GHSA-wc9g-mqfw-jrwm | high | 2.3.0 | — | R: node_modules/multer |
| 151 | npm | qs | 6.15.3 | GHSA-4mjr-xmp4-gh2g | moderate | 6.16.0 | — | R: node_modules/qs |
| 152 | npm | qs | 6.15.3 | GHSA-x5fp-wj9c-mxmx | low | 6.16.0 | — | R: node_modules/qs |
| 153 | npm | sharp | 0.35.3 | GHSA-rgj7-g3m4-5g8c | high | 0.35.4 | — | R: node_modules/sharp |
| 154 | npm | uuid | 7.0.3 | GHSA-w5hq-g745-h8pq | high | 11.1.1 | — | D: node_modules/xcode/node_modules/uuid |
| 155 | npm | @vitest/mocker | 4.1.10 | GHSA-82fw-gwwq-j7x9 | moderate | 4.1.11 | — | U: provenance gate |
| 156 | npm | @xmldom/xmldom | 0.9.10 | GHSA-27p8-2357-5qqv | high | 0.9.12 | — | U: provenance gate |
| 157 | npm | @xmldom/xmldom | 0.9.10 | GHSA-3px3-54cx-rmw9 | high | 0.9.12 | — | U: provenance gate |
| 158 | npm | @xmldom/xmldom | 0.9.10 | GHSA-4w3w-2rp5-g8jm | high | 0.9.11 | — | U: provenance gate |
| 159 | npm | @xmldom/xmldom | 0.9.10 | GHSA-6gmq-8vp8-gcm6 | moderate | 0.9.12 | — | U: provenance gate |
| 160 | npm | @xmldom/xmldom | 0.9.10 | GHSA-6h8r-xr42-gp59 | moderate | 0.9.12 | — | U: provenance gate |
| 161 | npm | @xmldom/xmldom | 0.9.10 | GHSA-6mj3-qw4j-hgrw | high | 0.9.12 | — | U: provenance gate |
| 162 | npm | @xmldom/xmldom | 0.9.10 | GHSA-8344-3jmq-59r6 | high | 0.9.12 | — | U: provenance gate |
| 163 | npm | @xmldom/xmldom | 0.9.10 | GHSA-93r5-fhx6-vmg9 | high | 0.9.12 | — | U: provenance gate |
| 164 | npm | @xmldom/xmldom | 0.9.10 | GHSA-965w-775f-mr7g | high | 0.9.12 | — | U: provenance gate |
| 165 | npm | @xmldom/xmldom | 0.9.10 | GHSA-c7q8-3ch8-vqpv | high | 0.9.12 | — | U: provenance gate |
| 166 | npm | @xmldom/xmldom | 0.9.10 | GHSA-g53g-w8rj-fmg7 | high | 0.9.11 | — | U: provenance gate |
| 167 | npm | @xmldom/xmldom | 0.9.10 | GHSA-vr34-hp96-76pp | high | 0.9.12 | — | U: provenance gate |
| 168 | npm | @xmldom/xmldom | 0.9.10 | GHSA-w2rr-34g9-rvrj | high | 0.9.11 | — | U: provenance gate |
| 169 | npm | csv-parse | 6.2.1 | GHSA-8cw4-87c7-c6xx | moderate | 7.0.2 | — | R: node_modules/csv-parse |
| 170 | npm | dompurify | 3.4.12 | GHSA-55q2-fjhq-7xh7 | moderate | 3.4.13 | — | U: provenance gate |
| 171 | npm | fast-uri | 3.1.5 | GHSA-5jgf-p345-68v8 | high | 3.1.6 | — | R: node_modules/fast-uri |
| 172 | npm | fast-uri | 3.1.5 | GHSA-f65p-4m7j-42xc | high | 3.1.6 | — | R: node_modules/fast-uri |
| 173 | npm | fast-uri | 3.1.5 | GHSA-fph4-wmhf-6fwf | high | 3.1.6 | — | R: node_modules/fast-uri |
| 174 | npm | fast-uri | 3.1.5 | GHSA-jqff-g426-hqxp | high | 3.1.6 | — | R: node_modules/fast-uri |
| 175 | npm | js-yaml | 4.3.0 | GHSA-2883-xcg3-v3hh | high | 4.3.2 | — | U: provenance gate |
| 176 | npm | js-yaml | 4.3.0 | GHSA-5p4m-2wfm-xmqj | high | 4.3.1 | — | U: provenance gate |
| 177 | npm | multer | 2.2.0 | GHSA-535w-7cp7-47q4 | high | 2.3.0 | — | R: node_modules/multer |
| 178 | npm | multer | 2.2.0 | GHSA-qfvm-cv95-jqjf | high | 2.3.0 | — | R: node_modules/multer |
| 179 | npm | multer | 2.2.0 | GHSA-qvfw-j98x-7q72 | low | 2.3.0 | — | R: node_modules/multer |
| 180 | npm | multer | 2.2.0 | GHSA-wc9g-mqfw-jrwm | high | 2.3.0 | — | R: node_modules/multer |
| 181 | npm | nanoid | 3.3.16 | GHSA-2v37-7h3g-55p8 | moderate | 3.3.18 | — | U: provenance gate |
| 182 | npm | qs | 6.15.3 | GHSA-4mjr-xmp4-gh2g | moderate | 6.16.0 | — | R: node_modules/qs |
| 183 | npm | qs | 6.15.3 | GHSA-x5fp-wj9c-mxmx | low | 6.16.0 | — | R: node_modules/qs |
| 184 | npm | sharp | 0.35.3 | GHSA-rgj7-g3m4-5g8c | high | 0.35.4 | — | R: node_modules/sharp |
| 185 | npm | tar | file:stubs/tar | GHSA-23hp-3jrh-7fpw | high | 7.5.19 | — | Local stub: SCAN-04 |
| 186 | npm | tar | file:stubs/tar | GHSA-34x7-hfp2-rc4v | high | 7.5.7 | — | Local stub: SCAN-04 |
| 187 | npm | tar | file:stubs/tar | GHSA-3jfq-g458-7qm9 | high | unavailable / not supplied | — | Local stub: SCAN-04 |
| 188 | npm | tar | file:stubs/tar | GHSA-5955-9wpr-37jh | high | unavailable / not supplied | — | Local stub: SCAN-04 |
| 189 | npm | tar | file:stubs/tar | GHSA-83g3-92jg-28cx | high | 7.5.8 | — | Local stub: SCAN-04 |
| 190 | npm | tar | file:stubs/tar | GHSA-8qq5-rm4j-mr97 | high | 7.5.3 | — | Local stub: SCAN-04 |
| 191 | npm | tar | file:stubs/tar | GHSA-8x88-c5mf-7j5w | high | 7.5.18 | — | Local stub: SCAN-04 |
| 192 | npm | tar | file:stubs/tar | GHSA-9ppj-qmqm-q256 | high | 7.5.11 | — | Local stub: SCAN-04 |
| 193 | npm | tar | file:stubs/tar | GHSA-f5x3-32g6-xq36 | moderate | 6.2.1 | — | Local stub: SCAN-04 |
| 194 | npm | tar | file:stubs/tar | GHSA-gfjr-3jmm-4g9v | high | 2.0.0 | — | Local stub: SCAN-04 |
| 195 | npm | tar | file:stubs/tar | GHSA-gvwx-54wh-qm9j | moderate | 7.5.17 | — | Local stub: SCAN-04 |
| 196 | npm | tar | file:stubs/tar | GHSA-j44m-qm6p-hp7m | high | unavailable / not supplied | — | Local stub: SCAN-04 |
| 197 | npm | tar | file:stubs/tar | GHSA-qffp-2rhf-9h96 | high | 7.5.10 | — | Local stub: SCAN-04 |
| 198 | npm | tar | file:stubs/tar | GHSA-r292-9mhp-454m | high | 7.5.21 | — | Local stub: SCAN-04 |
| 199 | npm | tar | file:stubs/tar | GHSA-r6q2-hw4h-h46w | high | 7.5.4 | — | Local stub: SCAN-04 |
| 200 | npm | tar | file:stubs/tar | GHSA-vmf3-w455-68vh | moderate | 7.5.16 | — | Local stub: SCAN-04 |
| 201 | npm | tar | file:stubs/tar | GHSA-w8wr-v893-vjvp | moderate | 7.5.18 | — | Local stub: SCAN-04 |
| 202 | npm | vitest | 4.1.10 | GHSA-82fw-gwwq-j7x9 | moderate | 4.1.11 | — | U: provenance gate |
| 203 | npm | esbuild | 0.27.7 | GHSA-g7r4-m6w7-qqqr | low | 0.28.1 | — | U: provenance gate |
| 204 | PyPI | anyio | 4.13.0 | GHSA-5p39-cfhj-2xmp | moderate | 4.14.2 | — | U: provenance gate |
| 205 | PyPI | anyio | 4.13.0 | GHSA-82r6-8w77-94w6 | critical | 4.14.2 | — | U: provenance gate |
| 206 | PyPI | click | 8.3.2 | PYSEC-2026-2132 | high | 8.3.3 | — | U: provenance gate |

## Full privacy disposition inventory — all 79 observations

All cited source ranges were compared with current source, not accepted from remediation prompts. No personal values or source payloads are reproduced. Scanner severity is retained for traceability, not endorsed. T = confirmed source-level personal-data emission / SCAN-03; F = scanner category false positive; G = narrower verification gate. A source emission alone does not establish legal noncompliance. All T rows are instances of one minimization/schema root and use the SCAN-03 alternatives. Non-web operational scripts have their own execution/retention scope.

| # | Scanner severity | Current source citation | Disposition and consumer detail |
|---|---|---|---|
| 1 | MEDIUM | server/middleware/errorHandler.ts:253-262 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 2 | LOW | server/routes/socialOAuth.ts:1090-1097 | T: Username emitted to application log; central redaction does not cover the cited field/message. |
| 3 | LOW | server/routes/admin.ts:267-267 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 4 | LOW | server/services/statusPageService.ts:442-444 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 5 | CRITICAL | server/routes/socialOAuth.ts:559-566 | F: Token-presence booleans and expiry only; no token material. OAuth callback. |
| 6 | MEDIUM | server/middleware/rateLimiter.ts:454-454 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 7 | LOW | server/routes/support.ts:184-184 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 8 | LOW | server/routes/support.ts:264-264 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 9 | MEDIUM | server/services/dnsServer.ts:606-608 | F for personal-IP allegation: authoritative server address announcement; infrastructure metadata. |
| 10 | LOW | server/services/accountDeletionService.ts:103-105 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 11 | MEDIUM | server/routes/selfHealingApi.ts:260-260 | T: Email and IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 12 | LOW | server/services/socialSyncService.ts:462-464 | T: Username emitted to application log; central redaction does not cover the cited field/message. |
| 13 | LOW | server/services/accountDeletionService.ts:230-236 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 14 | LOW | server/routes/admin.ts:670-670 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 15 | LOW | server/routes/admin.ts:751-753 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 16 | LOW | server/services/advertisingDispatchService.ts:946-948 | G: Advertising monetary budget is business/campaign telemetry, not intrinsically personal data; purpose and linkage need review under SCAN-03. |
| 17 | LOW | server/routes/admin.ts:695-697 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 18 | LOW | server/routes/support.ts:334-335 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 19 | MEDIUM | server/middleware/requestValidation.ts:162-166 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 20 | MEDIUM | server/security-system.ts:940-940 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 21 | CRITICAL | server/routes/socialOAuth.ts:646-654 | F for alleged token leak; G under SCAN-03 for unconstrained provider error value. Status/ok/presence boolean do not expose tokens. |
| 22 | LOW | server/routes.ts:2439-2439 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 23 | MEDIUM | server/routes/notifications.ts:531-533 | T: SMS recipient prefix (partial phone data), sender and user ID; not a full phone number. |
| 24 | LOW | server/services/accountDeletionService.ts:149-151 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 25 | MEDIUM | vps-dns-proxy/dns-proxy-node.js:212-212 | F: TCP listener bind address, not visitor/client IP. |
| 26 | LOW | server/services/beatMoneyLoopService.ts:202-204 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 27 | LOW | server/services/musicCodes.ts:403-403 | F for street/address category: registrant code and user ID, no postal address; linked identifier still requires retention review. |
| 28 | MEDIUM | server/middleware/rateLimiter.ts:485-487 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 29 | LOW | server/routes/paymentBypass.ts:83-85 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 30 | MEDIUM | server/middleware/rateLimiter.ts:381-381 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 31 | LOW | server/services/statusPageService.ts:470-470 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 32 | LOW | tools/vgpu_scheduler/demo.py:117-119 | F: Scheduler demonstration round budget/backlog, not financial budget or personal-data leak; nonproduction demo scope. |
| 33 | LOW | server/services/accountDeletionService.ts:173-178 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 34 | LOW | server/routes/selfHealingApi.ts:273-273 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 35 | MEDIUM | server/middleware/rateLimiter.ts:419-419 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 36 | LOW | server/services/statusPageService.ts:644-647 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 37 | LOW | server/routes/admin.ts:1142-1144 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 38 | LOW | server/routes/paymentBypass.ts:59-61 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 39 | MEDIUM | server/middleware/globalRateLimiter.ts:213-213 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 40 | MEDIUM | server/services/selfHealingSecurityEngine.ts:1046-1046 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 41 | LOW | server/init-admin.ts:147-147 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 42 | LOW | server/routes/admin.ts:717-719 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 43 | LOW | server/services/weeklyInsightsService.ts:349-352 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 44 | LOW | server/services/beatMoneyLoopService.ts:196-198 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 45 | LOW | server/services/emailService.ts:412-412 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 46 | MEDIUM | server/services/dnsServer.ts:609-611 | F: Nameserver/server-address announcement, infrastructure metadata. |
| 47 | LOW | server/routes/admin.ts:382-382 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 48 | LOW | server/routes/paymentBypass.ts:113-115 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 49 | LOW | server/services/notificationService.ts:175-175 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 50 | MEDIUM | server/middleware/csrf.ts:38-41 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 51 | LOW | server/routes/support.ts:221-223 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 52 | LOW | server/routes/support.ts:384-384 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 53 | LOW | server/services/weeklyInsightsService.ts:315-315 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 54 | MEDIUM | server/middleware/requestCorrelation.ts:95-106 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 55 | MEDIUM | server/middleware/scalableRateLimiter.ts:471-471 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 56 | MEDIUM | server/services/selfHealingSecurityEngine.ts:822-824 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 57 | LOW | server/routes/admin.ts:317-319 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 58 | LOW | server/scripts/setupAdmin.ts:680-680 | T: Administrative bootstrap CLI prints email; operational-tool scope, not a request handler. |
| 59 | MEDIUM | server/services/geoDns.ts:347-355 | T conditional: GeoDNS lookup IP in debug event; default info level suppresses emission, configured debug enables it. |
| 60 | MEDIUM | server/middleware/requestValidation.ts:140-143 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 61 | LOW | server/services/dunningService.ts:269-271 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 62 | LOW | server/routes/admin.ts:358-358 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 63 | LOW | server/routes/export.ts:1615-1615 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 64 | LOW | server/routes.ts:2423-2423 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 65 | LOW | server/init-admin.ts:78-78 | T: Existing-admin bootstrap diagnostic email; initialization scope. |
| 66 | MEDIUM | server/middleware/csrf.ts:49-52 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 67 | LOW | server/routes.ts:574-574 | F for email allegation: current login event logs user ID only. Pseudonymous ID retention remains a policy matter, not the alleged email leak. |
| 68 | MEDIUM | server/middleware/csrf.ts:61-64 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 69 | MEDIUM | server/services/selfHealingSecurityEngine.ts:1048-1048 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 70 | MEDIUM | vps-dns-proxy/dns-proxy-node.js:208-208 | F: UDP listener bind address, not client IP. |
| 71 | MEDIUM | server/security-system.ts:966-966 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 72 | MEDIUM | server/security-system.ts:1100-1102 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 73 | MEDIUM | server/middleware/rateLimiter.ts:313-313 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 74 | LOW | server/services/distributionService.ts:1632-1632 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 75 | LOW | server/routes/admin.ts:405-407 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 76 | MEDIUM | server/services/selfHealingSecurityEngine.ts:826-829 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 77 | LOW | server/services/statusPageService.ts:618-621 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 78 | LOW | server/scripts/setupAdmin.ts:56-56 | T: Administrative bootstrap CLI prints email; operational-tool scope. |
| 79 | MEDIUM | server/safety/inputValidation.ts:273-273 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |

## Examined-surface inventory and unexamined boundaries

Examined: the three newly supplied scanner JSON reports; all 79 current privacy source ranges across routes, middleware, services, bootstrap scripts, DNS proxy and scheduler demo; server/logger.ts; root package manifest and exact matching root npm lock records; tracked manifest/lock filename inventory including nested/vendor workspaces; selected AnyIO/click/torch/setuptools and Rust lock records; tar CommonJS/ESM implementations and override; source upload/image/CSV consumers; Dockerfile, Dockerfile.prod, .dockerignore and build.sh release-selection/install behavior; tracked dist file presence; current security/integrations report cross-references. Historical task proposals, cancelled tasks and memory were not used as defect proof.

Unexamined / not attested: complete advisory-publisher authenticity/version history; exploit reproduction; every transitive consumer or installed package implementation; the internals/effectiveness of build-time security patches; final image/container/desktop/mobile/SBOM contents; actual process environments, Go binary provenance and nested dev/cache installations; CI scanner failure cause/rules/full language coverage; live log sinks, retention, access control and legal basis; provider OAuth responses beyond source schema; live DB/provider state; secrets and deployment configuration values. No app startup, tests, package installation, migrations, build/config edits or live queries were performed. A screenshot is not pertinent to this read-only scanner report and would not close these release gates.

Acceptance requires the selected playbooks' evidence on the exact release candidate. This report does not assert production is clean, that every scanner advisory is reachable, or that an absent root-lock match is harmless.
