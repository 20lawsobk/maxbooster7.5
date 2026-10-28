# Independent candidate review

Verdict: **approve for controlled integration and a fresh separate collector recheck**.
No repository source, canonical coverage counters, acceptance mapping or launch
status was changed. This verdict does not approve any profile merge.

The exact three-file patch is `../candidate.patch`, SHA-256
`d2befaa7af8a46e61fa43acd12898403de5cc7e2be1a8b5497a5b657bb74c118`.
Its generated diff exactly matches the reviewed next-source files, and
`git apply --check` passes. The existing P1 suite allowlist, process ownership,
range/provenance validation and strict complete-map comparator remain intact.

The actual candidate helper, collector and complete framework were copied into
`staged/` outside the checkout. A credential-free Node 22.23.3 child ran the exact
full framework: **22 passed, 0 failed, 0 skipped**, including existing timeout,
forced descendant cleanup, output bounds, spawn failure, stale runtime/source,
malformed ranges and PostgreSQL-suite pre-execution rejection cases. New tests
include actual esbuild output executed inside an owned VM with inspector
counters; the uncalled original function and original unexecuted statements and
branches remain in the denominator with zero hits. See `framework.txt` and
`framework-receipt.json` for the real command, source scope and exit.

A second independent review in `../independent-adversarial/` inspected the actual
converter API: its variable-declarator callback receives the same AST identity
stored in the WeakSet, and ignoring that subtree cannot ignore adjacent author
functions. Its separate nine-case candidate run passed. Twelve additional real
compiler controls retained every original statement/function/branch denominator
for nested declarations, class fields, arrows, Unicode/escaped names, JSX/TS,
destructuring, shadowed bindings and anonymous defaults. These are bounded
regression controls, not proof for every possible compiler output.

No concrete authored-node false exclusion was found. Original identifier
collisions decline filtering, mapped prelude nodes are retained, helper writers
are checked, and ignored standalone calls must map exclusively to an original
parsed declaration name while containing only identifier/literal arguments.
Function/arrow-valued wrapper arguments remain intact. The three repository
source hashes still match the pre-review values. Canonical global coverage bytes
match the preserved full a160 master archive, not the older pre-a160 producer's
historical baseline hash; these are separate source cohorts.

The candidate repairs one proven compiler-helper attribution defect. Seven of
nine retained production files still have genuinely different serialized maps;
all nine remain strictly incompatible in memory because coordinate/undefined
representation is intentionally unchanged. Root must run the fresh actual
allowlisted collector after landing. No JSON normalization, hit copying, test
allowlist expansion or whole-platform readiness claim is authorized by this
review.
