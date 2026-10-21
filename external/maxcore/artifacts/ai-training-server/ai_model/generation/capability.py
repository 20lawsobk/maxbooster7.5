"""Observed serving capability, separate from public-source/privacy certification.

These bounded synthetic requests are executable interface checks, not training
corpora, human review, signatures, or evidence of general model quality.
"""


import math
import os
import time
from ai_model.model.inference_budget import inference_deadline, check_inference_budget

CAPABILITY_POLICY = "agent-text-capability-v1"


def capability_budget_seconds():
    value = float(os.environ.get("MAXCORE_CAPABILITY_PROBE_SECONDS", "30"))
    if not math.isfinite(value) or not 1 <= value <= 120:
        raise ValueError("Capability probe budget must be 1..120 seconds")
    return value


def verify_text_capability(adapter):
    from ai_model.agents.script_agent import ScriptAgent, ScriptRequest
    from .plan import GenerationPlan, active_plan
    # Use the actual agent and its unchanged readability/safety/CTA guards.
    # No scanner network call or supplied prose can substitute for model output.
    cases = (
        ScriptRequest(idea="Announce a new independent music single", platform="instagram",
                      goal="engagement", tone="energetic"),
        ScriptRequest(idea="Invite listeners to a live music performance", platform="tiktok",
                      goal="engagement", tone="friendly"),
    )
    deadline = time.monotonic() + capability_budget_seconds()
    inherited_deadline = inference_deadline.get()
    if inherited_deadline is not None:
        deadline = min(deadline, inherited_deadline)
    deadline_token = inference_deadline.set(deadline)
    try:
        return _verify_cases(adapter, cases)
    finally:
        inference_deadline.reset(deadline_token)


def _verify_cases(adapter, cases):
    from ai_model.agents.script_agent import ScriptAgent
    from .plan import GenerationPlan, active_plan
    for index, request in enumerate(cases):
        plan = GenerationPlan.from_request({**vars(request), "seed": 1729 + index}, "text")
        token = active_plan.set(plan)
        try:
            check_inference_budget()
            result = ScriptAgent(adapter).run(request)
            check_inference_budget()
            if result.source != "ai_model" or not all(
                    isinstance(value, str) and value.strip()
                    for value in (result.hook, result.body, result.cta)):
                raise ValueError("Agent did not return checkpoint-generated script sections")
        except Exception as exc:
            raise ValueError("Public live candidate failed operational text generation probe") from exc
        finally:
            active_plan.reset(token)
    return {"policy": CAPABILITY_POLICY, "passed": True, "cases": len(cases),
            "general_quality": "not_evaluated"}
