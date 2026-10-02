---
name: Tar firewall recovery
description: Historical blanket tar blocking is not a standing reason to substitute a stub.
---

Use a real patched tar release through the configured package firewall. Do not recreate the former local stub or assume every version remains blocked.

**Why:** An earlier installation workaround treated tar as universally blocked. Patched registry tar subsequently installed successfully and real desktop-tool consumers passed archive creation and extraction checks. A stub hides missing behavior and can itself produce dependency findings.

**How to apply:** Follow the package-management recovery sequence: try the latest patched release, verify the consuming package resolves it, and exercise archive operations. If blocked again, diagnose the current block rather than reviving a fake package or bypassing the firewall.