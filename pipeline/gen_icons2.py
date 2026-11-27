#!/usr/bin/env python3
"""生成浅色系导航图标（白描边 + 鎏金），供清新主题使用。"""
import base64
import json
import os
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE, MODEL = "https://www.hfsyapi.cn", "gpt-image-2.5"
OUT = "/home/ubuntu/card/gacha/img/ui/raw2"
os.makedirs(OUT, exist_ok=True)

KEY = None
for line in open(os.path.expanduser("~/.dsh/vision.env"), encoding="utf-8"):
    if line.startswith("VISION_API_KEY="):
        KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
assert KEY

TAIL = (
    "图标风格：干净的扁平矢量图标，白色主体带细腻的浅金渐变描边与柔和的内部高光，"
    "极简几何造型，不要写实材质，不要文字。背景必须是纯 #00FF00 均匀亮绿，"
    "不要投影落地，不要边框，不要让绿色渗进图形内部。"
)

JOBS = [
    ("icon2_home", "一个店铺图标：小店屋顶 + 门口一盏灯笼的极简剪影"),
    ("icon2_bag", "一个背包图标：行囊的极简剪影，带一个搭扣"),
    ("icon2_pack", "一个卡包图标：鼓起的卡包，顶端露出一角卡牌的剪影"),
    ("icon2_fight", "一个对战图标：交叉的双剑剪影"),
    ("icon2_trade", "一个交易图标：一架天平的剪影"),
]


def gen(prompt, out, retries=3):
    body = json.dumps({"model": MODEL, "messages": [{"role": "user",
        "content": prompt.strip() + "\n" + TAIL}], "stream": False}).encode()
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
            if len(data) < 15000:
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
    if os.path.exists(p) and os.path.getsize(p) > 15000:
        return name, "skip"
    t = time.time()
    n = gen(prompt, p)
    return name, f"{n // 1024}KB {round(time.time() - t)}s"


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=5) as ex:
        for k, v in ex.map(one, JOBS):
            print("✓", k, v, flush=True)
