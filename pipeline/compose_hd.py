#!/usr/bin/env python3
"""高清重制卡面：角色/道具抠像上采样到 1440×1920，铭牌文字直接画进背景层。

思路：
- 不用 AI 重绘，纯 Python（PIL + numpy）做 Lanczos 上采样 + USM 锐化 + 局部对比，
  把 900×1200 的抠像拉到 1440×1920，边缘和细节明显更实。
- 铭牌（名字/类型/编号/稀有度）画在高清背景层上，位置在角色之下，
  角色层叠在上面 —— 文字和卡面同一层、角色压住文字，同时文字是 1440 宽度下的
  高分辨率栅格，缩放后不会糊。
"""
import json, os, sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, "/home/ubuntu/card/gacha")
from compose_cards import RARITY, FONT_BOLD, FONT_REG, font  # noqa: E402

ROOT = "/home/ubuntu/card/gacha"
OUT = f"{ROOT}/site/img/card"
W, H = 1080, 1512


def upscale(im, size=(W, H), sharpen=True):
    out = im.resize(size, Image.LANCZOS)
    if sharpen:
        # USM：半径 2.2、强度 115%、阈值 3，锐化边缘又不炸噪点
        out = out.filter(ImageFilter.UnsharpMask(radius=2.2, percent=115, threshold=3))
    return out


def local_contrast(im, amount=0.12):
    """对 RGB 通道做一点局部对比（unsharp 的柔和版），让画面更透。"""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    blur = np.asarray(im.convert("RGB").filter(ImageFilter.GaussianBlur(18))).astype(np.float32)
    out = rgb + (rgb - blur) * amount
    out = np.clip(out, 0, 255).astype(np.uint8)
    res = Image.fromarray(out, "RGB")
    if im.mode == "RGBA":
        res = res.convert("RGBA")
        res.putalpha(im.split()[3])
    return res


def plate(img, entry, kind):
    """铭牌层（透明底）：底部渐变 + 名字 + 类型 + 编号 + 四角装饰"""
    r = RARITY[entry["rarity"]]
    d = ImageDraw.Draw(img, "RGBA")

    plate_h = int(H * 0.205)
    top = H - plate_h
    # 底部压暗：前 35% 保持通透，让角色腿脚透出来
    grad = Image.new("RGBA", (W, plate_h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(plate_h):
        t = max(0.0, (y / plate_h - 0.34) / 0.66)
        a = int(172 * (t ** 0.85))
        gd.line([(0, y), (W, y)], fill=(7, 8, 13, a))
    img.alpha_composite(grad, (0, top))

    # 文字交给 DOM 渲染（可反向旋转、任意缩放都清晰），这里只留装饰
    # 四角装饰
    L = 58
    for (cx, cy, sx, sy) in [(20, 20, 1, 1), (W - 20, 20, -1, 1), (20, H - 20, 1, -1), (W - 20, H - 20, -1, -1)]:
        d.line([(cx, cy), (cx + L * sx, cy)], fill=r["frame"], width=4)
        d.line([(cx, cy), (cx, cy + L * sy)], fill=r["frame"], width=4)
    return img


def build(kind, entry, src_char, src_bg):
    cid = entry["id"]
    ch = upscale(Image.open(src_char).convert("RGBA"))
    bg = upscale(Image.open(src_bg).convert("RGBA"), sharpen=False)
    ch = local_contrast(ch, 0.10)

    # ── 背景层：只做底部压暗，不放文字 ──
    bgc = bg.copy()
    plate_h = int(H * 0.205)
    top = H - plate_h
    # 必须用独立图层做 alpha_composite：直接在 RGBA 上 draw 会整块覆盖成纯色
    shade = Image.new("RGBA", (W, plate_h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for y in range(plate_h):
        a = int(150 * min(1, (y / plate_h) ** 0.8))
        sd.line([(0, y), (W, y)], fill=(6, 7, 12, a))
    bgc.alpha_composite(shade, (0, top))
    bgc.convert("RGB").save(f"{OUT}/{cid}-bg.webp", quality=84, method=4)

    # ── 角色层：缩到 82%，居中偏上，四周留出卡面 ──
    sc = 0.82
    nw, nh = int(W * sc), int(H * sc)
    ch_s = ch.resize((nw, nh), Image.LANCZOS)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
    alpha = ch_s.split()[3].filter(ImageFilter.GaussianBlur(14))
    shadow.putalpha(alpha.point(lambda v: int(v * 0.45)))
    ox, oy = (W - nw) // 2, int(H * 0.055)
    layer.alpha_composite(shadow, (ox + 4, oy + 14))
    layer.alpha_composite(ch_s, (ox, oy))
    layer.save(f"{OUT}/{cid}-ch.webp", quality=78, method=4)

    # ── 铭牌层：透明底，叠在角色之上 ──
    pl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    plate(pl, entry, kind)
    pl.save(f"{OUT}/{cid}-plate.webp", quality=86, method=4)


def main():
    cards = json.load(open(f"{ROOT}/cards.json", encoding="utf-8"))
    items = json.load(open(f"{ROOT}/items.json", encoding="utf-8"))
    total = 0
    for c in cards:
        build("char", dict(c, sub=f"{c['cls']} · {c['element']}属性"),
              f"{ROOT}/img/char/{c['id']}.webp", f"{ROOT}/img/bg/{c['id']}.webp")
        total += 1
        if total % 20 == 0:
            print(f"{total}/200", flush=True)
    for it in items:
        build("item", dict(it, sub=f"{it['tag']} · {it['element']}属性"),
              f"{ROOT}/img/item/char/{it['id']}.webp", f"{ROOT}/img/item/bg/{it['id']}.webp")
        total += 1
        if total % 20 == 0:
            print(f"{total}/200", flush=True)
    print("完成", total)


if __name__ == "__main__":
    main()
