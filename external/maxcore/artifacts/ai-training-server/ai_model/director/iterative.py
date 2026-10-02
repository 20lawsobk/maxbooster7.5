"""Iterative critic loop — the critic's failures mutate the brief.

This is the production-grade version: not "pick best of N" but
"diagnose failure → adjust inputs → regenerate". Each iteration
targets the specific failed dimensions.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Callable, Any

from .critic import Critic, CritiqueReport


class IterativeLoop:
    """Runs generate → critique → mutate → regenerate until pass or limit."""

    def __init__(self, critic: Optional[Critic] = None, max_iterations: int = 5):
        self.critic = critic or Critic()
        self.max_iterations = max_iterations

    def run(
        self,
        generate_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
        critique_fn: Callable[[Dict[str, Any]], CritiqueReport],
        mutate_fn: Callable[[Dict[str, Any], List], Dict[str, Any]],
        initial_params: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute the loop.

        generate_fn: takes params, returns output dict
        critique_fn: takes output, returns CritiqueReport
        mutate_fn: takes (params, failures) returns new params
        initial_params: starting generation parameters
        """
        params = dict(initial_params)
        best = None
        best_score = -1
        history = []

        for i in range(self.max_iterations):
            try:
                output = generate_fn(params)
            except Exception as e:
                # Generation failed — record and try with simplified params.
                history.append({"iteration": i, "error": str(e)})
                # Strip optional params and retry once.
                params = {k: v for k, v in params.items()
                          if k in ("topic", "artist", "platform")}
                try:
                    output = generate_fn(params)
                except Exception as e2:
                    history.append({"iteration": i, "fatal": str(e2)})
                    break

            report = critique_fn(output)
            score = sum(c.score for c in report.critiques) / max(1, len(report.critiques))

            history.append({
                "iteration": i,
                "score": round(score, 3),
                "passed": report.passed(),
                "failures": [c.dimension for c in report.failures()],
            })

            if score > best_score:
                best_score = score
                best = dict(output)
                best["critique_report"] = report
                best["iteration"] = i

            if report.passed():
                break

            # Mutate params based on failures for next iteration.
            failures = report.failures()
            if not failures:
                break
            params = mutate_fn(params, failures)

        if best is None:
            # Total failure — return error dict, never raise.
            return {"error": "generation failed", "history": history}

        best["loop_history"] = history
        best["final_score"] = round(best_score, 3)
        return best


def mutate_social_params(
    params: Dict[str, Any],
    failures,
) -> Dict[str, Any]:
    """Adjust social generation params based on critic failures.

    Every mutation maps to a real compose_caption input:
    - keywords -> brief themes (authoritative in build_brief)
    - force_cta -> agent_cta (first candidate in _cta_candidates)
    """
    params = dict(params)
    failed_dims = {f.dimension for f in failures}

    # Keywords flow through build_brief(themes=[...]) — verified authoritative.
    keywords = list(params.get("keywords", []))

    if "emotional_arc" in failed_dims:
        # Force tension + resolution vocabulary into themes.
        keywords.extend(["3am", "struggle", "finally", "survived"])
    if "cta" in failed_dims:
        # agent_cta becomes the FIRST CTA candidate — guaranteed consideration.
        # Pick platform-native one-tap verbs per the algorithm research.
        from .social_director import SocialDirector
        params["force_cta"] = SocialDirector._platform_cta(
            params.get("platform", "instagram"))
    if "engagement" in failed_dims:
        keywords.extend(["fire", "obsessed", "you"])
    if "specificity" in failed_dims:
        # Concrete details flow through themes into body candidates.
        keywords.extend(["midnight", "studio", "3am", "2026"])

    # Deduplicate while preserving order.
    seen = set()
    params["keywords"] = [k for k in keywords if not (k in seen or seen.add(k))]

    return params
