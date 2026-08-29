---
name: Deployment runtime helper packaging
description: Runtime launch helpers must survive deployment-context filtering or promote can fail before useful logs appear.
---

Any file invoked by the production run command before the real server binds must be explicitly preserved by deployment-context ignore rules. Development-tool directories are commonly excluded wholesale, so runtime helpers kept inside one need narrow inclusion exceptions.

**Why:** A build can compile, package, and upload successfully yet fail promotion when its launcher references filtered-out helpers. If the missing helper owns the early liveness listener, the platform may terminate the container before runtime logging becomes visible.

**How to apply:** Whenever production startup gains a helper dependency, verify that dependency with an actual Docker-context COPY test. Keep only required runtime files, make mandatory shell sourcing fail explicitly, and do not require source-only configuration files inside the runtime image.