/* 移动端全息卡：结构 + 指针/陀螺仪驱动 */
import { CARD_POOL } from "../src/cards-config.js";

const pushed = new Set();

const RAR = {
  common: ["N", "普通"], rare: ["R", "稀有"], holo: ["SR", "史诗"],
  ultra: ["SSR", "传说"], secret: ["UR", "秘宝"],
};
const VALUE = { common: 40, rare: 90, holo: 200, ultra: 520, secret: 1400 };

export function cardHTML(c, opts = {}) {
  const [mark, rname] = RAR[c.rarity] || ["N", "普通"];
  const el = (c.trait.match(/([^\s·]+)属性/) || [, "无"])[1];
  const val = VALUE[c.rarity] || 0;
  const kind = c.kind === "char" ? "角色" : "道具";

  const extra = opts.lg
    ? `<div class="mi-row"><span>战力</span><b>${opts.power ?? ""}</b></div>
       <div class="mi-row"><span>参考价</span><b>${val} <img class="mi-coin" src="../img/ui/icon_coin.webp" alt=""></b></div>
       <div class="mi-row"><span>持有</span><b>×${opts.own ?? 1}</b></div>`
    : `<div class="mi-foot"><span class="mi-power">战 ${opts.power ?? 0}</span><span class="mi-price">${val}<img class="mi-coin" src="../img/ui/icon_coin.webp" alt=""></span></div>`;

  return `<div class="mcard r-${c.rarity}${opts.lg ? " lg" : ""}" data-holo="${c.id}">
    <div class="mcard-inner">
      <img class="mc-bg" src="../${c.artBg}" alt="" draggable="false">
      <i class="mc-holo"></i>
      <i class="mc-glare"></i>
      <img class="mc-ch" src="../${c.artChar}" alt="${c.name}" draggable="false">
      <img class="mc-plate" src="../${c.artPlate}" alt="" draggable="false">

      <div class="mc-info">
        <div class="mc-name" data-txt="${c.name}">${c.name}</div>
        <div class="mc-meta">
          <span class="mc-rar r-${c.rarity}">${mark}</span>
          <span class="mc-kv">${kind}</span>
          <span class="mc-sep">·</span>
          <span class="mc-kv">${el}</span>
          ${opts.lg ? `<span class="mc-sep">·</span><span class="mc-kv">${rname}</span>` : ""}
        </div>
        ${extra}
      </div>

      <i class="mc-clear"></i>
      <i class="mc-sheen"></i>
      <i class="mc-shine"></i>
    </div>
  </div>`;
}

/* 指针 / 手指拖动 → 倾斜 + 光斑位置 */
export function bindHolo(root = document) {
  root.querySelectorAll(".mcard").forEach((el) => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";

    const set = (x, y) => {
      const r = el.getBoundingClientRect();
      const px = Math.min(100, Math.max(0, ((x - r.left) / r.width) * 100));
      const py = Math.min(100, Math.max(0, ((y - r.top) / r.height) * 100));
      el.style.setProperty("--px", px.toFixed(1));
      el.style.setProperty("--py", py.toFixed(1));
      el.style.setProperty("--ry", ((px - 50) * 0.28).toFixed(2) + "deg");
      el.style.setProperty("--rx", ((50 - py) * 0.34).toFixed(2) + "deg");
      el.style.setProperty("--rz", ((px - 50) * 0.1).toFixed(2) + "deg");
      el.style.setProperty("--hyp", Math.min(1, Math.abs(px - 50) / 50 + Math.abs(py - 50) / 50).toFixed(2));
    };

    const reset = () => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--px", "50");
      el.style.setProperty("--py", "50");
      el.style.setProperty("--hyp", "0");
    };

    el.addEventListener("pointerdown", (e) => {
      el.dataset.drag = "1";
      el.classList.add("manual");
      set(e.clientX, e.clientY);
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || el.dataset.drag === "1") set(e.clientX, e.clientY);
    });
    const back = () => {
      el.dataset.drag = "";
      reset();
      setTimeout(() => el.classList.remove("manual"), 900);
    };
    el.addEventListener("pointerup", back);
    el.addEventListener("pointercancel", back);
    el.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") reset();
      else if (el.dataset.drag !== "1") reset();
    });
  });
}

/* 设备倾斜（可选）：让整屏卡片跟着手机轻微动 */
export function bindDeviceTilt() {
  if (pushed.has("devicemotion")) return;
  pushed.add("devicemotion");
  const handler = (e) => {
    const g = e.gamma || 0;   // 左右 -90..90
    const b = e.beta || 0;    // 前后
    const px = 50 + Math.max(-40, Math.min(40, g * 1.1));
    const py = 50 + Math.max(-40, Math.min(40, (b - 40) * 0.7));
    document.querySelectorAll(".mcard").forEach((el) => {
      el.style.setProperty("--px", px.toFixed(1));
      el.style.setProperty("--py", py.toFixed(1));
      el.style.setProperty("--hyp", "0.35");
    });
  };
  window.addEventListener("devicemotion", handler, { passive: true });
}
