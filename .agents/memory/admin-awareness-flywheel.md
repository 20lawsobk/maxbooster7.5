---
name: Admin awareness flywheel
description: Product contract for live awareness generation, corpus growth, and external-awareness retirement
---

The configured awareness system is the authority for selecting relevant public sources. Fresh validated scan data is useful generation context, but snapshot availability or expiry must never gate generation or admin flywheel ingestion. When a valid scan is available, preserve its observations intact; do not fabricate awareness when it is not. Feed generated admin content into the existing PDIM phrase corpus, and retire external awareness only when an authoritative storage measurement reaches the configured self-sufficiency threshold. Do not add a competing source-rights gate or discard an observation to manufacture a training holdout.

Corpus growth is retrieval/dataset growth, not proof that neural weights were updated or that quality improved. Candidate quality review and promotion remain separate: they require an independent post-training evaluation that does not overlap the full training snapshot.

**Why:** Active and passive source scanning continues independently of snapshot publication. Making a complete or fresh snapshot a generation prerequisite pauses the flywheel during startup, expiry, or scan/storage interruptions even though generation can proceed from its request. A train-time holdout carved out of the live snapshot also reduces the configured source data the flywheel is meant to learn from.

**How to apply:** Capture and bind a validated snapshot only when one is available; omit its conditioning and metadata when missing or expired, while continuing generation and PDIM ingestion. Keep the scanner running independently. Base retirement on measured corpus state. Candidate training still needs actual validated observations, and candidate review still requires independent evaluation against the full training snapshot.