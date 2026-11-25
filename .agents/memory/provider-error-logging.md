---
name: Provider error logging
description: Safe diagnostics for upstream payment and API failures.
---

Provider error messages are untrusted diagnostic text and may embed credentials without a field name. At sensitive integration call sites, log only allowlisted error categories and non-sensitive status metadata; do not log raw provider messages. Generic redaction is defense in depth, not a substitute for safe logging.

**Why:** A Stripe initialization error included a secret-key fragment in its message, which bypassed field-name-based redaction.

**How to apply:** When adding or changing provider error logs, retain actionable categories while suppressing raw message/stack content unless it has been explicitly scrubbed and tested with provider-specific credential formats.
