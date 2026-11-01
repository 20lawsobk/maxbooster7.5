"""Iterative critic loop — the critic's failures mutate the brief.

This is the production-grade version: not "pick best of N" but
"diagnose failure → adjust inputs → regenerate". Each iteration
targets the specific failed dimensions.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Callable, Any

from .critic import Critic, CritiqueReport


class IterativeLoop:
    """Runs generate → critique → mutate → regenerate until pass or limit.

    The critic is the selector: all candidates across all iterations are
    kept, and the highest critic-scoring one wins. Mutations create real
    diversity (not just keyword stuffing) so the loop can actually improve.
    """

    def __init__(self, critic: Optional[Critic] = None, max_iterations: int = 5):
        self.critic = critic or Critic()
        self.max_iterations = max_iterations

    def run(
        self,
        generate_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
        critique_fn: Callable[[Dict[str, Any]], CritiqueReport],
        mutate_fn: Callable[[Dict[str, Any], List, int], Dict[str, Any]],
        initial_params: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute the loop.

        generate_fn: takes params, returns output dict
        critique_fn: takes output, returns CritiqueReport
        mutate_fn: takes (params, failures, iteration) returns new params.
            The iteration index lets mutations create real diversity —
            e.g. rotation through different theme sets and CTA styles.
        initial_params: starting generation parameters
        """
        params = dict(initial_params)
        candidates = []  # (critic_score, output, report)
        history = []

        for i in range(self.max_iterations):
            try:
                output = generate_fn(params)
            except Exception as e:
                history.append({"iteration": i, "error": str(e)})
                params = {k: v for k, v in params.items()
                          if k in ("topic", "artist", "platform")}
                try:
                    output = generate_fn(params)
                except Exception as e2:
                    history.append({"iteration": i, "fatal": str(e2)})
                    break

            report = critique_fn(output)
            score = sum(c.score for c in report.critiques) / max(1, len(report.critiques))
            candidates.append((score, dict(output), report))

            history.append({
                "iteration": i,
                "score": round(score, 3),
                "passed": report.passed(),
                "failures": [c.dimension for c in report.failures()],
            })

            if report.passed():
                break

            failures = report.failures()
            if not failures:
                break
            # Pass iteration index so mutations diversify, not just accumulate.
            params = mutate_fn(params, failures, i)

        if not candidates:
            return {"error": "generation failed", "history": history}

        # Critic is the selector: best critic score across ALL iterations wins.
        candidates.sort(key=lambda c: c[0], reverse=True)
        best_score, best, best_report = candidates[0]

        best["critique_report"] = best_report
        best["loop_history"] = history
        best["final_score"] = round(best_score, 3)
        best["candidates_considered"] = len(candidates)
        return best


def mutate_social_params(
    params: Dict[str, Any],
    failures,
    iteration: int = 0,
) -> Dict[str, Any]:
    """Adjust social generation params based on critic failures.

    Every mutation maps to a real compose_caption input:
    - keywords -> brief themes (authoritative in build_brief)
    - force_cta -> agent_cta (first candidate in _cta_candidates)

    The iteration index rotates through genuinely different strategies
    so each round explores new territory instead of re-running the same
    generation with slightly more keywords.
    """
    params = dict(params)
    failed_dims = {f.dimension for f in failures}

    # Strategy rotation: each iteration tries a different creative angle.
    # This is what makes the loop converge instead of spinning.
    strategies = [
        {"angle": "tension", "keywords": ["3am", "struggle", "scrapped", "doubt"]},
        {"angle": "payoff", "keywords": ["finally", "survived", "arrived", "out now"]},
        {"angle": "identity", "keywords": ["you", "your", "real ones", "for you"]},
        {"angle": "arousal", "keywords": ["fire", "insane", "obsessed", "unreal"]},
        {"angle": "concrete", "keywords": ["midnight", "studio", "3am", "2026"]},
    ]
    strategy = strategies[iteration % len(strategies)]

    keywords = list(strategy["keywords"])

    # Layer failure-specific prescriptions on top of the rotation.
    if "emotional_arc" in failed_dims and strategy["angle"] not in ("tension", "payoff"):
        keywords += ["3am", "finally"]
    if "engagement" in failed_dims and strategy["angle"] not in ("identity", "arousal"):
        keywords += ["fire", "you"]

    if "cta" in failed_dims:
        # agent_cta becomes the FIRST CTA candidate — guaranteed consideration.
        from .social_director import SocialDirector
        params["force_cta"] = SocialDirector._platform_cta(
            params.get("platform", "instagram"))

    # Deduplicate while preserving order.
    seen = set()
    params["keywords"] = [k for k in keywords if not (k in seen or seen.add(k))]
    params["strategy"] = strategy["angle"]

    return params
