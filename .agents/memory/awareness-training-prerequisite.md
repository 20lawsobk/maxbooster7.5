---
name: Awareness-led use before training
description: User's intended relationship between awareness and checkpoint training.
---
The owner clarifies that MaxCore's awareness endpoints are intended to function
as the live model before a separately trained model is ready, and using those
endpoints is intended to train the model in the process. The model therefore
does not need a completed checkpoint before the awareness-based capability can
be used.

**Why:** This is the owner's stated product design. A missing serving checkpoint
must not be treated as proof that live awareness is unusable or that awareness
use is disconnected from learning.

**How to apply:** Trace the active awareness-to-generation path and distinguish
the live awareness capability, observation-driven training, and certified
checkpoint serving states. Investigate whether use actually contributes
eligible observations and optimizer updates; do not assume every endpoint
request trains weights. Do not claim the intended path works without evidence,
or remove validation to make errors vanish.