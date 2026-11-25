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

## 悬停序列帧动画（实验）

拿两张卡做了原型：**月影狼德鲁伊（001）** 与 **神谕之钥（P23）**。

鼠标悬停到卡片上时，静止的角色层淡出，换成 4 帧序列帧循环播放（上浮 / 飘动 / 光晕呼吸）。

### 怎么生成的

1. `pipeline/gen_anim.py` 走 hfsy 的**「参考图 + 文本」**出图，逐帧描述动作差异
   - 网关**不支持 base64 参考图**，只吃公网 URL，所以参考图放在 `site/anim/ref/`
   - 每帧约 120–340 秒，6 帧共约 12 分钟（3 并发）
2. `pipeline/process_anim.py` 把 4 帧（原图 + 3 张生成帧）对齐成一张 4320×1512 的雪碧图：
   - 绿幕抠像 → 取 alpha 包围盒 → 按高度缩放到基准 → 中心对齐
   - 每帧再叠一点垂直位移（0 / -20 / -32 / +10 px）保证上浮感和循环闭合
   - 最后按 82% 放大到 1080×1512 画布，和静态 `-ch` 完全同一套坐标
3. 前端用 `<i class="ca-anim"><img></i>` 叠在角色层上：

```css
.ca-anim img { width: 400%; height: 100%; }
.card.is-playing .ca-anim img {
  animation: caAnimPlay 1.4s steps(4, jump-none) infinite;
}
@keyframes caAnimPlay { to { transform: translate3d(-75%, 0, 0); } }
```

`steps(4, jump-none)` 是关键：普通的 `steps(4)` 只会停在 0/25/50/75% 的进度上，
最后一帧永远到不了，而且中间会出现半帧错位。

### 从「呼吸」升级成真正的动作

第一版只做了上浮呼吸，看起来不像动画。现在是 6 帧的姿态序列（挥手 / 道具摆动）：

| 帧 | 动作 |
|---|---|
| 1 | 原图（手自然下垂） |
| 2 | 抬手到胸前 |
| 3 | 举到肩高、掌心朝前 |
| 4 | 手腕向一侧偏 20° |
| 5 | 手腕向另一侧偏 20° |
| 6 | 收回胸前 |

播放时用 `alternate` 乒乓循环：`1→2→3→4→5→6→5→4→3→2→1`，
所以首尾天然衔接，不会出现跳帧。

对齐锚点用**头部**（头顶 y + 头部水平中心）而不是整体包围盒——挥手时手臂外扩会把包围盒撑大，
按包围盒对齐整个人会忽大忽小；再按全身高度统一缩放，保证每帧人一样大。

> 关于眨眼：这一版没做。用同一个出图通道生成「闭眼」帧时，模型会把头部角度重画成 3/4 侧脸，
> 和原图对不上，做成眼睛贴片会穿帮。真要做眨眼，需要把头部/眼睛拆成独立图层做伪 Live2D。
