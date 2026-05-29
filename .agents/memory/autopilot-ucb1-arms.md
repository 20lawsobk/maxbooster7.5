---
name: Autopilot UCB1 arm seeding
description: Why the autopilot topic bandit must seed arms from a static default set unioned with history, not from a single arm
---

The autopilot topic selector (`selectOptimalTopic()`) uses a UCB1 multi-armed bandit. A bandit can only converge if it has multiple arms to explore.

**Rule:** Build the candidate arm set every call as the union of (a) per-topic stats derived from observed history (`contentPerformanceHistory`) and (b) a static `DEFAULT_TOPICS` const. Force-explore any arm with zero pulls before applying the UCB1 score; only run the UCB1 formula once every arm has at least one observation.

**Why:** A previous implementation seeded the arm map with a single topic, so the bandit had exactly one arm forever — no exploration, no convergence, the learning loop silently never improved topic selection. This is the kind of defect that passes all tests (it still returns *a* topic) but defeats the entire purpose of the system.

**How to apply:** Any bandit/explore-exploit selector here must derive its arm set from a durable candidate list, not from whatever happens to be in the history map at first call. If you add a new selection dimension (hour, format, platform), apply the same union-with-defaults + force-explore pattern.
