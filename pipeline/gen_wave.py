#!/usr/bin/env python3
"""生成真正的动作序列帧：挥手 / 道具摆动。

和上一版「上浮呼吸」不同，这里每一帧都是一次明确的姿态变化，
参考图始终用原图，避免逐帧误差累积。
"""
import base64, json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://www.hfsyapi.cn"
MODEL = "gpt-image-2.5"
ROOT = "/home/ubuntu/card/gacha"
OUT = f"{ROOT}/img/anim/wave"
PUB = "https://gacha.lukezystudio.cn/anim/ref"
KEY = None
for line in open(os.path.expanduser("~/.dsh/vision.env"), encoding="utf-8"):
    if line.startswith("VISION_API_KEY="):
        KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
assert KEY
os.makedirs(OUT, exist_ok=True)

CHAR_TAIL = ("除了这只手臂的动作之外，角色的脸、五官、发色、服装、配饰、尾巴、另一只手、"
             "双腿的姿态与重心、身体在画面中的大小和位置，以及背景、画风、配色都保持与原图完全一致。"
             "竖版 3:4，纯 #00FF00 亮绿幕背景，背景绝对均匀干净，不要文字水印边框。")

ITEM_TAIL = ("除了道具本身的角度与光效之外，画面大小、位置、配色、画风与原图完全一致。"
             "竖版 3:4，纯 #00FF00 亮绿幕背景，背景绝对均匀干净，不要文字水印边框。")

HAND = "画面右侧那只空着的手"

JOBS = [
    ("001", "001.png", "w2",
     f"以这张角色立绘为基准，画同一个角色挥手动作的第 2 步：{HAND}抬起到胸前高度，"
     "前臂竖起、手掌张开朝前，手肘自然下垂。"),
    ("001", "001.png", "w3",
     f"以这张角色立绘为基准，画同一个角色挥手动作的第 3 步：{HAND}举到肩膀以上、手掌张开朝前，"
     "手臂略微向外张开，像在打招呼。"),
    ("001", "001.png", "w4",
     f"以这张角色立绘为基准，画同一个角色挥手动作的第 4 步：{HAND}仍举在肩膀以上，"
     "手腕连同手掌向画面右侧（角色自己的左侧）倾斜约 20 度。"),
    ("001", "001.png", "w5",
     f"以这张角色立绘为基准，画同一个角色挥手动作的第 5 步：{HAND}仍举在肩膀以上，"
     "手腕连同手掌向画面左侧（角色自己的右侧）倾斜约 20 度。"),
    ("001", "001.png", "w6",
     f"以这张角色立绘为基准，画同一个角色挥手动作的第 6 步：{HAND}放回胸前高度，手掌自然放松，准备放下。"),
    ("P23", "P23.png", "w2",
     "以这件道具立绘为基准，画同一件道具摆动的第 2 帧：整体顺时针旋转约 8 度，金色光晕变亮。"),
    ("P23", "P23.png", "w3",
     "以这件道具立绘为基准，画同一件道具摆动的第 3 帧：整体逆时针旋转约 10 度，金色光晕最盛、星尘增多。"),
    ("P23", "P23.png", "w4",
     "以这件道具立绘为基准，画同一件道具摆动的第 4 帧：整体逆时针旋转约 18 度，光晕变暗、星尘减少。"),
    ("P23", "P23.png", "w5",
     "以这件道具立绘为基准，画同一件道具摆动的第 5 帧：整体接近原角度、略顺时针偏 4 度，光晕柔和。"),
]


def gen(prompt, ref_url, path, retries=3):
    content = [
        {"type": "text", "text": prompt},
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
    cid, ref, tag, prompt = job
    path = f"{OUT}/{cid}_{tag}.png"
    if os.path.exists(path) and os.path.getsize(path) > 80000:
        return cid, tag, "skip"
    t0 = time.time()
    tail = CHAR_TAIL if cid == "001" else ITEM_TAIL
    n = gen(prompt + tail, f"{PUB}/{ref}", path)
    return cid, tag, f"{n//1024}KB {round(time.time()-t0)}s"


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=4) as ex:
        for cid, tag, msg in ex.map(one, JOBS):
            print("✓", cid, tag, msg, flush=True)
    print("完成")
