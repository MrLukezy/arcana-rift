#!/usr/bin/env python3
"""把生成的序列帧对齐成一条雪碧图（4 帧横排），供卡片 hover 播放。

对齐策略：
- 以静态角色层（-ch 用到的原始抠像）为基准，取其 alpha 包围盒
- 每帧抓同样大小的包围盒、按高度缩放到基准高度、中心对齐
- 再按帧号叠加一点垂直位移，做出上浮/回落；保证循环闭合、无横向跳动
- 最后放大 82% 放到 1080×1512 画布（与 compose_hd 的 -ch 完全一致）
"""
import json, os, sys

from PIL import Image, ImageFilter

ROOT = "/home/ubuntu/card/gacha"
OUT = f"{ROOT}/site/img/card"
W, H = 1080, 1512
SC = 0.82
OY = int(H * 0.055)

# 每帧的垂直微位移（像素，负数是上浮）
FLOAT = {1: 0, 2: -20, 3: -32, 4: 10}


def key_green(im):
    """与 process_assets.key_green 同款色键。"""
    import numpy as np
    arr = np.asarray(im.convert("RGB")).astype(np.int16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    excess = g - np.maximum(r, b)
    alpha = np.clip((40 - excess) * 6, 0, 255).astype(np.uint8)
    out = np.dstack([arr.astype(np.uint8), alpha])
    return Image.fromarray(out, "RGBA")


def bbox_of(im):
    return im.split()[3].getbbox()


def build(cid, ref_path, src_kind):
    ref = Image.open(ref_path).convert("RGBA")
    rb = bbox_of(ref)
    rw, rh = rb[2] - rb[0], rb[3] - rb[1]
    rcx, rcy = (rb[0] + rb[2]) / 2, (rb[1] + rb[3]) / 2
    print(f"{cid} 基准包围盒 {rw}×{rh}")

    frames = [ref]
    for f in (2, 3, 4):
        p = f"{ROOT}/img/anim/raw/{cid}_f{f}.png"
        if not os.path.exists(p):
            raise SystemExit(f"缺帧 {p}")
        im = key_green(Image.open(p))
        im = im.filter(ImageFilter.MedianFilter(3))
        bb = bbox_of(im)
        fw, fh = bb[2] - bb[0], bb[3] - bb[1]
        scale = rh / fh
        im = im.crop(bb).resize((max(1, int(fw * scale)), rh), Image.LANCZOS)
        frames.append((im, (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2))

    # 统一放进 900×1200 的基准画布（和 ref 同尺寸），再整体放到卡面画布
    base = Image.new("RGBA", ref.size, (0, 0, 0, 0))
    base.alpha_composite(ref, (0, 0))
    canvases = [base]
    for f in frames[1:]:
        im, _, _ = f
        c = Image.new("RGBA", ref.size, (0, 0, 0, 0))
        x = int(rcx - im.width / 2)
        y = int(rcy - im.height / 2 + FLOAT[len(canvases) + 1])
        c.alpha_composite(im, (x, y))
        canvases.append(c)

    sheet = Image.new("RGBA", (W * len(canvases), H), (0, 0, 0, 0))
    for i, c in enumerate(canvases):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        # 与 compose_hd 一致：缩放 82%、水平居中、顶部留 5.5%
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

    # 记录到配置
    return True


def patch_config(ids):
    p = f"{ROOT}/site/src/cards-config.js"
    s = open(p, encoding="utf-8").read()
    for cid in ids:
        s = s.replace(f'"id": "{cid}",', f'"id": "{cid}",\n    "anim": "img/card/{cid}-anim.webp?v=4",', 1)
    open(p, "w", encoding="utf-8").write(s)
    print("配置已写入 anim:", ids)


if __name__ == "__main__":
    build("001", f"{ROOT}/img/char/001.webp", "char")
    build("P23", f"{ROOT}/img/item/char/P23.webp", "item")
    patch_config(["001", "P23"])
