# Production-readiness execution roadmap

## Evidence boundary
The existing React/Vite client calls Express routes, which delegate to service
modules, PostgreSQL/Drizzle, BullMQ/Redis, PDIM and supervised MaxCore processes.
Social and advertising share posting infrastructure; the beat loop promotes
marketplace listings through advertising dispatch and reconciles genuine sales.
Music workflow templates have their own dispatch and execution-log layer.
Publishing is configured as `bash build.sh` followed by `bash start.sh`, not
merely the package build command. Server bundles externalize dependencies.

## Ordered work and acceptance gates
1. Workflow execution integrity: replace descriptive-only success with owned,
   durable work; prove idempotency, publishing consent and error propagation.
   Unsupported provider operations must fail explicitly, not claim success.
2. Generation: trace awareness and checkpoint conditioning; retain unknown-token
   and quality validation. Prove actual supported requests generate usable
   outputs before enabling dependent autonomous work.
3. Distribution: retire active LabelGrid consumers, preserve historical IDs,
   route new work through authenticated Too Lost and its submission repository.
4. Deployment: inspect destructive scripts, then rehearse the configured
   build/restore/start in isolation. Verify external imports and readiness.
5. Cross-cutting gates: tenant/auth tests, input validation, credential
   redaction, replay-safe payments, worker recovery and load measurements.

Each patch requires focused tests, rereading changed source, and an appropriate
type/build check. A blocked stage is not a passed gate. No live posting, payments,
releases or production publishing are authorized by this roadmap.

## Initial demonstrated blockers
- Countdown, bio-update and caption-repurpose handlers return descriptions
  rather than their advertised side effects.
- ScriptAgent requires checkpoint generation even when awareness is present;
  runtime evidence includes the unknown-token rejection.
- Distribution modules still import LabelGrid and its SDK remains a dependency.
- No current complete publishing rehearsal has been established.

This document is an execution order, not a production-readiness certification.
