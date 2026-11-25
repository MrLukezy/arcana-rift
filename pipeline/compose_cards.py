#!/usr/bin/env python3
"""把背景 + 角色合成一张 900×1200 的「全幅卡面」，并生成 pack 应用的 cards-config.js。"""
import json, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = "/home/ubuntu/card/gacha"
OUT_IMG = f"{ROOT}/site/img/card"
os.makedirs(OUT_IMG, exist_ok=True)

W, H = 900, 1200
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"
FONT_REG = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

RARITY = {
    "N":  dict(key="common", label="普通", mark="◆",  frame="#c8ccd6", edge="#7b8291"),
    "R":  dict(key="rare",   label="稀有", mark="◆◆", frame="#7fb0ee", edge="#3d6fc4"),
    "SR": dict(key="holo",   label="史诗", mark="✦",  frame="#c9b3ff", edge="#7c5ce0"),
    "SSR": dict(key="ultra", label="传说", mark="✦✦", frame="#ffe08a", edge="#d99b14"),
    "UR": dict(key="secret", label="神话", mark="✧✧", frame="#ffd1ec", edge="#ff7ad9"),
}

def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        return ImageFont.truetype(path, size)


CW, CH = 640, 854


def compose_layers(card):
    """输出拆层的卡面素材：背景层 / 角色层（供前端做 3D 视差）"""
    bg = Image.open(f"{ROOT}/img/bg/{card['id']}.webp").convert("RGBA").resize((CW, CH), Image.LANCZOS)
    ch = Image.open(f"{ROOT}/img/char/{card['id']}.webp").convert("RGBA").resize((CW, CH), Image.LANCZOS)

    # 背景：底部压暗，给铭牌留出可读区域
    bgd = ImageDraw.Draw(bg, "RGBA")
    for y in range(int(CH * 0.74), CH):
        a = int(118 * (y - CH * 0.74) / (CH * 0.26))
        bgd.line([(0, y), (CW, y)], fill=(6, 7, 12, a))

    # 角色：带落地投影，透明背景
    out = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    alpha = ch.split()[3].filter(ImageFilter.GaussianBlur(12))
    shadow.putalpha(alpha.point(lambda v: int(v * 0.55)))
    out.alpha_composite(shadow, (4, 12))
    out.alpha_composite(ch)



def compose_item(item):
    """道具：img/item 的 bg + char → 全幅卡面 + 拆层三件套（画布 640×854）"""
    if (os.path.exists(f"{OUT_IMG}/{item['id']}-ch.webp")
            and os.path.exists(f"{OUT_IMG}/{item['id']}-bg.webp")
            and os.path.exists(f"{OUT_IMG}/{item['id']}.webp")):
        return 0
    bg = Image.open(f"{ROOT}/img/item/bg/{item['id']}.webp").convert("RGBA").resize((CW, CH), Image.LANCZOS)
    ch = Image.open(f"{ROOT}/img/item/char/{item['id']}.webp").convert("RGBA").resize((CW, CH), Image.LANCZOS)

    d0 = ImageDraw.Draw(bg, "RGBA")
    for y in range(int(CH * 0.74), CH):
        a = int(118 * (y - CH * 0.74) / (CH * 0.26))
        d0.line([(0, y), (CW, y)], fill=(6, 7, 12, a))
    bg.convert("RGB").save(f"{OUT_IMG}/{item['id']}-bg.webp", quality=82, method=4)

    out = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    alpha = ch.split()[3].filter(ImageFilter.GaussianBlur(9))
    shadow.putalpha(alpha.point(lambda v: int(v * 0.5)))
    out.alpha_composite(shadow, (3, 10))
    out.alpha_composite(ch)
    out.save(f"{OUT_IMG}/{item['id']}-ch.webp", quality=86, method=4)

    r = RARITY[item["rarity"]]
    full = bg.copy()
    full.alpha_composite(out)
    d = ImageDraw.Draw(full, "RGBA")

    plate_h = int(CH * 0.20)
    top = CH - plate_h
    grad = Image.new("RGBA", (CW, plate_h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(plate_h):
        a = int(230 * min(1, (y / plate_h) ** 0.6))
        gd.line([(0, y), (CW, y)], fill=(8, 9, 14, a))
    full.alpha_composite(grad, (0, top))

    f_name = font(FONT_BOLD, 46)
    f_sub = font(FONT_REG, 22)
    d.line([(CW * 0.09, top + 13), (CW * 0.91, top + 13)], fill=r["frame"], width=2)
    tw = d.textlength(item["name"], font=f_name)
    d.text(((CW - tw) / 2, top + 30), item["name"], font=f_name, fill=(255, 255, 255, 255))
    sub = f"{item['tag']} · {item['element']}属性"
    sw = d.textlength(sub, font=f_sub)
    d.text(((CW - sw) / 2, top + 88), sub, font=f_sub, fill=(210, 216, 232, 235))

    tag = f"{item['rarity']} {r['label']}"
    tgw = d.textlength(tag, font=f_sub)
    d.rounded_rectangle([20, 20, 20 + tgw + 26, 20 + 40], radius=10,
                        fill=(10, 11, 17, 212), outline=r["edge"], width=2)
    d.text((33, 28), tag, font=f_sub, fill=(255, 255, 255, 240))
    serial = f"NO.{item['id'][1:]} / 100"
    d.text((CW - 20 - d.textlength(serial, font=f_sub), 28), serial, font=f_sub,
           fill=(200, 206, 222, 205))

    for (cx, cy, sx, sy) in [(13, 13, 1, 1), (CW - 13, 13, -1, 1), (13, CH - 13, 1, -1), (CW - 13, CH - 13, -1, -1)]:
        d.line([(cx, cy), (cx + 38 * sx, cy)], fill=r["frame"], width=2)
        d.line([(cx, cy), (cx, cy + 38 * sy)], fill=r["frame"], width=2)

    full.convert("RGB").save(f"{OUT_IMG}/{item['id']}.webp", quality=86, method=4)
    return os.path.getsize(f"{OUT_IMG}/{item['id']}.webp")


def compose(card):
    """只生成图鉴用的全幅卡面（640×854）。-bg/-ch/-plate 由 compose_hd.py 负责，别在这里覆盖。"""
    if os.path.exists(f"{OUT_IMG}/{card['id']}.webp"):
        return 0
    bg = Image.open(f"{ROOT}/img/bg/{card['id']}.webp").convert("RGBA").resize((W, H), Image.LANCZOS)
    ch = Image.open(f"{ROOT}/img/char/{card['id']}.webp").convert("RGBA").resize((W, H), Image.LANCZOS)
    # 角色投影：轻微下移的暗影，让角色「站」在背景上
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    alpha = ch.split()[3].filter(ImageFilter.GaussianBlur(18))
    shadow.putalpha(alpha.point(lambda v: int(v * 0.5)))
    img = bg.copy()
    img.alpha_composite(shadow, (6, 18))
    img.alpha_composite(ch)

    # 底部铭牌
    d = ImageDraw.Draw(img, "RGBA")
    plate_h = 168
    top = H - plate_h
    grad = Image.new("RGBA", (W, plate_h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(plate_h):
        a = int(232 * min(1, (y / plate_h) ** 0.6))
        gd.line([(0, y), (W, y)], fill=(8, 9, 14, a))
    img.alpha_composite(grad, (0, top))

    r = RARITY[card["rarity"]]
    # 稀有度线
    d.line([(W * 0.09, top + 18), (W * 0.91, top + 18)], fill=r["frame"] + "", width=2)

    f_name = font(FONT_BOLD, 62)
    f_sub = font(FONT_REG, 30)
    f_chip = font(FONT_REG, 30)

    name = card["name"]
    tw = d.textlength(name, font=f_name)
    d.text(((W - tw) / 2, top + 44), name, font=f_name, fill=(255, 255, 255, 255))
    sub = f"{card['cls']} · {card['element']}属性"
    sw = d.textlength(sub, font=f_sub)
    d.text(((W - sw) / 2, top + 116), sub, font=f_sub, fill=(210, 216, 232, 235))

    # 稀有度角标
    tag = f"{card['rarity']} {r['label']}"
    tgw = d.textlength(tag, font=f_chip)
    d.rounded_rectangle([28, 28, 28 + tgw + 34, 28 + 52], radius=12,
                        fill=(10, 11, 17, 210), outline=r["edge"] + "", width=2)
    d.text((45, 38), tag, font=f_chip, fill=(255, 255, 255, 240))

    # 编号
    serial = f"NO.{card['id']}/100"
    d.text((W - 28 - d.textlength(serial, font=f_chip), 38), serial,
           font=f_chip, fill=(200, 206, 222, 200))

    # 四角装饰
    for (cx, cy, sx, sy) in [(18, 18, 1, 1), (W - 18, 18, -1, 1), (18, H - 18, 1, -1), (W - 18, H - 18, -1, -1)]:
        d.line([(cx, cy), (cx + 54 * sx, cy)], fill=r["frame"] + "", width=3)
        d.line([(cx, cy), (cx, cy + 54 * sy)], fill=r["frame"] + "", width=3)

    img.convert("RGB").save(f"{OUT_IMG}/{card['id']}.webp", quality=88, method=6)
    compose_layers(card)
    return os.path.getsize(f"{OUT_IMG}/{card['id']}.webp")


def build_config(cards, items, ver="3"):
    """生成 pack 应用的 cards-config.js"""
    q = f"?v={ver}"
    pool = []
    for c in cards:
        r = RARITY[c["rarity"]]
        pool.append({
            "id": c["id"],
            "name": c["name"],
            "tag": c["cls"],
            "trait": f"{c['race']}娘 · {c['element']}属性 · {c['wpn']}",
            "serial": f"{c['id']}/100",
            "rarity": r["key"],
            "rarityMark": r["mark"],
            "rarityLabel": r["label"],
            "kind": "char",
            "character": {"image": f"img/card/{c['id']}.webp{q}", "glyph": "❖"},
            "fullArtImage": f"img/card/{c['id']}.webp{q}",
            "artBg": f"img/card/{c['id']}-bg.webp{q}",
            "artChar": f"img/card/{c['id']}-ch.webp{q}",
            "artPlate": f"img/card/{c['id']}-plate.webp{q}",
            "frameBg": f"linear-gradient(155deg,{r['frame']} 0%,{r['edge']} 100%)",
            "plaqueBg": "linear-gradient(180deg, rgba(16,18,26,.96), rgba(8,9,14,.98))",
            "edgeColor": r["edge"],
            "textColor": "#f2f5ff",
            "windowBg": "linear-gradient(174deg,#2a2f3c 0%,#151821 100%)",
        })

    for it in items:
        r = RARITY[it["rarity"]]
        pool.append({
            "id": it["id"],
            "name": it["name"],
            "tag": it["tag"],
            "trait": f"道具 · {it['element']}属性",
            "serial": f"{it['id'][1:]}/100",
            "rarity": r["key"],
            "rarityMark": r["mark"],
            "rarityLabel": r["label"],
            "kind": "item",
            "fullArtImage": f"img/card/{it['id']}.webp{q}",
            "artBg": f"img/card/{it['id']}-bg.webp{q}",
            "artChar": f"img/card/{it['id']}-ch.webp{q}",
            "artPlate": f"img/card/{it['id']}-plate.webp{q}",
            "character": {"image": f"img/card/{it['id']}.webp{q}", "glyph": "❖"},
            "frameBg": f"linear-gradient(155deg,{r['frame']} 0%,{r['edge']} 100%)",
            "plaqueBg": "linear-gradient(180deg, rgba(16,18,26,.96), rgba(8,9,14,.98))",
            "edgeColor": r["edge"],
            "textColor": "#f2f5ff",
            "windowBg": "linear-gradient(174deg,#2a2f3c 0%,#151821 100%)",
        })

    cfg = '''/**
 * Arcana Rift · 卡池与包装配置（本应用唯一数据入口）
 * 交互骨架来自 SimpleMkt PRISM（MIT，见 NOTICE.md），卡面为本站 100 位兽娘。
 */

export const PACK_BRAND = {
  logo: 'ARCANA',
  seriesCode: '星界盟约 · 第一期',
  tearHint: '◀ 撕开封蜡 ⟶',
  footerLeft: '星界盟约 · 第一部',
  footerRight: '五张卡',
  microSpec: '星界认证 · 全息保底',
  backHeadline: '一百位兽娘\\n皆封于箔纸之中',
  backSpec: 'ARCANA RIFT · LOT AR-100',
};

export const PACK_THEMES = [
  { name: '星辉薄暮', code: 'DUSK', color: '#3b2c63', highlight: '#b9a5f0', shadow: '#0a0714' },
  { name: '霜蓝秘仪', code: 'FROST', color: '#1e3a5f', highlight: '#8fd8ff', shadow: '#070d16' },
  { name: '赤炎誓约', code: 'EMBER', color: '#7c2e1c', highlight: '#f0a878', shadow: '#1e0703' },
  { name: '樱瓣低语', code: 'SAKURA', color: '#6d2a4a', highlight: '#f0a8c8', shadow: '#1a0710' },
  { name: '玄夜秘藏', code: 'NIGHT', color: '#26283f', highlight: '#9aa2cc', shadow: '#05060c' },
  { name: '圣金典藏', code: 'AURUM', color: '#6d5324', highlight: '#f0d79a', shadow: '#1c1408' },
];

// 五档稀有度（N / R / SR / SSR / UR）
export const RARITY_META = {
  common: { rank: 1, aura: 'rgba(200, 205, 220, 0.0)', shockColor: '#e6eaf4', autoFlip: true },
  rare:   { rank: 2, aura: '#6f8fd8', shockColor: '#a8c4ff', autoFlip: false },
  holo:   { rank: 3, aura: '#a78bfa', shockColor: '#d5c6ff', autoFlip: false },
  ultra:  { rank: 4, aura: '#e6b64c', shockColor: '#ffd98a', autoFlip: false },
  secret: { rank: 5, aura: '#ff7ad9', shockColor: '#ffc8ec', autoFlip: false },
};

export const MASCOT_CONFIG = { glyph: '❖', rigged: false };

export const CARD_POOL = ''' + json.dumps(pool, ensure_ascii=False, indent=2) + ''';
'''
    open(f"{ROOT}/site/src/cards-config.js", "w", encoding="utf-8").write(cfg)
    return len(pool)


def main():
    cards = json.load(open(f"{ROOT}/cards.json", encoding="utf-8"))
    total = 0
    for i, c in enumerate(cards, 1):
        total += compose(c)
        if i % 20 == 0:
            print(f"{i}/100", flush=True)
    items = json.load(open(f"{ROOT}/items.json", encoding="utf-8"))
    for i, it in enumerate(items, 1):
        compose_item(it)
    n = build_config(cards, items)
    print(f"完成 {n} 张卡面，共 {total/1024/1024:.1f} MB")


if __name__ == "__main__":
    main()
