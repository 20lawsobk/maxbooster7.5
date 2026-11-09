---
name: Whole-product acceptance scope
description: Acceptance evidence must cover the complete Max Booster product, not an isolated server or role.
---

Max Booster release acceptance applies to the complete existing product: public and onboarding flows, regular accounts, administrator access, other supported roles, modules, cross-module journeys, integrations, and operational dependencies. MaxCore and the admin account are components and test paths, not substitutes for whole-product verification.

Within that whole-product boundary, the owner's architecture treats MaxCore as Max Booster's central first-party intelligence subsystem, not as an unrelated external product. The existing gateway and service boundaries may remain, but Max Booster capabilities should connect to MaxCore through them.

**Why:** the owner explicitly clarified that MaxCore is part of Max Booster and is intended to serve the wider ecosystem.

**How to apply:** preserve the existing internal service architecture, make MaxCore integrations use the real gateway and readiness contracts, and do not treat an internal HTTP boundary as evidence that MaxCore is a third-party dependency.

**Why:** the owner explicitly corrected the scope from MaxCore/admin-only verification to Max Booster as a whole.

**How to apply:** inventory each existing role and user journey, then collect fresh evidence for each module, cross-module handoff, persistence/recovery behavior, and external dependency. Report blocked or untested items separately; never infer whole-product readiness from a passing subset.

MaxCore's owner-defined MVP also requires persistent project/system memory, project awareness, a knowledge graph, multi-agent runtime, permissioned tools, context retrieval, event-driven operations, bounded auto-expansion, vector search, telemetry, and a canonical cognitive-entity API for users, projects, goals, tasks, agents, departments, memories, knowledge, tools, workflows, events, and relationships. The initial deployment target is 8 CPU, 32 GB RAM, and 500 GB SSD.

**Why:** the owner supplied explicit MaxCore system and API data-model specifications; these are acceptance requirements, not evidence that similar-sounding application modules satisfy them.

**How to apply:** map each requirement to the existing implementation and verify real persistence, authorization, tool execution, agent lifecycle, retrieval, and bounded scaling. Treat the deployment figures as a target, not measured capacity of the current Replit runtime.
