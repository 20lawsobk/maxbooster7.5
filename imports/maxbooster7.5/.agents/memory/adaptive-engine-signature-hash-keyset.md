---
name: Adaptive generation engine signature-hash key-set sensitivity
description: isRecentlyUsed/recordGeneration in adaptiveGenerationEngine.ts hash the exact attribute key SET; mismatched keys between the check call and the record call silently defeat the check forever.
---

`isRecentlyUsed({ domain, attributes })` and `recordGeneration({ domain, attributes })` (shared
self-optimization/anti-repetition engine, one instance of `generationHistory` per `domain`) compute
a SHA1 signature over `Object.keys(attributes).sort().map(k => \`${k}=${attributes[k]}\`).join("|")`.
This hashes the full key set, not just shared keys. `{genre, mood}` and `{genre, mood, musicalKey}`
produce different hashes even when genre and mood are identical values — there is no subset/superset
matching.

**Why:** first wiring attempt recorded `{genre, mood, musicalKey}` at the finalization call site but
checked `{genre, mood}` at the decision call site (musicalKey isn't known yet at decision time in that
flow). The two hashes could never equal, so `isRecentlyUsed` always returned `false` — a silent,
permanently-inert guard that would have passed a shallow code read and even a "does it throw" smoke
test. Caught only by writing a standalone script that recorded then checked through the real functions
and asserted on the boolean, plus a same-session negative-control test proving the mismatched-key-set
call really does return false even for an exact value match.

**How to apply:** whenever wiring `isRecentlyUsed`/`recordGeneration` into a new generation surface,
grep both call sites for that `domain` string and diff their `attributes` object keys — they must be
character-for-character identical (same keys; values naturally differ). If a value isn't available yet
at decision time, it cannot be part of the signature at all (drop it from both sides), rather than
adding it only at the record site. Verify with a real record→check round trip against the live DB
(unique test domain), not just a typecheck or a read-through — this bug produces zero errors, zero
exceptions, and zero visible symptoms; it just never fires.
