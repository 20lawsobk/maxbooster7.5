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