---
name: Live-awareness scope
description: User clarification about live sources versus pretrained model requirements.
---

The user states: "the live awareness endpoints don't need already trained data because they use live data from the already configured data sources aka the social media landscape".

The user further states: "the whole maxcore server uses only the live awareness endpoints which channel live publically accessable data into each section". Treat this as the intended input architecture, not as permission to fabricate training provenance or claim unverified generation capability.

**Why:** The user corrected an explanation that conflated awareness readiness with trained-model generation readiness.

**How to apply:** Configure and verify the existing live-awareness endpoints against their configured live sources. Do not require a pretrained checkpoint, separate offline dataset, or Git LFS asset to declare awareness ready. Evaluate model-generation requirements independently, without changing the awareness behavior or replacing live signals with mocks. Identify automatic-learning failures as failures of that separate path, not as missing public-feed configuration.

The user says the public-source learning setup was already configured, and emphasizes that the model was designed and configured to produce its output from that live data.

**Why:** The user corrected proposals to introduce a new learning policy before tracing the existing configuration.

**How to apply:** Locate the existing policy and follow its configuration through collection, admission, training, and serving. Do not treat a blocked stage as proof that the entire learning setup is absent or ask the user to configure it again without that investigation. Do not infer a design limitation from a failing newly trained candidate; first compare the intended configuration, imported implementation, actual selected model, and retained learning state.

The user clarifies: "You don't have to replace it to enhance it to a new level."

**Why:** The user wants enhancement of the existing MaxCore design, not a choice between replacing it and leaving its capabilities unchanged.

**How to apply:** Improve the existing live-data learning and generation system, measuring actual output quality. Preserving the architecture does not mean freezing its implementation or capacity.
