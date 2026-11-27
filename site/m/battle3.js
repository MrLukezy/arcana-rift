/* 三消对战 v2：上舞台 + 下棋盘，拖动/点选交换，带真实位移动画 */

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
  const { host, deck, enemy, onEnd } = opts;

  const affinity = {};
  for (const d of deck) affinity[d.element] = (affinity[d.element] || 0) + 1;

  let uid = 1;
  const st = {
    grid: [], busy: false, sel: null, combo: 0,
    playerHp: 70 + deck.length * 22,
    enemyHp: enemy.hp, enemyMax: enemy.hp,
    turns: 0, over: false,
  };
  st.playerMax = st.playerHp;
  const el = {};

  const mk = (g) => ({ id: uid++, g: g === undefined ? rnd(N) : g });

  function fresh() {
    let guard = 0;
    do {
      st.grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => mk()));
      guard++;
    } while ((runs().length || !hasMove()) && guard < 80);
  }

  function runs(g = st.grid) {
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        const v = g[r][c].g, s = c;
        let e = c;
        while (e + 1 < COLS && g[r][e + 1].g === v) e++;
        if (e - s + 1 >= 3) out.push({ r, c: s, g: v, cells: range(r, s, "h", e - s + 1) });
        c = e + 1;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        const v = g[r][c].g, s = r;
        let e = r;
        while (e + 1 < ROWS && g[e + 1][c].g === v) e++;
        if (e - s + 1 >= 3) out.push({ r: s, c, g: v, cells: range(s, c, "v", e - s + 1) });
        r = e + 1;
      }
    }
    return out;
  }

  function range(r, c, dir, len) {
    return Array.from({ length: len }, (_, i) => (dir === "h" ? [r, c + i] : [r + i, c]));
  }

  function swapCells(a, b) {
    const t = st.grid[a.r][a.c];
    st.grid[a.r][a.c] = st.grid[b.r][b.c];
    st.grid[b.r][b.c] = t;
  }

  function hasMove() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c + 1 < COLS) {
          swapCells({ r, c }, { r, c: c + 1 });
          const ok = runs().length > 0;
          swapCells({ r, c }, { r, c: c + 1 });
          if (ok) return true;
        }
        if (r + 1 < ROWS) {
          swapCells({ r, c }, { r: r + 1, c });
          const ok = runs().length > 0;
          swapCells({ r, c }, { r: r + 1, c });
          if (ok) return true;
        }
      }
    }
    return false;
  }

  function mount() {
    const heroCard = (deck.find((d) => d.card.kind === "char") || deck[0]).card;
    host.innerHTML = `
      <div class="m3-scene">
        <div class="m3-side hero" id="m3Hero">
          <div class="m3-portrait"><img src="../${heroCard.artChar}" alt="${heroCard.name}" draggable="false"></div>
          <div class="m3-name">${heroCard.name}</div>
          <div class="hpbar me"><i></i><span></span></div>
        </div>
        <div class="m3-clash">⚔</div>
        <div class="m3-side foe" id="m3Foe">
          <div class="m3-portrait"><img src="${enemy.artChar}" alt="${enemy.name}" draggable="false"></div>
          <div class="m3-name foe">${enemy.name}</div>
          <div class="hpbar foe"><i></i><span></span></div>
        </div>
      </div>
      <div class="m3-boardwrap">
        <div class="m3-board"><div class="m3-layer" id="m3Layer"></div></div>
      </div>
      <div class="m3-hint" id="m3Hint">拖动宝石交换，三个同色即可施放元素攻击</div>`;

    el.layer = host.querySelector("#m3Layer");
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = st.grid[r][c];
        const d = document.createElement("button");
        d.className = "m3-tile";
        d.dataset.id = t.id;
        d.style.setProperty("--gem", GEMS[t.g].color);
        d.innerHTML = `<img src="${GEMS[t.g].icon}" alt="" draggable="false">`;
        el.layer.appendChild(d);
        el[t.id] = d;
        place(d, r, c, true);
      }
    }
    paintHud();
    bindInput();
  }

  /* ── 施法：从角色飞向敌人 ── */
  function fly(color, toFoe = true) {
    const fromEl = host.querySelector(toFoe ? ".m3-side.hero .m3-portrait" : ".m3-side.foe .m3-portrait");
    const toEl = host.querySelector(toFoe ? ".m3-side.foe .m3-portrait" : ".m3-side.hero .m3-portrait");
    if (!fromEl || !toEl) return;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const bolt = document.createElement("i");
    bolt.className = "m3-bolt";
    bolt.style.setProperty("--c", color);
    bolt.style.left = (a.left + a.width / 2) + "px";
    bolt.style.top = (a.top + a.height / 2) + "px";
    host.appendChild(bolt);
    requestAnimationFrame(() => {
      bolt.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.4)`;
      bolt.style.opacity = "0.2";
    });
    setTimeout(() => {
      bolt.remove();
      const tgt = host.querySelector(toFoe ? ".m3-side.foe" : ".m3-side.hero");
      if (tgt) shake(tgt);
    }, 300);
  }

  function place(node, r, c, instant) {
    if (instant) node.style.transition = "none";
    node.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
    node.dataset.r = r;
    node.dataset.c = c;
    if (instant) requestAnimationFrame(() => { node.style.transition = ""; });
  }

  function paintHud() {
    const foe = host.querySelector(".hpbar.foe");
    const me = host.querySelector(".hpbar.me");
    if (foe) {
      foe.querySelector("i").style.width = Math.max(0, (st.enemyHp / st.enemyMax) * 100) + "%";
      foe.querySelector("span").textContent = `${Math.max(0, st.enemyHp)} / ${st.enemyMax}`;
    }
    if (me) {
      me.querySelector("i").style.width = Math.max(0, (st.playerHp / st.playerMax) * 100) + "%";
      me.querySelector("span").textContent = `${Math.max(0, st.playerHp)} / ${st.playerMax}`;
    }
  }

  function hint(msg) { const h = host.querySelector("#m3Hint"); if (h) h.textContent = msg; }

  function float(txt, cls) {
    const d = document.createElement("div");
    d.className = "m3-float " + (cls || "");
    d.textContent = txt;
    host.appendChild(d);
    setTimeout(() => d.remove(), 950);
  }

  function shake(target) {
    if (!target) return;
    target.classList.remove("hit");
    void target.offsetWidth;
    target.classList.add("hit");
  }

  function bindInput() {
    let down = null;

    host.addEventListener("pointerdown", (e) => {
      if (st.busy || st.over) return;
      const n = e.target.closest && e.target.closest(".m3-tile");
      if (!n) return;
      const r = +n.dataset.r, c = +n.dataset.c;
      down = { r, c, x: e.clientX, y: e.clientY };

      if (st.sel) {
        const s = st.sel;
        if (s.r === r && s.c === c) { clearSel(); down = null; return; }
        if (Math.abs(s.r - r) + Math.abs(s.c - c) === 1) {
          clearSel();
          down = null;
          trySwap(s, { r, c });
          return;
        }
        clearSel();
      }
      setSel({ r, c }, n);
    });

    host.addEventListener("pointermove", (e) => {
      if (!down || st.busy || st.over) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) < 16) return;
      const first = host.querySelector(".m3-tile");
      const cell = first ? first.getBoundingClientRect().width : 44;
      let nr = down.r, nc = down.c;
      if (Math.abs(dx) > Math.abs(dy)) nc += Math.sign(dx) * Math.max(1, Math.round(Math.abs(dx) / cell));
      else nr += Math.sign(dy) * Math.max(1, Math.round(Math.abs(dy) / cell));
      nr = Math.max(0, Math.min(ROWS - 1, nr));
      nc = Math.max(0, Math.min(COLS - 1, nc));
      if (nr === down.r && nc === down.c) return;
      const from = { r: down.r, c: down.c };
      down = null;
      clearSel();
      trySwap(from, { r: nr, c: nc });
    });

    const end = () => { down = null; };
    host.addEventListener("pointerup", end);
    host.addEventListener("pointercancel", end);
  }

  function setSel(pos, node) { st.sel = pos; node.classList.add("on"); }
  function clearSel() {
    st.sel = null;
    host.querySelectorAll(".m3-tile.on").forEach((n) => n.classList.remove("on"));
  }

  async function trySwap(a, b) {
    st.busy = true;
    const A = st.grid[a.r][a.c], B = st.grid[b.r][b.c];
    swapCells(a, b);
    place(el[A.id], b.r, b.c);
    place(el[B.id], a.r, a.c);
    await WAIT(170);

    if (!runs().length) {
      swapCells(a, b);
      place(el[A.id], a.r, a.c);
      place(el[B.id], b.r, b.c);
      [A, B].forEach((t) => {
        const n = el[t.id];
        n.classList.add("bad");
        setTimeout(() => n.classList.remove("bad"), 340);
      });
      hint("这样换不出三连，换个方向试试");
      st.busy = false;
      return;
    }

    await resolveAll();
    st.turns++;
    if (!st.over) await enemyTurn();
    st.busy = false;
  }

  async function resolveAll() {
    st.combo = 0;
    while (true) {
      const rs = runs();
      if (!rs.length) break;
      st.combo++;

      const cells = new Set();
      const per = {};
      for (const run of rs) {
        for (const [r, c] of run.cells) {
          cells.add(r * COLS + c);
          const g = st.grid[r][c].g;
          per[g] = (per[g] || 0) + 1;
        }
      }

      let dmg = 0;
      let mainGem = GEMS[0], mainN = 0;
      for (const [g, n] of Object.entries(per)) {
        const gem = GEMS[+g];
        const bonus = affinity[gem.name] ? 2 : 1;
        dmg += n * bonus;
        if (n > mainN) { mainN = n; mainGem = gem; }
        if (affinity[gem.name]) float(`${gem.name}共鸣 +${n * 2}`, "crit");
      }
      dmg = Math.round(dmg * (1 + 0.3 * (st.combo - 1)));
      fly(mainGem.color, true);

      for (const idx of cells) {
        const t = st.grid[(idx / COLS) | 0][idx % COLS];
        if (t && el[t.id]) el[t.id].classList.add("pop");
      }
      await WAIT(220);

      for (const idx of cells) st.grid[(idx / COLS) | 0][idx % COLS] = null;

      st.enemyHp -= dmg;
      paintHud();
      float(`-${dmg}`, "dmg");
      shake(host.querySelector("#m3Foe"));
      hint(st.combo > 1 ? `连击 ×${st.combo}！造成 ${dmg} 伤害` : `造成 ${dmg} 伤害`);

      collapse();
      await WAIT(210);

      if (st.enemyHp <= 0) { finish(true); return; }
    }
    if (!hasMove()) { hint("没有可交换的组合，重排棋盘"); await reshuffle(); }
  }

  function collapse() {
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const t = st.grid[r][c];
        if (t) {
          if (write !== r) {
            st.grid[write][c] = t;
            st.grid[r][c] = null;
            place(el[t.id], write, c);
          }
          write--;
        }
      }
      for (let r = write; r >= 0; r--) {
        const t = mk();
        st.grid[r][c] = t;
        const node = document.createElement("button");
        node.className = "m3-tile";
        node.dataset.id = t.id;
        node.style.setProperty("--gem", GEMS[t.g].color);
        node.innerHTML = `<img src="${GEMS[t.g].icon}" alt="" draggable="false">`;
        el.layer.appendChild(node);
        el[t.id] = node;
        node.style.transition = "none";
        node.style.transform = `translate(${c * 100}%, ${(r - ROWS) * 100}%)`;
        node.dataset.r = r;
        node.dataset.c = c;
        requestAnimationFrame(() => {
          node.style.transition = "";
          node.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
        });
      }
    }
  }

  async function reshuffle() {
    const all = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) all.push(st.grid[r][c].g);
    for (let i = all.length - 1; i > 0; i--) { const j = rnd(i + 1); [all[i], all[j]] = [all[j], all[i]]; }
    let guard = 0;
    do {
      let i = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const cellData = st.grid[r][c];
        cellData.g = all[i++ % all.length];
        const node = el[cellData.id];
        node.style.setProperty("--gem", GEMS[cellData.g].color);
        node.innerHTML = `<img src="${GEMS[cellData.g].icon}" alt="" draggable="false">`;
      }
      guard++;
    } while ((runs().length || !hasMove()) && guard < 40);
    await WAIT(300);
  }

  async function enemyTurn() {
    const dmg = enemy.atk + rnd(6);
    fly("#ff6b6b", false);
    st.playerHp -= dmg;
    paintHud();
    float(`-${dmg}`, "hurt");
    shake(host.querySelector("#m3Party"));
    hint(`${enemy.name} 反击，造成 ${dmg} 伤害`);
    await WAIT(430);
    if (st.playerHp <= 0) finish(false);
  }

  let ended = false;
  function finish(win) {
    if (ended) return;
    ended = true;
    st.over = true;
    hint(win ? "🎉 战斗胜利" : "💥 战斗失败");
    if (win) {
      const foe = host.querySelector("#m3Foe");
      if (foe) foe.classList.add("down");
    }
    setTimeout(() => onEnd && onEnd({ win, turns: st.turns, hpLeft: Math.max(0, st.playerHp) }), 640);
  }

  fresh();
  mount();
  return { destroy() { host.innerHTML = ""; } };
}
