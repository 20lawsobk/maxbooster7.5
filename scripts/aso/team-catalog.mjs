/**
 * Max Booster whole-repository senior engineering team. Each role owns explicit
 * evidence-producing tasks, not a roleplay label. The plan generator materializes
 * these contracts for EVERY tracked Git path and every admin product journey.
 */
export const TEAM = Object.freeze([
  {id:"product-director", title:"Senior Product Director", work:[
    "Determine the real administrator personas, privileges, top-level workflows, entry points, expected outputs and business invariants.",
    "Create an unambiguous requirement and acceptance checklist for each function, form, button, job, route and operator decision.",
    "Classify tasks as administrator-critical, deferred-public-only, or blocked on an external provider; never classify a missing admin feature as optional.",
    "Reconcile requirements with user-visible behavior, existing contracts and observed failures; reject invented or descriptive-only successes.",
    "Review resulting acceptance evidence, mark unmet requirements as open and prioritize by operational impact."
  ], acceptance:"Every admin workflow has an owner, explicit success/error contract and actual evidence."},
  {id:"engineering-manager",title:"Senior Engineering Manager",work:[
    "Split each requirement into small file-specific engineering tasks and record dependencies, affected services and risk.",
    "Assign each task one accountable owner and separate quality/security reviewers; avoid overlapping writes and coordinate critical integration points.",
    "Sequence work to unblock admin login, boot, core studio and integrations before public-only work.",
    "Track blocked jobs, retry limits, time budgets, code-review status, test receipts and rollback plans.",
    "Escalate uncertainty, insufficient permissions, repeated failure or conflicting changes; never falsely close a job."
  ],acceptance:"No missing/unowned tracked files or admin-journey requirements in the work register."},
  {id:"principal-architect",title:"Principal Systems Architect",work:[
    "Identify this file's bounded context, imports/exports, callees, environment requirements and downstream consumers.",
    "Trace frontend-to-API-to-worker-to-database and vendor call chains, including failure and restart behavior.",
    "Specify data, security, latency, ownership and error-handling invariants; review whether boundaries are implementable.",
    "Compare current implementation to the desired contract; design minimal, reversible root-cause fixes with migration compatibility.",
    "Independently review changed contracts and dependent services; prove no hidden dev-only or fail-open production assumptions."
  ],acceptance:"Architecture and contracts are consistent across all touched boundaries."},
  {id:"ux-product-designer",title:"Senior UX/Product Designer",work:[
    "Enumerate every user action and visible state on this workflow or screen, including empty, loading, failed and completed states.",
    "Map administrator navigation paths and observe where user intent cannot be completed or controls are misleading.",
    "Specify responsive behaviors across phone, tablet and desktop, keyboard flow, error messages and retry/undo behavior.",
    "Check design against implementation without hiding unavailable operations behind fake success.",
    "Capture manual or browser evidence of the real administrator journey; hand usability findings to frontend engineering."
  ],acceptance:"Admin can understand, reach and complete the workflow on supported screens."},
  {id:"frontend-engineer",title:"Senior Frontend Engineer",work:[
    "Inspect page/component tree, routing, dependency imports, state and live API contracts.",
    "Specify interactions, input validation, form semantics, loading/empty/error/offline and cancellation behavior.",
    "Implement the smallest safe fix in real components and client data/state code, preserving existing supported features.",
    "Exercise authenticated administrator happy-path and rejected/timeout/stale responses at component and browser level.",
    "Verify lint, client typecheck, accessibility, mobile responsiveness and real API integration; record actual outcomes."
  ],acceptance:"Administrator interactions render real state and dispatch valid authorized requests."},
  {id:"backend-engineer",title:"Senior Backend/API Engineer",work:[
    "Inspect handlers, auth middleware order, user/tenant scoping, validation, rate limits, worker queues and service calls.",
    "Define request/response schemas, idempotency keys, transactional boundaries, timeouts, errors and retries.",
    "Implement actual durable operations with no pretend/silent success, no unsafe fallback and explicit upstream failures.",
    "Test legitimate administrator actions, unauthenticated denials, non-admin denials, malformed inputs and concurrent requests.",
    "Verify server typecheck, integration tests, events, logs and restart/retry correctness; document incompatible clients."
  ],acceptance:"API effects are durable, authorized, observable and contractually correct."},
  {id:"database-engineer",title:"Senior Database/Reliability Engineer",work:[
    "Trace all table and index references, foreign keys, migrations and how this file affects persistent state.",
    "Check default values, integrity constraints, tenancy keys, schema version, locks, idempotency, query planning and backups.",
    "Design forward/rollback migrations and test against disposable PostgreSQL/PDIM fixtures, not live customer data.",
    "Reproduce consistency and concurrency failures; prove exact before/after rows, journal invariants and read-after-write.",
    "Verify data recovery, rollback, migration provenance and no destructive production mutations."
  ],acceptance:"No missing/ambiguous schema or destructive and unverified data change."},
  {id:"security-engineer",title:"Senior Application Security Engineer",work:[
    "Threat-model access, sessions, MFA, admin recovery, CSRF, rate limits, injection and secret handling along this path.",
    "Test non-admin, anonymous and forged requests, race conditions, SSRF/path traversal, prompt/tool injection and cross-tenant leakage as applicable.",
    "Propose least-privilege and fail-closed mitigations; do not weaken permissions or create bypass accounts.",
    "Use safe isolated test fixtures; review all identity, billing, infrastructure and AI-agent changes before promotion.",
    "Re-test exploit reproductions and credential redaction, document residual risk and require explicit sign-off for high-impact changes."
  ],acceptance:"Admin-only access boundaries and sensitive operations fail closed with negative tests."},
  {id:"qa-engineer",title:"Senior Test Automation Engineer",work:[
    "Extract success and failure requirements from this file's actual interfaces and its linked feature register.",
    "Create deterministic unit tests with boundary inputs and isolated integration fixtures; prohibit fake pass signals.",
    "Exercise actual administrator E2E workflows using real browser/API/store behavior in disposable environments.",
    "Run regression, property/fuzz, retry, load and crash-recovery cases according to the file's risk.",
    "Verify current-commit freshness, artifact identity, zero unreviewed failures/skips and preserved behavior after each fix."
  ],acceptance:"Fresh tests demonstrate desired effects and reject incorrect ones."},
  {id:"adversarial-engineer",title:"Senior Failure & Bug Hunter",work:[
    "Inventory assumptions, unknown states, trust boundaries and exceptional paths for this file or operation.",
    "Inject malformed, missing, duplicate, concurrent, oversized, delayed and stale inputs in a controlled sandbox.",
    "Record a minimal reproducible failing case, expected behavior, actual error, root cause and affected dependencies.",
    "Challenge proposed fixes with counterexamples and check that they neither hide failures nor trade one bug for another.",
    "Attach independent replay evidence; elevate persistent or unknown cases to the specialist best positioned to fix them."
  ],acceptance:"Adversarial tests expose or exclude the named failure mode with evidence."},
  {id:"performance-engineer",title:"Senior Performance/Capacity Engineer",work:[
    "Record baseline latency, CPU, memory, allocations, bundle size, I/O and dependency bottlenecks for the path.",
    "Identify expensive algorithms, N+1 queries, serialization, transfers, cold starts and contention points.",
    "Define one-admin realistic resource budgets, plus safe overload boundaries and future growth concerns.",
    "Benchmark before/after under isolated repeatable loads; confirm no new correctness or security regressions.",
    "Prioritize changes by measured performance per unit of engineering cost, not synthetic scores."
  ],acceptance:"Representative administrator workflows meet measured budgets without runaway resources."},
  {id:"sre-devops-engineer",title:"Senior SRE/DevOps Engineer",work:[
    "Trace real npm/build/start and Replit publishing entrypoints, scripts, artifacts and configuration for each subsystem.",
    "Verify health and readiness reflect true dependency state and missing integrations cannot be mistaken for green.",
    "Provision and test isolated QA/staging fixtures; protect deployment secrets, persistent storage and application database boundaries.",
    "Run clean install, reproducible build, cold start, controlled shutdown, restart and rollback drills with bounded timeouts.",
    "Document alerts and runbooks, and require operator approval for live promotion, migration, credential or provider changes."
  ],acceptance:"Production-equivalent isolated runtime starts and recovers with truthful readiness."},
  {id:"observability-engineer",title:"Senior Observability/Incident Engineer",work:[
    "Trace real request/job IDs, errors, audit logs, queue health and storage/model/provider readiness.",
    "Instrument non-sensitive metrics, structured errors and action receipts for this workflow.",
    "Define alert thresholds for failed admin login, media operations, billing reconciliation, database faults and model outages.",
    "Exercise controlled incidents and verify alerts, diagnosis provenance and safe human-readable recovery action.",
    "Review ongoing failures and adjust escalation thresholds using measured false positives and incident outcomes."
  ],acceptance:"Failures are detectable, diagnosable and attributable without sensitive data leakage."},
  {id:"ai-ml-engineer",title:"Senior AI/ML Systems Engineer",work:[
    "Trace model selection, actual checkpoint artifacts, tokenizer/serving paths, budgets and external MaxCore/PDIM dependencies.",
    "Validate training provenance, quality measurements, model authorization and awareness freshness before AI promotion.",
    "Implement bounded inference/streaming with explicit unsupported-model errors, retry semantics and privacy controls.",
    "Test deterministic contracts, representative music-related outputs, poisoned prompts and degraded model availability.",
    "Reject unqualified, simulated, stale or nonsensical outputs regardless of superficial API success."
  ],acceptance:"Admin-visible AI work produces genuinely qualified outputs from verified models."},
  {id:"audio-dsp-engineer",title:"Senior Audio/DAW Engineer",work:[
    "Map track, clip, sample, effect, render and export format contracts and platform audio dependencies.",
    "Prove media inputs/outputs with actual bytes, format metadata, sample rates, channel maps and stem ownership.",
    "Test corrupt/oversized files, concurrent render/cancel, plugin failure, interrupted upload and state restoration.",
    "Implement deterministic, non-destructive fixes for DAW controls, generation, synchronization and exports.",
    "Validate playable media quality, duration, provenance and round-trip persistence under admin workflows."
  ],acceptance:"Admin can create, edit, render, export and recover real music projects."},
  {id:"integrations-engineer",title:"Senior Integration/Distribution Engineer",work:[
    "Trace each social, marketing, messaging and DSP integration's installed SDKs, credentials, callbacks and capabilities.",
    "Verify actual provider API contract, tenant ownership, consent, callbacks, retry/idempotency and error classifications.",
    "Exercise mocked and sandbox journeys; use real external action only with explicit scoped approval.",
    "Prevent false distribution/posting receipts, silent vendor fallback and insecure token storage.",
    "Collect provider-confirmed success/failed action evidence and operational recovery procedure."
  ],acceptance:"Admin-requested external actions have genuine provider receipts or explicit blockers."},
  {id:"billing-engineer",title:"Senior Billing/Revenue Engineer",work:[
    "Trace admin subscriptions, product catalogue, checkout, invoice, refund, royalty, commission and payout paths.",
    "Specify ledger invariants, provider-sourced facts, idempotent reconciliation and dispute/refund ordering.",
    "Test representative cases with disposable database and dedicated provider test mode; never manufacture money outcomes.",
    "Review race conditions, exact balances, tax/fee handling and record-level access permissions.",
    "Require explicit approval for real charges, refunds, payouts or production price changes."
  ],acceptance:"Admin revenue figures and billing side effects reconcile to real records with no unsafe writes."},
  {id:"accessibility-engineer",title:"Senior Accessibility Engineer",work:[
    "Inventory controls, semantic labels, keyboard focus, ARIA relationships and screen-reader descriptions.",
    "Check 200% text, 400% zoom, motion preferences, contrast, mobile touch targets and validation errors.",
    "Reproduce inaccessible interaction and create tests against actual components and browser states.",
    "Review fixed workflows using keyboard and assistive technology where possible.",
    "Record actual WCAG-related evidence and explicit unsupported or manual-test gaps."
  ],acceptance:"Every admin function is operable through accessible supported interactions."},
  {id:"release-engineer",title:"Senior Release/Change Manager",work:[
    "Bind every acceptance claim to exact commit SHA, test run, environment, artifact hash and operator identity.",
    "Reconcile all upstream task dependencies, approvals, migration readiness and production runbooks.",
    "Require complete independent administrator-only release evidence without silently inheriting public-launch assumptions.",
    "Inspect the deployment diff, reviewed rollback path, monitoring plan and immutable release decision.",
    "Keep deployment, merge and live provider actions behind separate scoped operator approval."
  ],acceptance:"Release recommendation is evidence-based, reviewable and never self-certified."},
  {id:"technical-writer",title:"Senior Documentation/Developer Experience Engineer",work:[
    "Map this file to its user workflows, API contract, environment requirements and error/recovery behavior.",
    "Update explicit setup, run, integration and operator documentation alongside implementation changes.",
    "Test instructions from a clean checkout and clearly distinguish examples from demonstrated execution.",
    "Record missing env/provider requirements without putting credentials in docs or logs.",
    "Verify that actual interfaces, support guidance and feature limitations match documentation."
  ],acceptance:"Admin and maintainers can reproduce supported tasks and interpret blockers correctly."},
  {id:"privacy-governance-engineer",title:"Senior Privacy/Governance Engineer",work:[
    "Identify PII, personal media, licensing rights, export/delete paths and data provenance in this workflow.",
    "Verify data minimization, retention, lawful authorization, privacy boundaries and vendor disclosure.",
    "Test that admin authority does not silently override third-party or customer rights.",
    "Review agent consent, action previews, revocation and audit receipts for consequential operations.",
    "Escalate unresolved legal, policy or compliance claims for actual expert review."
  ],acceptance:"Sensitive data, licenses and third-party actions have appropriate controls and honest evidence."}
]);

export const ROLE_BY_ID = Object.fromEntries(TEAM.map(role => [role.id, role]));

export const ADMIN_DOMAINS = Object.freeze([
  ["admin-access","Secure login, MFA, admin privilege, account recovery, closed registration"],
  ["artist-management","Artist profile, catalogue, collaborators, contracts and management"],
  ["fan-management","Fan insights, segmentation, messages and engagement"],
  ["project-management","Projects, assets, tasks, versions, collaborators and persistence"],
  ["daw-studio","Studio edit, recording, arrangement, effects, rendering and export"],
  ["content-distribution","Upload, metadata, approvals, DSP connection, publish and status receipts"],
  ["marketing-automation","Campaigns, social connections, scheduling, consent and analytics"],
  ["revenue-analytics","Ledger, sales, refunds, disputes, royalties and statements"],
  ["ai-assistant","Sophia, model qualification, inference, prompts and orchestration"],
  ["collaboration","Invitations, membership permissions, sharing and version conflicts"],
  ["marketplace","Listings, licences, checkout, fulfillment and storefront"],
  ["subscriptions","Admin entitlements, billing, invoices, plan and payment preferences"],
  ["administration","Governance, settings, roles, observability, integration and operations"],
  ["operational-recovery","Build/start, service health, backups, restores, incidents and rollback"]
]);

export const FILE_STAGES = Object.freeze([
  {key:"discover",title:"Discover behavior and ownership",instruction:"Read the COMPLETE relevant implementation, dependencies, callers, configuration and existing tests; document actual behavior rather than inferring from filename.",output:"actual dependency trace and capability inventory"},
  {key:"specify",title:"Specify success and failure invariants",instruction:"Translate the administrator use case into exact input/output, persistence, authorization, error handling and resource limits for this file.",output:"explicit acceptance contract and denial cases"},
  {key:"reproduce",title:"Reproduce defects and measure baseline",instruction:"Exercise real current behavior in isolated fixtures; capture minimal reproduction and exact command/runtime evidence without exposing credentials.",output:"fresh passing/failing baseline receipt"},
  {key:"root-cause",title:"Review root cause and dependency impacts",instruction:"Check neighboring modules and related contracts; decide smallest safe change, migration implications and rollback plan.",output:"reviewable change design and blast-radius list"},
  {key:"implement",title:"Implement verified behavior",instruction:"Apply the required real change in a separately reviewed worktree; do not fake success, weaken permissions, insert stubs or silently alter tests.",output:"diff linked to requirement and source revision"},
  {key:"negative-tests",title:"Validate adversarial and boundary behavior",instruction:"Test invalid inputs, unauthorized roles, timeouts, concurrent actions, retries, corrupted data and dependency failure as relevant.",output:"negative-case receipts and discovered defects"},
  {key:"integration-tests",title:"Verify actual affected system",instruction:"Run focused unit/integration/browser tests AND the relevant client/server/type/security guards; keep skipped or blocked tests explicit.",output:"current-commit test evidence and exact exit statuses"},
  {key:"independent-review",title:"Conduct independent senior review",instruction:"Obtain a separate reviewer for security, regressions, accessibility, maintainability and provider effects; reject unexplained changes.",output:"reviewed diff and addressed findings"},
  {key:"acceptance",title:"Prove administrator acceptance",instruction:"Exercise linked admin workflow in disposable or approved staging context; verify persisted outcome and honest failure reporting.",output:"admin-specific evidence tied to exact revision"},
  {key:"handoff",title:"Handoff and monitor",instruction:"Document release limitations, operational monitors, rollback, ownership and unresolved blockers; request approval where required.",output:"operator runbook and release gate disposition"}
]);

export function assignment(entry) {
  const file = entry.path.toLowerCase();
  const isCode = /\.(?:[cm]?js|tsx?|jsx|py|rs|go|sh|c|cc|cpp|h|java|sql|nix)$/i.test(file);
  const isAsset = /\.(?:png|jpe?g|webp|gif|svg|mp3|wav|mp4|pdf|onnx|pt|safetensors|bin)$/i.test(file);
  let owner="principal-architect";
  if (/^(tests?\/|evaluations\/)/.test(file)) owner="qa-engineer";
  else if (/\.(?:wav|mp3|flac|ogg|aiff|m4a)$/i.test(file)) owner="audio-dsp-engineer";
  else if (/\.(?:png|jpe?g|webp|gif|svg)$/i.test(file)) owner="ux-product-designer";
  else if (/\.(?:md|rst|pdf|txt)$/i.test(file)) owner="technical-writer";
  else if (/(payment|billing|royalt|stripe|invoice|payout|refund|disput)/.test(file)) owner="billing-engineer";
  else if (/(authorization|authentication|auth|session|mfa|csrf|secret|security|admin|governance|policy)/.test(file)) owner="security-engineer";
  else if (/(migration|database|drizzle|schema|postgres|pdim|redis|storage)/.test(file)) owner="database-engineer";
  else if (/(ai[-_/]|maxcore|model|inference|training|agents?|sophia|prompt)/.test(file)) owner="ai-ml-engineer";
  else if (/(audio|studio|daw|vst|render|stem|beat|track)/.test(file)) owner="audio-dsp-engineer";
  else if (/(distribution|dsp|provider|marketing|social|campaign|webhook|email)/.test(file)) owner="integrations-engineer";
  else if (/^(client\/|.*\.(tsx|jsx|css|scss|html)$)/.test(file)) owner="frontend-engineer";
  else if (/^(server\/|api\/)/.test(file)) owner="backend-engineer";
  else if (/^(\.github\/|\.replit|replit\.nix|docker|infra\/|k8s\/|terraform\/|build\.sh|start\.sh)/.test(file)) owner="sre-devops-engineer";
  else if (/^(scripts?\/|.*\.(sh|nix)$)/.test(file)) owner="technical-writer";
  else if (/^docs?\//.test(file)) owner="technical-writer";
  const reviewers = new Set(["principal-architect","qa-engineer"]);
  if (isCode) reviewers.add("security-engineer");
  if (/(user|auth|security|admin|payment|billing|secret|licen|privac)/.test(file)) reviewers.add("privacy-governance-engineer");
  if (/(client\/|page|component|css|html)/.test(file)) reviewers.add("accessibility-engineer");
  if (/^(scripts?\/|\.github\/|docker|infra\/|external\/)/.test(file)) reviewers.add("sre-devops-engineer");
  if (isAsset) reviewers.add("technical-writer");
  reviewers.delete(owner);
  const risk = /(?:auth|payment|billing|secret|migrations|database|admin|security|governance|policy|refund|payout)/.test(file) ? "critical" :
    isCode ? "standard" : isAsset ? "asset" : "configuration";
  return {owner,reviewers:[...reviewers],risk,isCode,isAsset};
}
