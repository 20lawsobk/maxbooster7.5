---
name: Live-awareness scope
description: User clarification about live sources versus pretrained model requirements.
---

The user states: "the live awareness endpoints don't need already trained data because they use live data from the already configured data sources aka the social media landscape".

**Why:** The user corrected an explanation that conflated awareness readiness with trained-model generation readiness.

**How to apply:** Configure and verify the existing live-awareness endpoints against their configured live sources. Do not require a pretrained checkpoint or Git LFS asset to declare awareness ready. Evaluate model-generation requirements independently, without changing the awareness behavior or replacing live signals with mocks.
