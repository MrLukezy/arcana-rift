# Arcana Rift · 星界盟约

一个可以直接玩的全息抽卡收集站：**撕卡开包 → 逐张翻牌 → 200 件藏品图鉴**。

- 线上演示：https://gacha.lukezystudio.cn/
- 藏品图鉴：https://gacha.lukezystudio.cn/codex.html

![开包台](docs/01-pack.jpg)

## 玩法

- **一包 5 张**，100 位兽娘 + 100 件道具按稀有度权重混抽
- **五档稀有度**：N / R / SR / SSR / UR（`common / rare / holo / ultra / secret`）
- **必须先撕包**：按住封蜡横向扯开，才有光流喷涌和扇形发牌
- 图鉴按「角色 / 道具」分栏，未收录显示黑色剪影，最稀有两档只给 `?`
- 进度存在 `localStorage`，与图鉴页共用

## 技术要点

### 卡面是三层结构

每张卡由三张图叠出来，倾斜时产生视差纵深：

| 图层 | 文件 | 位移系数 | 内容 |
|---|---|---|---|
| 背景 | `img/card/<id>-bg.webp` | 0.07 | 场景 + 底部压暗 |
| 镭射 | CSS 伪层 | — | 彩虹扫光 |
| 角色 | `img/card/<id>-ch.webp` | 0.26 | 抠像角色（浮起） |
| 铭牌 | `img/card/<id>-plate.webp` | 0.30 | 底部渐变 + 角标 |

铭牌文字用 DOM 渲染，并通过 `--rz` 反向抵消卡片旋转，保证名字始终横向可读。

### 生成流水线（`pipeline/`）

```
gen_art.py      100 张兽娘立绘（hfsy gpt-image-2.5，绿幕）
gen_items.py    100 件道具立绘
process_assets.py / process_items.py   绿幕抠像 + 去星尘噪点 + 程序化背景
compose_cards.py   合成 640×854 图鉴用全幅卡面 + 生成 cards-config.js
compose_hd.py      合成 1080×1512 三层高清卡面（Lanczos 上采样 + USM 锐化）
gen_anim.py        用「参考图 + 文本」生成待机序列帧
```

绿幕抠像用 `excess = g - max(r,b)` 做色键，配合形态学与最大连通域；
道具额外做连通域去尘（`min_area=900`），否则物件周围会留一圈星点。

## 本地跑

```bash
pip install pillow numpy
# 站点是纯静态，直接起个静态服务器即可
cd site && python3 -m http.server 8000
```

卡面素材已随仓库提供；重新生成素材需要设置 `HFSY` 的 API key 放在 `~/.dsh/vision.env`。

## 许可

- 本项目代码：MIT
- 开包台交互移植自 [SimpleMkt PRISM](https://github.com/Lone3m-tech/prism-holo-pack)（MIT），见 `NOTICE.md`
- 美术素材全部由本项目生成
