---
name: Port contract boundaries
description: How the application prevents public-port collisions across shell startup, Node runtime, and Replit deployment configuration.
---

`PORT` is reserved exclusively for the public Max Booster HTTP listener. Every
sidecar must receive its own named internal port and bind to loopback; it must
never inherit or reuse `PORT`.

**Why:** The development launcher once started BoosterState using an environment
value that pointed at the public app port. The sidecar and app then raced for
the same socket, producing `EADDRINUSE` and an unavailable preview.

**How to apply:** When adding a local service, add its explicit internal port to
the runtime contract and startup validation, keep it out of the external Replit
port map, and ensure every shell/Node client consumes that named setting rather
than a numeric literal or `PORT`.