#!/usr/bin/env python3
"""生成主界面背景（竖版 9:16），走 hfsy 网关。"""
import base64
import json
import os
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE, MODEL = "https://www.hfsyapi.cn", "gpt-image-2.5"
OUT = "/home/ubuntu/card/gacha/img/bg/raw"
os.makedirs(OUT, exist_ok=True)

KEY = None
for line in open(os.path.expanduser("~/.dsh/vision.env"), encoding="utf-8"):
    if line.startswith("VISION_API_KEY="):
        KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
assert KEY

TAIL = (
    "竖版手机游戏主界面背景，构图：画面上部与下部有内容、中间留出大片干净区域放 UI，"
    "不要任何文字。画风：清新梦幻、通透发光、细腻的水彩与光线渲染，"
    "大量细小金色与白色星芒闪烁，边缘有柔和的彩虹色散。"
)

JOBS = [
    ("bg_sky", """
     一片漂浮在云海之上的奇幻天空：远处是薰衣草紫到蜜桃粉再到薄荷青的晨昏渐变，
     几座漂浮的水晶岛屿与破碎石柱悬浮在空中，长长的光柱从云层缝隙落下，
     空中飘着发光的花瓣与金色尘埃，下方云海翻涌泛着珍珠光泽。整体明亮通透。
    """),
    ("bg_shop", """
     一间开在星空下的奇幻卡牌商店露台：木质檐廊缠着发光的藤蔓，
     桌上摆着发光的卡牌与水晶球，头顶是银河与极光，远处漂浮着灯笼和光环。
     色调是薄荷青 + 薰衣草紫 + 暖金色，明亮通透、闪闪发光。
    """),
    ("bg_crystal", """
     水晶洞窟内部：巨大的半透明粉紫水晶簇从四周生长，内部有流动的虹彩光，
     顶上垂下发光的花藤，地面铺着薄雾与散落光点。明亮通透、折射七彩光。
    """),
]


def gen(prompt, out, retries=3):
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt.strip() + "\n" + TAIL}],
        "stream": False,
    }).encode()
    last = None
    for a in range(retries):
        try:
            req = urllib.request.Request(
                BASE + "/v1/chat/completions",
                data=body,
                headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
            )
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
    with ThreadPoolExecutor(max_workers=3) as ex:
        for k, v in ex.map(one, JOBS):
            print("✓", k, v, flush=True)
