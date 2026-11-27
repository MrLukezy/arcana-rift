#!/usr/bin/env python3
"""生成三消对战的敌人立绘（与卡牌不同的怪物设计），绿幕 + 本地抠像。"""
import base64
import json
import os
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE, MODEL = "https://www.hfsyapi.cn", "gpt-image-2.5"
OUT = "/home/ubuntu/card/gacha/img/enemy/raw"
os.makedirs(OUT, exist_ok=True)
REF = "https://gacha.lukezystudio.cn/anim/ref/001.png"

KEY = None
for line in open(os.path.expanduser("~/.dsh/vision.env"), encoding="utf-8"):
    if line.startswith("VISION_API_KEY="):
        KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
assert KEY

TAIL = (
    "这是一只怪物，不是人类角色。全身像、正面略微侧身站立，肢体完整不裁切，"
    "画风与参考图一致：暗色奇幻、水墨晕染、鎏金点缀、细腻的发光细节；"
    "纯 #00FF00 亮绿幕背景，背景必须绝对均匀，不要投影落在地上，不要文字、水印、边框。"
)

JOBS = [
    ("e_vine", "一只腐化藤妖：由扭曲枯藤与苔藓构成的树精躯干，胸口嵌一颗发出绿光的腐蚀core，"
               "手臂是带刺的藤蔓，头顶长着枯枝与几点微光菌菇。"),
    ("e_hound", "一只灰烬狼犬：浑身覆盖着灰白余烬与暗红裂纹的双头狼，"
                "四肢燃烧着将熄的火星，尾巴是散开的浓烟。"),
    ("e_spider", "一只深渊晶蛛：身体是悬浮的紫黑色晶簇，八条由棱柱水晶构成的长腿，"
                 "腹部透出内部流转的星空光。"),
    ("e_raven", "一只雷暴鸦灵：由紫色雷云凝聚而成的巨大乌鸦，眼窝是两团闪电，"
                "羽翼边缘不断散出细小的电弧。"),
    ("e_golem", "一只熔岩巨像：黑曜石与冷却岩浆构成的人形巨怪，肩膀与背部裂开露出暗红熔岩，"
                "胸口有一枚跳动的火光核。"),
    ("e_wraith", "一只虚空蚀影：漂浮的黑紫斗篷团块，边缘不断被虚无侵蚀出缺口，"
                 "斗篷下只有两点幽光眼睛与半透明的手臂。"),
]


def gen(prompt, out, retries=3):
    content = [
        {"type": "text", "text": prompt + "\n" + TAIL},
        {"type": "image_url", "image_url": {"url": REF}},
    ]
    body = json.dumps({"model": MODEL, "messages": [{"role": "user", "content": content}],
                       "stream": False}).encode()
    last = None
    for a in range(retries):
        try:
            req = urllib.request.Request(BASE + "/v1/chat/completions", data=body,
                headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=640) as r:
                d = json.loads(r.read())
            c = d["choices"][0]["message"]["content"]
            if not isinstance(c, str):
                c = json.dumps(c)
            m = re.search(r"data:image/\w+;base64,([A-Za-z0-9+/=]+)", c)
            if m:
                data = base64.b64decode(m.group(1))
            else:
                u = re.search(r"!\[[^\]]*\]\((https?://[^)]+)\)", c)
                if not u:
                    raise RuntimeError("无图:" + c[:120])
                rq = urllib.request.Request(u.group(1), headers={"User-Agent": "curl/8"})
                with urllib.request.urlopen(rq, timeout=240) as rr:
                    data = rr.read()
            if len(data) < 20000:
                raise RuntimeError("图太小")
            open(out + ".part", "wb").write(data)
            os.replace(out + ".part", out)
            return len(data)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(5 * (a + 1))
    raise RuntimeError(str(last)[:160])


def one(job):
    name, prompt = job
    p = f"{OUT}/{name}.png"
    if os.path.exists(p) and os.path.getsize(p) > 20000:
        return name, "skip"
    t = time.time()
    n = gen(prompt, p)
    return name, f"{n // 1024}KB {round(time.time() - t)}s"


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=6) as ex:
        for k, v in ex.map(one, JOBS):
            print("✓", k, v, flush=True)
