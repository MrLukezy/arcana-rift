#!/usr/bin/env python3
"""生成游戏化 UI 素材（图标 / 卡包 / 宝石 / 战场），统一绿幕 + 本地抠像。

风格锚点：用站内已有的卡牌立绘做参考图，保证「暗色奇幻 + 水墨 + 鎏金」一致。
"""
import base64, json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://www.hfsyapi.cn"
MODEL = "gpt-image-2.5"
ROOT = "/home/ubuntu/card/gacha"
OUT = f"{ROOT}/img/ui/raw"
REF = "https://gacha.lukezystudio.cn/anim/ref/001.png"   # 已有的卡牌立绘，用作风格锚
KEY = None
for line in open(os.path.expanduser("~/.dsh/vision.env"), encoding="utf-8"):
    if line.startswith("VISION_API_KEY="):
        KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
assert KEY
os.makedirs(OUT, exist_ok=True)

STYLE = ("风格必须与参考图里的卡牌立绘完全统一：暗色奇幻、水墨晕染、鎏金描边、"
         "细微的星尘高光，色彩浓郁但边缘干净。纯 #00FF00 亮绿幕背景，"
         "背景必须绝对均匀，不要投影落在地上，不要文字、水印、边框。")

JOBS = [
    # (文件名, 尺寸比例, 提示词)
    ("icon_home", "1:1", "一个圆形的奇幻店铺图标：水墨风格的摊位屋顶 + 一盏金色灯笼，极简 silhouette，游戏主城按钮图标。"),
    ("icon_bag", "1:1", "一个圆形的奇幻背包图标：皮质行囊 + 金色搭扣 + 系带，水墨渲染，游戏背包按钮图标。"),
    ("icon_pack", "1:1", "一个圆形的奇幻卡包图标：鼓起的卡包 + 金色封蜡 + 露出的卡牌边角，游戏开包按钮图标。"),
    ("icon_fight", "1:1", "一个圆形的奇幻对战图标：交叉的双剑 + 背后一枚六芒星符文，游戏对战按钮图标。"),
    ("icon_trade", "1:1", "一个圆形的奇幻交易图标：一架金色天平，两端各放一枚符文币，游戏交易按钮图标。"),
    ("icon_coin", "1:1", "一枚奇幻金币图标：圆形金币，正面压印星形符文，金色高光，轻微磨损，游戏货币图标。"),
    ("icon_gem", "1:1", "一颗奇幻宝石图标：紫红色多面切割水晶，内部有光晕，游戏钻石货币图标。"),
    ("icon_ticket", "1:1", "一张奇幻券图标：青蓝色符纸券，边缘鎏金，中间一个星形印记，游戏抽卡券图标。"),
    ("icon_mail", "1:1", "一个奇幻信封图标：暗红皮纸信封 + 金色封蜡印章，游戏信箱图标。"),
    ("icon_task", "1:1", "一卷奇幻卷轴图标：展开一半的羊皮卷轴 + 金色轴头，写有看不见的符文，游戏任务图标。"),
    ("icon_fire", "1:1", "一簇奇幻火焰图标：橙红火焰 + 内部亮黄核心，水墨笔触，游戏属性图标。"),
    ("icon_lock", "1:1", "一把奇幻锁图标：古铜色挂锁 + 金色锁孔，游戏未解锁图标。"),
    ("gem_fire", "1:1", "一颗三消宝石：菱形切割的红橙色火属性宝石，内部有火焰纹流动，中心一个火焰符文，游戏消除棋子。"),
    ("gem_water", "1:1", "一颗三消宝石：菱形切割的深蓝色水属性宝石，内部有水波流动，中心一个水滴符文，游戏消除棋子。"),
    ("gem_wind", "1:1", "一颗三消宝石：菱形切割的翠绿色风属性宝石，内部有旋风纹，中心一个气流符文，游戏消除棋子。"),
    ("gem_thunder", "1:1", "一颗三消宝石：菱形切割的紫色雷属性宝石，内部有电弧，中心一个闪电符文，游戏消除棋子。"),
    ("gem_light", "1:1", "一颗三消宝石：菱形切割的明黄色光属性宝石，内部发出柔和光芒，中心一个太阳符文，游戏消除棋子。"),
    ("gem_dark", "1:1", "一颗三消宝石：菱形切割的黑紫色暗属性宝石，内部有旋涡，中心一个月牙符文，游戏消除棋子。"),
    ("pack_front", "3:4", "一个竖版奇幻卡包正面：暗紫色皮革包体 + 鎏金符文封印 + 四角金属护片 + 顶部装饰纹带，"
                        "中间是发光的星界徽记，边缘有细密的金色描线，游戏抽卡卡包。"),
]

SIZES = {"1:1": "768x768", "3:4": "768x1024"}


def gen(prompt, out, aspect, retries=3):
    content = [
        {"type": "text", "text": prompt + STYLE},
        {"type": "image_url", "image_url": {"url": REF}},
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
            if len(data) < 20000:
                raise RuntimeError(f"图太小 {len(data)}")
            tmp = out + ".part"
            open(tmp, "wb").write(data)
            os.replace(tmp, out)
            return len(data)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(6 * (attempt + 1))
    raise RuntimeError(str(last)[:200])


def one(job):
    name, aspect, prompt = job
    p = f"{OUT}/{name}.png"
    if os.path.exists(p) and os.path.getsize(p) > 15000:
        return name, "skip"
    t0 = time.time()
    n = gen(prompt, p, aspect)
    return name, f"{n//1024}KB {round(time.time()-t0)}s"


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=6) as ex:
        for name, msg in ex.map(one, JOBS):
            print("✓", name, msg, flush=True)
    print("完成")
