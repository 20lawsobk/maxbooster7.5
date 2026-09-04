---
name: "projects" and "studio_projects" are two different live tables
description: confusingly similar names, both actively written to by current code — don't assume one is legacy/dead or that they're interchangeable for counting "tracks"/projects
---
`projects` (top-level project entity: title, genre, workflowStage, status; used by studio.ts CRUD, royalty splits, etc.) and `studio_projects` ("DAW Project State": mixBusConfig, masterSettings, automationData, lastSavedAt) are BOTH real, actively-written-to tables — not a legacy/current pair. Multiple current route files insert into both.

**Why:** `/api/dashboard/comprehensive`'s "totalTracks"/track-growth metrics count rows from `studio_projects`, not `projects` — a user's dashboard track count can diverge from their actual Projects-list count. Unresolved whether that's an intentional distinction (DAW sessions opened vs. projects created) or a metric wired to the wrong table — flagged as a follow-up, not fixed.

**How to apply:** when touching either table or any metric described as "tracks"/"projects", grep both `insert(projects)` and `insert(studioProjects)` call sites before assuming which one a given feature should read from.
