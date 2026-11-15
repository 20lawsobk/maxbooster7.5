# Preserved independent coverage-candidate review

This cohort preserves the independent review snapshot and its exact receipts.
It contains 48 passing portable framework tests and five passing historical
reader diagnostics, with no reported failures. The recorded
[snapshot](snapshot.json), [review receipt](review-receipt.json),
[framework log](framework.txt) and [historical reader checks](actual-raw-binding-check.json)
retain their original bytes.

The historical checks use retained actual raw bytes with explicitly injected
reader metadata. They exercise script binding, changed counters, duplicate
script IDs, mismatched nonce and malformed nested ranges. They grant no current
production counter admission and are not fresh application runtime proof.
The independent review explicitly leaves global counter admission unreviewed
until canonical command binding and a fresh same-source baseline are proved.

No global profile, canonical master, production source or page acceptance was
changed by this preservation. The snapshot's then-current candidate comparison
is historical to its recorded timestamp; future candidate changes require a
new review. Runtime behavior and 100% platform coverage remain separate gates.

[retained-manifest.json](retained-manifest.json) independently hashes all
retained snapshot files, diagnostic code, receipts and this README.

After the reviewed producer files land, use the canonical source test for a
fresh portable exercise. These report-owned copies retain their original scope:

```sh
node --test tests/testing/coverage-coordinate-contract.test.mjs
```

The recorded [framework invocation output](framework.txt) is evidence for its
original snapshot. Replaying the historical diagnostic against a different
producer requires its explicit metadata and source contract; a passing replay
never reblesses old counters for new source.
