---
name: Shared compute-sizing source
description: Lesson from unifying host-capacity-derived sizing across processes — constructing a sized object is not the same as wiring it in.
---

When deriving a resource-sizing value (worker count, GPU lane/tensor-core count, etc.) from a
single shared source and threading it through several independent constructors, grep for every
call site that builds the object being sized — not just the ones a first pass touches. It's easy
to correctly compute and pass a sized instance into a local variable, then have it silently
discarded because a nearby `backend=None` (or equivalent) argument tells the callee to construct
its OWN default-sized instance instead of using the one already built. The bug is invisible at a
glance because the sizing call and its result both look "used."

**Why:** an env-derived GPU backend was built, then thrown away because the model constructor was
still called with `backend=None`, so it silently fell back to its own hardcoded default.

**How to apply:** after wiring a shared sizing source into N call sites, re-grep the whole
codebase for the object's constructor signature (not just the sizing-parameter literal you
replaced) to catch sibling call sites — including fallback/secondary paths, class-default
arguments, and cluster/pool wrapper constructors — that build the same kind of object
independently and need the same value passed in explicitly. A single review pass rarely finds
all of them; expect multiple rounds of "one more call site" review feedback on this class of change.
