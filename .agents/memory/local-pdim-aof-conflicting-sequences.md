---
name: Conflicting PDIM AOF sequences
description: Safe recovery rules when local PDIM journal frames assign different mutations to one sequence.
---

When valid, checksummed journal frames assign different mutations to the same sequence, the journal alone cannot identify which mutation is authoritative. Selecting one can lose a write or resurrect deleted state; replaying or renumbering both can invent an order.

**Why:** A sequence collision across writers demonstrates that the persisted history has no unique ordering at that point. A snapshot older than the collision does not disambiguate it.

**How to apply:** Preserve the snapshot and journal unchanged. Seek an authoritative snapshot or independent acknowledgement/owner evidence before recovery, and obtain explicit approval before restoring or resetting state. Prevent multiple local PDIM primaries from writing the same journal.