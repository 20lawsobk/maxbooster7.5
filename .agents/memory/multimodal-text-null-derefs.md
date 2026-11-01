---
name: Multimodal text-path null-derefs unmasked by additive API change
description: Why an additive external-API change surfaced a chain of new-user null-deref crashes in multimodal generation, and the conventions that prevent the class
---

# Multimodal generation: latent null-derefs on the new-user / no-data path

An additive change to an external dependency (MaxCore's "request intelligence layer")
prompted a retest that exposed a CHAIN of pre-existing null-deref crashes in the
multimodal generation service — none caused by the external change itself.

**Why they were hidden:** the first crash (an unguarded `req.constraints.outputModality`
during plan-building) aborted the no-pack path *before* the workers ran, shielding every
downstream null-deref. Fixing the first crash unmasked the rest. Lesson: when retesting a
path that was crashing, fix the WHOLE crash chain — keep driving the same request
(especially the brand-new-user / empty-data path) until it returns real output, because
one fixed crash routinely reveals the next.

**The class:** these all triggered only for a user with no `autopilotPreferences` /
`userBrandVoices` rows (i.e. most new users), so normal testing with a fully-set-up
account would never hit them:
- destructuring empty DB results then reading a field on the `undefined` row
  (`prefs.artistName` where `prefs` came from an empty `[]`)
- reading `.length`/`.slice` on array fields typed `T[] | null` without `?.`
- indexing an object that only exists for one input shape
  (`normalized.perPlatformCopy[platform]` — only populated for URL inputs)
- passing a possibly-null array to a helper whose guard assumed non-null
  (`matchReleaseByUrl` did `!releases.length`)

**Convention — don't return `{} as UserContext`.** The context fetcher used to return
`{} as UserContext` on the empty/error paths. That is a type-lie: every field is actually
`undefined`, so every consumer must remember an optional guard, and any missed one crashes
only for new users. Return a fully-defaulted object instead (null scalars, `[]` arrays).
**Why:** makes the type honest and turns the whole array-field class into belt-and-suspenders
even if a future consumer forgets `?.`. **How to apply:** any "fetch user/tenant context that
may be empty" helper should have an `emptyXContext()` factory and use it in both the
no-id early-return and the catch.

**Logging gotcha that hid the errors:** `logger.warn("...error:", err.message)` (pino) —
a second *string* arg with no `%s` placeholder in the message is dropped, so every error
logged with a blank detail. The errors were invisible in logs; the only way to find the
throws was reading the worker code. Use a template literal (`` `...: ${err.message}` ``) or a
merge object (`logger.warn({ err }, "...")`) so the detail actually appears.
