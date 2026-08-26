---
name: Deploy boot-stub to primary port gap
description: start.sh kills the boot-stub liveness server and releases the app port before the real cluster process binds it; anything synchronous/CPU-blocking that runs before that process's listen() call reopens the gap.
---

## What happened

`start.sh` intentionally has the boot-stub liveness server release the app port (5000) and then launches the real server, on the assumption the real server binds the same port again almost immediately. In `server/cluster.ts`, asset pre-compression (brotli/gzip of the built static assets) used to run as a **synchronous, top-level IIFE** — `readFileSync`/`brotliCompressSync`/`writeFileSync` over every compressible built asset — executed at module load, before the cluster primary's `http.createServer(...).listen()` call ever ran.

That synchronous work took 20-30+ seconds on a normal build. During that whole window nothing was listening on the port at all (the stub was already dead, the primary hadn't bound yet), so any request — including the platform's own health check, or real user/API traffic hitting the app right after a deploy — got connection-refused instead of slow-but-successful.

## Why it matters

**Why:** any "hand off the port from A to B" boot sequence is only as safe as the assumption that B calls `listen()` almost immediately after A releases the port. That assumption silently breaks the moment new startup work is added to B's module-load path before the `listen()` call — especially anything CPU-bound and synchronous, which also blocks Node's single event loop even after a port *is* bound.

## How to apply

- Any expensive startup work (asset compression, cache warming, model loading, etc.) in a server entrypoint must run **after** the port is bound and listening, not before.
- Prefer async I/O (fs.promises, async zlib) with bounded concurrency over sync equivalents for anything that runs at server startup — sync CPU-bound work blocks the event loop even once the socket is open, so queued connections still stall.
- When debugging a "works fine standalone, drops connections right after deploy/restart" symptom, fetch deployment logs (`fetchDeploymentLogs`) and look for the literal sequence: stub/placeholder port release timestamp vs. the real server's "listening on" timestamp. A gap of more than ~1-2s between those two log lines is the signature of this bug class.
