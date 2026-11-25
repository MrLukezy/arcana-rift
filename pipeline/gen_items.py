#!/usr/bin/env python3
"""批量生成 24 件道具立绘（绿幕），复用 gen_art 的网关与重试逻辑。"""
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, "/home/ubuntu/card/gacha")
from gen_art import gen  # noqa: E402

ROOT = "/home/ubuntu/card/gacha"
RAW = f"{ROOT}/img/item/raw"
os.makedirs(RAW, exist_ok=True)
CONC = 8


def one(item):
    path = f"{RAW}/{item['id']}.png"
    if os.path.exists(path) and os.path.getsize(path) > 80000:
        return item["id"], "skip", os.path.getsize(path)
    t0 = time.time()
    n = gen(item["prompt"], path)
    return item["id"], f"{time.time() - t0:.0f}s", n


def main():
    items = json.load(open(f"{ROOT}/items.json", encoding="utf-8"))
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=CONC) as ex:
        futs = {ex.submit(one, it): it for it in items}
        for f in as_completed(futs):
            it = futs[f]
            try:
                iid, took, size = f.result()
                ok += 1
                print(f"✓ {iid} {it['name']} {took} {size // 1024}KB", flush=True)
            except Exception as e:  # noqa: BLE001
                fail += 1
                print(f"✗ {it['id']} {it['name']} {str(e)[:120]}", flush=True)
    print(f"完成 {ok} 失败 {fail}")


if __name__ == "__main__":
    main()
