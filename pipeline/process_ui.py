#!/usr/bin/env python3
"""把生成的绿幕 UI 素材抠成透明 webp：去绿、裁边、统一尺寸。"""
import os

import numpy as np
from PIL import Image, ImageFilter

RAW = "/home/ubuntu/card/gacha/img/ui/raw"
OUT = "/home/ubuntu/card/gacha/site/img/ui"
os.makedirs(OUT, exist_ok=True)

# 文件名 -> 输出边长（pack_front 单独处理）
SIZES = {
    "icon_home": 220, "icon_bag": 220, "icon_pack": 260, "icon_fight": 220, "icon_trade": 220,
    "icon_coin": 128, "icon_gem": 128, "icon_ticket": 128, "icon_mail": 140,
    "icon_task": 140, "icon_fire": 120, "icon_lock": 120,
    "gem_fire": 200, "gem_water": 200, "gem_wind": 200,
    "gem_thunder": 200, "gem_light": 200, "gem_dark": 200,
}


def key_green(im):
    arr = np.asarray(im.convert("RGB")).astype(np.int16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    excess = g - np.maximum(r, b)
    alpha = np.clip((36 - excess) * 7, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([arr.astype(np.uint8), alpha]), "RGBA")


def trim(im, pad=6):
    bbox = im.split()[3].point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def square(im, size):
    im = trim(im)
    side = max(im.width, im.height)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def main():
    done = 0
    for name, size in SIZES.items():
        src = f"{RAW}/{name}.png"
        if not os.path.exists(src):
            print("跳过", name)
            continue
        im = key_green(Image.open(src)).filter(ImageFilter.MedianFilter(3))
        out = square(im, size)
        out.save(f"{OUT}/{name}.webp", quality=88, method=4)
        done += 1

    # 卡包正面：保留 3:4 比例
    src = f"{RAW}/pack_front.png"
    if os.path.exists(src):
        im = key_green(Image.open(src)).filter(ImageFilter.MedianFilter(3))
        im = trim(im, 8)
        w = 620
        h = int(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(f"{OUT}/pack_front.webp", quality=86, method=4)
        print("pack_front", w, h)
        done += 1

    print("完成", done, "个素材")


if __name__ == "__main__":
    main()
