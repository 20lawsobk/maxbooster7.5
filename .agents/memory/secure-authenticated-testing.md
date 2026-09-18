---
name: Secure authenticated testing
description: Workspace secrets may not exist in the browser notebook; preserve normal login and distinguish configuration from account provisioning.
---

Use the normal application login flow for authenticated verification. Do not add temporary login bypasses or forge session-store records.

**Why:** An older note incorrectly claimed the app lacked login routes and recommended a temporary bypass. Normal login was verified to exist. Missing or rejected test credentials do not justify changing authentication.

The persistent browser notebook does not necessarily inherit workspace secrets. A workspace-shell-driven Chromium process can consume credentials from its own environment without printing them or exposing them to model context.

**How to apply:** Check presence only. Pass credentials directly from environment to the normal browser form inside the workspace process; never copy their values into tool messages, logs, or notebook inputs. On 401, avoid repeated attempts. A read-only check may establish whether the supplied identifier corresponds to an account, without emitting identifiers or hashes. Ask before provisioning an account or changing its access; configuring test secrets does not itself provision an application account.