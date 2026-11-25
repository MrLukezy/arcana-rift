#!/usr/bin/env python3
"""把绿幕原图处理成卡片素材：角色抠图（RGBA）+ 每张卡专属程序化背景。

输出：
  img/char/<id>.webp   角色抠图（带 alpha，900x1200 画布内等比缩放）
  img/bg/<id>.webp     背景（900x1200，按元素配色的多层景深）
  img/meta.json        每张卡的尺寸、主色、光晕色
"""
import json, os, math, random
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter

ROOT = "/home/ubuntu/card/gacha"
RAW = f"{ROOT}/img/raw"
CHAR = f"{ROOT}/img/char"
BG = f"{ROOT}/img/bg"
for d in (CHAR, BG):
    os.makedirs(d, exist_ok=True)

W, H = 900, 1200

# 元素配色：(远景色深, 中景, 主光, 粒子色)
ELEM_PAL = {
    "星月": ((28, 18, 52), (62, 40, 108), (176, 140, 255), (255, 236, 200)),
    "炎":   ((46, 16, 12), (110, 34, 18), (255, 138, 66), (255, 216, 150)),
    "圣光": ((40, 34, 22), (96, 78, 44), (255, 216, 150), (255, 250, 226)),
    "暗":   ((18, 14, 28), (44, 30, 66), (150, 120, 220), (200, 170, 255)),
    "自然": ((18, 38, 24), (42, 82, 48), (140, 226, 160), (230, 255, 200)),
    "土":   ((40, 30, 20), (84, 62, 38), (224, 178, 110), (255, 230, 180)),
    "风":   ((18, 36, 52), (40, 84, 116), (140, 216, 255), (232, 248, 255)),
    "冰":   ((20, 38, 56), (46, 84, 118), (168, 232, 255), (240, 252, 255)),
    "毒":   ((22, 40, 24), (48, 88, 44), (160, 226, 120), (236, 255, 190)),
    "音":   ((48, 32, 16), (108, 70, 30), (255, 206, 120), (255, 240, 200)),
    "花":   ((48, 24, 38), (108, 50, 80), (255, 168, 214), (255, 226, 240)),
    "雷":   ((24, 22, 52), (56, 46, 116), (186, 166, 255), (226, 236, 255)),
    "水":   ((14, 30, 54), (30, 66, 110), (126, 200, 255), (222, 244, 255)),
    "混沌": ((30, 16, 40), (74, 36, 96), (255, 154, 213), (255, 226, 180)),
    "岩":   ((34, 26, 22), (74, 54, 40), (206, 150, 96), (255, 224, 170)),
}


def key_green(path):
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise RuntimeError(f"读不到 {path}")
    if img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    excess = g - np.maximum(r, b)
    alpha = np.clip((0.055 - excess) / 0.11, 0, 1)

    m = (alpha > 0.5).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keep = (lab == big).astype(np.uint8)
        keep = cv2.dilate(keep, np.ones((7, 7), np.uint8))
        alpha = alpha * keep
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.7)

    bad = g > (r + b) * 0.5
    g2 = np.where(bad, (r + b) * 0.5 * 1.02, g)
    out = np.dstack([np.clip(rgb[..., 0], 0, 1), np.clip(g2, 0, 1),
                     np.clip(rgb[..., 2], 0, 1), np.clip(alpha, 0, 1)])
    arr = (out * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def fit_canvas(im, size=(W, H), margin=0.03):
    """等比缩放并居中放到画布上（保留完整角色）。"""
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    tw, th = size
    k = min(tw * (1 - margin * 2) / im.width, th * (1 - margin * 2) / im.height)
    nw, nh = max(1, int(im.width * k)), max(1, int(im.height * k))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


def make_bg(card, seed):
    """多层景深背景：远景渐变 + 柔光 + 远景点阵 + 近景光斑 + 暗角。"""
    c0, c1, c2, c3 = ELEM_PAL.get(card["element"], ELEM_PAL["星月"])
    rnd = random.Random(seed)

    base = Image.new("RGB", (W, H), c0)
    d = ImageDraw.Draw(base)
    for y in range(H):
        t = y / (H - 1)
        # 上深下浅，中间略提亮
        e = t ** 0.85
        col = tuple(int(c0[i] + (c1[i] - c0[i]) * e) for i in range(3))
        d.line([(0, y), (W, y)], fill=col)

    # 中心柔光（角色背后的光源）
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.16, H * 0.10, W * 0.84, H * 0.78], fill=176)
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    tint = Image.new("RGB", (W, H), c2)
    base = Image.composite(tint, base, glow.point(lambda v: int(v * 0.55)))

    # 远景：稀疏星点 / 光尘（模糊，制造空气感）
    far = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(far)
    for _ in range(150):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        r = rnd.uniform(1.0, 3.6)
        a = int(rnd.uniform(30, 130))
        fd.ellipse([x - r, y - r, x + r, y + r], fill=(*c3, a))
    far = far.filter(ImageFilter.GaussianBlur(2.2))
    base = Image.alpha_composite(base.convert("RGBA"), far)

    # 中景：环形/波纹装饰（低透明度大形状，读起来像背景建筑或法阵）
    mid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    md = ImageDraw.Draw(mid)
    cx, cy = W * 0.5, H * 0.46
    for k in range(4):
        rr = W * (0.30 + k * 0.10)
        a = int(26 - k * 4)
        md.ellipse([cx - rr, cy - rr * 0.78, cx + rr, cy + rr * 0.78],
                   outline=(*c2, max(6, a)), width=2)
    mid = mid.filter(ImageFilter.GaussianBlur(1.4))
    base = Image.alpha_composite(base, mid)

    # 近景：更大的光斑（不模糊，形成近层）
    near = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    nd = ImageDraw.Draw(near)
    for _ in range(26):
        x, y = rnd.uniform(0, W), rnd.uniform(H * 0.1, H)
        r = rnd.uniform(7, 26)
        a = int(rnd.uniform(10, 44))
        nd.ellipse([x - r, y - r, x + r, y + r], fill=(*c3, a))
    near = near.filter(ImageFilter.GaussianBlur(3.4))
    base = Image.alpha_composite(base, near)

    # 暗角
    vig = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-W * 0.28, -H * 0.22, W * 1.28, H * 1.22], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(160))
    dark = Image.new("RGBA", (W, H), (0, 0, 0, 190))
    base = Image.composite(base, Image.alpha_composite(base, dark), vig)

    return base.convert("RGB")


def main():
    cards = json.load(open(f"{ROOT}/cards.json", encoding="utf-8"))
    meta = {}
    for i, card in enumerate(cards):
        cid = card["id"]
        raw = f"{RAW}/{cid}.png"
        if not os.path.exists(raw):
            print(f"缺原图 {cid}")
            continue
        char = key_green(raw)
        char = fit_canvas(char)
        char.save(f"{CHAR}/{cid}.webp", quality=88, method=6)

        bg = make_bg(card, int(cid) * 977 + 13)
        bg.save(f"{BG}/{cid}.webp", quality=82, method=6)

        # 角色主色（用于卡面光晕）
        arr = np.asarray(char).astype(np.float32)
        a = arr[..., 3] > 128
        if a.any():
            mean = arr[..., :3][a].mean(0).astype(int)
            glow = "#%02x%02x%02x" % tuple(int(v) for v in mean)
        else:
            glow = "#b18cff"
        c0, c1, c2, c3 = ELEM_PAL.get(card["element"], ELEM_PAL["星月"])
        meta[cid] = {
            "glow": glow,
            "elem": "#%02x%02x%02x" % c2,
            "particle": "#%02x%02x%02x" % c3,
            "char": os.path.getsize(f"{CHAR}/{cid}.webp"),
        }
        if i % 10 == 0:
            print(f"{i+1}/100 {cid} {card['name']}", flush=True)

    json.dump(meta, open(f"{ROOT}/img/meta.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("完成", len(meta), "张")


if __name__ == "__main__":
    main()
