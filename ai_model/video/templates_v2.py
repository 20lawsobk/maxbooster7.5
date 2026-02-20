from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional
from .scenes import SceneConfig, TextElement

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_PATH_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


@dataclass
class CinematicTemplate:
    id: str
    name: str
    description: str
    transition: str = "fadeblack"
    transition_dur: float = 0.5
    color_grade: str = ""
    category: str = "general"

    def build_scenes(self, hook: str, body: str, cta: str, artist_name: str,
                     total_duration: float, width: int, height: int) -> List[SceneConfig]:
        raise NotImplementedError


class CinematicPromoTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="cinematic_promo", name="Cinematic Promo",
            description="Film-quality promotional video with dramatic lighting and smooth transitions",
            transition="fadeblack", transition_dur=0.6, color_grade="cinematic", category="promo"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.35
        body_dur = total_duration * 0.35
        cta_dur = total_duration * 0.30
        scenes = []
        intro = SceneConfig(
            duration=hook_dur, bg_type="radial",
            bg_color1="0x0a0a1a", bg_color2="0x1a0a2e",
            vignette=0.6, film_grain_amount=8, color_grade="cinematic",
            letterbox_ratio=0.08, corner_accent_color="0xe94560",
        )
        if artist_name:
            intro.texts.append(TextElement(
                text=artist_name.upper(), font=FONT_PATH, size=int(height * 0.03),
                color="0xe94560", x="(w-text_w)/2", y=f"{int(height * 0.08)}",
                start=0.2, fade_in=0.8, fade_out=0.4, animation="fade", max_chars=40
            ))
        if hook:
            intro.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.055),
                color="0xffffff", x="(w-text_w)/2", y="(h-text_h)*0.35",
                start=0.3, fade_in=0.8, fade_out=0.5, animation="slide_up",
                max_chars=int(width / (height * 0.055 * 0.55))
            ))
        scenes.append(intro)

        mid = SceneConfig(
            duration=body_dur, bg_type="animated_gradient",
            bg_color1="0x16213e", bg_color2="0x0f3460",
            vignette=0.4, film_grain_amount=6, color_grade="cinematic",
            letterbox_ratio=0.08, breathing=True,
        )
        if body:
            mid.texts.append(TextElement(
                text=body, font=FONT_PATH_REGULAR, size=int(height * 0.04),
                color="0xe8e8e8", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.3, fade_in=0.6, fade_out=0.5, animation="fade",
                max_chars=int(width / (height * 0.04 * 0.55))
            ))
        scenes.append(mid)

        outro = SceneConfig(
            duration=cta_dur, bg_type="radial",
            bg_color1="0x1a0a2e", bg_color2="0x0a0a1a",
            vignette=0.5, film_grain_amount=8, color_grade="cinematic",
            letterbox_ratio=0.08, border_color="0xe94560",
        )
        if cta:
            outro.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.05),
                color="0xffffff", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.2, fade_in=0.5, fade_out=0.3, animation="scale_in",
                max_chars=int(width / (height * 0.05 * 0.55))
            ))
        scenes.append(outro)
        return scenes


class NeonPulseTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="neon_pulse", name="Neon Pulse",
            description="Vibrant neon colors with pulsing energy and plasma backgrounds",
            transition="dissolve", transition_dur=0.4, color_grade="neon", category="energetic"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.35
        body_dur = total_duration * 0.35
        cta_dur = total_duration * 0.30
        scenes = []

        s1 = SceneConfig(
            duration=hook_dur, bg_type="plasma",
            bg_color1="0x0d0221", bg_color2="0x2a0845",
            vignette=0.5, color_grade="neon",
            corner_accent_color="0xff6ec7", breathing=True,
        )
        if artist_name:
            s1.texts.append(TextElement(
                text=artist_name, font=FONT_PATH, size=int(height * 0.028),
                color="0xff6ec7", x="(w-text_w)/2", y=f"{int(height * 0.06)}",
                start=0.1, fade_in=0.5, animation="fade", max_chars=40
            ))
        if hook:
            s1.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.06),
                color="0x00fff5", x="(w-text_w)/2", y="(h-text_h)*0.35",
                start=0.2, fade_in=0.6, fade_out=0.4, animation="scale_in",
                max_chars=int(width / (height * 0.06 * 0.55))
            ))
        scenes.append(s1)

        s2 = SceneConfig(
            duration=body_dur, bg_type="wave",
            bg_color1="0x2a0845", bg_color2="0x0d0221",
            vignette=0.3, color_grade="neon", breathing=True,
        )
        if body:
            s2.texts.append(TextElement(
                text=body, font=FONT_PATH_REGULAR, size=int(height * 0.042),
                color="0xffffff", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.2, fade_in=0.5, fade_out=0.4, animation="fade",
                max_chars=int(width / (height * 0.042 * 0.55))
            ))
        scenes.append(s2)

        s3 = SceneConfig(
            duration=cta_dur, bg_type="plasma",
            bg_color1="0x0d0221", bg_color2="0x4a0e5c",
            vignette=0.4, color_grade="neon", border_color="0xff6ec7",
        )
        if cta:
            s3.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.052),
                color="0x00fff5", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.2, fade_in=0.4, animation="slide_up",
                max_chars=int(width / (height * 0.052 * 0.55))
            ))
        scenes.append(s3)
        return scenes


class ElegantMinimalTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="elegant_minimal", name="Elegant Minimal",
            description="Clean, sophisticated design with subtle animations and warm tones",
            transition="fade", transition_dur=0.7, color_grade="warm", category="professional"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.4
        body_dur = total_duration * 0.35
        cta_dur = total_duration * 0.25
        scenes = []

        s1 = SceneConfig(
            duration=hook_dur, bg_type="gradient",
            bg_color1="0xf8f4f0", bg_color2="0xe8ddd0",
            vignette=0.2, color_grade="warm",
        )
        if artist_name:
            s1.texts.append(TextElement(
                text=artist_name.upper(), font=FONT_PATH, size=int(height * 0.022),
                color="0x8b7355", x="(w-text_w)/2", y=f"{int(height * 0.08)}",
                start=0.3, fade_in=0.8, animation="fade", max_chars=40, shadow=False,
            ))
        if hook:
            s1.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.05),
                color="0x2c2c2c", x="(w-text_w)/2", y="(h-text_h)*0.35",
                start=0.5, fade_in=1.0, fade_out=0.6, animation="fade",
                shadow=False, max_chars=int(width / (height * 0.05 * 0.55))
            ))
        scenes.append(s1)

        s2 = SceneConfig(
            duration=body_dur, bg_type="animated_gradient",
            bg_color1="0xe8ddd0", bg_color2="0xf0e6d8",
            vignette=0.15, color_grade="warm",
        )
        if body:
            s2.texts.append(TextElement(
                text=body, font=FONT_PATH_REGULAR, size=int(height * 0.038),
                color="0x3c3c3c", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.3, fade_in=0.7, fade_out=0.5, animation="fade",
                shadow=False, max_chars=int(width / (height * 0.038 * 0.55))
            ))
        scenes.append(s2)

        s3 = SceneConfig(
            duration=cta_dur, bg_type="gradient",
            bg_color1="0xf0e6d8", bg_color2="0xf8f4f0",
            vignette=0.2, color_grade="warm",
        )
        if cta:
            s3.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.045),
                color="0x8b5e3c", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.2, fade_in=0.6, animation="slide_up",
                shadow=False, max_chars=int(width / (height * 0.045 * 0.55))
            ))
        scenes.append(s3)
        return scenes


class DarkCinemaTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="dark_cinema", name="Dark Cinema",
            description="Moody, atmospheric film look with deep shadows and dramatic reveals",
            transition="fadeblack", transition_dur=0.8, color_grade="cinematic", category="dramatic"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.4
        body_dur = total_duration * 0.3
        cta_dur = total_duration * 0.3
        scenes = []

        s1 = SceneConfig(
            duration=hook_dur, bg_type="radial",
            bg_color1="0x000000", bg_color2="0x0a0a0a",
            vignette=0.8, film_grain_amount=12, color_grade="cinematic",
            letterbox_ratio=0.12,
        )
        if artist_name:
            s1.texts.append(TextElement(
                text=artist_name.upper(), font=FONT_PATH, size=int(height * 0.025),
                color="0x666666", x="(w-text_w)/2", y=f"{int(height * 0.15)}",
                start=0.5, fade_in=1.2, animation="fade", max_chars=40
            ))
        if hook:
            s1.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.055),
                color="0xf0f0f0", x="(w-text_w)/2", y="(h-text_h)*0.38",
                start=0.8, fade_in=1.0, fade_out=0.6, animation="fade",
                max_chars=int(width / (height * 0.055 * 0.55))
            ))
        scenes.append(s1)

        s2 = SceneConfig(
            duration=body_dur, bg_type="animated_gradient",
            bg_color1="0x0a0a0a", bg_color2="0x141414",
            vignette=0.6, film_grain_amount=10, color_grade="cinematic",
            letterbox_ratio=0.12, breathing=True,
        )
        if body:
            s2.texts.append(TextElement(
                text=body, font=FONT_PATH_REGULAR, size=int(height * 0.04),
                color="0xcccccc", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.3, fade_in=0.8, fade_out=0.5, animation="fade",
                max_chars=int(width / (height * 0.04 * 0.55))
            ))
        scenes.append(s2)

        s3 = SceneConfig(
            duration=cta_dur, bg_type="radial",
            bg_color1="0x0a0a0a", bg_color2="0x000000",
            vignette=0.7, film_grain_amount=10, color_grade="cinematic",
            letterbox_ratio=0.12,
        )
        if cta:
            s3.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.048),
                color="0xffd700", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.3, fade_in=0.6, animation="scale_in",
                max_chars=int(width / (height * 0.048 * 0.55))
            ))
        scenes.append(s3)
        return scenes


class AuroraTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="aurora", name="Aurora Borealis",
            description="Mesmerizing northern lights with flowing color waves",
            transition="dissolve", transition_dur=0.6, color_grade="cool", category="atmospheric"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.35
        body_dur = total_duration * 0.35
        cta_dur = total_duration * 0.30
        scenes = []

        s1 = SceneConfig(
            duration=hook_dur, bg_type="aurora",
            vignette=0.3, color_grade="cool",
            corner_accent_color="0x40e0d0",
        )
        if artist_name:
            s1.texts.append(TextElement(
                text=artist_name, font=FONT_PATH, size=int(height * 0.025),
                color="0x80ffdb", x="(w-text_w)/2", y=f"{int(height * 0.07)}",
                start=0.2, fade_in=0.6, animation="fade", max_chars=40
            ))
        if hook:
            s1.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.055),
                color="0xffffff", x="(w-text_w)/2", y="(h-text_h)*0.35",
                start=0.3, fade_in=0.7, fade_out=0.5, animation="slide_up",
                max_chars=int(width / (height * 0.055 * 0.55))
            ))
        scenes.append(s1)

        s2 = SceneConfig(
            duration=body_dur, bg_type="wave",
            bg_color1="0x0a1628", bg_color2="0x0d2137",
            vignette=0.25, color_grade="cool",
        )
        if body:
            s2.texts.append(TextElement(
                text=body, font=FONT_PATH_REGULAR, size=int(height * 0.04),
                color="0xe0e0e0", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.2, fade_in=0.5, fade_out=0.4, animation="fade",
                max_chars=int(width / (height * 0.04 * 0.55))
            ))
        scenes.append(s2)

        s3 = SceneConfig(
            duration=cta_dur, bg_type="aurora",
            vignette=0.3, color_grade="cool",
        )
        if cta:
            s3.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.05),
                color="0x80ffdb", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.2, fade_in=0.5, animation="fade",
                max_chars=int(width / (height * 0.05 * 0.55))
            ))
        scenes.append(s3)
        return scenes


class VintageFilmTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="vintage_film", name="Vintage Film",
            description="Retro 8mm film aesthetic with warm grain and soft focus",
            transition="fadewhite", transition_dur=0.5, color_grade="vintage", category="retro"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.35
        body_dur = total_duration * 0.35
        cta_dur = total_duration * 0.30
        scenes = []

        s1 = SceneConfig(
            duration=hook_dur, bg_type="animated_gradient",
            bg_color1="0x3d2b1f", bg_color2="0x5c4033",
            vignette=0.7, film_grain_amount=20, color_grade="vintage",
        )
        if artist_name:
            s1.texts.append(TextElement(
                text=artist_name, font=FONT_PATH, size=int(height * 0.028),
                color="0xd4a574", x="(w-text_w)/2", y=f"{int(height * 0.08)}",
                start=0.2, fade_in=0.6, animation="fade", max_chars=40
            ))
        if hook:
            s1.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.05),
                color="0xfff8e7", x="(w-text_w)/2", y="(h-text_h)*0.35",
                start=0.4, fade_in=0.8, fade_out=0.5, animation="fade",
                max_chars=int(width / (height * 0.05 * 0.55))
            ))
        scenes.append(s1)

        s2 = SceneConfig(
            duration=body_dur, bg_type="gradient",
            bg_color1="0x5c4033", bg_color2="0x4a3728",
            vignette=0.6, film_grain_amount=18, color_grade="vintage",
        )
        if body:
            s2.texts.append(TextElement(
                text=body, font=FONT_PATH_REGULAR, size=int(height * 0.038),
                color="0xf0e0c8", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.3, fade_in=0.6, fade_out=0.5, animation="fade",
                max_chars=int(width / (height * 0.038 * 0.55))
            ))
        scenes.append(s2)

        s3 = SceneConfig(
            duration=cta_dur, bg_type="animated_gradient",
            bg_color1="0x4a3728", bg_color2="0x3d2b1f",
            vignette=0.7, film_grain_amount=20, color_grade="vintage",
        )
        if cta:
            s3.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.045),
                color="0xffd700", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.2, fade_in=0.5, animation="fade",
                max_chars=int(width / (height * 0.045 * 0.55))
            ))
        scenes.append(s3)
        return scenes


class MusicVideoTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="music_video", name="Music Video",
            description="High-energy music video style with bold colors and dynamic transitions",
            transition="wipeleft", transition_dur=0.3, color_grade="neon", category="music"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.3
        body_dur = total_duration * 0.4
        cta_dur = total_duration * 0.3
        scenes = []

        s1 = SceneConfig(
            duration=hook_dur, bg_type="plasma",
            bg_color1="0x1a0033", bg_color2="0x4a0080",
            vignette=0.3, color_grade="neon",
            border_color="0xff00ff", breathing=True,
        )
        if artist_name:
            s1.texts.append(TextElement(
                text=artist_name.upper(), font=FONT_PATH, size=int(height * 0.035),
                color="0xff00ff", x="(w-text_w)/2", y=f"{int(height * 0.06)}",
                start=0.1, fade_in=0.3, animation="scale_in", max_chars=40
            ))
        if hook:
            s1.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.065),
                color="0xffffff", x="(w-text_w)/2", y="(h-text_h)*0.35",
                start=0.2, fade_in=0.4, fade_out=0.3, animation="scale_in",
                max_chars=int(width / (height * 0.065 * 0.55))
            ))
        scenes.append(s1)

        s2 = SceneConfig(
            duration=body_dur, bg_type="wave",
            bg_color1="0x4a0080", bg_color2="0x0033aa",
            vignette=0.2, color_grade="neon", breathing=True,
        )
        if body:
            s2.texts.append(TextElement(
                text=body, font=FONT_PATH, size=int(height * 0.045),
                color="0x00ffff", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.1, fade_in=0.3, fade_out=0.3, animation="slide_up",
                max_chars=int(width / (height * 0.045 * 0.55))
            ))
        scenes.append(s2)

        s3 = SceneConfig(
            duration=cta_dur, bg_type="plasma",
            bg_color1="0x0033aa", bg_color2="0x1a0033",
            vignette=0.3, color_grade="neon",
            border_color="0x00ffff",
        )
        if cta:
            s3.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.055),
                color="0xff00ff", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.15, fade_in=0.3, animation="scale_in",
                max_chars=int(width / (height * 0.055 * 0.55))
            ))
        scenes.append(s3)
        return scenes


class GoldLuxuryTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="gold_luxury", name="Gold Luxury",
            description="Premium gold and black aesthetic for high-end branding",
            transition="fadeblack", transition_dur=0.7, color_grade="warm", category="luxury"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.35
        body_dur = total_duration * 0.35
        cta_dur = total_duration * 0.30
        scenes = []

        s1 = SceneConfig(
            duration=hook_dur, bg_type="radial",
            bg_color1="0x1a1a0a", bg_color2="0x0a0a00",
            vignette=0.5, film_grain_amount=5, color_grade="warm",
            corner_accent_color="0xd4af37", border_color="0xd4af37",
        )
        if artist_name:
            s1.texts.append(TextElement(
                text=artist_name.upper(), font=FONT_PATH, size=int(height * 0.025),
                color="0xd4af37", x="(w-text_w)/2", y=f"{int(height * 0.09)}",
                start=0.3, fade_in=0.8, animation="fade", max_chars=40
            ))
        if hook:
            s1.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.052),
                color="0xffd700", x="(w-text_w)/2", y="(h-text_h)*0.35",
                start=0.5, fade_in=0.8, fade_out=0.5, animation="fade",
                max_chars=int(width / (height * 0.052 * 0.55))
            ))
        scenes.append(s1)

        s2 = SceneConfig(
            duration=body_dur, bg_type="animated_gradient",
            bg_color1="0x0a0a00", bg_color2="0x1a1408",
            vignette=0.4, film_grain_amount=4, color_grade="warm",
        )
        if body:
            s2.texts.append(TextElement(
                text=body, font=FONT_PATH_REGULAR, size=int(height * 0.038),
                color="0xe8dcc8", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.3, fade_in=0.6, fade_out=0.5, animation="fade",
                max_chars=int(width / (height * 0.038 * 0.55))
            ))
        scenes.append(s2)

        s3 = SceneConfig(
            duration=cta_dur, bg_type="radial",
            bg_color1="0x1a1408", bg_color2="0x0a0a00",
            vignette=0.5, film_grain_amount=5, color_grade="warm",
            border_color="0xd4af37",
        )
        if cta:
            s3.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.048),
                color="0xffd700", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.2, fade_in=0.5, animation="slide_up",
                max_chars=int(width / (height * 0.048 * 0.55))
            ))
        scenes.append(s3)
        return scenes


class OceanWaveTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="ocean_wave", name="Ocean Wave",
            description="Calming ocean-inspired gradients with flowing wave animations",
            transition="smoothleft", transition_dur=0.6, color_grade="cool", category="calm"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.35
        body_dur = total_duration * 0.35
        cta_dur = total_duration * 0.30
        scenes = []

        s1 = SceneConfig(
            duration=hook_dur, bg_type="wave",
            bg_color1="0x006994", bg_color2="0x001f3f",
            vignette=0.3, color_grade="cool",
        )
        if artist_name:
            s1.texts.append(TextElement(
                text=artist_name, font=FONT_PATH, size=int(height * 0.025),
                color="0x7fdbff", x="(w-text_w)/2", y=f"{int(height * 0.07)}",
                start=0.2, fade_in=0.6, animation="fade", max_chars=40
            ))
        if hook:
            s1.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.05),
                color="0xffffff", x="(w-text_w)/2", y="(h-text_h)*0.35",
                start=0.3, fade_in=0.7, fade_out=0.5, animation="slide_up",
                max_chars=int(width / (height * 0.05 * 0.55))
            ))
        scenes.append(s1)

        s2 = SceneConfig(
            duration=body_dur, bg_type="wave",
            bg_color1="0x001f3f", bg_color2="0x004466",
            vignette=0.2, color_grade="cool", breathing=True,
        )
        if body:
            s2.texts.append(TextElement(
                text=body, font=FONT_PATH_REGULAR, size=int(height * 0.04),
                color="0xe0f0ff", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.2, fade_in=0.6, fade_out=0.5, animation="fade",
                max_chars=int(width / (height * 0.04 * 0.55))
            ))
        scenes.append(s2)

        s3 = SceneConfig(
            duration=cta_dur, bg_type="wave",
            bg_color1="0x004466", bg_color2="0x006994",
            vignette=0.3, color_grade="cool",
        )
        if cta:
            s3.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.048),
                color="0x7fdbff", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.2, fade_in=0.5, animation="fade",
                max_chars=int(width / (height * 0.048 * 0.55))
            ))
        scenes.append(s3)
        return scenes


class FireEmberTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="fire_ember", name="Fire & Ember",
            description="Intense warm tones with fire-like animated backgrounds",
            transition="fadeblack", transition_dur=0.4, color_grade="warm", category="intense"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.35
        body_dur = total_duration * 0.35
        cta_dur = total_duration * 0.30
        scenes = []

        s1 = SceneConfig(
            duration=hook_dur, bg_type="plasma",
            bg_color1="0x8b0000", bg_color2="0xff4500",
            vignette=0.5, film_grain_amount=6, color_grade="warm",
            breathing=True,
        )
        if artist_name:
            s1.texts.append(TextElement(
                text=artist_name.upper(), font=FONT_PATH, size=int(height * 0.03),
                color="0xff6600", x="(w-text_w)/2", y=f"{int(height * 0.07)}",
                start=0.2, fade_in=0.5, animation="fade", max_chars=40
            ))
        if hook:
            s1.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.055),
                color="0xffffff", x="(w-text_w)/2", y="(h-text_h)*0.35",
                start=0.3, fade_in=0.5, fade_out=0.4, animation="scale_in",
                max_chars=int(width / (height * 0.055 * 0.55))
            ))
        scenes.append(s1)

        s2 = SceneConfig(
            duration=body_dur, bg_type="wave",
            bg_color1="0xff4500", bg_color2="0x8b0000",
            vignette=0.4, film_grain_amount=5, color_grade="warm",
        )
        if body:
            s2.texts.append(TextElement(
                text=body, font=FONT_PATH_REGULAR, size=int(height * 0.04),
                color="0xfff0e0", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.2, fade_in=0.5, fade_out=0.4, animation="fade",
                max_chars=int(width / (height * 0.04 * 0.55))
            ))
        scenes.append(s2)

        s3 = SceneConfig(
            duration=cta_dur, bg_type="plasma",
            bg_color1="0x8b0000", bg_color2="0xcc3300",
            vignette=0.5, film_grain_amount=6, color_grade="warm",
        )
        if cta:
            s3.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.05),
                color="0xffd700", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.2, fade_in=0.4, animation="slide_up",
                max_chars=int(width / (height * 0.05 * 0.55))
            ))
        scenes.append(s3)
        return scenes


class StorytellerTemplate(CinematicTemplate):
    def __init__(self):
        super().__init__(
            id="storyteller", name="Storyteller",
            description="Narrative-driven format with chapter-like scene progression",
            transition="wiperight", transition_dur=0.5, color_grade="cinematic", category="narrative"
        )

    def build_scenes(self, hook, body, cta, artist_name, total_duration, width, height):
        hook_dur = total_duration * 0.35
        body_dur = total_duration * 0.4
        cta_dur = total_duration * 0.25
        scenes = []

        s1 = SceneConfig(
            duration=hook_dur, bg_type="animated_gradient",
            bg_color1="0x1a1a2e", bg_color2="0x2d2d44",
            vignette=0.5, film_grain_amount=8, color_grade="cinematic",
            letterbox_ratio=0.1,
        )
        if artist_name:
            s1.texts.append(TextElement(
                text=f"presents", font=FONT_PATH_REGULAR, size=int(height * 0.02),
                color="0x888888", x="(w-text_w)/2", y=f"{int(height * 0.14)}",
                start=0.3, fade_in=0.8, animation="fade", max_chars=40, shadow=False,
            ))
            s1.texts.append(TextElement(
                text=artist_name, font=FONT_PATH, size=int(height * 0.03),
                color="0xc0c0c0", x="(w-text_w)/2", y=f"{int(height * 0.11)}",
                start=0.2, fade_in=0.8, animation="fade", max_chars=40
            ))
        if hook:
            s1.texts.append(TextElement(
                text=hook, font=FONT_PATH, size=int(height * 0.05),
                color="0xffffff", x="(w-text_w)/2", y="(h-text_h)*0.38",
                start=0.6, fade_in=0.8, fade_out=0.5, animation="fade",
                max_chars=int(width / (height * 0.05 * 0.55))
            ))
        scenes.append(s1)

        s2 = SceneConfig(
            duration=body_dur, bg_type="animated_gradient",
            bg_color1="0x2d2d44", bg_color2="0x1a1a2e",
            vignette=0.4, film_grain_amount=6, color_grade="cinematic",
            letterbox_ratio=0.1,
        )
        if body:
            s2.texts.append(TextElement(
                text=body, font=FONT_PATH_REGULAR, size=int(height * 0.038),
                color="0xd8d8d8", x="(w-text_w)/2", y="(h-text_h)/2",
                start=0.3, fade_in=0.6, fade_out=0.5, animation="fade",
                max_chars=int(width / (height * 0.038 * 0.55))
            ))
        scenes.append(s2)

        s3 = SceneConfig(
            duration=cta_dur, bg_type="radial",
            bg_color1="0x1a1a2e", bg_color2="0x0f0f1a",
            vignette=0.6, film_grain_amount=8, color_grade="cinematic",
            letterbox_ratio=0.1,
        )
        if cta:
            s3.texts.append(TextElement(
                text=cta, font=FONT_PATH, size=int(height * 0.045),
                color="0xffd700", x="(w-text_w)/2", y="(h-text_h)*0.4",
                start=0.2, fade_in=0.5, animation="slide_up",
                max_chars=int(width / (height * 0.045 * 0.55))
            ))
        scenes.append(s3)
        return scenes


CINEMATIC_TEMPLATES: dict[str, CinematicTemplate] = {
    "cinematic_promo": CinematicPromoTemplate(),
    "neon_pulse": NeonPulseTemplate(),
    "elegant_minimal": ElegantMinimalTemplate(),
    "dark_cinema": DarkCinemaTemplate(),
    "aurora": AuroraTemplate(),
    "vintage_film": VintageFilmTemplate(),
    "music_video": MusicVideoTemplate(),
    "gold_luxury": GoldLuxuryTemplate(),
    "ocean_wave": OceanWaveTemplate(),
    "fire_ember": FireEmberTemplate(),
    "storyteller": StorytellerTemplate(),
}


def get_template_list():
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "category": t.category,
            "transition": t.transition,
            "color_grade": t.color_grade,
        }
        for t in CINEMATIC_TEMPLATES.values()
    ]
