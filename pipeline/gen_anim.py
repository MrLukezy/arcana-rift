#!/usr/bin/env python3
"""用 hfsy 的「参考图 + 文本」生成同一张卡的待机序列帧。

参考图必须是公网 URL（网关不支持 base64 参考图），
所以先把原图放到 site/anim/ref/ 再从这里引用。
"""
import base64, json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

BASE = "https://www.hfsyapi.cn"
MODEL = "gpt-image-2.5"
ROOT = "/home/ubuntu/card/gacha"
OUT = f"{ROOT}/img/anim/raw"
PUB = "https://gacha.lukezystudio.cn/anim/ref"
KEY = None
for line in open(os.path.expanduser("~/.dsh/vision.env"), encoding="utf-8"):
    if line.startswith("VISION_API_KEY="):
        KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
assert KEY
os.makedirs(OUT, exist_ok=True)

TAIL = ("构图、画面大小、角色位置、朝向、画风、配色、线条粗细与原图完全一致，"
        "只改变动作与光影。竖版 3:4，纯 #00FF00 亮绿幕背景（背景必须完全均匀，"
        "不要任何阴影或光斑落在背景上），不要出现文字、水印、边框。")

JOBS = [
    # (id, 参考图文件名, 第几帧, 提示词)
    ("001", "001.png", 2,
     "以这张角色立绘为基准，画同一个角色的第 2 帧待机动画：整体轻微上浮约 3%，"
     "长发与披风向后上方飘起、衣摆外扩，手心的紫色宝石光晕变亮、周围星光增多。"),
    ("001", "001.png", 3,
     "以这张角色立绘为基准，画同一个角色的第 3 帧待机动画：上浮到最高点，"
     "发丝与披风飘到最大幅度、末端分叉，宝石光芒最盛，周身光点最多。"),
    ("001", "001.png", 4,
     "以这张角色立绘为基准，画同一个角色的第 4 帧待机动画：整体回落约 2%，"
     "发丝与披风向下垂落、收拢，宝石光晕变暗、星光减少。"),
    ("P23", "P23.png", 2,
     "以这件道具立绘为基准，画同一件道具的第 2 帧待机动画：整体轻微上浮约 4%，"
     "顺时针旋转约 4 度，金色光晕变亮，周围星尘增多。"),
    ("P23", "P23.png", 3,
     "以这件道具立绘为基准，画同一件道具的第 3 帧待机动画：上浮到最高点，"
     "再顺时针旋转约 4 度，金色光晕最盛、星尘最多，钥齿有高光扫过。"),
    ("P23", "P23.png", 4,
     "以这件道具立绘为基准，画同一件道具的第 4 帧待机动画：回落到原位附近，"
     "旋转回到接近原角度，光晕转暗，星尘减少。"),
]


def gen(prompt, ref_url, path, retries=3):
    content = [
        {"type": "text", "text": prompt + TAIL},
        {"type": "image_url", "image_url": {"url": ref_url}},
    ]
    body = json.dumps({"model": MODEL,
                       "messages": [{"role": "user", "content": content}],
                       "stream": False}).encode()
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(BASE + "/v1/chat/completions", data=body,
                                         headers={"Authorization": "Bearer " + KEY,
                                                  "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=600) as r:
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
                    raise RuntimeError("无图: " + c[:150])
                rq = urllib.request.Request(u.group(1), headers={"User-Agent": "curl/8"})
                with urllib.request.urlopen(rq, timeout=240) as rr:
                    data = rr.read()
            if len(data) < 50000:
                raise RuntimeError(f"图太小 {len(data)}")
            tmp = path + ".part"
            open(tmp, "wb").write(data)
            os.replace(tmp, path)
            return len(data)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(6 * (attempt + 1))
    raise RuntimeError(str(last)[:200])


def one(job):
    cid, ref, frame, prompt = job
    path = f"{OUT}/{cid}_f{frame}.png"
    if os.path.exists(path) and os.path.getsize(path) > 80000:
        return cid, frame, "skip"
    t0 = time.time()
    n = gen(prompt, f"{PUB}/{ref}", path)
    return cid, frame, f"{n//1024}KB {round(time.time()-t0)}s"


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=3) as ex:
        for cid, frame, msg in ex.map(one, JOBS):
            print("✓", cid, "帧", frame, msg, flush=True)
    print("完成")
