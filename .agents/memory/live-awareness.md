---
name: Live-awareness scope
description: User clarification about live sources versus pretrained model requirements.
---

The user states: "the live awareness endpoints don't need already trained data because they use live data from the already configured data sources aka the social media landscape".

The user further states: "the whole maxcore server uses only the live awareness endpoints which channel live publically accessable data into each section". Treat this as the intended input architecture, not as permission to fabricate training provenance or claim unverified generation capability.

**Why:** The user corrected an explanation that conflated awareness readiness with trained-model generation readiness.

**How to apply:** Configure and verify the existing live-awareness endpoints against their configured live sources. Do not require a pretrained checkpoint, separate offline dataset, or Git LFS asset to declare awareness ready. Evaluate model-generation requirements independently, without changing the awareness behavior or replacing live signals with mocks. Identify automatic-learning failures as failures of that separate path, not as missing public-feed configuration.
