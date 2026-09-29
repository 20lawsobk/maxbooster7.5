---
name: Admin awareness flywheel
description: Product contract for live awareness generation, corpus growth, and external-awareness retirement
---

The configured awareness system is the authority for selecting relevant public sources. The admin flywheel must use its validated snapshot intact, feed generated admin content into the existing PDIM phrase corpus, and retire external awareness only when an authoritative storage measurement reaches the configured self-sufficiency threshold. Do not add a competing source-rights gate or discard an observation to manufacture a training holdout.

Corpus growth is retrieval/dataset growth, not proof that neural weights were updated or that quality improved. Candidate quality review and promotion remain separate: they require an independent post-training evaluation that does not overlap the full training snapshot.

**Why:** A train-time holdout carved out of the live snapshot reduced the very configured source data the flywheel is meant to learn from. Treating candidate training as quality success or as serving-model training would also overstate what happened.

**How to apply:** Keep one validated snapshot bound to each admin generation plan, persist generated outputs through the existing flywheel, and base retirement on measured corpus state. If measurement is unavailable, do not claim retirement; if later evaluating a candidate, validate an independent protocol against every record in the full snapshot.