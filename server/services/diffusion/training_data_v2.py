"""
Training data v2 — Rich synthetic scene generator.

62 visual templates across 12 scene categories, all PIL-based.
Renders at 256×256 then downscales for clean, anti-aliased training frames.
No external APIs or downloads required — fully in-house.
"""

import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance


RNG = random.Random()


def _rng_seed(scene: str, idx: int):
    RNG.seed(hash((scene, idx)) & 0xFFFF_FFFF)


def _canvas(size: int = 256):
    return Image.new('RGB', (size, size), (0, 0, 0))


def _draw(img):
    return ImageDraw.Draw(img)


def _jitter(val, lo=0.85, hi=1.15):
    return val * RNG.uniform(lo, hi)


def _randcol(r, g, b, spread=30):
    return (
        max(0, min(255, int(r + RNG.randint(-spread, spread)))),
        max(0, min(255, int(g + RNG.randint(-spread, spread)))),
        max(0, min(255, int(b + RNG.randint(-spread, spread)))),
    )


def _gradient_bg(img, top_col, bot_col):
    d = _draw(img)
    W, H = img.size
    for y in range(H):
        t = y / H
        r = int(top_col[0] * (1 - t) + bot_col[0] * t)
        g = int(top_col[1] * (1 - t) + bot_col[1] * t)
        b = int(top_col[2] * (1 - t) + bot_col[2] * t)
        d.line([(0, y), (W, y)], fill=(r, g, b))
    return img


def _radial_gradient(img, cx, cy, inner_col, outer_col, radius=None):
    W, H = img.size
    if radius is None:
        radius = max(W, H) * 0.7
    arr = np.array(img).astype(np.float32)
    Y, X = np.mgrid[0:H, 0:W]
    dist = np.sqrt((X - cx)**2 + (Y - cy)**2)
    t = np.clip(dist / radius, 0, 1)
    for c, (ic, oc) in enumerate(zip(inner_col, outer_col)):
        arr[:, :, c] = np.clip(arr[:, :, c] + ic * (1 - t) + oc * t, 0, 255)
    img.paste(Image.fromarray(arr.astype(np.uint8)), (0, 0))
    return img


def _bokeh_circles(d, W, H, cols, n=15):
    for _ in range(n):
        x = RNG.randint(-20, W + 20)
        y = RNG.randint(-20, H + 20)
        r = RNG.randint(4, 30)
        col = RNG.choice(cols)
        alpha = RNG.randint(40, 140)
        overlay = Image.new('RGBA', d.im.size, (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.ellipse([x - r, y - r, x + r, y + r], fill=col + (alpha,))


def _spotlight_cone(img, tip_x, tip_y, angle_deg, spread_deg, length, col):
    d = _draw(img)
    W, H = img.size
    angle = math.radians(angle_deg)
    spread = math.radians(spread_deg / 2)
    a1 = angle - spread
    a2 = angle + spread
    px1 = int(tip_x + math.cos(a1) * length)
    py1 = int(tip_y + math.sin(a1) * length)
    px2 = int(tip_x + math.cos(a2) * length)
    py2 = int(tip_y + math.sin(a2) * length)
    d.polygon([(tip_x, tip_y), (px1, py1), (px2, py2)], fill=col)


def _vanishing_floor(img, vx, vy, col1, col2, n_lines=8):
    d = _draw(img)
    W, H = img.size
    for i in range(n_lines):
        t = i / n_lines
        x = int(t * W)
        d.line([(vx, vy), (x, H)], fill=col1, width=max(1, int((1 - t) * 2)))
    for j in range(n_lines):
        t = j / n_lines
        y = int(vy + (H - vy) * t)
        alpha = int(80 * (1 - t))
        d.line([(0, y), (W, y)], fill=col2, width=1)


def _building_silhouette(d, W, H, col, n=12):
    for i in range(n):
        bx = int(i / n * W) - RNG.randint(0, 10)
        bw = RNG.randint(15, 35)
        bh = RNG.randint(40, 160)
        by = H - bh
        d.rectangle([bx, by, bx + bw, H], fill=col)
        for wy in range(by + 5, H - 10, RNG.randint(8, 16)):
            for wx in range(bx + 3, bx + bw - 3, RNG.randint(6, 12)):
                if RNG.random() > 0.35:
                    wc = (RNG.randint(200, 255), RNG.randint(200, 220), RNG.randint(140, 200))
                    d.rectangle([wx, wy, wx + 3, wy + 5], fill=wc)


def _rain_streaks(d, W, H, n=80, col=(150, 170, 200)):
    for _ in range(n):
        x = RNG.randint(0, W)
        y = RNG.randint(0, H)
        length = RNG.randint(8, 25)
        angle = RNG.uniform(80, 100)
        ex = int(x + math.cos(math.radians(angle)) * length)
        ey = int(y + math.sin(math.radians(angle)) * length)
        d.line([(x, y), (ex, ey)], fill=col, width=1)


def _crowd_silhouette_row(d, W, H, row_y, n=25, col=(20, 10, 30), height_range=(20, 50)):
    for i in range(n):
        cx = int((i + 0.5 + RNG.uniform(-0.3, 0.3)) * W / n)
        ch = RNG.randint(*height_range)
        hw = RNG.randint(8, 16)
        d.ellipse([cx - hw // 2, row_y - ch, cx + hw // 2, row_y - ch + hw], fill=col)
        d.rectangle([cx - hw // 3, row_y - ch + hw - 2, cx + hw // 3, row_y], fill=col)


def _neon_sign_rect(d, x, y, w, h, col, text_col=(255, 255, 255), thickness=3):
    for i in range(thickness):
        d.rectangle([x + i, y + i, x + w - i, y + h - i], outline=col)


def _glow_overlay(img, cx, cy, col, radius=60, alpha=80):
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for r in range(radius, 0, -8):
        a = int(alpha * (1 - r / radius))
        od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (a,))
    img_rgba = img.convert('RGBA')
    img_rgba = Image.alpha_composite(img_rgba, overlay)
    return img_rgba.convert('RGB')


def _horizontal_bars(d, W, H, col_dark, col_light, n=6):
    bh = H // n
    for i in range(n):
        col = col_light if i % 2 == 0 else col_dark
        d.rectangle([0, i * bh, W, (i + 1) * bh], fill=col)


def _noise_texture(img, strength=15):
    arr = np.array(img).astype(np.int16)
    noise = np.random.randint(-strength, strength + 1, arr.shape, dtype=np.int16)
    return Image.fromarray(np.clip(arr + noise, 0, 255).astype(np.uint8))


def _vignette(img, strength=0.6):
    W, H = img.size
    Y, X = np.mgrid[0:H, 0:W]
    cx, cy = W / 2, H / 2
    dist = np.sqrt(((X - cx) / cx)**2 + ((Y - cy) / cy)**2)
    mask = np.clip(1 - dist * strength, 0, 1)
    arr = np.array(img).astype(np.float32)
    arr *= mask[:, :, np.newaxis]
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8))


def _downscale(img, res):
    return img.resize((res, res), Image.LANCZOS)


# ══════════════════════════════════════════════════════════════════════════════
# CONCERT STAGE  (6 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _concert_perspective_stage(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(5, 0, 15), _randcol(25, 5, 40))
    d = _draw(img)
    vx, vy = 128, RNG.randint(70, 110)
    stage_col = _randcol(80, 20, 100)
    _vanishing_floor(img, vx, vy, _randcol(100, 30, 120), _randcol(60, 15, 80))
    d.rectangle([0, vy - 8, 256, vy + 8], fill=_randcol(200, 100, 220))
    for i in range(RNG.randint(3, 6)):
        sx = 30 + i * 35 + RNG.randint(-10, 10)
        col = (RNG.randint(180, 255), RNG.randint(180, 255), RNG.randint(100, 255))
        _spotlight_cone(img, sx, vy + 4, 100, RNG.randint(12, 22), 180, col + (60,))
    performer_x = vx + RNG.randint(-20, 20)
    performer_y = vy + 15
    d.ellipse([performer_x - 8, performer_y - 10, performer_x + 8, performer_y], fill=(220, 200, 180))
    d.rectangle([performer_x - 6, performer_y, performer_x + 6, performer_y + 20], fill=(30, 20, 40))
    _crowd_silhouette_row(d, 256, 256, 256, n=18, col=_randcol(15, 8, 20), height_range=(25, 55))
    return _vignette(_noise_texture(img))


def _concert_crowd_energy(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(10, 0, 30), _randcol(40, 10, 60))
    d = _draw(img)
    _crowd_silhouette_row(d, 256, 256, 220, n=20, col=_randcol(15, 5, 25), height_range=(30, 60))
    _crowd_silhouette_row(d, 256, 256, 185, n=18, col=_randcol(12, 3, 20), height_range=(25, 50))
    _crowd_silhouette_row(d, 256, 256, 155, n=16, col=_randcol(10, 2, 18), height_range=(20, 40))
    colors = [(255, 80, 60), (80, 120, 255), (255, 220, 60), (60, 255, 180)]
    for i in range(5):
        cx = RNG.randint(30, 220)
        col = RNG.choice(colors)
        for r in [50, 35, 20, 10]:
            a = int(30 * r / 50)
            img = _glow_overlay(img, cx, 100, col, radius=r, alpha=a)
    d = _draw(img)
    d.rectangle([80, 90, 175, 145], fill=_randcol(200, 100, 220))
    return _vignette(_noise_texture(img))


def _concert_arena_aerial(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(5, 2, 15), _randcol(20, 8, 35))
    d = _draw(img)
    cx, cy = 128, 128
    for r in range(120, 10, -15):
        col = _randcol(30, 10, 50)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=2)
    for i in range(16):
        angle = i * math.pi / 8
        x = int(cx + math.cos(angle) * 40)
        y = int(cy + math.sin(angle) * 40)
        col = (RNG.randint(180, 255), RNG.randint(100, 255), RNG.randint(50, 255))
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=col)
    d.ellipse([115, 115, 141, 141], fill=_randcol(220, 200, 240))
    return _vignette(_noise_texture(img))


def _concert_led_wall(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(0, 0, 5), _randcol(10, 0, 20))
    d = _draw(img)
    tile_w, tile_h = RNG.randint(20, 40), RNG.randint(15, 30)
    for gy in range(0, 160, tile_h):
        for gx in range(0, 256, tile_w):
            col = (RNG.randint(20, 255), RNG.randint(20, 255), RNG.randint(20, 255))
            d.rectangle([gx + 2, gy + 2, gx + tile_w - 2, gy + tile_h - 2], fill=col)
    d.rectangle([0, 155, 256, 180], fill=_randcol(60, 20, 80))
    _crowd_silhouette_row(d, 256, 256, 256, n=20, col=_randcol(10, 4, 18), height_range=(20, 45))
    return _vignette(_noise_texture(img))


def _concert_laser_show(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(0, 0, 8), _randcol(8, 0, 20))
    d = _draw(img)
    laser_cols = [(255, 30, 80), (30, 255, 80), (80, 30, 255), (255, 255, 30), (30, 255, 255)]
    for _ in range(12):
        col = RNG.choice(laser_cols)
        sx = RNG.randint(0, 256)
        d.line([(sx, 256), (RNG.randint(60, 190), RNG.randint(60, 130))], fill=col, width=2)
    for _ in range(8):
        col = RNG.choice(laser_cols)
        d.line([(RNG.randint(0, 256), 0), (RNG.randint(60, 190), RNG.randint(60, 180))],
               fill=col, width=1)
    _crowd_silhouette_row(d, 256, 256, 256, n=22, col=(5, 2, 10), height_range=(25, 55))
    return _vignette(_noise_texture(img))


def _concert_confetti(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(10, 5, 25), _randcol(30, 10, 50))
    d = _draw(img)
    cols = [(255, 80, 80), (80, 200, 255), (255, 230, 60), (180, 60, 255), (60, 255, 160)]
    for _ in range(80):
        cx = RNG.randint(0, 256)
        cy = RNG.randint(0, 200)
        col = RNG.choice(cols)
        size = RNG.randint(3, 10)
        d.ellipse([cx - size // 2, cy - size // 2, cx + size // 2, cy + size // 2], fill=col)
    d.rectangle([70, 105, 185, 165], fill=_randcol(180, 80, 200))
    _crowd_silhouette_row(d, 256, 256, 256, n=20, col=_randcol(12, 5, 20), height_range=(25, 50))
    return _vignette(_noise_texture(img))


# ══════════════════════════════════════════════════════════════════════════════
# CITY NIGHTS  (6 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _city_skyline_reflection(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(5, 8, 30), _randcol(15, 20, 60))
    d = _draw(img)
    _building_silhouette(d, 256, 130, _randcol(15, 15, 25))
    d.rectangle([0, 128, 256, 256], fill=_randcol(8, 12, 35))
    for _ in range(40):
        wy = RNG.randint(20, 125)
        wx = RNG.randint(0, 256)
        wc = (RNG.randint(180, 255), RNG.randint(180, 220), RNG.randint(120, 200))
        d.ellipse([wx - 2, 256 - wy + RNG.randint(-3, 3), wx + 2, 256 - wy + 8 + RNG.randint(-3, 3)],
                  fill=wc)
    _rain_streaks(d, 256, 256, n=60)
    return _vignette(_noise_texture(img))


def _city_street_bokeh(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(3, 5, 20), _randcol(10, 15, 45))
    d = _draw(img)
    vx = 128 + RNG.randint(-20, 20)
    vy = 110 + RNG.randint(-10, 10)
    _vanishing_floor(img, vx, vy, _randcol(40, 40, 60), _randcol(25, 25, 45))
    _building_silhouette(d, 256, vy + 20, _randcol(12, 12, 22))
    bokeh_cols = [(255, 200, 80), (255, 160, 60), (200, 220, 255), (255, 100, 80), (80, 200, 255)]
    for _ in range(20):
        cx = RNG.randint(10, 245)
        cy = RNG.randint(10, vy + 30)
        r = RNG.randint(5, 22)
        col = RNG.choice(bokeh_cols)
        overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (RNG.randint(40, 100),))
        img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
    _rain_streaks(_draw(img), 256, 256, n=50)
    return _vignette(_noise_texture(img))


def _city_rain_window(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(5, 8, 25), _randcol(15, 20, 55))
    d = _draw(img)
    _building_silhouette(d, 256, 200, _randcol(8, 10, 22))
    for _ in range(30):
        cx = RNG.randint(10, 245)
        cy = RNG.randint(10, 240)
        col = (RNG.randint(150, 230), RNG.randint(160, 210), RNG.randint(190, 255))
        r = RNG.randint(3, 12)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=1)
        tail_len = RNG.randint(5, 25)
        d.line([(cx, cy + r), (cx + RNG.randint(-3, 3), cy + r + tail_len)], fill=col, width=1)
    img = img.filter(ImageFilter.GaussianBlur(2))
    d = _draw(img)
    for _ in range(60):
        x = RNG.randint(0, 256)
        y = RNG.randint(0, 256)
        length = RNG.randint(3, 12)
        d.line([(x, y), (x + RNG.randint(-2, 2), y + length)],
               fill=(180, 190, 220), width=1)
    return _vignette(img)


def _city_aerial_grid(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(3, 5, 18), _randcol(8, 12, 35))
    d = _draw(img)
    block_w = RNG.randint(20, 40)
    block_h = RNG.randint(15, 30)
    for gy in range(0, 256, block_h):
        for gx in range(0, 256, block_w):
            base = RNG.randint(10, 35)
            d.rectangle([gx + 1, gy + 1, gx + block_w - 1, gy + block_h - 1],
                        fill=(base, base, base + 15))
            if RNG.random() > 0.4:
                wc = (RNG.randint(150, 255), RNG.randint(150, 220), RNG.randint(100, 200))
                wx = gx + RNG.randint(2, block_w - 4)
                wy = gy + RNG.randint(2, block_h - 4)
                d.rectangle([wx, wy, wx + 3, wy + 4], fill=wc)
    for angle in range(0, 360, 45):
        r = RNG.randint(30, 80)
        cx = 128 + int(math.cos(math.radians(angle)) * r)
        cy = 128 + int(math.sin(math.radians(angle)) * r)
        col = (RNG.randint(200, 255), RNG.randint(150, 220), RNG.randint(60, 180))
        d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=col)
    return _vignette(_noise_texture(img))


def _city_bridge_night(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(3, 5, 20), _randcol(10, 15, 45))
    d = _draw(img)
    d.rectangle([0, 185, 256, 256], fill=_randcol(6, 10, 28))
    anchor_y = RNG.randint(30, 60)
    for bx in [60, 195]:
        d.rectangle([bx - 8, anchor_y, bx + 8, 190], fill=_randcol(30, 30, 50))
        for cy in range(anchor_y, 185, 8):
            d.line([(bx, cy), (128, 180)], fill=_randcol(60, 60, 90), width=1)
    d.rectangle([0, 180, 256, 195], fill=_randcol(40, 40, 65))
    for _ in range(15):
        lx = RNG.randint(0, 256)
        col = (RNG.randint(200, 255), RNG.randint(180, 230), RNG.randint(100, 200))
        y0a = 190 + RNG.randint(-3, 3)
        d.ellipse([lx - 4, y0a, lx + 4, y0a + 6], fill=col)
        y0b = 210 + RNG.randint(-5, 5)
        d.ellipse([lx - 3, y0b, lx + 3, y0b + 8],
                  fill=(col[0] // 2, col[1] // 2, col[2] // 2))
    _building_silhouette(d, 256, 185, _randcol(8, 10, 22))
    return _vignette(_noise_texture(img))


def _city_traffic_blur(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(5, 5, 15), _randcol(15, 15, 40))
    d = _draw(img)
    vx, vy = 128 + RNG.randint(-20, 20), 100 + RNG.randint(-15, 15)
    _vanishing_floor(img, vx, vy, _randcol(35, 35, 55), _randcol(20, 20, 38))
    for _ in range(18):
        lx = RNG.randint(30, 225)
        ly_start = RNG.randint(vy + 20, 220)
        length = RNG.randint(20, 60)
        col = RNG.choice([(255, 230, 180), (255, 100, 100), (180, 200, 255)])
        d.line([(lx, ly_start), (int(vx + (lx - vx) * 0.3), vy + 20)], fill=col, width=2)
    img = img.filter(ImageFilter.GaussianBlur(1))
    return _vignette(img)


# ══════════════════════════════════════════════════════════════════════════════
# STUDIO SESSION  (6 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _studio_console_perspective(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(15, 10, 5), _randcol(40, 28, 12))
    d = _draw(img)
    vx, vy = 128, 90
    _vanishing_floor(img, vx, vy, _randcol(60, 40, 15), _randcol(40, 28, 10))
    d.rectangle([20, 140, 235, 200], fill=_randcol(30, 22, 10))
    for i in range(20):
        fx = 25 + i * 10
        fh = RNG.randint(8, 30)
        fy = 170 - fh
        col = (RNG.randint(80, 160), RNG.randint(80, 160), RNG.randint(80, 200))
        d.rectangle([fx, fy, fx + 6, 170], fill=col)
    d.rectangle([40, 95, 215, 145], fill=_randcol(20, 15, 8))
    for iy in range(3):
        for ix in range(8):
            vc = (RNG.randint(20, 255), RNG.randint(20, 255), RNG.randint(20, 255))
            d.rectangle([45 + ix * 22, 100 + iy * 14, 60 + ix * 22, 112 + iy * 14], fill=vc)
    for _ in range(8):
        kx = RNG.randint(30, 220)
        ky = RNG.randint(200, 245)
        d.ellipse([kx - 4, ky - 4, kx + 4, ky + 4], fill=_randcol(80, 60, 30))
    return _vignette(_noise_texture(img))


def _studio_vu_meters(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(8, 6, 3), _randcol(25, 18, 8))
    d = _draw(img)
    for i in range(8):
        mx = 15 + i * 30
        level = RNG.randint(40, 220)
        for j in range(0, level, 12):
            t = j / 220.0
            if t < 0.6:
                col = (30, int(180 * (1 - t) + 60 * t), 30)
            elif t < 0.85:
                col = (int(180 * (t - 0.6) / 0.25 + 60), 180, 30)
            else:
                col = (220, 60, 30)
            d.rectangle([mx, 240 - j - 8, mx + 18, 240 - j], fill=col)
    d.rectangle([0, 15, 256, 80], fill=_randcol(12, 10, 5))
    wf_pts = [(0, 48)]
    for wx in range(1, 256):
        wy = 48 + int(math.sin(wx * 0.2) * 25 * math.sin(wx * 0.05))
        wf_pts.append((wx, wy))
    wf_pts.append((255, 48))
    d.polygon(wf_pts, fill=_randcol(40, 120, 80))
    return _vignette(_noise_texture(img))


def _studio_mic_booth(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(20, 14, 6), _randcol(50, 35, 15))
    d = _draw(img)
    for gy in range(0, 256, 20):
        for gx in range(0, 256, 20):
            shade = RNG.randint(0, 15)
            d.rectangle([gx, gy, gx + 19, gy + 19],
                        fill=_randcol(60 + shade, 45 + shade, 20 + shade))
    d.ellipse([98, 60, 158, 130], outline=_randcol(180, 150, 80), width=3)
    d.rectangle([121, 125, 135, 200], fill=_randcol(120, 100, 50))
    d.rectangle([90, 195, 166, 205], fill=_randcol(100, 80, 40))
    for y in range(68, 122, 6):
        d.line([(100, y), (156, y)], fill=_randcol(120, 100, 50), width=1)
    img = _glow_overlay(img, 128, 95, (255, 230, 150), radius=50, alpha=40)
    return _vignette(_noise_texture(img))


def _studio_monitor_speakers(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(10, 7, 4), _randcol(28, 20, 10))
    d = _draw(img)
    for sx in [40, 165]:
        d.rectangle([sx, 50, sx + 50, 160], fill=_randcol(25, 18, 8))
        d.ellipse([sx + 10, 65, sx + 40, 105], fill=_randcol(50, 45, 35))
        d.ellipse([sx + 18, 75, sx + 32, 95], fill=_randcol(100, 90, 70))
        d.ellipse([sx + 13, 110, sx + 37, 130], fill=_randcol(40, 35, 25))
        d.ellipse([sx + 5, 140, sx + 45, 155], fill=(30, int(200 * RNG.random()), 30))
    d.rectangle([50, 170, 205, 215], fill=_randcol(20, 14, 6))
    wf_pts = []
    for wx in range(55, 200):
        wy = 192 + int(math.sin(wx * 0.25) * 15 * math.exp(-abs(wx - 127) / 60))
        wf_pts.append((wx, wy))
    d.line(wf_pts, fill=_randcol(80, 200, 120), width=2)
    return _vignette(_noise_texture(img))


def _studio_producer_setup(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(5, 5, 12), _randcol(15, 12, 30))
    d = _draw(img)
    d.rectangle([40, 90, 216, 160], fill=_randcol(12, 10, 20))
    d.rectangle([50, 95, 206, 155], fill=_randcol(8, 120, 80))
    wf_pts = []
    for wx in range(55, 201):
        wy = 125 + int(math.sin(wx * 0.3) * 20 * RNG.random())
        wf_pts.append((wx, wy))
    d.line(wf_pts, fill=(60, 255, 120), width=2)
    d.rectangle([40, 160, 216, 185], fill=_randcol(20, 15, 8))
    for i in range(16):
        kx = 45 + i * 11
        d.rectangle([kx, 162, kx + 8, 183], fill=(230, 225, 210))
        if i % 12 in [1, 3, 6, 8, 10]:
            d.rectangle([kx + 2, 162, kx + 7, 174], fill=(20, 18, 15))
    d.rectangle([55, 185, 200, 200], fill=_randcol(15, 12, 8))
    for i in range(10):
        px = 60 + i * 14
        d.ellipse([px - 4, 189, px + 4, 197], fill=_randcol(60, 50, 30))
    return _vignette(_noise_texture(img))


def _studio_vinyl_record(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(25, 18, 8), _randcol(50, 35, 15))
    d = _draw(img)
    for r in range(110, 10, -4):
        shade = int(r / 110 * 40)
        d.ellipse([128 - r, 128 - r, 128 + r, 128 + r],
                  outline=(shade, shade, shade + 5), width=1)
    d.ellipse([68, 68, 188, 188], fill=(10, 8, 5))
    d.ellipse([88, 88, 168, 168], fill=_randcol(150, 60, 30))
    d.ellipse([108, 108, 148, 148], fill=(10, 8, 5))
    d.ellipse([122, 122, 134, 134], fill=(200, 180, 150))
    img = _glow_overlay(img, 128, 128, (255, 160, 80), radius=80, alpha=25)
    return _vignette(_noise_texture(img))


# ══════════════════════════════════════════════════════════════════════════════
# GOLDEN HOUR  (5 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _golden_sunset_landscape(seed=0):
    RNG.seed(seed)
    img = _canvas()
    sky_top = _randcol(20, 10, 60)
    sky_mid = _randcol(230, 120, 30)
    sky_bot = _randcol(250, 180, 60)
    d = _draw(img)
    for y in range(200):
        t = y / 200.0
        if t < 0.5:
            r = int(sky_top[0] * (1 - t * 2) + sky_mid[0] * t * 2)
            g = int(sky_top[1] * (1 - t * 2) + sky_mid[1] * t * 2)
            b = int(sky_top[2] * (1 - t * 2) + sky_mid[2] * t * 2)
        else:
            r = int(sky_mid[0] * (1 - (t - 0.5) * 2) + sky_bot[0] * (t - 0.5) * 2)
            g = int(sky_mid[1] * (1 - (t - 0.5) * 2) + sky_bot[1] * (t - 0.5) * 2)
            b = int(sky_mid[2] * (1 - (t - 0.5) * 2) + sky_bot[2] * (t - 0.5) * 2)
        d.line([(0, y), (256, y)], fill=(r, g, b))
    sun_x = RNG.randint(80, 176)
    d.ellipse([sun_x - 18, 82, sun_x + 18, 118], fill=_randcol(255, 220, 100))
    for r in [30, 45, 60]:
        img = _glow_overlay(img, sun_x, 100, (255, 220, 80), radius=r, alpha=20)
    d = _draw(img)
    horizon_y = RNG.randint(190, 210)
    d.rectangle([0, horizon_y, 256, 256], fill=_randcol(15, 25, 10))
    for i in range(12):
        tx = RNG.randint(0, 255)
        th = RNG.randint(20, 60)
        d.line([(tx, horizon_y), (tx, horizon_y - th)], fill=_randcol(10, 20, 8), width=3)
        d.ellipse([tx - 10, horizon_y - th - 8, tx + 10, horizon_y - th + 4],
                  fill=_randcol(12, 22, 9))
    return _vignette(_noise_texture(img))


def _golden_sun_rays(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(200, 120, 30), _randcol(255, 200, 80))
    d = _draw(img)
    cx, cy = 128, RNG.randint(80, 140)
    for angle in range(0, 360, RNG.randint(8, 18)):
        length = RNG.randint(100, 200)
        ex = int(cx + math.cos(math.radians(angle)) * length)
        ey = int(cy + math.sin(math.radians(angle)) * length)
        col = (255, RNG.randint(200, 240), RNG.randint(60, 120))
        d.line([(cx, cy), (ex, ey)], fill=col, width=RNG.randint(1, 4))
    d.ellipse([cx - 25, cy - 25, cx + 25, cy + 25], fill=_randcol(255, 240, 180))
    horizon_y = RNG.randint(200, 230)
    d.rectangle([0, horizon_y, 256, 256], fill=_randcol(20, 35, 12))
    return _vignette(_noise_texture(img))


def _golden_ocean_sunset(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for y in range(140):
        t = y / 140.0
        r = int(40 * (1 - t) + 255 * t)
        g = int(10 * (1 - t) + 160 * t)
        b = int(80 * (1 - t) + 30 * t)
        _draw(img).line([(0, y), (256, y)], fill=(r, g, b))
    d = _draw(img)
    d.rectangle([0, 138, 256, 256], fill=_randcol(15, 40, 80))
    for wy in range(145, 256, 8):
        wave_pts = []
        for wx in range(0, 256, 4):
            wy2 = wy + int(math.sin(wx * 0.15 + wy * 0.05) * 4)
            wave_pts.append((wx, wy2))
        d.line(wave_pts, fill=_randcol(40, 80, 120), width=1)
    d.rectangle([120, 130, 136, 256], fill=_randcol(255, 200, 80))
    sun_x = 128
    d.ellipse([sun_x - 20, 70, sun_x + 20, 110], fill=_randcol(255, 210, 80))
    return _vignette(_noise_texture(img))


def _golden_misty_forest(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(180, 140, 60), _randcol(250, 200, 100))
    d = _draw(img)
    for i in range(18):
        tx = RNG.randint(-10, 265)
        th = RNG.randint(80, 200)
        tw = RNG.randint(3, 12)
        d.rectangle([tx, 256 - th, tx + tw, 256], fill=_randcol(30, 40, 15))
        d.ellipse([tx - 15, 256 - th - 20, tx + tw + 15, 256 - th + 15],
                  fill=_randcol(35, 50, 18))
    d.rectangle([0, 200, 256, 256], fill=_randcol(20, 30, 10))
    for my in range(170, 220, 5):
        col = (RNG.randint(220, 255), RNG.randint(200, 240), RNG.randint(160, 200))
        d.line([(0, my), (256, my)], fill=col + (int((220 - my) / 50 * 120),) if len(col) == 3 else col)
    for angle in range(-30, 30, 6):
        cx = RNG.randint(80, 176)
        img = _glow_overlay(img, cx, 128, (255, 220, 120), radius=60, alpha=20)
    return _vignette(_noise_texture(img))


def _golden_field_flowers(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for y in range(180):
        t = y / 180.0
        r = int(50 * (1 - t) + 240 * t)
        g = int(20 * (1 - t) + 150 * t)
        b = int(100 * (1 - t) + 30 * t)
        _draw(img).line([(0, y), (256, y)], fill=(r, g, b))
    d = _draw(img)
    d.rectangle([0, 175, 256, 256], fill=_randcol(20, 60, 15))
    flower_cols = [(255, 230, 30), (255, 150, 50), (255, 80, 80), (255, 200, 255)]
    for _ in range(40):
        fx = RNG.randint(0, 255)
        fy = RNG.randint(170, 255)
        fc = RNG.choice(flower_cols)
        r = RNG.randint(3, 8)
        d.ellipse([fx - r, fy - r, fx + r, fy + r], fill=fc)
    return _vignette(_noise_texture(img))


# ══════════════════════════════════════════════════════════════════════════════
# NEON CITYSCAPE  (6 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _neon_signs_alley(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(2, 0, 8), _randcol(8, 2, 18))
    d = _draw(img)
    sign_cols = [(255, 30, 100), (30, 200, 255), (255, 220, 30), (200, 30, 255), (30, 255, 160)]
    for _ in range(8):
        sx = RNG.randint(10, 200)
        sy = RNG.randint(10, 180)
        sw = RNG.randint(30, 70)
        sh = RNG.randint(15, 35)
        col = RNG.choice(sign_cols)
        _neon_sign_rect(d, sx, sy, sw, sh, col)
        img = _glow_overlay(img, sx + sw // 2, sy + sh // 2, col, radius=20, alpha=50)
    _building_silhouette(_draw(img), 256, 200, _randcol(8, 5, 15))
    _rain_streaks(_draw(img), 256, 256, n=70)
    return _vignette(_noise_texture(img))


def _neon_cyber_street(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(0, 0, 5), _randcol(5, 0, 15))
    d = _draw(img)
    vx, vy = 128, RNG.randint(80, 110)
    _vanishing_floor(img, vx, vy, _randcol(50, 0, 80), _randcol(30, 0, 50))
    sign_cols = [(255, 30, 100), (30, 200, 255), (200, 30, 255)]
    for side in [-1, 1]:
        for i in range(3):
            bx = int(vx + side * (30 + i * 30))
            by = vy + int(i * 20)
            bw = 25 - i * 3
            bh = 40 + RNG.randint(0, 40)
            col = _randcol(15, 5, 25)
            d.rectangle([bx - bw, by, bx + bw, by + bh], fill=col)
            if RNG.random() > 0.4:
                sc = RNG.choice(sign_cols)
                _neon_sign_rect(d, bx - bw + 2, by + 5, bw * 2 - 4, 10, sc)
                img = _glow_overlay(img, bx, by + 10, sc, radius=12, alpha=40)
    _rain_streaks(_draw(img), 256, 256, n=80)
    return _vignette(_noise_texture(img))


def _neon_reflection_puddle(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(2, 0, 8), _randcol(6, 0, 15))
    d = _draw(img)
    _building_silhouette(d, 256, 128, _randcol(10, 5, 18))
    sign_cols = [(255, 30, 100), (30, 200, 255), (200, 30, 255), (30, 255, 160)]
    for _ in range(5):
        sx = RNG.randint(20, 200)
        col = RNG.choice(sign_cols)
        sy = RNG.randint(20, 115)
        _neon_sign_rect(d, sx, sy, RNG.randint(20, 50), RNG.randint(10, 25), col)
        img = _glow_overlay(img, sx + 15, sy + 10, col, radius=15, alpha=45)
        img = _glow_overlay(img, sx + 15, 256 - sy - 10, col, radius=10, alpha=30)
    d = _draw(img)
    d.rectangle([0, 128, 256, 140], fill=_randcol(15, 8, 25))
    _rain_streaks(d, 256, 256, n=60)
    return _vignette(_noise_texture(img))


def _neon_synthwave_grid(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(10, 0, 30), _randcol(60, 0, 100))
    d = _draw(img)
    horizon_y = RNG.randint(100, 140)
    grid_col = _randcol(200, 30, 255)
    sun_col = _randcol(255, 80, 180)
    sun_x = 128
    for r in range(80, 0, -15):
        d.ellipse([sun_x - r, horizon_y - r // 2, sun_x + r, horizon_y + r // 2],
                  fill=sun_col)
    for i, y in enumerate(range(horizon_y, 256, max(1, (256 - horizon_y) // 10))):
        line_col = tuple(min(255, int(c * (1 - i / 10))) for c in grid_col)
        d.line([(0, y), (256, y)], fill=line_col, width=1)
    for x_frac in range(-5, 6):
        bx = int(sun_x + x_frac * 256 / 5)
        vanish_x = int(sun_x + x_frac * 30)
        d.line([(vanish_x, horizon_y), (bx, 256)], fill=grid_col, width=1)
    return _vignette(_noise_texture(img))


def _neon_hologram_lines(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(0, 2, 10), _randcol(0, 8, 25))
    d = _draw(img)
    cols = [(30, 200, 255), (30, 255, 180), (255, 30, 200)]
    for _ in range(30):
        lx = RNG.randint(0, 256)
        col = RNG.choice(cols)
        width = RNG.randint(1, 3)
        if RNG.random() > 0.5:
            d.line([(lx, 0), (lx + RNG.randint(-20, 20), 256)], fill=col, width=width)
        else:
            ly = RNG.randint(0, 256)
            d.line([(0, ly), (256, ly + RNG.randint(-15, 15))], fill=col, width=width)
    for _ in range(6):
        cx, cy = RNG.randint(40, 215), RNG.randint(40, 215)
        col = RNG.choice(cols)
        for r in range(5, 50, 8):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=1)
    img = img.filter(ImageFilter.GaussianBlur(1))
    return _vignette(img)


def _neon_tunnel(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(0, 0, 3), _randcol(2, 0, 8))
    d = _draw(img)
    cx, cy = 128, 128
    ring_cols = [(255, 30, 100), (30, 200, 255), (200, 30, 255), (30, 255, 180)]
    for i, r in enumerate(range(110, 5, -12)):
        col = ring_cols[i % len(ring_cols)]
        d.ellipse([cx - r, cy - r * 0.6, cx + r, cy + r * 0.6], outline=col, width=2)
        img = _glow_overlay(img, cx, cy, col, radius=max(3, r - 8), alpha=15)
    return _vignette(_noise_texture(img))


# ══════════════════════════════════════════════════════════════════════════════
# MUSIC FESTIVAL  (5 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _festival_main_stage(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for y in range(200):
        t = y / 200.0
        r = int(10 * (1 - t) + 80 * t)
        g = int(5 * (1 - t) + 50 * t)
        b = int(30 * (1 - t) + 100 * t)
        _draw(img).line([(0, y), (256, y)], fill=(r, g, b))
    d = _draw(img)
    d.rectangle([60, 100, 195, 170], fill=_randcol(30, 15, 50))
    d.rectangle([58, 90, 197, 105], fill=_randcol(40, 20, 60))
    for _ in range(6):
        lx = RNG.randint(65, 190)
        col = (RNG.randint(180, 255), RNG.randint(180, 255), RNG.randint(100, 255))
        _spotlight_cone(img, lx, 90, 95, 20, 80, col + (50,))
    _crowd_silhouette_row(d, 256, 256, 256, n=25, col=_randcol(15, 8, 22), height_range=(20, 45))
    _crowd_silhouette_row(d, 256, 256, 220, n=22, col=_randcol(12, 6, 18), height_range=(18, 40))
    d.rectangle([0, 195, 256, 256], fill=_randcol(15, 35, 10))
    return _vignette(_noise_texture(img))


def _festival_grounds_aerial(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(10, 20, 50), _randcol(25, 45, 90))
    d = _draw(img)
    for _ in range(20):
        tx = RNG.randint(0, 230)
        ty = RNG.randint(80, 200)
        tw = RNG.randint(20, 45)
        col = (RNG.randint(100, 200), RNG.randint(100, 200), RNG.randint(100, 200))
        d.polygon([(tx + tw // 2, ty - 15), (tx, ty + 20), (tx + tw, ty + 20)], fill=col)
        d.rectangle([tx + tw // 3, ty + 20, tx + tw * 2 // 3, ty + 35], fill=col)
    for _ in range(6):
        fx = RNG.randint(10, 240)
        fy = RNG.randint(10, 80)
        col = (RNG.randint(180, 255), RNG.randint(80, 200), RNG.randint(80, 200))
        d.rectangle([fx, fy, fx + 4, fy + 20], fill=(80, 70, 60))
        d.rectangle([fx - 5, fy - 8, fx + 14, fy + 2], fill=col)
    return _vignette(_noise_texture(img))


def _festival_crowd_aerial(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for gy in range(0, 256, 18):
        for gx in range(0, 256, 14):
            t = (gx + gy) / 512.0
            if t < 0.3:
                col = (RNG.randint(180, 255), RNG.randint(60, 140), RNG.randint(60, 140))
            elif t < 0.6:
                col = (RNG.randint(60, 140), RNG.randint(60, 140), RNG.randint(180, 255))
            else:
                col = (RNG.randint(60, 200), RNG.randint(120, 255), RNG.randint(60, 200))
            _draw(img).ellipse([gx + 2, gy + 2, gx + 11, gy + 11], fill=col)
    return _vignette(_noise_texture(img))


def _festival_sunset_stage(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for y in range(220):
        t = y / 220.0
        r = int(40 * (1 - t) + 220 * t)
        g = int(10 * (1 - t) + 100 * t)
        b = int(60 * (1 - t) + 40 * t)
        _draw(img).line([(0, y), (256, y)], fill=(r, g, b))
    d = _draw(img)
    d.rectangle([60, 130, 195, 210], fill=(20, 15, 25))
    d.rectangle([58, 120, 197, 135], fill=(30, 20, 35))
    d.line([(58, 120), (58, 80)], fill=(25, 18, 30), width=3)
    d.line([(197, 120), (197, 80)], fill=(25, 18, 30), width=3)
    d.line([(58, 80), (197, 80)], fill=(25, 18, 30), width=2)
    _crowd_silhouette_row(d, 256, 256, 256, n=22, col=(15, 10, 20), height_range=(18, 40))
    d.rectangle([0, 215, 256, 256], fill=_randcol(20, 40, 12))
    return _vignette(_noise_texture(img))


def _festival_string_lights(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(3, 5, 20), _randcol(12, 18, 50))
    d = _draw(img)
    bulb_cols = [(255, 200, 80), (255, 100, 80), (80, 200, 255), (200, 255, 80), (255, 80, 200)]
    for sy in range(40, 140, 25):
        for sx in range(0, 256, 15):
            bx = sx + int(math.sin(sx * 0.2) * 5)
            by = sy + int(math.sin(sx * 0.15) * 8)
            col = RNG.choice(bulb_cols)
            d.ellipse([bx - 3, by - 3, bx + 3, by + 3], fill=col)
            img = _glow_overlay(img, bx, by, col, radius=8, alpha=30)
    d = _draw(img)
    _crowd_silhouette_row(d, 256, 256, 256, n=20, col=_randcol(10, 6, 15), height_range=(25, 50))
    return _vignette(_noise_texture(img))


# ══════════════════════════════════════════════════════════════════════════════
# ROOFTOP VIEW  (5 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _rooftop_city_aerial(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(4, 8, 20), _randcol(12, 22, 55))
    d = _draw(img)
    bw = RNG.randint(25, 45)
    for gy in range(0, 256, 30):
        for gx in range(0, 256, bw):
            base = RNG.randint(10, 30)
            d.rectangle([gx + 1, gy + 1, gx + bw - 1, gy + 27],
                        fill=(base, base, base + 12))
            for wy in range(gy + 3, gy + 25, 6):
                for wx in range(gx + 3, gx + bw - 3, 8):
                    if RNG.random() > 0.4:
                        wc = (RNG.randint(180, 255), RNG.randint(180, 220), RNG.randint(120, 200))
                        d.rectangle([wx, wy, wx + 4, wy + 4], fill=wc)
    return _vignette(_noise_texture(img))


def _rooftop_edge_view(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for y in range(180):
        t = y / 180.0
        r = int(8 * (1 - t) + 25 * t)
        g = int(12 * (1 - t) + 35 * t)
        b = int(35 * (1 - t) + 80 * t)
        _draw(img).line([(0, y), (256, y)], fill=(r, g, b))
    d = _draw(img)
    d.rectangle([0, 175, 256, 256], fill=_randcol(30, 25, 20))
    _building_silhouette(d, 256, 175, _randcol(12, 12, 22))
    for rx in range(0, 256, 25):
        d.line([(rx, 175), (rx, 256)], fill=_randcol(50, 45, 35), width=2)
    d.line([(0, 175), (256, 175)], fill=_randcol(70, 65, 50), width=4)
    return _vignette(_noise_texture(img))


def _rooftop_sunset(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for y in range(200):
        t = y / 200.0
        r = int(30 * (1 - t) + 200 * t)
        g = int(10 * (1 - t) + 120 * t)
        b = int(60 * (1 - t) + 50 * t)
        _draw(img).line([(0, y), (256, y)], fill=(r, g, b))
    d = _draw(img)
    _building_silhouette(d, 256, 180, _randcol(10, 10, 15))
    d.rectangle([0, 180, 256, 256], fill=_randcol(25, 20, 15))
    sun_x = RNG.randint(60, 195)
    d.ellipse([sun_x - 20, 100, sun_x + 20, 140], fill=_randcol(255, 180, 60))
    for r in [35, 50, 70]:
        img = _glow_overlay(img, sun_x, 120, (255, 160, 60), radius=r, alpha=20)
    return _vignette(_noise_texture(img))


def _rooftop_night_stars(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(3, 4, 15), _randcol(8, 12, 35))
    d = _draw(img)
    for _ in range(80):
        sx = RNG.randint(0, 256)
        sy = RNG.randint(0, 160)
        br = RNG.randint(150, 255)
        d.ellipse([sx - 1, sy - 1, sx + 1, sy + 1], fill=(br, br, br))
    _building_silhouette(d, 256, 190, _randcol(8, 10, 20))
    for bx in range(0, 256, 30):
        for wy in range(195, 240, 8):
            if RNG.random() > 0.4:
                wc = (RNG.randint(180, 255), RNG.randint(180, 220), RNG.randint(100, 200))
                wx0 = bx + RNG.randint(2, 22)
                _draw(img).rectangle([wx0, wy, wx0 + 3, wy + 5], fill=wc)
    return _vignette(_noise_texture(img))


def _rooftop_pool(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for y in range(150):
        t = y / 150.0
        r = int(20 * (1 - t) + 80 * t)
        g = int(15 * (1 - t) + 60 * t)
        b = int(50 * (1 - t) + 140 * t)
        _draw(img).line([(0, y), (256, y)], fill=(r, g, b))
    d = _draw(img)
    d.rectangle([30, 148, 225, 200], fill=_randcol(30, 60, 100))
    for py in range(152, 198, 4):
        wave_pts = [(30, py)]
        for px in range(35, 225, 5):
            wy = py + int(math.sin(px * 0.3 + py * 0.2) * 2)
            wave_pts.append((px, wy))
        wave_pts.append((225, py))
        d.line(wave_pts, fill=_randcol(50, 100, 160), width=1)
    _building_silhouette(d, 256, 148, _randcol(8, 10, 20))
    return _vignette(_noise_texture(img))


# ══════════════════════════════════════════════════════════════════════════════
# UNDERGROUND CLUB  (5 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _club_dark_dancefloor(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(2, 0, 6), _randcol(8, 0, 18))
    d = _draw(img)
    tile_size = RNG.randint(20, 35)
    for gy in range(140, 256, tile_size):
        for gx in range(0, 256, tile_size):
            if RNG.random() > 0.5:
                col = _randcol(15, 5, 25)
            else:
                col = _randcol(8, 2, 15)
            d.rectangle([gx + 1, gy + 1, gx + tile_size - 1, gy + tile_size - 1], fill=col)
    laser_cols = [(255, 30, 150), (30, 200, 255), (200, 30, 255)]
    for angle in range(0, 180, 15):
        col = RNG.choice(laser_cols)
        ex = int(128 + math.cos(math.radians(angle)) * 200)
        ey = int(50 + math.sin(math.radians(angle)) * 200)
        d.line([(128, 50), (ex, ey)], fill=col, width=1)
    _crowd_silhouette_row(d, 256, 256, 256, n=20, col=_randcol(5, 2, 10), height_range=(25, 55))
    return _vignette(_noise_texture(img))


def _club_dj_booth(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(2, 0, 5), _randcol(8, 0, 15))
    d = _draw(img)
    d.rectangle([60, 120, 195, 195], fill=_randcol(15, 8, 25))
    d.rectangle([70, 128, 185, 160], fill=_randcol(12, 6, 20))
    for i in range(6):
        px = 75 + i * 18
        d.ellipse([px - 5, 135, px + 5, 153], fill=_randcol(40, 25, 60))
        d.ellipse([px - 3, 137, px + 3, 151], fill=_randcol(70, 50, 90))
    for i in range(4):
        fx = 72 + i * 28
        fh = RNG.randint(5, 25)
        d.rectangle([fx, 160 - fh, fx + 16, 160], fill=_randcol(30, 150, 80))
    img = _glow_overlay(img, 128, 155, (80, 30, 140), radius=60, alpha=40)
    _crowd_silhouette_row(_draw(img), 256, 256, 256, n=22, col=_randcol(3, 1, 8), height_range=(28, 58))
    return _vignette(_noise_texture(img))


def _club_smoke_beams(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(0, 0, 3), _randcol(5, 0, 12))
    d = _draw(img)
    beam_cols = [(255, 30, 150), (80, 30, 255), (30, 200, 255), (200, 255, 30)]
    for i in range(5):
        bx = 30 + i * 45
        col = RNG.choice(beam_cols)
        for r in range(25, 3, -4):
            alpha_val = int(40 * r / 25)
            overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
            od = ImageDraw.Draw(overlay)
            od.ellipse([bx - r, 0 - r, bx + r, 0 + r], fill=col + (alpha_val,))
            img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
        d = _draw(img)
        for by in range(0, 250, 8):
            w = max(1, 3 - by // 80)
            d.line([(bx - 2, by), (bx + 2, by + 8)], fill=col, width=w)
    arr = np.array(img).astype(np.float32)
    noise = np.random.randn(*arr.shape) * 8
    img = Image.fromarray(np.clip(arr + noise, 0, 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(1))
    return _vignette(img)


def _club_mirror_ball(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(2, 0, 6), _randcol(8, 0, 18))
    d = _draw(img)
    cx, cy = 128, 80
    d.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], fill=_randcol(40, 35, 50))
    for angle in range(0, 360, 20):
        for dist in range(15, 35, 8):
            mx = int(cx + math.cos(math.radians(angle)) * dist)
            my = int(cy + math.sin(math.radians(angle)) * dist * 0.7)
            tile_col = (RNG.randint(180, 255), RNG.randint(180, 255), RNG.randint(180, 255))
            d.rectangle([mx - 3, my - 3, mx + 3, my + 3], fill=tile_col)
    for _ in range(25):
        rx = RNG.randint(0, 256)
        ry = RNG.randint(120, 256)
        rcol = (RNG.randint(150, 255), RNG.randint(150, 255), RNG.randint(150, 255))
        r = RNG.randint(2, 8)
        d.ellipse([rx - r, ry - r, rx + r, ry + r], fill=rcol)
    _crowd_silhouette_row(d, 256, 256, 256, n=20, col=_randcol(4, 1, 8), height_range=(25, 55))
    return _vignette(_noise_texture(img))


def _club_strobe(seed=0):
    RNG.seed(seed)
    img = _canvas()
    base_bright = RNG.randint(30, 80)
    _gradient_bg(img, (base_bright, base_bright, base_bright + 10), (0, 0, 5))
    d = _draw(img)
    _crowd_silhouette_row(d, 256, 256, 256, n=22, col=(0, 0, 2), height_range=(30, 65))
    _crowd_silhouette_row(d, 256, 256, 220, n=20, col=(2, 0, 4), height_range=(25, 55))
    col = (RNG.randint(200, 255), RNG.randint(200, 255), RNG.randint(200, 255))
    d.ellipse([100, 50, 155, 80], fill=col)
    return _vignette(_noise_texture(img, 5))


# ══════════════════════════════════════════════════════════════════════════════
# RAIN MOOD  (5 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _rain_window_drops(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(6, 10, 30), _randcol(15, 22, 55))
    d = _draw(img)
    _building_silhouette(d, 256, 180, _randcol(8, 12, 28))
    img = img.filter(ImageFilter.GaussianBlur(2))
    d = _draw(img)
    for _ in range(35):
        dx = RNG.randint(5, 248)
        dy = RNG.randint(5, 248)
        dr = RNG.randint(3, 10)
        d.ellipse([dx - dr, dy - dr, dx + dr, dy + dr], outline=(180, 190, 220), width=1)
        tail = RNG.randint(5, 18)
        d.line([(dx, dy + dr), (dx + RNG.randint(-3, 3), dy + dr + tail)],
               fill=(150, 165, 200), width=1)
    return _vignette(img)


def _rain_street_puddle(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(6, 8, 22), _randcol(12, 18, 45))
    d = _draw(img)
    d.rectangle([0, 145, 256, 256], fill=_randcol(8, 12, 30))
    for py in range(148, 200, 4):
        d.line([(0, py), (256, py)],
               fill=_randcol(15, 22, 50), width=1)
    _building_silhouette(d, 256, 145, _randcol(8, 10, 22))
    for _ in range(20):
        px = RNG.randint(10, 245)
        py = RNG.randint(148, 200)
        pr = RNG.randint(2, 8)
        d.ellipse([px - pr, py - pr // 2, px + pr, py + pr // 2], outline=(60, 80, 120), width=1)
    sign_cols = [(255, 80, 120), (80, 200, 255), (200, 255, 80)]
    for _ in range(3):
        sx = RNG.randint(30, 200)
        sy = RNG.randint(60, 140)
        col = RNG.choice(sign_cols)
        d.rectangle([sx, sy, sx + 20, sy + 10], outline=col, width=1)
        d.line([(sx + 10, 145), (sx + 10 + RNG.randint(-5, 5), 150 + RNG.randint(0, 40))],
               fill=col, width=1)
    _rain_streaks(d, 256, 256, n=90)
    return _vignette(_noise_texture(img))


def _rain_dark_street(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(4, 5, 15), _randcol(10, 12, 35))
    d = _draw(img)
    vx, vy = 128, 110
    _vanishing_floor(img, vx, vy, _randcol(20, 22, 45), _randcol(12, 14, 30))
    _building_silhouette(d, 256, vy + 10, _randcol(6, 7, 18))
    for lx in [60, 128, 196]:
        d.ellipse([lx - 5, vy, lx + 5, vy + 12], fill=(220, 200, 150))
        img = _glow_overlay(img, lx, vy + 6, (220, 200, 150), radius=20, alpha=40)
    d = _draw(img)
    _rain_streaks(d, 256, 256, n=100)
    return _vignette(_noise_texture(img))


def _rain_fog_bridge(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(15, 18, 35), _randcol(30, 35, 65))
    d = _draw(img)
    for anchor_x in [60, 196]:
        d.rectangle([anchor_x - 10, 40, anchor_x + 10, 200], fill=_randcol(30, 32, 52))
        for cy in range(50, 195, 10):
            d.line([(anchor_x, cy), (128, 185)], fill=_randcol(50, 52, 75), width=1)
    d.rectangle([0, 185, 256, 205], fill=_randcol(40, 42, 68))
    for fy in range(0, 256, 20):
        d.line([(0, fy), (256, fy)], fill=(200, 210, 230, 30), width=RNG.randint(1, 3))
    img = img.filter(ImageFilter.GaussianBlur(2))
    _rain_streaks(_draw(img), 256, 256, n=60, col=(160, 175, 210))
    return _vignette(img)


def _rain_indoor_warmth(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(35, 25, 10), _randcol(80, 55, 20))
    d = _draw(img)
    d.rectangle([0, 40, 256, 256], fill=_randcol(30, 22, 8))
    win_col = _randcol(80, 100, 140)
    d.rectangle([30, 45, 100, 130], fill=win_col)
    d.rectangle([50, 45, 52, 130], fill=_randcol(35, 27, 12))
    d.rectangle([30, 87, 100, 89], fill=_randcol(35, 27, 12))
    for _ in range(25):
        rx = RNG.randint(30, 99)
        ry = RNG.randint(47, 128)
        rr = RNG.randint(2, 6)
        d.ellipse([rx - rr, ry - rr, rx + rr, ry + rr], outline=(200, 215, 240), width=1)
        tail = RNG.randint(4, 12)
        d.line([(rx, ry + rr), (rx, ry + rr + tail)], fill=(180, 195, 225), width=1)
    img = _glow_overlay(img, 65, 87, (180, 150, 80), radius=40, alpha=35)
    return _vignette(_noise_texture(img))


# ══════════════════════════════════════════════════════════════════════════════
# MORNING LIGHT  (5 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _morning_sunrise_rays(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for y in range(256):
        t = y / 256.0
        r = int(30 * (1 - t) + 250 * t)
        g = int(10 * (1 - t) + 180 * t)
        b = int(60 * (1 - t) + 60 * t)
        _draw(img).line([(0, y), (256, y)], fill=(r, g, b))
    d = _draw(img)
    cx = 128 + RNG.randint(-20, 20)
    cy = RNG.randint(180, 220)
    for angle in range(0, 360, 12):
        length = RNG.randint(80, 180)
        ex = int(cx + math.cos(math.radians(angle)) * length)
        ey = int(cy + math.sin(math.radians(angle)) * length)
        col = (255, RNG.randint(180, 230), RNG.randint(60, 120))
        d.line([(cx, cy), (ex, ey)], fill=col, width=RNG.randint(1, 3))
    d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], fill=_randcol(255, 240, 180))
    d.rectangle([0, 220, 256, 256], fill=_randcol(30, 50, 15))
    return _vignette(_noise_texture(img))


def _morning_misty_forest(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for y in range(256):
        t = y / 256.0
        r = int(220 * (1 - t) + 180 * t)
        g = int(200 * (1 - t) + 160 * t)
        b = int(150 * (1 - t) + 100 * t)
        _draw(img).line([(0, y), (256, y)], fill=(r, g, b))
    d = _draw(img)
    for i in range(20):
        tx = RNG.randint(-10, 265)
        th = RNG.randint(80, 200)
        tw = RNG.randint(4, 15)
        tree_col = _randcol(30, 45, 15)
        d.rectangle([tx, 256 - th, tx + tw, 256], fill=tree_col)
    for my in range(180, 256, 6):
        mist = int((256 - my) / 76 * 180)
        d.rectangle([0, my, 256, my + 5], fill=(230, 220, 200, mist))
    for i in range(5):
        bx = RNG.randint(40, 215)
        by = 180 - RNG.randint(20, 60)
        col = (255, RNG.randint(220, 255), RNG.randint(150, 200))
        for r in [40, 55, 70]:
            img = _glow_overlay(img, bx, by, col, radius=r, alpha=15)
    return _vignette(_noise_texture(img))


def _morning_dawn_sky(seed=0):
    RNG.seed(seed)
    img = _canvas()
    cols = [
        _randcol(20, 15, 60),
        _randcol(100, 40, 120),
        _randcol(220, 100, 80),
        _randcol(250, 180, 80),
        _randcol(255, 220, 140),
    ]
    d = _draw(img)
    band_h = 256 // len(cols)
    for i, col in enumerate(cols):
        next_col = cols[min(i + 1, len(cols) - 1)]
        for y in range(band_h):
            t = y / band_h
            r = int(col[0] * (1 - t) + next_col[0] * t)
            g = int(col[1] * (1 - t) + next_col[1] * t)
            b = int(col[2] * (1 - t) + next_col[2] * t)
            d.line([(0, i * band_h + y), (256, i * band_h + y)], fill=(r, g, b))
    for _ in range(8):
        cx = RNG.randint(20, 235)
        cy = RNG.randint(10, 100)
        cw = RNG.randint(20, 60)
        ch = RNG.randint(8, 20)
        d.ellipse([cx - cw, cy - ch, cx + cw, cy + ch], fill=_randcol(240, 210, 200))
    return _vignette(_noise_texture(img))


def _morning_coffee_steam(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(30, 22, 10), _randcol(80, 58, 25))
    d = _draw(img)
    d.ellipse([85, 155, 170, 215], fill=_randcol(15, 10, 5))
    d.ellipse([90, 158, 165, 210], fill=_randcol(50, 30, 10))
    d.rectangle([80, 210, 175, 225], fill=_randcol(12, 8, 4))
    steam_pts = [
        [(128, 150), (122, 130), (132, 110), (125, 90)],
        [(110, 155), (105, 135), (115, 115), (108, 95)],
        [(146, 155), (150, 135), (142, 115), (148, 95)],
    ]
    for pts in steam_pts:
        d.line(pts, fill=(220, 210, 200), width=2)
    win_col = _randcol(220, 200, 150)
    d.rectangle([15, 30, 75, 145], fill=win_col)
    img = _glow_overlay(img, 45, 87, (250, 220, 140), radius=35, alpha=40)
    return _vignette(_noise_texture(img))


def _morning_city_sunrise(seed=0):
    RNG.seed(seed)
    img = _canvas()
    for y in range(200):
        t = y / 200.0
        r = int(20 * (1 - t) + 230 * t)
        g = int(10 * (1 - t) + 150 * t)
        b = int(40 * (1 - t) + 60 * t)
        _draw(img).line([(0, y), (256, y)], fill=(r, g, b))
    d = _draw(img)
    _building_silhouette(d, 256, 185, _randcol(12, 12, 20))
    sun_x = RNG.randint(80, 176)
    d.ellipse([sun_x - 15, 170, sun_x + 15, 200], fill=_randcol(255, 220, 100))
    for r in [25, 40, 60]:
        img = _glow_overlay(img, sun_x, 185, (255, 200, 80), radius=r, alpha=25)
    d = _draw(img)
    d.rectangle([0, 220, 256, 256], fill=_randcol(20, 30, 10))
    return _vignette(_noise_texture(img))


# ══════════════════════════════════════════════════════════════════════════════
# WAREHOUSE RAVE  (5 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _warehouse_concrete_floor(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(4, 3, 5), _randcol(15, 10, 18))
    d = _draw(img)
    vx, vy = 128, 100
    floor_col = _randcol(35, 30, 40)
    _vanishing_floor(img, vx, vy, floor_col, _randcol(25, 20, 30))
    for px in [70, 128, 185]:
        d.rectangle([px - 8, vy, px + 8, 256], fill=_randcol(20, 15, 22))
        for _ in range(3):
            hx = RNG.randint(-20, 20)
            hy = vy + RNG.randint(10, 60)
            beam_col = (RNG.randint(200, 255), RNG.randint(100, 255), RNG.randint(50, 200))
            _spotlight_cone(img, px + hx // 2, hy, 100, 25, 150, beam_col + (40,))
    _crowd_silhouette_row(_draw(img), 256, 256, 256, n=20, col=_randcol(4, 2, 6), height_range=(28, 60))
    return _vignette(_noise_texture(img))


def _warehouse_graffiti_wall(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(20, 15, 25), _randcol(40, 30, 50))
    d = _draw(img)
    block_size = RNG.randint(30, 60)
    for gy in range(0, 256, block_size):
        for gx in range(0, 256, block_size):
            if RNG.random() > 0.3:
                col = (RNG.randint(80, 255), RNG.randint(30, 200), RNG.randint(30, 200))
                d.rectangle([gx + 2, gy + 2, gx + block_size - 2, gy + block_size - 2], fill=col)
    d.rectangle([0, 210, 256, 256], fill=_randcol(8, 5, 12))
    _crowd_silhouette_row(d, 256, 256, 256, n=18, col=_randcol(3, 1, 5), height_range=(25, 55))
    return _vignette(_noise_texture(img))


def _warehouse_pipe_ceiling(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(3, 2, 5), _randcol(12, 8, 16))
    d = _draw(img)
    for px in range(0, 256, 30):
        d.line([(px, 0), (px, 60)], fill=_randcol(40, 35, 45), width=RNG.randint(4, 12))
    for py in range(10, 65, 18):
        d.line([(0, py), (256, py)], fill=_randcol(35, 30, 40), width=RNG.randint(3, 8))
    for sx in range(15, 256, 40):
        col = (RNG.randint(150, 255), RNG.randint(100, 255), RNG.randint(50, 255))
        d.ellipse([sx - 5, 55, sx + 5, 70], fill=col)
        img = _glow_overlay(img, sx, 62, col, radius=20, alpha=35)
    d = _draw(img)
    _crowd_silhouette_row(d, 256, 256, 256, n=22, col=_randcol(4, 2, 6), height_range=(30, 65))
    return _vignette(_noise_texture(img))


def _warehouse_bass_speaker(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(5, 3, 8), _randcol(18, 12, 25))
    d = _draw(img)
    cx, cy = 128, 128
    d.ellipse([cx - 80, cy - 80, cx + 80, cy + 80], fill=_randcol(18, 12, 22))
    for r in range(75, 10, -12):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=_randcol(40, 32, 50), width=2)
    d.ellipse([cx - 28, cy - 28, cx + 28, cy + 28], fill=_randcol(60, 50, 75))
    d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=_randcol(15, 10, 20))
    for _ in range(6):
        angle = RNG.randint(0, 360)
        dist = RNG.randint(5, 80)
        px = int(cx + math.cos(math.radians(angle)) * dist)
        py = int(cy + math.sin(math.radians(angle)) * dist)
        d.line([(cx, cy), (px, py)], fill=_randcol(30, 22, 40), width=1)
    col = (80, 30, 150)
    for r in [90, 100, 110]:
        img = _glow_overlay(img, cx, cy, col, radius=r, alpha=15)
    return _vignette(_noise_texture(img))


def _warehouse_dark_crowd(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(0, 0, 2), _randcol(5, 0, 10))
    d = _draw(img)
    _crowd_silhouette_row(d, 256, 256, 256, n=24, col=_randcol(2, 0, 4), height_range=(35, 70))
    _crowd_silhouette_row(d, 256, 256, 210, n=21, col=_randcol(1, 0, 3), height_range=(28, 58))
    _crowd_silhouette_row(d, 256, 256, 175, n=18, col=_randcol(1, 0, 2), height_range=(22, 45))
    beam_cols = [(255, 50, 150), (50, 200, 255), (200, 50, 255)]
    for _ in range(4):
        bx = RNG.randint(30, 225)
        col = RNG.choice(beam_cols)
        d.line([(bx, 0), (bx + RNG.randint(-15, 15), 175)], fill=col, width=2)
        img = _glow_overlay(img, bx, 10, col, radius=15, alpha=60)
    return _vignette(_noise_texture(img, 3))


# ══════════════════════════════════════════════════════════════════════════════
# INTIMATE VENUE  (5 templates)
# ══════════════════════════════════════════════════════════════════════════════

def _intimate_small_stage(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(18, 12, 5), _randcol(50, 35, 15))
    d = _draw(img)
    d.rectangle([55, 130, 200, 200], fill=_randcol(40, 28, 10))
    d.rectangle([53, 118, 202, 133], fill=_randcol(55, 38, 15))
    performer_x = 128
    d.ellipse([performer_x - 9, 100, performer_x + 9, 120], fill=_randcol(200, 175, 145))
    d.rectangle([performer_x - 7, 118, performer_x + 7, 145], fill=_randcol(50, 40, 20))
    d.rectangle([performer_x - 2, 130, performer_x + 2, 165], fill=_randcol(60, 48, 20))
    img = _glow_overlay(img, performer_x, 110, (255, 230, 160), radius=35, alpha=50)
    d = _draw(img)
    for i in range(8):
        sx = RNG.randint(0, 50)
        ex = RNG.randint(205, 255)
        ay = 200 + int(i * 7)
        d.rectangle([sx, ay, ex, ay + 10], fill=_randcol(35, 25, 10))
    return _vignette(_noise_texture(img))


def _intimate_candles(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(10, 6, 2), _randcol(35, 22, 8))
    d = _draw(img)
    for _ in range(12):
        cx = RNG.randint(20, 235)
        cy = RNG.randint(80, 210)
        h = RNG.randint(15, 40)
        d.rectangle([cx - 4, cy, cx + 4, cy + h], fill=_randcol(200, 180, 150))
        d.ellipse([cx - 2, cy - 6, cx + 2, cy + 2], fill=_randcol(255, 200, 80))
        img = _glow_overlay(img, cx, cy, (255, 180, 80), radius=12, alpha=50)
        img = _glow_overlay(img, cx, cy, (255, 120, 30), radius=25, alpha=25)
    return _vignette(_noise_texture(img))


def _intimate_mic_spotlight(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(3, 2, 5), _randcol(12, 8, 18))
    d = _draw(img)
    cx = 128 + RNG.randint(-20, 20)
    _spotlight_cone(img, cx, 0, 90, 35, 300, (255, 235, 180, 50))
    d.ellipse([cx - 10, 80, cx + 10, 105], outline=_randcol(180, 160, 120), width=3)
    for wy in range(86, 100, 5):
        d.line([(cx - 8, wy), (cx + 8, wy)], fill=_randcol(120, 100, 70), width=1)
    d.rectangle([cx - 2, 100, cx + 2, 160], fill=_randcol(120, 100, 70))
    d.rectangle([cx - 12, 158, cx + 12, 165], fill=_randcol(100, 85, 55))
    img = _glow_overlay(img, cx, 90, (255, 235, 180), radius=25, alpha=40)
    return _vignette(_noise_texture(img))


def _intimate_jazz_setup(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(20, 14, 5), _randcol(55, 38, 15))
    d = _draw(img)
    d.rectangle([30, 165, 225, 256], fill=_randcol(45, 32, 12))
    d.line([(60, 165), (60, 100)], fill=_randcol(80, 65, 30), width=4)
    d.rectangle([35, 98, 85, 110], fill=_randcol(90, 75, 35))
    d.line([(128, 165), (128, 95)], fill=_randcol(70, 55, 25), width=3)
    d.ellipse([108, 85, 148, 100], fill=_randcol(80, 65, 30))
    for i in range(8):
        kx = 90 + i * 8
        ky = 80 + RNG.randint(-3, 3)
        d.ellipse([kx - 2, ky, kx + 2, ky + 5], fill=_randcol(180, 160, 110))
    d.ellipse([160, 120, 210, 165], fill=_randcol(180, 150, 60))
    d.ellipse([170, 130, 200, 157], fill=_randcol(160, 130, 50))
    for i in range(6):
        angle = i * 60
        px = int(185 + math.cos(math.radians(angle)) * 12)
        py = int(143 + math.sin(math.radians(angle)) * 12)
        d.line([(185, 143), (px, py)], fill=_randcol(140, 110, 40), width=2)
    return _vignette(_noise_texture(img))


def _intimate_acoustic_circle(seed=0):
    RNG.seed(seed)
    img = _canvas()
    _gradient_bg(img, _randcol(15, 10, 4), _randcol(45, 32, 12))
    d = _draw(img)
    cx, cy = 128, 128
    img = _glow_overlay(img, cx, cy, (255, 200, 100), radius=50, alpha=35)
    img = _glow_overlay(img, cx, cy, (255, 180, 80), radius=30, alpha=25)
    d = _draw(img)
    for i in range(6):
        angle = i * 60
        mx = int(cx + math.cos(math.radians(angle)) * 70)
        my = int(cy + math.sin(math.radians(angle)) * 70)
        d.ellipse([mx - 8, my - 10, mx + 8, my + 10], fill=_randcol(200, 175, 145))
        d.rectangle([mx - 6, my + 8, mx + 6, my + 25], fill=_randcol(55, 42, 18))
    for i in range(6):
        angle = i * 60
        sx = int(cx + math.cos(math.radians(angle)) * 55)
        sy = int(cy + math.sin(math.radians(angle)) * 55)
        d.ellipse([sx - 6, sy - 8, sx + 6, sy + 8], fill=_randcol(160, 130, 60))
    return _vignette(_noise_texture(img))


# ══════════════════════════════════════════════════════════════════════════════
# DISPATCH TABLE
# ══════════════════════════════════════════════════════════════════════════════

TEMPLATES = {
    'concert_stage': [
        _concert_perspective_stage,
        _concert_crowd_energy,
        _concert_arena_aerial,
        _concert_led_wall,
        _concert_laser_show,
        _concert_confetti,
    ],
    'city_nights': [
        _city_skyline_reflection,
        _city_street_bokeh,
        _city_rain_window,
        _city_aerial_grid,
        _city_bridge_night,
        _city_traffic_blur,
    ],
    'studio_session': [
        _studio_console_perspective,
        _studio_vu_meters,
        _studio_mic_booth,
        _studio_monitor_speakers,
        _studio_producer_setup,
        _studio_vinyl_record,
    ],
    'golden_hour': [
        _golden_sunset_landscape,
        _golden_sun_rays,
        _golden_ocean_sunset,
        _golden_misty_forest,
        _golden_field_flowers,
    ],
    'neon_cityscape': [
        _neon_signs_alley,
        _neon_cyber_street,
        _neon_reflection_puddle,
        _neon_synthwave_grid,
        _neon_hologram_lines,
        _neon_tunnel,
    ],
    'music_festival': [
        _festival_main_stage,
        _festival_grounds_aerial,
        _festival_crowd_aerial,
        _festival_sunset_stage,
        _festival_string_lights,
    ],
    'rooftop_view': [
        _rooftop_city_aerial,
        _rooftop_edge_view,
        _rooftop_sunset,
        _rooftop_night_stars,
        _rooftop_pool,
    ],
    'underground_club': [
        _club_dark_dancefloor,
        _club_dj_booth,
        _club_smoke_beams,
        _club_mirror_ball,
        _club_strobe,
    ],
    'rain_mood': [
        _rain_window_drops,
        _rain_street_puddle,
        _rain_dark_street,
        _rain_fog_bridge,
        _rain_indoor_warmth,
    ],
    'morning_light': [
        _morning_sunrise_rays,
        _morning_misty_forest,
        _morning_dawn_sky,
        _morning_coffee_steam,
        _morning_city_sunrise,
    ],
    'warehouse_rave': [
        _warehouse_concrete_floor,
        _warehouse_graffiti_wall,
        _warehouse_pipe_ceiling,
        _warehouse_bass_speaker,
        _warehouse_dark_crowd,
    ],
    'intimate_venue': [
        _intimate_small_stage,
        _intimate_candles,
        _intimate_mic_spotlight,
        _intimate_jazz_setup,
        _intimate_acoustic_circle,
    ],

    # ── 8 new categories: map to best-matching existing visual templates ──────
    # (provides proper visual variety per-category instead of defaulting to
    #  concert_stage; dedicated templates may be added in a future version)

    'dj_booth': [
        _club_dj_booth,
        _club_dark_dancefloor,
        _club_smoke_beams,
        _studio_console_perspective,
        _club_mirror_ball,
    ],

    'street_art': [
        _warehouse_graffiti_wall,
        _neon_signs_alley,
        _neon_hologram_lines,
        _concert_led_wall,
        _warehouse_pipe_ceiling,
    ],

    'music_video_set': [
        _concert_laser_show,
        _concert_led_wall,
        _concert_perspective_stage,
        _neon_cyber_street,
        _intimate_mic_spotlight,
    ],

    'album_cover_shoot': [
        _intimate_mic_spotlight,
        _intimate_candles,
        _studio_mic_booth,
        _studio_vinyl_record,
        _golden_sun_rays,
    ],

    'hip_hop_cypher': [
        _intimate_acoustic_circle,
        _concert_crowd_energy,
        _rain_dark_street,
        _warehouse_dark_crowd,
        _club_dark_dancefloor,
    ],

    'luxury_yacht': [
        _golden_ocean_sunset,
        _rooftop_pool,
        _golden_sunset_landscape,
        _morning_city_sunrise,
        _city_skyline_reflection,
    ],

    'gospel_choir': [
        _intimate_small_stage,
        _morning_sunrise_rays,
        _morning_dawn_sky,
        _concert_crowd_energy,
        _golden_sun_rays,
    ],

    'trap_aesthetic': [
        _neon_synthwave_grid,
        _club_dark_dancefloor,
        _city_aerial_grid,
        _neon_reflection_puddle,
        _warehouse_dark_crowd,
    ],
}

TEMPLATE_COUNT = sum(len(v) for v in TEMPLATES.values())


def generate_frame(scene: str, frame_idx: int, res: int = 48) -> np.ndarray:
    """
    Generate a rich training frame for `scene`.
    Returns a float32 array in [-1, 1], shape (res, res, 3).
    """
    templates = TEMPLATES.get(scene, list(TEMPLATES.values())[0])
    template_fn = templates[frame_idx % len(templates)]
    seed = (hash((scene, frame_idx)) & 0xFFFF_FFFF)
    img = template_fn(seed=seed)
    img = _downscale(img, res)
    arr = np.array(img, dtype=np.float32) / 127.5 - 1.0
    return arr.clip(-1.0, 1.0)


def generate_batch(scene: str, n: int, res: int = 48) -> list:
    """Generate n varied frames for a scene, cycling through all templates."""
    return [generate_frame(scene, i, res) for i in range(n)]
