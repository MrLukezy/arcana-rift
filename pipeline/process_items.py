#!/usr/bin/env python3
"""道具素材处理：绿幕抠像 → 居中留白 → 程序化背景，与角色卡同一套输出。

输出：
  img/item/char/<id>.webp   道具抠像（RGBA）
  img/item/bg/<id>.webp     背景
  img/item/meta.json        主色/元素色，供卡面光晕使用
"""
import json, os, sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, "/home/ubuntu/card/gacha")
from process_assets import ELEM_PAL, W, H, fit_canvas, key_green, make_bg  # noqa: E402


def despeckle(im, min_area=900):
    """道具立绘常带一圈星尘碎点，按连通域剔除，只留主体与足够大的部件。"""
    arr = np.asarray(im).copy()
    alpha = arr[..., 3]
    mask = (alpha > 60).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n <= 1:
        return im
    keep = np.zeros(n, np.uint8)
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA]
        if area >= min_area or i == best:
            keep[i] = 1
    solid = keep[labels]
    # 边缘羽化，避免锯齿
    solid = cv2.GaussianBlur(solid.astype(np.float32), (0, 0), 0.8)
    arr[..., 3] = (alpha * solid).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")

ROOT = "/home/ubuntu/card/gacha"
RAW = f"{ROOT}/img/item/raw"
CHAR = f"{ROOT}/img/item/char"
BG = f"{ROOT}/img/item/bg"
os.makedirs(CHAR, exist_ok=True)
os.makedirs(BG, exist_ok=True)


def main():
    items = json.load(open(f"{ROOT}/items.json", encoding="utf-8"))
    meta = {}
    for i, item in enumerate(items):
        iid = item["id"]
        raw = f"{RAW}/{iid}.png"
        if not os.path.exists(raw):
            print(f"缺原图 {iid}")
            continue
        # 道具留白比角色大：物件居中偏上，给下方铭牌让位
        obj = despeckle(key_green(raw))
        obj = fit_canvas(obj, margin=0.16)
        obj.save(f"{CHAR}/{iid}.webp", quality=88, method=4)

        bg = make_bg(item, int(iid[1:]) * 613 + 29)
        bg.save(f"{BG}/{iid}.webp", quality=82, method=4)

        arr = np.asarray(obj).astype(np.float32)
        a = arr[..., 3] > 128
        if a.any():
            glow = "#%02x%02x%02x" % tuple(int(v) for v in arr[..., :3][a].mean(0))
        else:
            glow = "#b18cff"
        c0, c1, c2, c3 = ELEM_PAL.get(item["element"], ELEM_PAL["星月"])
        meta[iid] = {
            "glow": glow,
            "elem": "#%02x%02x%02x" % c2,
            "particle": "#%02x%02x%02x" % c3,
        }
        print(f"{i+1}/{len(items)} {iid} {item['name']}", flush=True)

    json.dump(meta, open(f"{ROOT}/img/item/meta.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("完成", len(meta), "件道具")


if __name__ == "__main__":
    main()
