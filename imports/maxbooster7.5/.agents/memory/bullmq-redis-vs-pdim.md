---
name: BullMQ native Redis vs PDIM
description: BullMQ must use native ioredis for reliability; PDIM is for storage, not job queuing
---

## Rule
BullMQ must always use a native Redis instance (redis://localhost:6379) not PDIM HTTP exec.

**Why:** PDIM has its own Redis engine for storage/cache, but BullMQ Lua scripts over HTTP cause floods of timeouts, blocked AutonomousScheduler, and stalled workers.

## Worker opts by backend
| Setting | PDIM (HTTP) | Native Redis |
|---------|-------------|--------------|
| concurrency | min(n, 2) | full n |
| drainDelay | 120,000ms | 5,000ms |
| lockDuration | 600,000ms | 30,000ms |
| stalledInterval | 300,000ms | 30,000ms |

## Setup
- Workflow: `redis-server --daemonize yes --port 6379 --loglevel warning --save '' --appendonly no && sleep 1 && npm run dev`
- Env: `REDIS_URL=redis://localhost:6379`
- System dep: `installSystemDependencies({ packages: ["redis"] })`
- Detection in code: `REDIS_URL.startsWith("redis://")` → use ioredis
