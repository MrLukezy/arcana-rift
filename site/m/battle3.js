/* 三消对战（移植自 matchgame/web3d 的棋盘规则，改成竖屏 DOM 棋盘） */

export const GEMS = [
  { key: "fire", name: "火", color: "#ff7a45", icon: "../img/ui/gem_fire.webp" },
  { key: "water", name: "水", color: "#4aa8ff", icon: "../img/ui/gem_water.webp" },
  { key: "wind", name: "风", color: "#4fd08a", icon: "../img/ui/gem_wind.webp" },
  { key: "thunder", name: "雷", color: "#a97bff", icon: "../img/ui/gem_thunder.webp" },
  { key: "light", name: "光", color: "#ffd45c", icon: "../img/ui/gem_light.webp" },
  { key: "dark", name: "暗", color: "#c06bd8", icon: "../img/ui/gem_dark.webp" },
];

const N = GEMS.length;
const COLS = 7, ROWS = 7;
const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n) => Math.floor(Math.random() * n);

export function createBattle(opts) {
  /**
   * opts: { host, deck: [{card, power, element}], enemy: {name, hp, atk, art},
   *         onEnd(result), toast(msg) }
   */
  const { host, deck, enemy, onEnd, toast } = opts;

  const affinity = {};
  for (const d of deck) affinity[d.element] = (affinity[d.element] || 0) + 1;

  const state = {
    grid: [],
    busy: false,
    sel: null,
    combo: 0,
    playerHp: 60 + deck.length * 20,
    playerMax: 60 + deck.length * 20,
    enemyHp: enemy.hp,
    enemyMax: enemy.hp,
    turns: 0,
    over: false,
  };

  /* ── 棋盘生成 ── */
  function makeGrid() {
    let guard = 0;
    do {
      state.grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => rnd(N)));
      guard++;
    } while ((findRuns().length || !hasMove()) && guard < 60);
  }

  function findRuns(g = state.grid) {
    const runs = [];
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        const v = g[r][c];
        let e = c;
        while (e + 1 < COLS && g[r][e + 1] === v) e++;
        if (e - c + 1 >= 3) runs.push({ dir: "h", r, c, len: e - c + 1, e: v, cells: range(r, c, "h", e - c + 1) });
        c = e + 1;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        const v = g[r][c];
        let e = r;
        while (e + 1 < ROWS && g[e + 1][c] === v) e++;
        if (e - r + 1 >= 3) runs.push({ dir: "v", r, c, len: e - r + 1, e: v, cells: range(r, c, "v", e - r + 1) });
        r = e + 1;
      }
    }
    return runs;
  }

  function range(r, c, dir, len) {
    return Array.from({ length: len }, (_, i) => (dir === "h" ? [r, c + i] : [r + i, c]));
  }

  function hasMove() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c + 1 < COLS) {
          swapData(r, c, r, c + 1);
          const ok = findRuns().length > 0;
          swapData(r, c, r, c + 1);
          if (ok) return true;
        }
        if (r + 1 < ROWS) {
          swapData(r, c, r + 1, c);
          const ok = findRuns().length > 0;
          swapData(r, c, r + 1, c);
          if (ok) return true;
        }
      }
    }
    return false;
  }

  function swapData(r1, c1, r2, c2) {
    const t = state.grid[r1][c1];
    state.grid[r1][c1] = state.grid[r2][c2];
    state.grid[r2][c2] = t;
  }

  /* ── 渲染 ── */
  function tileHTML(v, r, c) {
    const g = GEMS[v];
    return `<button class="m3-tile" data-r="${r}" data-c="${c}" style="--gem:${g.color}">
      <img src="${g.icon}" alt="${g.name}" draggable="false">
    </button>`;
  }

  function paintBoard() {
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) cells.push(tileHTML(state.grid[r][c], r, c));
    }
    const board = host.querySelector(".m3-board");
    if (board) board.innerHTML = cells.join("");
  }

  function render() {
    host.innerHTML = `
      <div class="m3-wrap">
        <div class="m3-foe">
          <div class="m3-avatar"><img src="${enemy.art}" alt="${enemy.name}"></div>
          <div class="m3-foe-info">
            <b>${enemy.name}</b>
            <div class="hpbar foe"><i style="width:${(state.enemyHp / state.enemyMax) * 100}%"></i>
              <span>${Math.max(0, state.enemyHp)}/${state.enemyMax}</span></div>
          </div>
        </div>

        <div class="m3-board" id="m3Board"></div>

        <div class="m3-me">
          <div class="hpbar me"><i style="width:${(state.playerHp / state.playerMax) * 100}%"></i>
            <span>${Math.max(0, state.playerHp)}/${state.playerMax}</span></div>
          <div class="m3-deck-row"><span class="hint">共鸣卡组</span><div class="m3-deck">
            ${deck.map((d) => `<span class="m3-deck-card" title="${d.card.name} · ${d.element}">
              <img src="../${d.card.fullArtImage}"><i>${d.element}</i></span>`).join("")}
          </div></div>
        </div>
        <div class="m3-hint" id="m3Hint">交换相邻宝石，凑够 3 个同色即可攻击</div>
      </div>`;
    paintBoard();
  }

  function updateHud() {
    const foe = host.querySelector(".hpbar.foe");
    const me = host.querySelector(".hpbar.me");
    if (foe) {
      foe.querySelector("i").style.width = Math.max(0, (state.enemyHp / state.enemyMax) * 100) + "%";
      foe.querySelector("span").textContent = `${Math.max(0, state.enemyHp)}/${state.enemyMax}`;
    }
    if (me) {
      me.querySelector("i").style.width = Math.max(0, (state.playerHp / state.playerMax) * 100) + "%";
      me.querySelector("span").textContent = `${Math.max(0, state.playerHp)}/${state.playerMax}`;
    }
  }

  function hint(msg) {
    const el = host.querySelector("#m3Hint");
    if (el) el.textContent = msg;
  }

  function floatText(txt, cls) {
    const el = document.createElement("div");
    el.className = "m3-float " + (cls || "");
    el.textContent = txt;
    host.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /* ── 交互 ── */
  host.addEventListener("click", async (e) => {
    const t = e.target.closest(".m3-tile");
    if (!t || state.busy || state.over) return;
    const r = +t.dataset.r, c = +t.dataset.c;
    if (!state.sel) {
      state.sel = { r, c };
      t.classList.add("on");
      return;
    }
    const s = state.sel;
    host.querySelectorAll(".m3-tile.on").forEach((x) => x.classList.remove("on"));
    state.sel = null;
    const adj = Math.abs(s.r - r) + Math.abs(s.c - c) === 1;
    if (!adj) {
      state.sel = { r, c };
      t.classList.add("on");
      return;
    }
    state.busy = true;
    swapData(s.r, s.c, r, c);
    paintBoard();
    await WAIT(140);
    if (!findRuns().length) {
      swapData(s.r, s.c, r, c);
      paintBoard();
      hint("这样换不出三连");
      state.busy = false;
      return;
    }
    await resolveAll(r, c);
    state.turns++;
    // 敌方回合
    if (!state.over) await enemyTurn();
    state.busy = false;
  });

  /* ── 结算 ── */
  async function resolveAll(swapR, swapC) {
    state.combo = 0;
    let totalDmg = 0;
    while (true) {
      const runs = findRuns();
      if (!runs.length) break;
      state.combo++;
      const cells = new Set();
      const perGem = {};
      for (const run of runs) for (const [r, c] of run.cells) {
        cells.add(r * COLS + c);
        perGem[state.grid[r][c]] = (perGem[state.grid[r][c]] || 0) + 1;
      }

      // 伤害：基础 1 点/宝石，属性亲和 ×2，连击加成
      let dmg = 0;
      for (const [gem, n] of Object.entries(perGem)) {
        const g = GEMS[+gem];
        const bonus = affinity[g.name] ? 2 : 1;
        dmg += n * bonus;
        if (affinity[g.name]) floatText(`${g.name}共鸣 +${n * 2}`, "crit");
      }
      dmg = Math.round(dmg * (1 + 0.3 * (state.combo - 1)));
      totalDmg += dmg;

      // 播放消除
      for (const idx of cells) {
        const el = host.querySelector(`.m3-tile[data-r="${Math.floor(idx / COLS)}"][data-c="${idx % COLS}"]`);
        if (el) el.classList.add("pop");
      }
      await WAIT(180);
      for (const idx of cells) state.grid[Math.floor(idx / COLS)][idx % COLS] = null;

      state.enemyHp -= dmg;
      updateHud();
      if (state.combo > 1) hint(`连击 ×${state.combo}！造成 ${dmg} 伤害`);
      else hint(`造成 ${dmg} 伤害`);
      floatText(`-${dmg}`, "dmg");

      collapse();
      paintBoard();
      await WAIT(180);
      if (state.enemyHp <= 0) return finish(true);
    }
    if (!hasMove()) {
      hint("没有可用的交换，重排棋盘");
      makeGrid();
      paintBoard();
    }
    return totalDmg;
  }

  function collapse() {
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const v = state.grid[r][c];
        if (v !== null) {
          state.grid[write][c] = v;
          if (write !== r) state.grid[r][c] = null;
          write--;
        }
      }
      for (let r = write; r >= 0; r--) state.grid[r][c] = rnd(N);
    }
  }

  async function enemyTurn() {
    if (state.turns < 1) return;
    const dmg = enemy.atk + rnd(6);
    state.playerHp -= dmg;
    updateHud();
    floatText(`-${dmg}`, "hurt");
    hint(`${enemy.name} 反击，造成 ${dmg} 伤害`);
    await WAIT(420);
    if (state.playerHp <= 0) finish(false);
  }

  let ended = false;
  function finish(win) {
    if (ended) return;
    ended = true;
    state.over = true;
    hint(win ? "🎉 战斗胜利" : "💥 战斗失败");
    setTimeout(() => onEnd && onEnd({ win, turns: state.turns, hpLeft: Math.max(0, state.playerHp) }), 520);
  }

  /* ── 启动 ── */
  makeGrid();
  render();
  return { destroy() { host.innerHTML = ""; } };
}
