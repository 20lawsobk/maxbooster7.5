# Independent Validation Guide

**Purpose:** What third-party evaluators look for, and how to prepare
for (or simulate) independent assessment.

---

## 1. What Evaluators Actually Check

### Security (OWASP ASVS + PTES methodology)
A credible pentest report maps every finding to:
- **OWASP Top 10 (2021)** and **OWASP API Security Top 10**
- **OWASP ASVS** requirement IDs (not just "we found XSS")
- **NIST SP 800-115** or **PTES** methodology

**What distinguishes pentest from scan:**
- Vulnerability scan: lists weaknesses
- Penetration test: proves exploitability, chains weaknesses into attack paths
- If the report has no exploit chains and no business-logic findings, it was a scan

**SaaS-specific scope:**
- Broken access control: user A → user B's data (every tenant endpoint)
- Multi-tenant isolation: cross-tenant leakage, IDOR
- Auth: session fixation, token invalidation on logout, MFA gaps
- Business logic: pricing flows, coupon abuse, workflow state-skipping, race conditions
- SSRF: every URL-fetching feature, webhook config, file-upload-via-URL

### Performance (k6 thresholds-as-code)
- Thresholds declared BEFORE the run (not fitted to results)
- k6 exit code decides pass/fail (not eyeballing)
- Critical path tested (auth, heaviest DB queries), not just `/health`
- Baseline recorded: p50/p95/p99, RPS, error rate, CPU/memory

### Resilience (chaos scenarios)
- Blast radius declared, abort conditions defined
- Isolated chaos stack (never production data)
- Per-scenario runbook for operators

---

## 2. Preparing for Evaluation

### Before engaging a firm:
1. Run the live verification runbook (docs/LIVE_VERIFICATION_RUNBOOK.md)
2. Run k6 suite, save JSON artifacts
3. Run chaos scenarios, save report
4. Fix all findings from automated scans
5. Document: architecture diagram, data flow, trust boundaries, auth model

### During evaluation:
- Provide: API docs, test accounts (multiple roles), staging environment
- Scope: define in-scope/out-of-scope explicitly
- Timeline: 5-25 person-days for SaaS pentest

### After evaluation:
1. Triage findings by severity + exploitability
2. Fix in priority order
3. **Retest:** findings aren't closed until the tester validates the fix
4. Publish remediation log (finding → fix commit → retest confirmation)

---

## 3. Continuous Validation (2026 Standard)

The strongest posture: **continuous autonomous testing + annual manual pentest**

**Autonomous tools:**
- **XBOW** — autonomous web exploitation, per-pentest pricing
- **Horizon3.ai NodeZero** — network/identity/cloud, compliance-ready reports
- **Escape** — continuous API/business-logic testing
- **Cobalt** — human pentest-as-a-service (PTaaS)

**Cadence:**
- Autonomous: weekly or on every major deploy
- Manual pentest: annually or after major architecture changes
- Either alone is arguable; both together is hard to dispute

---

## 4. Compliance Mapping

Enterprise buyers require control-mapped evidence (not scan exports):

| Framework | When required | Evidence format |
|-----------|---------------|-----------------|
| SOC 2 | Enterprise SaaS (default ask) | Trust Services Criteria mapped |
| ISO 27001 | Global sales | Annex A controls mapped |
| GDPR | EU users | Data processing records, DPA |
| PCI DSS 4.0 | Card payments | SAQ or ROC, mapped requirements |

Findings must map to control language (SOC 2 criteria / ASVS IDs),
not just CVSS scores.

---

## 5. The "Impossible to Deny" Package

| Artifact | Proves | Form |
|----------|--------|------|
| Pentest report | Security | Named firm, dated, OWASP-mapped |
| Remediation log | Fixes work | Finding → commit → retest |
| k6 JSON + SLO matrix | Performance | Thresholds-as-code, CI history |
| Chaos report | Resilience | Per-scenario results, runbook |
| TLS/header scans | Transport | Dated screenshots, A+ grades |
| Backup drill log | Durability | RPO/RTO numbers, restore date |
| Control mapping | Compliance | SOC 2 / ASVS-mapped pack |
| Deployed SHA | Identity | All artifacts reference same commit |

**Pattern:** each claim has a dated artifact, produced by someone/something
other than the team making the claim, reproducible on demand.
