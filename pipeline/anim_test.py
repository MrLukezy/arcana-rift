#!/usr/bin/env python3
"""测试 hfsy 是否支持「参考图 + 文本」出图（用于做同一角色的序列帧）。"""
import base64, json, os, re, sys, time, urllib.request

BASE = "https://www.hfsyapi.cn"
KEY = None
for line in open(os.path.expanduser("~/.dsh/vision.env"), encoding="utf-8"):
    if line.startswith("VISION_API_KEY="):
        KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
assert KEY


def gen_with_ref(prompt, ref_path, out_path, model="gpt-image-2.5"):
    b64 = base64.b64encode(open(ref_path, "rb").read()).decode()
    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64," + b64}},
    ]
    body = json.dumps({"model": model,
                       "messages": [{"role": "user", "content": content}],
                       "stream": False}).encode()
    req = urllib.request.Request(BASE + "/v1/chat/completions", data=body,
                                 headers={"Authorization": "Bearer " + KEY,
                                          "Content-Type": "application/json"})
    t0 = time.time()
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
            raise RuntimeError("无图片: " + c[:200])
        rq = urllib.request.Request(u.group(1), headers={"User-Agent": "curl/8"})
        with urllib.request.urlopen(rq, timeout=240) as rr:
            data = rr.read()
    open(out_path, "wb").write(data)
    return len(data), round(time.time() - t0, 1)


if __name__ == "__main__":
    ref = sys.argv[1]
    out = sys.argv[2]
    prompt = sys.argv[3]
    n, t = gen_with_ref(prompt, ref, out)
    print("saved", out, n, "bytes", t, "s")
