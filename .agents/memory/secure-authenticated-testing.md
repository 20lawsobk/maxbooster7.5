---
name: Secure authenticated testing
description: Workspace secrets may not exist in the browser notebook; preserve normal login and distinguish configuration from account provisioning.
---

Use the normal application login flow for authenticated verification. Do not add temporary login bypasses or forge session-store records.

**Why:** An older note incorrectly claimed the app lacked login routes and recommended a temporary bypass. Normal login was verified to exist. Missing or rejected test credentials do not justify changing authentication.

The persistent browser notebook does not necessarily inherit workspace secrets. A workspace-shell-driven Chromium process can consume credentials from its own environment without printing them or exposing them to model context.

**How to apply:** Check presence only. Pass credentials directly from environment to the normal browser form inside the workspace process; never copy their values into tool messages, logs, or notebook inputs. On 401, avoid repeated attempts. A read-only check may establish whether the supplied identifier corresponds to an account, without emitting identifiers or hashes. Ask before provisioning an account or changing its access; configuring test secrets does not itself provision an application account.

### Process-local MaxCore channel token
When local MaxCore mode starts without an explicitly inherited channel token, the application generates a random token in its own process and passes it to the child. A separate diagnostic process that imports the same config generates a different token, so its direct MaxCore request can return 401 even while the running application is authenticated correctly.

**Why:** An isolated probe falsely implicated the local MaxCore connection; the normal authenticated application proxy returned the valid model-info contract.

**How to apply:** Verify MaxCore generation auth through the running app's normal login/session flow (for example, its authenticated model-info proxy). Never treat a separate config-importing process's 401 as evidence of a live connection failure, and never print either process's token.

Browser harnesses must use real pointer or keyboard input for Radix tabs, not an evaluated DOM `.click()`.

**Why:** The tab activates on pointer/key events that a synthetic click alone does not dispatch; this produced misleading UI-failure reports despite a working control.

**How to apply:** Use the browser driver's element click or keyboard activation. Wait for the parent panel, activate the inner tab, and only then wait for its fields. Treat intercepted clicks and missing network requests as harness evidence, not proof of backend failure.