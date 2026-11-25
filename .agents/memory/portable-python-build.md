---
name: Portable Python publishing
description: Replit builder pip configuration and the runtime manifests required for the packaged Python environment.
---

The publishing builder may force pip into user-site mode, which fails under the isolated `python_runtime` because its user site is disabled. Pass `PIP_USER=0` to every pip install launched for this runtime. Install the AI-server project dependencies, its uv constraint and override dependencies, and the diffusion requirements; do not pull root development or hardware-tooling dependencies into the production runtime.

**Why:** A real publishing log failed at the CPU Torch install with “Can not perform a '--user' install,” and the existing runtime also lacked the diffusion AnyIO pin and some security override floors.

**How to apply:** Before installing, check declared versions, `pip check`, and portable import origins; skip pip only when all pass. Test the pip override with a no-write dry run. A local pass does not replace verification on the actual Replit publishing builder.
