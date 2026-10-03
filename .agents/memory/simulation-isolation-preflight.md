---
name: Simulation isolation preflight
description: Match sandbox capability checks to the actual unprivileged namespace startup contract.
---

Test the exact isolation mechanism the simulation will use. A failure to create
a privileged network namespace does not establish that unprivileged user-plus-
network namespaces are unavailable.

**Why:** A privileged-only preflight incorrectly blocked this project's packed
runtime simulations. The actual unprivileged user/network namespace mechanism
worked and isolated Node, Python, and native descendants without live credentials.

**How to apply:** Match the preflight's namespace options and identity mapping to
runtime startup, prove loopback works inside it, and verify its network namespace
differs from the host's. Do not replace a failed preflight with an isolation waiver.

Sanitized build tests must preserve the project's existing non-secret npm
install policy via a strict boolean-key allowlist, without copying `.npmrc`
credentials. Give npm separate empty user and global configuration files.

**Why:** Removing the existing peer-dependency policy produced a harness-only
ERESOLVE failure; assigning both npm configuration paths to `/dev/null`
instead made npm fail with "double-loading config" before installation.

**How to apply:** Copy only allowlisted boolean install settings into the
disposable project and keep user/global configuration paths distinct. Never
introduce a new peer-dependency bypass merely to make a test pass.

Set private XDG config/cache/data/state directories in sanitized build
environments. Replit's `npx` shell wrapper uses `set -u` and requires
`XDG_CONFIG_HOME`; an otherwise valid historical build failed before Vite when
the harness omitted it. This is a harness prerequisite, not an application
compiler failure.