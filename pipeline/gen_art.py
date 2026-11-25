#!/usr/bin/env python3
"""用 hfsy 网关的 gpt-image-2.5 批量生成 100 张绿幕角色立绘。"""
import base64, json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://www.hfsyapi.cn"
MODEL = "gpt-image-2.5"
ROOT = "/home/ubuntu/card/gacha"
RAW = f"{ROOT}/img/raw"
KEY = None
for line in open(os.path.expanduser("~/.dsh/vision.env"), encoding="utf-8"):
    if line.startswith("VISION_API_KEY="):
        KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
assert KEY
os.makedirs(RAW, exist_ok=True)


def gen(prompt, path, retries=3):
    body = json.dumps({"model": MODEL,
                       "messages": [{"role": "user", "content": prompt}],
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
                    raise RuntimeError("响应里没有图片: " + c[:160])
                rq = urllib.request.Request(u.group(1), headers={"User-Agent": "curl/8"})
                with urllib.request.urlopen(rq, timeout=240) as rr:
                    data = rr.read()
            if len(data) < 50000:
                raise RuntimeError(f"图片过小 {len(data)}")
            tmp = path + ".part"
            open(tmp, "wb").write(data)
            os.replace(tmp, path)
            return len(data)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(6 * (attempt + 1))
    raise RuntimeError(str(last)[:200])


def one(card):
    path = f"{RAW}/{card['id']}.png"
    if os.path.exists(path) and os.path.getsize(path) > 80000:
        return card["id"], "skip", os.path.getsize(path)
    t0 = time.time()
    n = gen(card["prompt"], path)
    return card["id"], f"ok {time.time()-t0:.0f}s", n


def main():
    cards = json.load(open(f"{ROOT}/cards.json", encoding="utf-8"))
    only = sys.argv[1:]
    if only:
        cards = [c for c in cards if c["id"] in only or c["slug"] in only]
    conc = int(os.environ.get("CONC", "8"))
    done = ok = fail = 0
    t0 = time.time()
    print(f"共 {len(cards)} 张，并发 {conc}", flush=True)
    with ThreadPoolExecutor(max_workers=conc) as ex:
        futs = {ex.submit(one, c): c for c in cards}
        for f in as_completed(futs):
            c = futs[f]
            done += 1
            try:
                cid, status, size = f.result()
                ok += 1
                print(f"[{done}/{len(cards)}] {cid} {c['name']:12s} {status} {size//1024}KB "
                      f"({time.time()-t0:.0f}s)", flush=True)
            except Exception as e:  # noqa: BLE001
                fail += 1
                print(f"[{done}/{len(cards)}] FAIL {c['id']} {c['name']}: {e}", flush=True)
    print(f"完成 ok={ok} fail={fail} 用时 {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
