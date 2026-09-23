---
name: Drizzle adapter union loses contextual typing
description: Why an isolated PostgreSQL adapter caused hundreds of apparent caller errors
---
A union of schema-parameterized Neon and node-postgres Drizzle instances can
destroy overload/contextual typing throughout otherwise unchanged callers.
Do not mass-annotate those callers or suppress their diagnostics.

**Why:** Adding an isolated acceptance adapter caused hundreds of implicit-any
and unknown-result errors. The root was the public database export's inferred
cross-driver union, not hundreds of independent application mistakes.

**How to apply:** Keep one explicit schema-parameterized public database contract
and a narrow reviewed driver boundary. Verify that both adapters implement the
used runtime surface, then run the complete split typechecks.