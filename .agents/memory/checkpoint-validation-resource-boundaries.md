---
name: Checkpoint validation under constrained memory
description: Separate safe archive and meta-model checks from actual serving inference.
---

A quarantined filename is not evidence that a checkpoint is corrupt. Preserve
the candidate and establish safe deserialization, structural compatibility, and
actual serving inference as separate claims.

**Why:** The imported quarantined candidate had valid archive CRCs and safely
loaded tensor data. Meta-device comparison matched both model architectures,
but actual forward execution exceeded the initial measured RSS budget. Neither
the filename nor that resource abort established corrupt weights; structural
compatibility did not establish trained quality either.

**How to apply:** Prefer tensor-only CPU memory-mapped loading and meta-device
key/shape comparison before allocating a full model. Use measured RSS and
host/cgroup reserves, not virtual-address limits or an assumed import footprint.
Keep missing optional tokenizer fields aligned with the real runtime contract.
Do not promote quarantined weights solely because ZIP or shape checks pass.

Keep forward-only checkpoint quality diagnostics separate from KV-cache serving
quality and from startup/recovery acceptance. A serving error makes quality
unmeasurable on that path; it is not a zero-valued prose score.

**Why:** Held-out sampling encountered a serving-path shape error even though
forward-only numerical acceptance had succeeded. An explicit full-prefix
diagnostic can measure the unchanged weights, but cannot establish that the
serving path works or retroactively invalidate a different acceptance contract.

**How to apply:** Preserve failed trials, disclose diagnostic-path changes, retain
checkpoint hashes, and score generated continuations rather than echoed inputs.

Treat importing a production server as a lifecycle operation, not a pure
read-only loader, even when its startup event is never called.

Tokenizer compatibility must include token semantics, not just tensor shapes.
**Why:** A whole-word checkpoint was wrapped in a BPE tokenizer, losing even
known words; surplus unnamed output rows also decoded as unknown tokens.
Correcting those wiring errors restored numerical generation but did not give
the checkpoint vocabulary it never learned.
**How to apply:** Separate tokenizer mismatch, unsupported vocabulary, finite
inference, and readable output quality. None is a substitute for the others.

**Why:** A connected inference retest needed real model initialization without
training workers, but module import itself started janitor threads and the
initializer attempted DB logging. Checkpoint hashes alone cannot establish
that unrelated generated files were untouched.

**How to apply:** Identify import-time lifecycle effects, protect weights and
user files before import, avoid autonomous training startup, and report the
remaining lifecycle scope honestly. Capture output provenance: awareness-derived
candidate text must not be counted as successful checkpoint generation.