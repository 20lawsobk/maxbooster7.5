---
name: Python scan version attribution
description: Verify the resolved Python dependency version when a scan reports a version inconsistent with its manifest.
---

When a dependency scanner reports a Python version that the current constraints exclude, resolve the exact requirements and compare them with the lockfiles before changing pins. Do not suppress the finding or add an arbitrary exact pin.

**Why:** A dependency audit reported AnyIO 4.9.0 against a current `>=4.14.2,<5` requirement; a fresh resolver selected 4.16.0. The scan result remains a release blocker until a fresh scan confirms the corrected attribution.

**How to apply:** Use the package manager to resolve the relevant manifest without installing or restarting the running app. Keep the security gate unresolved until the scan or actual publishing builder confirms the safe version.
