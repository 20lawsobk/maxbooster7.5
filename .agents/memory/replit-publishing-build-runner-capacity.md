---
name: Replit publishing build runner capacity
description: Distinguishes the publishing build runner's resources from the deployed Reserved VM machine configuration.
---

Replit's Publishing machine configuration sets CPU and RAM for the running published app. The Publishing Build runner has separate infrastructure-managed resources and cannot be sized through the app's deployment scripts.

**Why:** the build log showed lower live capacity than the configured 16-vCPU/64-GiB runtime target; Replit's documentation confirms the two resource allocations are separate.

**How to apply:** keep the 16/64 runtime ceiling, but schedule build tasks only against detected cgroup capacity. Do not override live limits or claim the build runner uses the production VM's allocation.
