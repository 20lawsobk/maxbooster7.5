---
name: Portable Python build isolation
description: Host Python paths can contaminate a different interpreter during publishing.
---

Use Python isolated mode for every portable-runtime build invocation, including lock export, pip installation and smoke verification.

**Why:** Invoking the portable Python 3.12 executable alone did not isolate it from the publishing environment's Python 3.13 packages. Pip treated host packages as installed and attempted to uninstall read-only Nix setuptools. Even a successful install could silently omit dependencies from the capsule.

**How to apply:** Ignore host Python paths with interpreter isolation, retain package-firewall registry settings, and verify the interpreter prefix, search paths and imported package origins belong to the portable runtime. Do not fix this by changing Nix permissions, using user-site installs or skipping dependency verification.