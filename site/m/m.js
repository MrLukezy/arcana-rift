/* 星界盟约 · 店长（移动端） */
import { CARD_POOL } from "../src/cards-config.js";
import { createBattle } from "./battle3.js";
import { cardHTML, bindHolo, startTilt, stopTilt } from "./card3d.js";
import { mountPack } from "./pack.js";
import { createSoundController } from "./sound.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const RARITY = {
  common: { label: "N", name: "普通", w: 40, value: 40, power: 10, cls: "r-common" },
  rare: { label: "R", name: "稀有", w: 30, value: 90, power: 22, cls: "r-rare" },
  holo: { label: "SR", name: "史诗", w: 19, value: 200, power: 40, cls: "r-holo" },
  ultra: { label: "SSR", name: "传说", w: 8, value: 520, power: 70, cls: "r-ultra" },
  secret: { label: "UR", name: "秘宝", w: 3, value: 1400, power: 120, cls: "r-secret" },
};
const ORDER = ["common", "rare", "holo", "ultra", "secret"];

const ELEMENTS = ["星月", "自然", "毒", "暗", "火", "水", "风", "光", "土", "雷", "冰", "圣光"];
const FREE_MAX = 2;
const FREE_MS = 8 * 60 * 1000;      // 演示用：8 分钟产 1 包
const PACK_SIZE = 5;
const PITY_MAX = 30;
const LV_STEP = 100;
const KEY = "arcana-shop-v1";

/* ───────── 数据 ───────── */
const byId = new Map(CARD_POOL.map((c) => [c.id, c]));
const elementOf = (c) => (c.trait.match(/([^\s·]+)属性/) || [, "无"])[1];
const today = () => new Date().toISOString().slice(0, 10);

function seedHot() {
  const d = new Date();
  const idx = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % ELEMENTS.length;
  return ELEMENTS[idx];
}

/* ───────── 存档 ───────── */
function fresh() {
  return {
    v: 1,
    name: "收藏学徒",
    lv: 1,
    xp: 0,
    coins: 200,
    gems: 60,
    tickets: 3,
    free: { n: FREE_MAX, at: Date.now() },
    bag: {},
    pity: 0,
    picks: [],
    fightsLeft: 5,
    fightLog: [],
    tasks: { date: today(), opened: 0, recycled: 0, fights: 0, trades: 0, sr: 0, claimed: [] },
    mail: [
      { id: "m1", title: "开业礼包", desc: "3 个新手卡包 + 200 金币", got: false },
      { id: "m2", title: "版本更新", desc: "新增 100 件道具与图鉴分档", got: false },
      { id: "m3", title: "今日热点", desc: "热门属性卡回收价上浮 30%", got: false },
      { id: "m4", title: "云存档提醒", desc: "本机存档，换设备会丢进度", got: false },
    ],
    hot: { element: seedHot(), date: today() },
  };
}

let S = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || raw.v !== 1) return fresh();
    if (raw.tasks?.date !== today()) {
      raw.tasks = { date: today(), opened: 0, recycled: 0, fights: 0, trades: 0, sr: 0, claimed: [] };
      raw.fightsLeft = 5;
    }
    if (raw.hot?.date !== today()) raw.hot = { element: seedHot(), date: today() };
    return raw;
  } catch {
    return fresh();
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
}

/* ───────── 资源与成长 ───────── */
function addCoins(n, why) {
  S.coins = Math.max(0, S.coins + n);
  if (n > 0) toast(`+${n} 金币${why ? " · " + why : ""}`);
  else if (n < 0) toast(`${n} 金币`);
  save(); paintTop();
}

function addXp(n) {
  S.xp += n;
  while (S.xp >= S.lv * LV_STEP) {
    S.xp -= S.lv * LV_STEP;
    S.lv += 1;
    S.gems += 10;
    toast(`升到 Lv${S.lv}！+10 钻石`);
  }
  save(); paintTop();
}

function pad(n, l = 2) { return String(n).padStart(l, "0"); }

/* ───────── 卡池抽取 ───────── */
function rollRarity() {
  if (S.pity >= PITY_MAX - 1) return "secret";
  const total = ORDER.reduce((s, k) => s + RARITY[k].w, 0);
  let r = Math.random() * total;
  for (const k of ORDER) {
    r -= RARITY[k].w;
    if (r <= 0) return k;
  }
  return "common";
}

function poolByRarity(k) { return CARD_POOL.filter((c) => c.rarity === k); }

function pickPower(id) {
  const c = byId.get(id);
  if (!c) return 0;
  const base = RARITY[c.rarity].power;
  const hot = elementOf(c) === S.hot.element ? 1.15 : 1;
  return Math.round(base * hot);
}

function drawOne() {
  const k = rollRarity();
  const pool = poolByRarity(k);
  const c = pool[Math.floor(Math.random() * pool.length)];
  const isNew = !S.bag[c.id];
  S.bag[c.id] = (S.bag[c.id] || 0) + 1;
  if (k === "secret" || k === "ultra") { S.pity = 0; } else { S.pity += 1; }
  if (ORDER.indexOf(k) >= 2) S.tasks.sr += 1;
  return { card: c, rarity: k, isNew };
}

/* ───────── 免费卡包 ───────── */
function syncFree() {
  const f = S.free;
  if (f.n >= FREE_MAX) { f.at = Date.now(); return; }
  const gained = Math.floor((Date.now() - f.at) / FREE_MS);
  if (gained > 0) {
    f.n = Math.min(FREE_MAX, f.n + gained);
    f.at = Date.now();
    save();
  }
}
function freeLeftMs() {
  if (S.free.n >= FREE_MAX) return 0;
  return Math.max(0, FREE_MS - (Date.now() - S.free.at));
}

/* ───────── 顶部条 ───────── */
function paintTop() {
  $("#coins").textContent = S.coins;
  $("#gems").textContent = S.gems;
  $("#tickets").textContent = S.tickets;
  $("#lv").textContent = "Lv" + S.lv;
  $("#playerName").textContent = S.name;
  $("#avatar").textContent = S.name.slice(0, 1);
  $("#xpBar").style.width = Math.min(100, (S.xp / (S.lv * LV_STEP)) * 100) + "%";
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 1900);
}

/* ───────── 视图：主页 ───────── */
function viewHome() {
  syncFree();
  const hot = S.hot.element;
  const freeNote = S.free.n >= FREE_MAX
    ? `已攒满 ×${S.free.n}`
    : `下一包 ${fmt(freeLeftMs())}`;
  const pityPct = Math.min(100, (S.pity / PITY_MAX) * 100);

  const slots = S.picks.length
    ? S.picks.map((id) => {
        const c = byId.get(id);
        return `<div class="slot filled" data-pick="${id}"><img src="../${c.fullArtImage}" alt="${c.name}"></div>`;
      }).join("")
    : [1, 2, 3, 4, 5, 6].map((i) =>
        i <= 3
          ? `<div class="slot"><span>＋</span><span>陈列</span></div>`
          : `<div class="slot lock"><img src="../img/ui/icon_lock.webp" alt=""><span>Lv${i === 4 ? 8 : i === 5 ? 15 : 25}</span></div>`
      ).join("");

  const unread = S.mail.filter((m) => !m.got).length;

  return `
  <div class="grid2">
    <div class="tile gift">
      <div class="tile-head"><img src="../img/ui/icon_pack.webp" alt=""><div class="tile-title">免费卡包</div></div>
      <div class="tile-note">${freeNote}</div>
      <button class="btn" id="goPack" ${S.free.n <= 0 ? "disabled" : ""}>开启</button>
    </div>
    <div class="tile">
      <div class="tile-head"><img src="../img/ui/icon_task.webp" alt=""><div class="tile-title">任务</div></div>
      <div class="tile-note">${taskDone()}/5 完成</div>
      <button class="btn ghost" id="goTasks">查看</button>
    </div>
  </div>

  <div class="panel">
    ${unread ? `<span class="badge">${unread}</span>` : ""}
    <div class="mail-row">
      <div class="mail-ico"><img src="../img/ui/icon_mail.webp" alt=""></div>
      <div class="mail-txt">
        <b>信箱</b>
        <span>${S.mail.find((m) => !m.got)?.desc || "没有未读信件"}</span>
      </div>
      <button class="btn sm ghost" id="goMail">查看</button>
    </div>
  </div>

  <div class="h2">陈列位</div>
  <div class="slots">${slots}</div>

  <div class="h2">今日活动</div>
  <div class="panel hot">
    <img src="../img/ui/icon_fire.webp" alt="">
    <div>
      今日热门：<b>${hot}属性</b><br>
      <span class="hint">该属性卡回收价 +30%</span>
    </div>
  </div>

  <div class="h2">保底进度</div>
  <div class="panel">
    <div class="pity">
      <div class="bar"><i style="width:${pityPct}%"></i></div>
      <span>${S.pity}/${PITY_MAX}</span>
    </div>
    <div class="hint" style="margin-top:8px">累计 ${S.pity} 抽未出 SSR/UR，满 ${PITY_MAX} 抽必出秘宝。</div>
  </div>
  `;
}

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function taskDone() {
  return TASK_DEFS.filter((t) => taskValue(t.key) >= t.need).length;
}

/* ───────── 任务 ───────── */
const TASK_DEFS = [
  { key: "opened", name: "撕开卡包", need: 3, coin: 120 },
  { key: "recycled", name: "回收卡牌", need: 5, coin: 90 },
  { key: "fights", name: "参与对战", need: 1, coin: 150 },
  { key: "trades", name: "完成交易", need: 1, coin: 100 },
  { key: "sr", name: "获得 SR 及以上", need: 3, coin: 180 },
];
function taskValue(k) { return S.tasks[k] || 0; }

function viewTasks() {
  return `
  <div class="h2">每日任务</div>
  <div class="hint" style="margin-bottom:10px">每日 0 点重置 · 共 ${TASK_DEFS.length} 个</div>
  ${TASK_DEFS.map((t) => {
    const v = Math.min(taskValue(t.key), t.need);
    const done = v >= t.need;
    const claimed = S.tasks.claimed.includes(t.key);
    return `
    <div class="panel">
      <div class="mail-row">
        <div class="mail-ico">${done ? "✅" : "🎯"}</div>
        <div class="mail-txt">
          <b>${t.name}</b>
          <span>${v}/${t.need} · 奖励 ${t.coin} 金币</span>
        </div>
        <button class="btn sm ${claimed ? "ghost" : ""}" data-claim="${t.key}"
          ${!done || claimed ? "disabled" : ""}>${claimed ? "已领" : "领取"}</button>
      </div>
    </div>`;
  }).join("")}`;
}

/* ───────── 背包 ───────── */
let bagFilter = "all";

function bagList() {
  let ids = Object.keys(S.bag);
  if (bagFilter === "char") ids = ids.filter((id) => byId.get(id).kind === "char");
  if (bagFilter === "item") ids = ids.filter((id) => byId.get(id).kind === "item");
  if (bagFilter !== "all" && bagFilter !== "char" && bagFilter !== "item") {
    ids = ids.filter((id) => byId.get(id).rarity === bagFilter);
  }
  return ids.sort((a, b) => {
    const ra = ORDER.indexOf(byId.get(a).rarity), rb = ORDER.indexOf(byId.get(b).rarity);
    return rb - ra || a.localeCompare(b);
  });
}

function viewBag() {
  const ids = bagList();
  const chips = [
    ["all", "全部"], ["char", "角色"], ["item", "道具"],
    ["secret", "UR"], ["ultra", "SSR"], ["holo", "SR"], ["rare", "R"], ["common", "N"],
  ].map(([k, l]) => `<button class="chip ${bagFilter === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("");

  const grid = ids.length
    ? ids.map((id) => {
        const c = byId.get(id);
        const r = RARITY[c.rarity];
        return `<div class="bag-item" data-card="${id}">
          <img src="../${c.fullArtImage}" alt="${c.name}" loading="lazy">
          <span class="rmark ${r.cls}">${r.label}</span>
          ${S.bag[id] > 1 ? `<span class="cnt">×${S.bag[id]}</span>` : ""}
        </div>`;
      }).join("")
    : `<div class="bag-empty">还没有卡牌<br>去「开包」抽几张吧</div>`;

  return `
  <div class="h2">背包</div>
  <div class="chips">${chips}</div>
  <div class="bag-grid">${grid}</div>`;
}

/* ───────── 开包 ───────── */
let packState = { opening: false, results: [], torn: false };

function viewPack() {
  syncFree();
  if (packState.results.length) {
    return `
    <div class="pack-stage">
      <div class="pack-hint">本次开出 <b>${packState.results.length}</b> 张</div>
      <div class="result-grid">
        ${packState.results.map((r, i) => `
          <div class="result-card ${r.isNew ? "new" : ""}" data-res="${i}" style="animation-delay:${i * 70}ms">
            ${cardHTML(r.card, { power: pickPower(r.card.id) })}
          </div>`).join("")}
      </div>
      <button class="btn" id="packAgain">再开一包</button>
      <button class="btn ghost" style="margin-left:8px" id="packDone">收好</button>
      <div class="hint" style="margin-top:14px">新卡会自动进入背包</div>
    </div>`;
  }

  const free = S.free.n > 0;
  return `
  <div class="pack-stage">
    <div class="pack-hint">${free ? "按住封条横向<b>扯开</b>" : `免费卡包 ${fmt(freeLeftMs())} 后到账`}</div>
    <div class="packhost" id="packHost"></div>
    <div style="margin-top:10px">
      <button class="btn" id="buyPack" ${S.coins >= 180 ? "" : "disabled"}>花 180 金币买一包</button>
      <div class="hint" style="margin-top:8px">免费包每 ${FREE_MS / 60000} 分钟 +1，最多存 ${FREE_MAX} 个</div>
    </div>
  </div>`;
}

function finishTear() {
  if (packState.opening) return;
  packState.opening = true;
  packState.torn = true;
  S.tasks.opened += 1;
  if (S.free.n > 0 && !packState.paid) {
    S.free.n -= 1;
    syncFree();
  }
  packState.paid = false;
  save();

  const res = [];
  for (let i = 0; i < PACK_SIZE; i++) res.push(drawOne());
  save();

  setTimeout(() => {
    sfx.call("cardFlip", res[0] ? (ORDER.indexOf(res[0].card.rarity) + 1) : 1, 0);
    packState.results = res;
    packState.opening = false;
    packState.torn = false;
    render();
    addXp(12);
  }, 460);
}

/* ───────── 对战（三消） ───────── */
const sfx = createSoundController();
let packInst = null;
let fightMode = "setup";
let battleInst = null;

function makeEnemy() {
  // 从 SR 以上里挑一个当对手
  const pool = CARD_POOL.filter((c) => ORDER.indexOf(c.rarity) >= 2);
  const c = pool[Math.floor(Math.random() * pool.length)];
  const r = RARITY[c.rarity];
  return {
    card: c,
    name: c.name,
    art: `../${c.fullArtImage}`,
    hp: 110 + r.power * 3 + Math.floor(Math.random() * 40),
    atk: 6 + Math.round(r.power / 3),
  };
}

function viewFight() {
  if (fightMode === "battle") {
    return `<div id="m3Host"></div>`;
  }

  if (S.fightsLeft <= 0) {
    return `
    <div class="h2">元素试炼</div>
    <div class="panel center">
      <div style="font-size:34px;margin:8px 0 10px">⚔️</div>
      <div style="font-size:13px;margin-bottom:6px">今日挑战次数已用完</div>
      <div class="hint">明天 0 点恢复 5 次</div>
    </div>
    <div class="h2">试炼记录</div>
    <div class="panel"><div class="hint" style="line-height:2">${S.fightLog.slice(0, 8).map((l) => `<div>${l}</div>`).join("") || "暂无记录"}</div></div>`;
  }

  const owned = bagList().slice(0, 40);
  const cards = owned.length
    ? owned.map((id) => {
        const c = byId.get(id);
        return `<div class="bag-item ${S.picks.includes(id) ? "on" : ""}" data-pick="${id}">
          <img src="../${c.fullArtImage}" alt="${c.name}" loading="lazy">
        </div>`;
      }).join("")
    : `<div class="bag-empty" style="grid-column:1/-1">背包是空的<br>先去开包抽几张</div>`;

  const aff = S.picks.map((id) => elementOf(byId.get(id)));
  const affTxt = aff.length ? [...new Set(aff)].join(" / ") : "—";

  return `
  <div class="h2">出战卡组 <span class="hint" style="font-weight:400">选 1～3 张</span></div>
  <div class="panel">
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-dim)">
      <span>生命 <b style="color:var(--ok)">${60 + S.picks.length * 20}</b></span>
      <span>共鸣属性 <b style="color:var(--gold)">${affTxt}</b></span>
      <span>今日剩余 <b style="color:var(--gold)">${S.fightsLeft}</b></span>
    </div>
  </div>
  <div class="bag-grid" style="margin-top:2px">${cards}</div>
  <div style="margin:14px 0">
    <button class="btn block" id="doFight" ${S.picks.length ? "" : "disabled"}>进入元素试炼</button>
  </div>
  <div class="hint" style="margin-top:6px">三消规则：交换相邻宝石凑够 3 个同色即造成伤害；与卡组属性共鸣的宝石伤害翻倍。</div>
  <div class="h2">试炼记录</div>
  <div class="panel"><div class="hint" style="line-height:2">${S.fightLog.slice(0, 8).map((l) => `<div>${l}</div>`).join("") || "暂无记录"}</div></div>`;
}

function startBattle() {
  if (!S.picks.length) return;
  const deck = S.picks.map((id) => {
    const c = byId.get(id);
    return { card: c, element: elementOf(c), power: pickPower(id) };
  });
  const enemy = makeEnemy();
  S.fightsLeft -= 1;
  S.tasks.fights += 1;
  save();
  fightMode = "battle";
  render();

  const host = document.querySelector("#m3Host");
  battleInst = createBattle({
    host,
    deck,
    enemy,
    toast,
    onEnd({ win, turns, hpLeft }) {
      const base = 40 + deck.reduce((s2, d) => s2 + d.power, 0);
      const gain = win ? base * 2 : Math.round(base * 0.35);
      S.fightLog.unshift(`${win ? "🏆 胜利" : "💥 失败"} · ${enemy.name} · ${turns} 回合 · +${gain}◉`);
      S.fightLog = S.fightLog.slice(0, 12);
      addCoins(gain, win ? "试炼胜利" : "试炼");
      addXp(win ? 20 : 6);
      save();
      fightMode = "setup";
      render();
      openSheet(`
        <h3>${win ? "🏆 试炼通过" : "💥 试炼失败"}</h3>
        <p>对手：<b>${enemy.name}</b><br>回合数：<b>${turns}</b> · 剩余生命：<b>${hpLeft}</b><br>奖励：<b style="color:var(--gold)">${gain} 金币</b></p>
        <div class="sheet-actions"><button class="btn ghost" data-act="close">收下</button></div>`);
    },
  });
}

/* ───────── 交易 ───────── */
function offers() {
  // 用日期做种子，同一天市场稳定
  const seed = today().split("-").join("");
  let x = parseInt(seed, 10) % 100000;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = [];
  for (let i = 0; i < 6; i++) {
    const k = ORDER[Math.min(4, Math.floor(rnd() * (rnd() < 0.12 ? 5 : 4)))];
    const pool = poolByRarity(k);
    const c = pool[Math.floor(rnd() * pool.length)];
    const hot = elementOf(c) === S.hot.element;
    const price = Math.round(RARITY[k].value * (hot ? 1.3 : 1) * (0.92 + rnd() * 0.2));
    out.push({ card: c, rarity: k, price, hot });
  }
  return out;
}

function sellPrice(c) {
  const hot = elementOf(c) === S.hot.element;
  return Math.round(RARITY[c.rarity].value * 0.35 * (hot ? 1.3 : 1));
}

function viewTrade() {
  const list = offers();
  return `
  <div class="h2">今日市场</div>
  <div class="hint" style="margin-bottom:10px">热门属性（${S.hot.element}）加价 30%</div>
  <div id="offers">
    ${list.map((o, i) => `
      <div class="offer">
        <img src="../${o.card.fullArtImage}" alt="${o.card.name}">
        <div class="info">
          <b>${o.card.name}</b>
          <span>${RARITY[o.rarity].label} · ${elementOf(o.card)}属性 · ${o.card.kind === "char" ? "角色" : "道具"}</span>
        </div>
        <div>
          <div class="price ${o.hot ? "hot" : ""}">${o.price} ◉</div>
          <button class="btn sm" data-buy="${i}" ${S.coins < o.price ? "disabled" : ""}>买入</button>
        </div>
      </div>`).join("")}
  </div>

  <div class="h2">我的回收</div>
  <div class="hint" style="margin-bottom:10px">在背包里点开一张卡即可回收，回收价 = 卡价的 35%</div>
  <button class="btn ghost" id="sellHint">去背包挑卡</button>`;
}

/* ───────── 弹层 ───────── */
function openSheet(html, full = false) {
  $("#sheetCard").innerHTML = html;
  $("#sheet").classList.toggle("full", !!full);
  $("#sheet").hidden = false;
  bindHolo($("#sheetCard"));
}
function closeSheet() { $("#sheet").hidden = true; }

function cardSheet(id) {
  const c = byId.get(id);
  const el = elementOf(c);
  const price = sellPrice(c);
  const hot = el === S.hot.element;
  openSheet(`
    <div class="cv-stage">
      <div class="cv-card">${cardHTML(c, { lg: true, power: pickPower(id), own: S.bag[id] || 1 })}</div>
      ${hot ? `<div class="cv-tip">🔥 今日热门属性 · 回收价 +30%</div>` : ""}
    </div>
    <div class="cv-actions">
      <button class="btn ghost" data-act="close">关闭</button>
      <button class="btn ghost" data-act="shelve">陈列</button>
      <button class="btn" data-act="recycle" data-id="${id}">回收 ${price}◉</button>
    </div>`, true);
  startTilt();
}

/* ───────── 渲染 ───────── */
let tab = "home";

const VIEWS = {
  home: viewHome,
  bag: viewBag,
  pack: viewPack,
  fight: viewFight,
  trade: viewTrade,
};

function render() {
  paintTop();
  const html = VIEWS[tab]();
  $("#view").innerHTML = html;
  $$(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  if (tab === "pack") {
    if (packState.results.length) startTilt();
    if (packInst) { packInst.destroy(); packInst = null; }
    if (!packState.results.length && $("#packHost")) {
      packInst = mountPack($("#packHost"), { onOpen: finishTear, sfx });
    }
  }
  bindHolo(document);
  if (tab === "home") startClock();
}

let clockTimer = null;
function startClock() {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    if (tab !== "home") return clearInterval(clockTimer);
    const el = $(".tile-note");
    if (!el) return;
    syncFree();
    el.textContent = S.free.n >= FREE_MAX ? `已攒满 ×${S.free.n}` : `下一包 ${fmt(freeLeftMs())}`;
  }, 1000);
}

/* ───────── 事件 ───────── */
document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".tab");
  if (tabBtn) {
    if (tab !== "fight" && fightMode === "battle") {
      fightMode = "setup";
      battleInst = null;
    }
    tab = tabBtn.dataset.tab;
    if (tab === "pack" && packState.results.length === 0) {
      syncFree();
    }
    render();
    $("#view").scrollTop = 0;
    return;
  }

  const t = e.target;

  if (t.id === "goPack") { tab = "pack"; render(); return; }
  if (t.id === "goTasks") { openSheet(viewTasks() + `<div class="sheet-actions"><button class="btn ghost" data-act="close">关闭</button></div>`); return; }
  if (t.id === "goMail") { openMail(); return; }
  if (t.id === "packAgain") { packState.results = []; render(); return; }
  if (t.id === "packDone") { packState.results = []; tab = "home"; render(); return; }
  if (t.id === "buyPack") {
    if (S.coins < 180) return toast("金币不够");
    S.coins -= 180; packState.paid = true; save(); paintTop();
    toast("买好了，撕开它");
    return;
  }
  if (t.id === "sellHint") { tab = "bag"; render(); return; }
  if (t.id === "clearPicks") { S.picks = []; save(); render(); return; }
  if (t.id === "doFight") { startBattle(); return; }
  if (t.id === "sheet") { closeSheet(); return; }

  const f = t.closest("[data-f]");
  if (f) { bagFilter = f.dataset.f; render(); return; }

  const resCard = t.closest("[data-res]");
  if (resCard) {
    const r = packState.results[+resCard.dataset.res];
    if (r) cardSheet(r.card.id);
    return;
  }

  const cid = t.closest("[data-card]")?.dataset.card;
  if (cid) { cardSheet(cid); return; }

  const pick = t.closest("[data-pick]");
  if (pick) {
    const id = pick.dataset.pick;
    if (tab === "fight") {
      const i = S.picks.indexOf(id);
      if (i >= 0) S.picks.splice(i, 1);
      else if (S.picks.length < 3) S.picks.push(id);
      else return toast("最多选 3 张");
      save();
      // 只更新局部，避免整页重绘导致滚动位置丢失
      pick.classList.toggle("on", S.picks.includes(id));
      const pw = document.querySelector(".power");
      if (pw) pw.textContent = S.picks.reduce((s2, x) => s2 + pickPower(x), 0);
      const btn = document.querySelector("#doFight");
      if (btn) btn.disabled = S.picks.length === 0;
    } else {
      cardSheet(id);
    }
    return;
  }

  const claim = t.closest("[data-claim]");
  if (claim) {
    const key = claim.dataset.claim;
    const def = TASK_DEFS.find((d) => d.key === key);
    if (!def || S.tasks.claimed.includes(key)) return;
    S.tasks.claimed.push(key);
    addCoins(def.coin, def.name);
    save();
    closeSheet();
    openSheet(viewTasks() + `<div class="sheet-actions"><button class="btn ghost" data-act="close">关闭</button></div>`);
    return;
  }

  const buy = t.closest("[data-buy]");
  if (buy) {
    const o = offers()[+buy.dataset.buy];
    if (!o) return;
    if (S.coins < o.price) return toast("金币不够");
    S.coins -= o.price;
    if (!S.bag[o.card.id]) S.bag[o.card.id] = 0;
    S.bag[o.card.id] += 1;
    S.tasks.trades += 1;
    save(); paintTop();
    toast(`买入 ${o.card.name}`);
    render();
    return;
  }

  const act = t.closest("[data-act]")?.dataset.act;
  if (act === "close") return closeSheet();
  if (act === "recycle") {
    const id = t.dataset.id;
    if (!S.bag[id]) return closeSheet();
    const price = sellPrice(byId.get(id));
    S.bag[id] -= 1;
    if (S.bag[id] <= 0) delete S.bag[id];
    S.tasks.recycled += 1;
    addCoins(price, "回收");
    addXp(4);
    save(); closeSheet(); render();
    return;
  }
  if (act === "shelve") {
    closeSheet();
    toast("陈列功能下一版开放");
    return;
  }
});

function openMail() {
  openSheet(`
    <h3>信箱</h3>
    ${S.mail.map((m) => `
      <div class="offer" style="margin-bottom:8px">
        <div style="font-size:20px">${m.got ? "📭" : "📬"}</div>
        <div class="info"><b>${m.title}</b><span>${m.desc}</span></div>
        <button class="btn sm ${m.got ? "ghost" : ""}" data-mail="${m.id}" ${m.got ? "disabled" : ""}>${m.got ? "已领" : "领取"}</button>
      </div>`).join("")}
    <div class="sheet-actions"><button class="btn ghost" data-act="close">关闭</button></div>`);
}

document.addEventListener("click", (e) => {
  const m = e.target.closest("[data-mail]");
  if (!m) return;
  const item = S.mail.find((x) => x.id === m.dataset.mail);
  if (!item || item.got) return;
  item.got = true;
  if (item.id === "m1") { S.free.n = Math.min(FREE_MAX, S.free.n + 3); S.coins += 200; }
  else if (item.id === "m2") { S.gems += 30; }
  else if (item.id === "m3") { S.coins += 120; }
  else { S.tickets += 1; }
  save(); paintTop();
  toast("已领取");
  openMail();
});

function doFight() {
  if (S.fightsLeft <= 0) return;
  const mine = S.picks.reduce((s, id) => s + pickPower(id), 0);
  const opp = Math.round(mine * (0.75 + Math.random() * 0.7)) + 10;
  S.fightsLeft -= 1;
  S.tasks.fights += 1;
  const win = mine >= opp;
  const gain = win ? 60 + Math.round(mine * 0.6) : 15;
  S.fightLog.unshift(
    `${win ? "🏆 胜利" : "💥 失败"} · 我方 <b>${mine}</b> vs <b>${opp}</b> · +${gain}◉`
  );
  S.fightLog = S.fightLog.slice(0, 12);
  addCoins(gain, win ? "对战胜利" : "对战");
  addXp(win ? 18 : 6);
  save();
  render();
  openSheet(`
    <h3>${win ? "🏆 战斗胜利" : "💥 战斗失败"}</h3>
    <p>我方战力 <b style="color:var(--gold)">${mine}</b> · 对手战力 <b>${opp}</b><br>
    奖励 ${gain} 金币${win ? " · 经验 +18" : " · 经验 +6"}</p>
    <div class="sheet-actions"><button class="btn ghost" data-act="close">知道了</button></div>`);
}

/* ───────── 启动 ───────── */
paintTop();
render();

// 首次进入引导
if (!localStorage.getItem(KEY + ":greeted")) {
  localStorage.setItem(KEY + ":greeted", "1");
  setTimeout(() => {
    openSheet(`
      <h3>欢迎来到星界盟约！</h3>
      <p>你是这家卡灵小店的店长，<b>${S.name}</b>。<br>
      先送你 <b>3 个新手卡包</b>——用手指横着一划，把它撕开！</p>
      <div class="sheet-actions">
        <button class="btn" data-act="close">开包去</button>
      </div>`);
  }, 400);
}
