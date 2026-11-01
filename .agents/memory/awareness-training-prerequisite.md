---
name: Awareness-led use before training
description: User's intended relationship between awareness and checkpoint training.
---
The user says the model “technically doesn't have to be trained before using
thanks to how the awareness layers and awareness systems are set up.”

**Why:** This is the user's stated product design; a checkpoint vocabulary
failure alone must not be treated as proof that retraining is the only remedy.

**How to apply:** Trace the active awareness-to-generation path and distinguish
intended behavior from observed implementation. Investigate a routing or
conditioning mismatch before prescribing training. Do not claim an untrained
path works without evidence, or simply remove validation to make errors vanish.