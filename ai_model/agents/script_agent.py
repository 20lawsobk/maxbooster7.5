from __future__ import annotations
from dataclasses import dataclass
from ..model.creative_model import CreativeModel

PLATFORM_HOOKS = {
    "tiktok": "Stop scrolling - you need to hear this",
    "instagram": "This is what you've been waiting for",
    "youtube": "In this video, I'm going to show you something incredible",
    "facebook": "I've got something special to share today",
    "twitter": "Thread time",
    "linkedin": "Here's a lesson from my music career",
    "google_business": "Exciting update from the studio",
    "threads": "Let me tell you about this",
}

PLATFORM_CTAS = {
    "tiktok": "Follow for more content like this! Link in bio",
    "instagram": "Double tap if you feel this! Save for later",
    "youtube": "Like and subscribe for more! Hit the bell",
    "facebook": "Share this with someone who needs to hear it",
    "twitter": "RT if you agree. Drop a reply with your take",
    "linkedin": "What are your thoughts? Comment below",
    "google_business": "Visit us today and experience it yourself",
    "threads": "Repost if this hits different",
}


@dataclass
class ScriptRequest:
    idea: str
    platform: str
    goal: str
    tone: str


@dataclass
class ScriptResponse:
    hook: str
    body: str
    cta: str


class ScriptAgent:
    def __init__(self, model: CreativeModel):
        self.model = model

    def run(self, req: ScriptRequest) -> ScriptResponse:
        platform_token = f"<PLATFORM_{req.platform.upper()}>"
        goal_token = f"<GOAL_{req.goal.upper()}>"
        tone_token = f"<TONE_{req.tone.upper()}>"

        prompt = (
            f"{platform_token} {goal_token} {tone_token} "
            f"<STAGE_HOOK>\nIdea: {req.idea}\n"
            f"<STAGE_BODY>\n"
            f"<STAGE_CTA>\n"
        )

        try:
            output = self.model.generate(prompt)
            parts = output.split("<STAGE_")
            hook = parts[0].strip()
            body = ""
            cta = ""
            for p in parts[1:]:
                if p.startswith("BODY>"):
                    body = p.replace("BODY>", "").strip()
                elif p.startswith("CTA>"):
                    cta = p.replace("CTA>", "").strip()

            if self._is_meaningful(hook) and self._is_meaningful(body):
                return ScriptResponse(hook=hook, body=body, cta=cta)
        except Exception:
            pass

        return self._fallback(req)

    def _is_meaningful(self, text: str) -> bool:
        if not text or len(text) < 5:
            return False
        control_count = sum(1 for w in text.split() if w.startswith("<") and w.endswith(">"))
        total = len(text.split())
        if total == 0:
            return False
        return control_count / total < 0.5

    def _fallback(self, req: ScriptRequest) -> ScriptResponse:
        platform = req.platform.lower().replace(" ", "_")
        hook = PLATFORM_HOOKS.get(platform, "Check this out")
        cta = PLATFORM_CTAS.get(platform, "Let me know what you think!")

        body = req.idea
        if req.tone == "energetic":
            body = f"{req.idea} - and it's going to blow your mind!"
        elif req.tone == "professional":
            body = f"I'm excited to present: {req.idea}"
        elif req.tone == "casual":
            body = f"So about {req.idea}... yeah, it's that good"
        elif req.tone == "promotional":
            body = f"Introducing: {req.idea} - available now!"

        return ScriptResponse(hook=hook, body=body, cta=cta)
