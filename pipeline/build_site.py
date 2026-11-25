#!/usr/bin/env python3
"""组装抽卡站：生成 assets/data.js，并把角色与背景素材放进站点目录。"""
import json, os, shutil

ROOT = "/home/ubuntu/card/gacha"
SITE = f"{ROOT}/site"

FIELDS = ("id", "name", "rarity", "cls", "element", "race", "role", "race_desc", "wpn")


def main():
    cards = json.load(open(f"{ROOT}/cards.json", encoding="utf-8"))
    meta = json.load(open(f"{ROOT}/img/meta.json", encoding="utf-8"))

    os.makedirs(f"{SITE}/img/char", exist_ok=True)
    os.makedirs(f"{SITE}/img/bg", exist_ok=True)

    slim, have = [], []
    for c in cards:
        cid = c["id"]
        char = f"{ROOT}/img/char/{cid}.webp"
        bg = f"{ROOT}/img/bg/{cid}.webp"
        if not (os.path.exists(char) and os.path.exists(bg)):
            continue
        shutil.copyfile(char, f"{SITE}/img/char/{cid}.webp")
        shutil.copyfile(bg, f"{SITE}/img/bg/{cid}.webp")
        slim.append({k: c[k] for k in FIELDS})
        have.append(cid)

    data = "window.CARDS = " + json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + ";\n"
    data += "window.CARD_META = " + json.dumps(
        {k: v for k, v in meta.items() if k in have}, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(f"{SITE}/assets/data.js", "w", encoding="utf-8").write(data)

    total = 0
    for d in (f"{SITE}/img/char", f"{SITE}/img/bg"):
        for f in os.listdir(d):
            total += os.path.getsize(os.path.join(d, f))
    print(f"卡片 {len(slim)} 张 → {SITE}  (素材 {total/1024/1024:.1f} MB, data.js {len(data)//1024} KB)")


if __name__ == "__main__":
    main()
