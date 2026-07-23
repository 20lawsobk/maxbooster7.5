---
name: AutonomousScheduler PDIM wait bypass
description: waitForPdimSettled() must return immediately when REDIS_URL is a redis:// URL
---

## Rule
Check REDIS_URL first in waitForPdimSettled(); skip 75s wait when native Redis is active.

**Why:** The wait was designed for PDIM HTTP queue drain. With native Redis there is no queue — waiting 75s delays all BullMQ repeatable jobs unnecessarily.

**Code (server/services/autonomousJobScheduler.ts):**
```typescript
const redisUrl = process.env.REDIS_URL || process.env.NATIVE_REDIS_URL || "";
if (redisUrl.startsWith("redis://") || redisUrl.startsWith("rediss://")) {
  logger.info("[AutonomousScheduler] Native Redis detected — skipping PDIM startup wait");
  return;
}
```
