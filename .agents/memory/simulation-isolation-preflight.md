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