from __future__ import annotations
import math
from typing import Optional


def _hex_to_rgb(hex_color: str) -> tuple:
    h = hex_color.replace("0x", "").replace("#", "")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def animated_gradient_bg(w: int, h: int, dur: float, color1: str, color2: str, fps: int = 30) -> str:
    r1, g1, b1 = _hex_to_rgb(color1)
    r2, g2, b2 = _hex_to_rgb(color2)
    return (
        f"geq=r='clip({r1}+(({r2}-{r1})*((Y+T*80)/{h}))\\,0\\,255)'"
        f":g='clip({g1}+(({g2}-{g1})*((Y+T*80)/{h}))\\,0\\,255)'"
        f":b='clip({b1}+(({b2}-{b1})*((Y+T*80)/{h}))\\,0\\,255)'"
    )


def radial_gradient_bg(w: int, h: int, color1: str, color2: str) -> str:
    r1, g1, b1 = _hex_to_rgb(color1)
    r2, g2, b2 = _hex_to_rgb(color2)
    cx, cy = w // 2, h // 2
    max_dist = math.sqrt(cx * cx + cy * cy)
    return (
        f"geq=r='clip({r1}+({r2}-{r1})*hypot(X-{cx}\\,Y-{cy})/{max_dist:.0f}\\,0\\,255)'"
        f":g='clip({g1}+({g2}-{g1})*hypot(X-{cx}\\,Y-{cy})/{max_dist:.0f}\\,0\\,255)'"
        f":b='clip({b1}+({b2}-{b1})*hypot(X-{cx}\\,Y-{cy})/{max_dist:.0f}\\,0\\,255)'"
    )


def wave_gradient_bg(w: int, h: int, color1: str, color2: str) -> str:
    r1, g1, b1 = _hex_to_rgb(color1)
    r2, g2, b2 = _hex_to_rgb(color2)
    return (
        f"geq=r='clip({r1}+({r2}-{r1})*(0.5+0.5*sin(Y/{h}*6.28+T*2+X/{w}*3.14))\\,0\\,255)'"
        f":g='clip({g1}+({g2}-{g1})*(0.5+0.5*sin(Y/{h}*6.28+T*2.5+X/{w}*3.14))\\,0\\,255)'"
        f":b='clip({b1}+({b2}-{b1})*(0.5+0.5*sin(Y/{h}*6.28+T*3+X/{w}*3.14))\\,0\\,255)'"
    )


def plasma_bg(w: int, h: int, color1: str, color2: str) -> str:
    r1, g1, b1 = _hex_to_rgb(color1)
    r2, g2, b2 = _hex_to_rgb(color2)
    return (
        f"geq=r='clip({r1}+({r2}-{r1})*(0.5+0.25*sin(X/40+T*2)+0.25*cos(Y/30+T*1.5))\\,0\\,255)'"
        f":g='clip({g1}+({g2}-{g1})*(0.5+0.25*cos(X/35+T*1.7)+0.25*sin(Y/45+T*2.2))\\,0\\,255)'"
        f":b='clip({b1}+({b2}-{b1})*(0.5+0.25*sin((X+Y)/50+T*1.3)+0.25*cos(X/25-T*1.8))\\,0\\,255)'"
    )


def aurora_bg(w: int, h: int) -> str:
    return (
        f"geq=r='clip(10+20*sin(X/100+T*0.5)+15*cos(Y/80+T*0.3)\\,0\\,255)'"
        f":g='clip(30+60*sin(Y/{h}*3.14+T*0.7)*cos(X/200+T*0.4)+40*sin(X/150+T*0.6)\\,0\\,255)'"
        f":b='clip(60+80*sin(Y/{h}*3.14+T*0.5)*sin(X/120+T*0.8)+50*cos(Y/100+T*0.9)\\,0\\,255)'"
    )


def vignette_filter(intensity: float = 0.4) -> str:
    angle = max(0.1, min(1.0, intensity))
    return f"vignette=angle={angle}*PI/4"


def film_grain(amount: int = 15) -> str:
    amt = max(1, min(50, amount))
    return f"noise=alls={amt}:allf=t"


def color_grade_cinematic() -> str:
    return "curves=r='0/0 0.2/0.15 0.5/0.45 0.8/0.78 1/0.95':g='0/0 0.2/0.18 0.5/0.48 0.8/0.82 1/1':b='0/0.05 0.2/0.22 0.5/0.55 0.8/0.8 1/0.9'"


def color_grade_warm() -> str:
    return "colorbalance=rs=0.1:gs=0.05:bs=-0.1:rm=0.08:gm=0.03:bm=-0.05"


def color_grade_cool() -> str:
    return "colorbalance=rs=-0.1:gs=-0.02:bs=0.15:rm=-0.05:gm=0.02:bm=0.1"


def color_grade_neon() -> str:
    return "eq=saturation=1.6:contrast=1.2:brightness=0.02"


def color_grade_vintage() -> str:
    return "curves=r='0/0.05 0.3/0.28 0.7/0.72 1/0.9':g='0/0.02 0.3/0.25 0.7/0.65 1/0.85':b='0/0.1 0.3/0.22 0.7/0.55 1/0.75'"


def glow_effect(radius: int = 20, strength: float = 0.3) -> str:
    return f"split[main][glow];[glow]gblur=sigma={radius},eq=brightness=0.1[glowed];[main][glowed]blend=all_mode=screen:all_opacity={strength}"


def zoom_pulse(speed: float = 0.02) -> str:
    return f"zoompan=z='1+{speed}*sin(2*PI*on/90)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={{w}}x{{h}}:fps=30"


def slow_zoom_in(start: float = 1.0, end: float = 1.15, dur: float = 8.0) -> str:
    frames = int(dur * 30)
    step = (end - start) / frames
    return f"zoompan=z='min({end}\\,{start}+on*{step:.6f})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={{w}}x{{h}}:fps=30"


def slow_pan_down(amount: float = 0.1) -> str:
    return f"zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y='min(ih*{amount}\\,on*2)':d=1:s={{w}}x{{h}}:fps=30"


def text_glow(fontfile: str, text: str, color: str, size: int, x: str, y: str, glow_color: str = "0xffffff", enable: str = "") -> str:
    enable_str = f":enable='{enable}'" if enable else ""
    parts = []
    for offset in [(-2, -2), (2, -2), (-2, 2), (2, 2), (0, -3), (0, 3), (-3, 0), (3, 0)]:
        gx = f"({x})+{offset[0]}" if isinstance(x, str) and not x.isdigit() else f"{x}+{offset[0]}" if isinstance(x, str) else str(int(x) + offset[0])
        gy = f"({y})+{offset[1]}" if isinstance(y, str) and not y.isdigit() else f"{y}+{offset[1]}" if isinstance(y, str) else str(int(y) + offset[1])
        parts.append(
            f"drawtext=fontfile={fontfile}:text='{text}':fontcolor={glow_color}@0.3:fontsize={size}:x={gx}:y={gy}{enable_str}"
        )
    parts.append(
        f"drawtext=fontfile={fontfile}:text='{text}':fontcolor={color}:fontsize={size}:x={x}:y={y}{enable_str}"
    )
    return ",".join(parts)


def animated_border(w: int, h: int, color: str, thickness: int = 4) -> str:
    return (
        f"drawbox=x=0:y=0:w={w}:h={thickness}:color={color}@0.8:t=fill,"
        f"drawbox=x=0:y={h - thickness}:w={w}:h={thickness}:color={color}@0.8:t=fill,"
        f"drawbox=x=0:y=0:w={thickness}:h={h}:color={color}@0.8:t=fill,"
        f"drawbox=x={w - thickness}:y=0:w={thickness}:h={h}:color={color}@0.8:t=fill"
    )


def corner_accents(w: int, h: int, color: str, size: int = 60, thickness: int = 3) -> str:
    parts = []
    parts.append(f"drawbox=x=20:y=20:w={size}:h={thickness}:color={color}@0.7:t=fill")
    parts.append(f"drawbox=x=20:y=20:w={thickness}:h={size}:color={color}@0.7:t=fill")
    parts.append(f"drawbox=x={w - 20 - size}:y=20:w={size}:h={thickness}:color={color}@0.7:t=fill")
    parts.append(f"drawbox=x={w - 20 - thickness}:y=20:w={thickness}:h={size}:color={color}@0.7:t=fill")
    parts.append(f"drawbox=x=20:y={h - 20 - thickness}:w={size}:h={thickness}:color={color}@0.7:t=fill")
    parts.append(f"drawbox=x=20:y={h - 20 - size}:w={thickness}:h={size}:color={color}@0.7:t=fill")
    parts.append(f"drawbox=x={w - 20 - size}:y={h - 20 - thickness}:w={size}:h={thickness}:color={color}@0.7:t=fill")
    parts.append(f"drawbox=x={w - 20 - thickness}:y={h - 20 - size}:w={thickness}:h={size}:color={color}@0.7:t=fill")
    return ",".join(parts)


def scan_line_overlay(h: int, spacing: int = 4, opacity: float = 0.08) -> str:
    return f"geq=lum='lum(X\\,Y)*(1-{opacity}*(1-mod(Y\\,{spacing})/({spacing}-1)))':cb='cb(X\\,Y)':cr='cr(X\\,Y)'"


def breathing_brightness(speed: float = 1.0, amount: float = 0.03) -> str:
    return f"eq=brightness='{amount}*sin(2*PI*{speed}*t)'"


def letterbox(w: int, h: int, bar_ratio: float = 0.12) -> str:
    bar_h = int(h * bar_ratio)
    return (
        f"drawbox=x=0:y=0:w={w}:h={bar_h}:color=black@0.85:t=fill,"
        f"drawbox=x=0:y={h - bar_h}:w={w}:h={bar_h}:color=black@0.85:t=fill"
    )


def progress_bar(w: int, h: int, color: str, height: int = 4) -> str:
    y = h - height - 2
    return (
        f"drawbox=x=0:y={y}:w={w}:h={height}:color=0x333333@0.5:t=fill,"
        f"drawbox=x=0:y={y}:w='t/duration*{w}':h={height}:color={color}@0.8:t=fill"
    )


XFADE_TRANSITIONS = [
    "fade", "fadeblack", "fadewhite", "wipeleft", "wiperight",
    "wipeup", "wipedown", "slideleft", "slideright", "slideup",
    "slidedown", "smoothleft", "smoothright", "smoothup", "smoothdown",
    "circlecrop", "circleopen", "circleclose", "dissolve",
    "pixelize", "diagtl", "diagtr", "diagbl", "diagbr",
    "hlslice", "hrslice", "vuslice", "vdslice",
    "hblur", "radial", "zoomin",
]
