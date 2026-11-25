#!/usr/bin/env python3
"""把挥手 / 道具动作帧对齐成 6 帧雪碧图。

对齐锚点用「头部」而不是整体包围盒：挥手时手臂外扩会撑大包围盒，
按整体包围盒对齐会让整个人忽大忽小。
"""
import json, os

import numpy as np
from PIL import Image, ImageFilter

ROOT = "/home/ubuntu/card/gacha"
OUT = f"{ROOT}/site/img/card"
W, H = 1080, 1512
SC = 0.82
OY = int(H * 0.055)
FRAMES = 6


def key_green(im):
    arr = np.asarray(im.convert("RGB")).astype(np.int16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    excess = g - np.maximum(r, b)
    alpha = np.clip((40 - excess) * 6, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([arr.astype(np.uint8), alpha]), "RGBA")


def head_anchor(im):
    """返回 (头顶 y, 头部水平中心 x, 头高)：用上方 18% 的 alpha 带估算"""
    a = np.asarray(im.split()[3])
    rows = np.where((a > 24).any(axis=1))[0]
    top = int(rows[0])
    bot = int(rows[-1])
    band_end = top + max(20, int((bot - top) * 0.18))
    band = a[top:band_end]
    xs = np.where((band > 24).any(axis=0))[0]
    cx = (int(xs[0]) + int(xs[-1])) / 2
    return top, cx, bot - top


def build(cid, ref_path, tags):
    ref = Image.open(ref_path).convert("RGBA")
    rtop, rcx, rheight = head_anchor(ref)
    print(f"{cid} 基准：头顶 y={rtop}, 头部中心 x={rcx:.0f}, 全身高={rheight}")

    canvases = [ref]
    for tag in tags:
        if tag is None:
            canvases.append(ref)
            continue
        p = f"{ROOT}/img/anim/wave/{cid}_{tag}.png"
        if not os.path.exists(p):
            raise SystemExit(f"缺帧 {p}")
        im = key_green(Image.open(p)).filter(ImageFilter.MedianFilter(3))
        top, cx, h = head_anchor(im)
        # 先按整体高度缩放，让每一帧的人和原图一样大（否则会忽大忽小）
        if h > 0:
            k = rheight / h
            if abs(k - 1) > 0.02:
                im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
                top, cx, h = head_anchor(im)
        c = Image.new("RGBA", ref.size, (0, 0, 0, 0))
        c.alpha_composite(im, (int(rcx - cx), int(rtop - top)))
        canvases.append(c)

    sheet = Image.new("RGBA", (W * len(canvases), H), (0, 0, 0, 0))
    for i, c in enumerate(canvases):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        nw, nh = int(W * SC), int(H * SC)
        c2 = c.resize((nw, nh), Image.LANCZOS)
        shadow = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
        shadow.putalpha(c2.split()[3].filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.45)))
        ox = (W - nw) // 2
        layer.alpha_composite(shadow, (ox + 4, OY + 14))
        layer.alpha_composite(c2, (ox, OY))
        sheet.alpha_composite(layer, (W * i, 0))

    out = f"{OUT}/{cid}-anim.webp"
    sheet.save(out, quality=74, method=4)
    print("✓", out, sheet.size, os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    build("001", f"{ROOT}/img/char/001.webp", ("w2", "w3", "w4", "w5", "w6"))
    # 道具只有 4 张生成帧，用原图收尾凑满 6 帧（循环闭合）
    build("P23", f"{ROOT}/img/item/char/P23.webp", ("w2", "w3", "w4", "w5", None))
