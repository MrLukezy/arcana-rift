/**
 * 星界盟约 · 典藏卡册（独立页面）
 * 读取开包台写在 localStorage 里的同一份存档，展示 200 件藏品。
 */
import { CARD_POOL, RARITY_META } from './src/cards-config.js';

const STORAGE_KEY = 'smkt-pack-binder-v2';
const LABEL = { secret: 'UR', ultra: 'SSR', holo: 'SR', rare: 'R', common: 'N' };
const CN = { secret: '神话', ultra: '传说', holo: '史诗', rare: '稀有', common: '普通' };
const COLOR = {
  secret: '#ff9fe0',
  ultra: '#ffd98a',
  holo: '#c9b3ff',
  rare: '#8fb8ff',
  common: '#c3c9d6',
};
const KIND_CN = { char: '角色', item: '道具' };

const $ = (id) => document.getElementById(id);
const gridEl = $('cxGrid');
const statsEl = $('cxStats');
const rarityEl = $('cxRarity');
const emptyEl = $('cxEmpty');
const detailEl = $('cxDetail');

let kind = 'char';
let onlyOwned = false;
let selectedId = null;
let owned = {};

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && typeof raw === 'object' && raw.owned) {
      owned = raw.owned;
      return raw;
    }
  } catch {
    /* 存档损坏就当空档 */
  }
  owned = {};
  return { packsOpened: 0, draws: 0, owned: {} };
}

const state = loadState();

function pool(k) {
  return CARD_POOL.filter((c) => (c.kind || 'char') === k);
}

function recOf(id) {
  const r = owned[id];
  if (!r) return null;
  return typeof r === 'number' ? { count: r } : r;
}

function counts(k) {
  const all = pool(k);
  const got = all.filter((c) => recOf(c.id));
  const byRarity = {};
  for (const def of all) {
    const key = def.rarity;
    byRarity[key] = byRarity[key] || { total: 0, have: 0 };
    byRarity[key].total += 1;
    if (recOf(def.id)) byRarity[key].have += 1;
  }
  const copies = all.reduce((sum, c) => sum + (recOf(c.id)?.count || 0), 0);
  return { all, got, byRarity, copies };
}

function renderHeader() {
  const c = counts('char');
  const i = counts('item');
  const total = Object.keys(owned).length;
  const copies = Object.values(owned).reduce(
    (sum, r) => sum + (typeof r === 'number' ? r : r?.count || 0),
    0,
  );
  statsEl.innerHTML =
    `角色 <b>${c.got.length}/${c.all.length}</b> · 道具 <b>${i.got.length}/${i.all.length}</b>` +
    ` · 已拆 <b>${state.packsOpened || 0}</b> 包 · 累计收录 <b>${copies}</b> 张` +
    ` · 合计图鉴 <b>${total}/${CARD_POOL.length}</b>`;

  document.querySelectorAll('.cx-tab').forEach((btn) => {
    const k = btn.dataset.kind;
    const s = counts(k);
    btn.textContent = `${KIND_CN[k]} · ${s.got.length}/${s.all.length}`;
    btn.classList.toggle('is-active', k === kind);
  });

  const { byRarity } = counts(kind);
  rarityEl.innerHTML = ['secret', 'ultra', 'holo', 'rare', 'common']
    .filter((r) => byRarity[r])
    .map(
      (r) =>
        `<span class="rar rar-${r}"><b>${LABEL[r]}</b> ${byRarity[r].have}/${byRarity[r].total}</span>`,
    )
    .join('');
}

function slotHTML(def) {
  const rec = recOf(def.id);
  const unlocked = Boolean(rec);
  const rank = RARITY_META[def.rarity].rank;
  const secret = rank >= 4;

  let art;
  if (unlocked) {
    art = `<img src="${def.character?.image || def.fullArtImage}" alt="${def.name}" loading="lazy">`;
  } else if (secret) {
    art = `<span class="cx-qmark">?</span>`;
  } else {
    art = `<img class="sil" src="${def.artChar || def.fullArtImage}" alt="" aria-hidden="true" loading="lazy">`;
  }

  const artCls = unlocked ? '' : secret ? ' is-secret' : ' is-silhouette';
  const countPill = unlocked && (rec.count || 0) > 1 ? `<span class="cx-count">×${rec.count}</span>` : '';
  const name = unlocked ? def.name : secret ? '???' : '未收录';
  const sub = secret && !unlocked
    ? '<span>NO. ???</span><span>?</span>'
    : `<span>NO. ${def.serial}</span><span>${LABEL[def.rarity]}</span>`;

  return `<button class="cx-slot${unlocked ? '' : ' is-locked'}${selectedId === def.id ? ' is-selected' : ''}"
      type="button" data-id="${def.id}" ${unlocked ? '' : 'disabled'}>
      <div class="cx-art${artCls}">${countPill}${art}</div>
      <div class="cx-meta">
        <span class="cx-name">${name}</span>
        <div class="cx-sub">${sub}</div>
      </div>
    </button>`;
}

function renderGrid() {
  let list = pool(kind);
  if (onlyOwned) list = list.filter((c) => recOf(c.id));
  gridEl.innerHTML = list.map(slotHTML).join('');
  emptyEl.hidden = list.length > 0;
  if (!list.length) {
    emptyEl.textContent = onlyOwned ? '这一类还没有收集到任何藏品，去开包吧。' : '';
  }
}

function openDetail(def) {
  const rec = recOf(def.id);
  if (!rec) return;
  selectedId = def.id;

  const c = COLOR[def.rarity];
  $('cxDetailArt').innerHTML =
    `<img class="d-bg" src="${def.artBg}" alt="" aria-hidden="true">` +
    `<img class="d-ch" src="${def.artChar}" alt="${def.name}">` +
    `<img class="d-plate" src="${def.artPlate}" alt="" aria-hidden="true">` +
    `<i class="d-glare"></i>` +
    `<div class="d-text"><b>${def.name}</b><span>${def.tag} · ${def.trait}</span></div>`;
  $('cxDetailName').textContent = def.name;
  $('cxDetailTags').innerHTML =
    `<span class="cx-dtag" style="color:${c}">${LABEL[def.rarity]} ${CN[def.rarity]}</span>` +
    `<span class="cx-dtag" style="color:rgba(240,235,220,.7)">${KIND_CN[def.kind || 'char']}</span>` +
    `<span class="cx-dtag" style="color:rgba(240,235,220,.7)">${def.tag}</span>`;
  $('cxDetailDesc').innerHTML =
    `${def.trait || ''}<br>编号 NO. ${def.serial} · 已拥有 ${rec.count || 1} 张` +
    (rec.foils?.length ? `<br>特殊工艺：${rec.foils.join(' / ')}` : '');

  detailEl.classList.add('open');
  document.body.classList.add('has-detail');
  renderGrid();
}

function closeDetail() {
  detailEl.classList.remove('open');
  document.body.classList.remove('has-detail');
  selectedId = null;
  renderGrid();
}

gridEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.cx-slot');
  if (!btn || btn.disabled) return;
  const def = CARD_POOL.find((c) => c.id === btn.dataset.id);
  if (def) openDetail(def);
});

document.querySelectorAll('.cx-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    kind = btn.dataset.kind;
    selectedId = null;
    detailEl.classList.remove('open');
    document.body.classList.remove('has-detail');
    renderHeader();
    renderGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

$('cxOnlyOwned').addEventListener('change', (e) => {
  onlyOwned = e.target.checked;
  renderGrid();
});

$('cxClose').addEventListener('click', closeDetail);
$('cxScrim').addEventListener('click', closeDetail);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetail();
});

$('cxReset').addEventListener('click', () => {
  if (!confirm('清空本机的图鉴与保底进度？这个操作不可撤销。')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

// 详情卡跟着鼠标轻微倾斜
const artEl = $('cxDetailArt');
detailEl.addEventListener('pointermove', (e) => {
  const r = artEl.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  artEl.style.transform = `perspective(900px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg)`;
  artEl.style.setProperty('--dx', (x * 26).toFixed(1));
  artEl.style.setProperty('--dy', (y * 26).toFixed(1));
  artEl.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
  artEl.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
});
detailEl.addEventListener('pointerleave', () => {
  artEl.style.transform = '';
});

renderHeader();
renderGrid();
