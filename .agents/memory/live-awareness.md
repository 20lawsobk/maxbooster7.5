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

The user identifies Google Veo as the competitive target: "the final boss that you have to beat."

**Why:** The user clarified the intended level of ambition after basic capability improvements had already been discussed.

**How to apply:** Treat outperforming Veo as a target for MaxCore's own capabilities, not an achieved result. Operational health and passing tests are foundations; competitive claims require comparative evidence from actual generated output.

The user wants work considered many capability levels ahead, including what it takes to pass each level until the envisioned capability is achieved, rather than focusing only on the immediate next improvement.

**Why:** The user corrected an incremental-fix framing that did not explain the complete path to the competitive target.

**How to apply:** Work backward from that target, identify dependencies and measurable exit criteria across the full capability roadmap, and use it to prioritize implementation. A local repair is not completion of a capability level.

The user narrows the temporary target: "Google veo is a level 100 final boss I'd be okay with pausing at level 75 and calling it a temporary production grade readiness".

**Why:** The user accepts an intermediate production milestone before achieving the full competitive target.

**How to apply:** Prioritize a bounded, genuinely production-ready MaxCore capability set before Veo superiority. Treat level 75 as the user's milestone metaphor, not a measured percentage of Veo performance or permission to waive reliability and output-quality verification. The longer-term competitive target remains.

The user refines that intermediate target: "Think of a invideo level but with more focused range due to the awareness layers and awareness systems and awareness endpoints".

**Why:** The user defines the near-term ambition through a specialized video-production workflow rather than general-purpose Veo-level generation.

**How to apply:** Use an InVideo-style workflow as a product reference, with MaxCore's existing awareness architecture determining its focused range. Prioritize useful end-to-end video creation and verify that live awareness changes relevant production decisions. This is a target, not a claim of parity or authorization to replace MaxCore with InVideo.
