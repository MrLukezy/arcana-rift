/* Arcana Rift · 抽卡引擎 + 撕卡演出 + 图鉴 */
(function () {
  'use strict';

  var CARDS = window.CARDS || [];
  var META = window.CARD_META || {};
  var K = window.CardKit;
  var $ = function (id) { return document.getElementById(id); };
  var reduce = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };

  var BY_ID = {};
  CARDS.forEach(function (c) { BY_ID[c.id] = c; });

  /* ══════════ 1. 稀有度与权重 ══════════ */
  var TIERS = ['UR', 'SSR', 'SR', 'R', 'N'];
  var WEIGHT = { UR: 60, SSR: 540, SR: 1400, R: 3000, N: 5000 };  // 万分比
  var PITY = { softFrom: 70, softStep: 300, hard: 90 };
  var RATE_LABEL = { UR: '0.60%', SSR: '5.40%', SR: '14.00%', R: '30.00%', N: '50.00%' };
  var COLOR = { UR: '#ff7ad9', SSR: '#f6c344', SR: '#a78bfa', R: '#4c9df0', N: '#9aa3b2' };
  var RANK = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 };

  /* ══════════ 2. 状态（本地存档） ══════════ */
  var KEY = 'arcana-rift-v1';
  var state = load();
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && typeof s === 'object') return withDefaults(s);
      }
    } catch (e) { /* 忽略 */ }
    return withDefaults({});
  }
  function withDefaults(s) {
    return {
      owned: s.owned || {},
      pulls: s.pulls | 0,
      since: s.since | 0,
      newIds: s.newIds || []
    };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
  }

  /* ══════════ 3. 随机与抽取 ══════════ */
  function cryptoRng() {
    var b = new Uint32Array(1);
    (window.crypto || window.msCrypto).getRandomValues(b);
    return b[0];
  }
  // 拒绝采样，避免取模偏差
  function pickU32(total, next32) {
    var limit = Math.floor(4294967296 / total) * total;
    var x = next32();
    while (x >= limit) x = next32();
    return x % total;
  }
  function urWeight() {
    var n = state.since + 1;
    var w = WEIGHT.UR;
    if (n >= PITY.softFrom) w += (n - PITY.softFrom + 1) * PITY.softStep;
    return w;
  }
  // 一次抽取只消耗一个 uint32；分段映射
  function pullOne(forceSr) {
    var n = state.since + 1;
    if (n >= PITY.hard) { state.since = 0; return 'UR'; }
    var ur = urWeight();
    var rest = WEIGHT.SSR + WEIGHT.SR + WEIGHT.R + WEIGHT.N;
    var t = pickU32(ur + rest, cryptoRng);
    if (t < ur) { state.since = 0; return 'UR'; }
    var r = t - ur;
    state.since = n;
    if (r < WEIGHT.SSR) return 'SSR';
    r -= WEIGHT.SSR;
    if (r < WEIGHT.SR) return 'SR';
    if (forceSr) return 'SR';
    r -= WEIGHT.SR;
    if (r < WEIGHT.R) return 'R';
    return 'N';
  }
  function pullTen() {
    var out = [], gotSrPlus = false;
    for (var i = 0; i < 10; i++) {
      var force = (i === 9 && !gotSrPlus);
      var rarity = pullOne(force);
      if (RANK[rarity] >= 2) gotSrPlus = true;
      out.push(rarity);
    }
    return out;
  }
  function randomOf(rarity) {
    var pool = CARDS.filter(function (c) { return c.rarity === rarity; });
    return pool[(cryptoRng() % pool.length)];
  }

  /* ══════════ 4. 音效（合成，无外部文件） ══════════ */
  var AC = null;
  function ac() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
    }
    if (AC && AC.state === 'suspended') AC.resume();
    return AC;
  }
  var muted = false;
  function noiseBuf(a, sec) {
    var n = Math.floor(a.sampleRate * sec);
    var b = a.createBuffer(1, n, a.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    return b;
  }
  function sfx(kind) {
    if (muted) return;
    var a = ac(); if (!a) return;
    var t0 = a.currentTime, g = a.createGain();
    g.connect(a.destination);
    if (kind === 'tear') {
      var s = a.createBufferSource(); s.buffer = noiseBuf(a, .5);
      var f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1;
      f.frequency.setValueAtTime(2700, t0);
      f.frequency.exponentialRampToValueAtTime(320, t0 + .42);
      g.gain.setValueAtTime(.0001, t0);
      g.gain.exponentialRampToValueAtTime(.3, t0 + .04);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + .46);
      s.connect(f); f.connect(g); s.start(t0); s.stop(t0 + .5);
    } else if (kind === 'pop') {
      var o = a.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(520, t0);
      o.frequency.exponentialRampToValueAtTime(880, t0 + .12);
      g.gain.setValueAtTime(.0001, t0);
      g.gain.exponentialRampToValueAtTime(.14, t0 + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + .2);
      o.connect(g); o.start(t0); o.stop(t0 + .22);
    } else if (kind === 'sr') {
      [880, 1174, 1568].forEach(function (fr, i) {
        var o = a.createOscillator(), gg = a.createGain();
        o.type = 'triangle'; o.frequency.value = fr;
        var st = t0 + i * .07;
        gg.gain.setValueAtTime(.0001, st);
        gg.gain.exponentialRampToValueAtTime(.12, st + .02);
        gg.gain.exponentialRampToValueAtTime(.0001, st + .3);
        o.connect(gg); gg.connect(a.destination); o.start(st); o.stop(st + .32);
      });
    } else if (kind === 'ssr') {
      [659, 988, 1318, 1760].forEach(function (fr, i) {
        var o = a.createOscillator(), gg = a.createGain();
        o.type = 'sine'; o.frequency.value = fr;
        var st = t0 + i * .06;
        gg.gain.setValueAtTime(.0001, st);
        gg.gain.exponentialRampToValueAtTime(.13, st + .02);
        gg.gain.exponentialRampToValueAtTime(.0001, st + .45);
        o.connect(gg); gg.connect(a.destination); o.start(st); o.stop(st + .48);
      });
    } else if (kind === 'ur') {
      var o2 = a.createOscillator(); o2.type = 'sine';
      o2.frequency.setValueAtTime(150, t0);
      o2.frequency.exponentialRampToValueAtTime(48, t0 + .5);
      g.gain.setValueAtTime(.0001, t0);
      g.gain.exponentialRampToValueAtTime(.28, t0 + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + .62);
      o2.connect(g); o2.start(t0); o2.stop(t0 + .64);
      var s3 = a.createBufferSource(); s3.buffer = noiseBuf(a, .6);
      var f3 = a.createBiquadFilter(); f3.type = 'bandpass'; f3.Q.value = 2;
      f3.frequency.setValueAtTime(420, t0);
      f3.frequency.exponentialRampToValueAtTime(5200, t0 + .4);
      var g3 = a.createGain();
      g3.gain.setValueAtTime(.0001, t0);
      g3.gain.exponentialRampToValueAtTime(.15, t0 + .16);
      g3.gain.exponentialRampToValueAtTime(.0001, t0 + .62);
      s3.connect(f3); f3.connect(g3); g3.connect(a.destination);
      s3.start(t0); s3.stop(t0 + .64);
      [1318, 1760, 2637, 3520].forEach(function (fr, i) {
        var o3 = a.createOscillator(), gg3 = a.createGain();
        o3.type = 'sine'; o3.frequency.value = fr;
        var st = t0 + .2 + i * .08;
        gg3.gain.setValueAtTime(.0001, st);
        gg3.gain.exponentialRampToValueAtTime(.11, st + .02);
        gg3.gain.exponentialRampToValueAtTime(.0001, st + .5);
        o3.connect(gg3); gg3.connect(a.destination); o3.start(st); o3.stop(st + .55);
      });
    }
  }

  /* ══════════ 5. Canvas 特效 ══════════ */
  var stage = $('stage'), fx = $('fx'), ctx = fx.getContext('2d');
  var FX = { parts: [], rings: [], rays: null, raf: 0, dpr: 1, shake: 0 };
  function fitFx() {
    var r = fx.getBoundingClientRect();
    FX.dpr = Math.min(window.devicePixelRatio || 1, 2);
    fx.width = Math.max(1, Math.round(r.width * FX.dpr));
    fx.height = Math.max(1, Math.round(r.height * FX.dpr));
  }
  window.addEventListener('resize', fitFx);
  fitFx();

  function burst(x, y, o) {
    if (reduce()) return;
    for (var i = 0; i < o.n; i++) {
      var a = Math.random() * Math.PI * 2, v = (o.speed || 5) * (0.35 + Math.random() * 0.9);
      FX.parts.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.lift || 0),
        life: 1, decay: 0.008 + Math.random() * 0.014,
        r: (o.size || 2) * (0.6 + Math.random()),
        c: o.colors[(Math.random() * o.colors.length) | 0],
        g: o.gravity == null ? 0.05 : o.gravity
      });
    }
    runFx();
  }
  function ring(x, y) { if (!reduce()) { FX.rings.push({ x: x, y: y, t: 0, life: 0.9 }); runFx(); } }
  function rays(color, dur, spokes, alpha) {
    if (reduce()) return;
    FX.rays = { t: 0, dur: dur || 1.2, spokes: spokes || 24, color: color, alpha: alpha == null ? 0.5 : alpha };
    runFx();
  }
  function flash() {
    var f = $('flash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
  function shake(px) {
    if (reduce()) return;
    stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
  }
  function runFx() { if (!FX.raf) FX.raf = requestAnimationFrame(tickFx); }
  function tickFx() {
    FX.raf = 0;
    var w = fx.width, h = fx.height, d = FX.dpr;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    if (FX.rays) {
      FX.rays.t += 1 / 60;
      var t = FX.rays.t / FX.rays.dur;
      if (t >= 1) FX.rays = null;
      else {
        var cx = w / 2, cy = h / 2, R = Math.hypot(w, h) * 0.62;
        var al = Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t) * FX.rays.alpha;
        for (var k = 0; k < FX.rays.spokes; k++) {
          var ang = (k / FX.rays.spokes) * Math.PI * 2 + t * 0.55;
          var half = 0.006 + (k % 4) * 0.004;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang - half) * R, cy + Math.sin(ang - half) * R);
          ctx.lineTo(cx + Math.cos(ang + half) * R, cy + Math.sin(ang + half) * R);
          ctx.closePath();
          ctx.fillStyle = FX.rays.color;
          ctx.globalAlpha = al * (0.35 + (k % 4) * 0.16);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    for (var i = FX.rings.length - 1; i >= 0; i--) {
      var rg = FX.rings[i]; rg.t += 1 / 60;
      var p = rg.t / rg.life;
      if (p >= 1) { FX.rings.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, 30 + p * 150 * d / 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - p) * 0.55 + ')';
      ctx.lineWidth = Math.max(1, (1 - p) * 3.2 * d);
      ctx.stroke();
    }

    for (var j = FX.parts.length - 1; j >= 0; j--) {
      var q = FX.parts[j];
      q.x += q.vx * d; q.y += q.vy * d;
      q.vx *= 0.985; q.vy = q.vy * 0.985 + q.g * d;
      q.life -= q.decay * 2.2;
      if (q.life <= 0) { FX.parts.splice(j, 1); continue; }
      ctx.globalAlpha = Math.max(0, q.life);
      ctx.fillStyle = q.c;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * d * (0.4 + q.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (FX.parts.length || FX.rings.length || FX.rays) runFx();
    else ctx.clearRect(0, 0, w, h);
  }
  function centerOf(el) {
    var a = el.getBoundingClientRect(), b = fx.getBoundingClientRect();
    return {
      x: (a.left + a.width / 2 - b.left) * FX.dpr,
      y: (a.top + a.height / 2 - b.top) * FX.dpr
    };
  }

  /* ══════════ 6. 舞台：卡包 → 横撕 → 发牌 → 揭示 ══════════ */
  var slotsEl = $('slots'), hintEl = $('hint'), packEl = $('pack');
  var slots = [];
  var busy = false;

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function layout(n) {
    var W = (stage.clientWidth || 900) - 30;
    var cols = n === 1 ? 1 : stage.clientWidth < 560 ? 3 : stage.clientWidth < 820 ? 4 : 5;
    var rows = Math.ceil(n / cols);
    var Hmax = Math.min(960, Math.max(340, (window.innerHeight || 800) * 0.84));
    var bw = 168, bh = 224;
    var k1 = W / (cols * bw * 1.06);
    var k2 = (Hmax - 112) / (rows * bh * 1.10);
    var k = Math.max(0.26, Math.min(n === 1 ? 1.5 : 1.42, k1, k2));
    var h = Math.round(rows * bh * 1.10 * k + 112);
    stage.style.height = h + 'px';
    stage.style.minHeight = h + 'px';
    var out = [];
    for (var i = 0; i < n; i++) {
      var c = i % cols, r = (i / cols) | 0;
      out.push({
        x: (c - (cols - 1) / 2) * bw * k * 1.06,
        y: (r - (rows - 1) / 2) * bh * k * 1.10,
        w: bw * k
      });
    }
    return out;
  }

  function place(el, p, delay) {
    el.style.transitionDelay = (delay || 0) + 'ms';
    el.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px,0) ' +
      'translate(-50%, -50%)';
  }

  function buildSlots(cards) {
    var idle = $('idle');
    if (idle) idle.classList.add('hide');
    slotsEl.innerHTML = '';
    slots = [];
    cards.forEach(function (card) {
      var el = document.createElement('div');
      el.className = 'slot tier-' + (K.TIER[card.rarity] || 1);
      el.innerHTML = K.html(card, META) + '<span class="ring"></span>';
      slotsEl.appendChild(el);
      slots.push({ el: el, cv: el.querySelector('.cv'), card: card, grid: null });
    });
  }

  /* ── 卡包：出现 / 隐藏 ── */
  function showPack() {
    packEl.classList.remove('hide', 'tearing', 'dragging');
    packEl.style.setProperty('--dx', 0);
    packEl.style.visibility = '';
    // 撕包时舞台保持紧凑，撕完再撑开去摆牌
    var h = Math.round(Math.min(window.innerHeight * 0.62, 470));
    stage.style.height = h + 'px';
    stage.style.minHeight = h + 'px';
  }
  function hidePack() {
    packEl.classList.add('hide');
    setTimeout(function () { packEl.style.visibility = 'hidden'; }, 420);
  }

  /* ── 横向撕开：拖动跟手，撕够就飞 ── */
  var tearResolve = null;
  function tearOnce() {
    return new Promise(function (res) { tearResolve = res; });
  }
  function finishTear() {
    packEl.classList.remove('dragging');
    packEl.classList.add('tearing');
    sfx('tear');
    var c = centerOf(packEl);
    burst(c.x, c.y, { n: 46, speed: 7.5, colors: ['#ffffff', '#fff3c4', '#f6c344'], size: 2.4 });
    for (var k = 0; k < 22; k++) {
      FX.parts.push({
        x: c.x + (Math.random() - 0.5) * 30, y: c.y + (Math.random() - 0.5) * 150,
        vx: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 9),
        vy: (Math.random() - 0.5) * 2.4, life: 1,
        decay: 0.006 + Math.random() * 0.01, r: 1.8 + Math.random() * 2.2,
        c: 'rgba(255,246,214,.95)', g: 0.04
      });
    }
    runFx();
    setTimeout(function () {
      var r = tearResolve; tearResolve = null;
      if (r) r();
    }, reduce() ? 120 : 620);
  }

  function bindPack() {
    var dragging = false, startX = 0, dx = 0, moved = false;
    function paint() {
      var d = Math.max(-140, Math.min(140, dx));
      packEl.style.setProperty('--dx', d);
    }
    packEl.addEventListener('pointerdown', function (e) {
      if (packEl.classList.contains('tearing') || !tearResolve) return;
      dragging = true; moved = false; startX = e.clientX; dx = 0;
      packEl.classList.add('dragging');
      try { packEl.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    });
    packEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dx = e.clientX - startX;
      if (Math.abs(dx) > 5) moved = true;
      paint();
    });
    packEl.addEventListener('pointerup', function () {
      if (!dragging) return;
      dragging = false;
      if (!moved) { autoTear(); return; }
      if (Math.abs(dx) > 52) { finishTear(); return; }
      // 没撕够，合上
      packEl.classList.remove('dragging');
      packEl.style.setProperty('--dx', 0);
      dx = 0;
    });
    packEl.addEventListener('pointercancel', function () {
      if (!dragging) return;
      dragging = false;
      packEl.classList.remove('dragging');
      packEl.style.setProperty('--dx', 0);
      dx = 0;
    });
  }

  /* 点一下：把整条横向撕裂过程演出来 */
  function autoTear() {
    var t0 = performance.now(), dur = reduce() ? 80 : 420;
    packEl.classList.add('dragging');
    sfx('tear');
    (function step(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 2.2);
      packEl.style.setProperty('--dx', (e * 96).toFixed(1));
      if (t < 1) requestAnimationFrame(step); else finishTear();
    })(t0);
  }

  /* ── 发牌 ── */
  function deal() {
    var n = slots.length;
    var grid = layout(n);                       // 撕开后才撑开舞台
    slots.forEach(function (s, i) {
      s.grid = grid[i];
      s.el.style.setProperty('--cw', grid[i].w.toFixed(0) + 'px');
      s.cv.style.setProperty('--cw', grid[i].w.toFixed(0) + 'px');
      s.el.classList.add('in');
      place(s.el, s.grid, 36 * i);
    });
    return Promise.all(slots.map(function (s) { return K.preload(s.cv); }))
      .then(function () { return wait(420 + 36 * n); });
  }

  /* ── 揭示：逐张亮起，最高档演全套 ── */
  function revealAll() {
    var best = null;
    slots.forEach(function (s, i) {
      setTimeout(function () {
        s.el.classList.add('revealed');
        s.cv.classList.add('shine-go');
        K.bindTilt(s.cv, { max: slots.length === 1 ? 18 : 12 });
        var c = centerOf(s.el);
        var r = s.card.rarity;
        if (r === 'N') {
          burst(c.x, c.y, { n: 22, speed: 3.6, colors: ['#eef2fb', '#c8d2e6', '#ffffff'], size: 1.8 });
        } else if (r === 'R') {
          sfx('pop');
          ring(c.x, c.y);
          burst(c.x, c.y, { n: 34, speed: 4.4, colors: ['#9fd0ff', '#4c9df0', '#ffffff'], size: 2 });
        }
        // 记入图鉴
        var id = s.card.id;
        if (!state.owned[id]) state.newIds.push(id);
        state.owned[id] = (state.owned[id] || 0) + 1;
        save(); renderCollection(); updateStats();
      }, 120 + i * 90);
    });
    var order = slots.map(function (s) { return s; })
      .sort(function (a, b) { return (K.TIER[b.card.rarity] || 1) - (K.TIER[a.card.rarity] || 1); });
    best = order[0];
    if (best && (K.TIER[best.card.rarity] || 1) >= 3) {
      setTimeout(function () {
        var c = centerOf(best.el);
        var r = best.card.rarity;
        if (r === 'UR') {
          sfx('ur'); flash(); shake(10);
          rays('#ffe9a8', 1.8, 36, 0.7); ring(c.x, c.y);
          burst(c.x, c.y, { n: stage.clientWidth < 560 ? 90 : 170, speed: 12,
            colors: ['#ffe9a8', '#f6c344', '#ff7ad9', '#6ee7ff', '#ffffff'], size: 3, lift: 3 });
          setTimeout(function () {
            burst(c.x, c.y, { n: 60, speed: 4.2, colors: ['#fff', '#ffe9a8'], size: 1.6, gravity: -0.02 });
          }, 520);
        } else if (r === 'SSR') {
          sfx('ssr'); shake(5);
          rays('#f6c344', 1.2, 26, 0.5); ring(c.x, c.y);
          burst(c.x, c.y, { n: stage.clientWidth < 560 ? 60 : 110, speed: 8.5,
            colors: ['#ffe9a8', '#f6c344', '#ffffff'], size: 2.6, lift: 2 });
        } else {
          sfx('sr'); rays('#a78bfa', 0.9, 18, 0.3); ring(c.x, c.y);
          burst(c.x, c.y, { n: 56, speed: 5.6, colors: ['#c9bcff', '#a78bfa', '#ffffff'], size: 2.2 });
        }
      }, 140 + slots.length * 90);
    }
  }

  function setBusy(v) {
    busy = v;
    ['one', 'ten', 'reset'].forEach(function (id) {
      var el = $(id); if (el) el.disabled = v;
    });
  }

  async function draw(n) {
    if (busy) return;
    setBusy(true);
    hintEl.classList.add('hide');
    var rarities = n === 10 ? pullTen() : [pullOne(false)];
    var cards = rarities.map(function (r) { return randomOf(r); });
    state.pulls += n;
    save();

    buildSlots(cards);
    showPack();
    hintEl.innerHTML = '按住卡包，<b>左右拖动</b> 撕开';
    hintEl.classList.remove('hide');

    await tearOnce();          // 必须撕开，卡片才发得出来
    hidePack();
    hintEl.classList.add('hide');
    await deal();
    revealAll();
    setTimeout(function () {
      hintEl.innerHTML = '点 <b>再撕一包</b> 继续抽 · 已收进图鉴';
      hintEl.classList.remove('hide');
      setBusy(false);
    }, 600 + cards.length * 90);
  }

  /* ══════════ 7. 面板数字 ══════════ */
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }
  function updateStats() {
    var owned = Object.keys(state.owned).length;
    setText('statPulls', state.pulls);
    setText('statOwned', owned + '/100');
    setText('statSince', PITY.hard - state.since);
    var bar = $('pityBar');
    if (bar) bar.style.width = Math.min(100, (state.since / PITY.hard) * 100).toFixed(1) + '%';
    var left = PITY.hard - state.since;
    setText('pityTxt', left <= 10 ? '快到了，还差 ' + left + ' 抽' : '保底进度 ' + (100 - Math.round(left / PITY.hard * 100)) + '%');
    var cnt = { UR: 0, SSR: 0, SR: 0, R: 0, N: 0 };
    Object.keys(state.owned).forEach(function (id) {
      var c = BY_ID[id];
      if (c) cnt[c.rarity]++;
    });
    TIERS.forEach(function (t) {
      var el = $('cnt' + t);
      if (el) el.textContent = cnt[t];
    });
  }

  /* ══════════ 8. 图鉴 ══════════ */
  var deckEl = $('deckGrid');
  var collectionRendered = false;

  function renderCollection() {
    if (!deckEl) return;
    if (!collectionRendered) {
      var html = '';
      CARDS.forEach(function (c) {
        html += '<article class="gcard" data-id="' + c.id + '" data-rarity="' + c.rarity + '">' +
          '<div class="thumb">' + K.html(c, META, { plate: false }) +
          '<div class="lock">?</div></div>' +
          '<div class="cap"><div class="nm">' + K.esc(c.name) + '</div>' +
          '<div class="sub"><b>' + c.rarity + '</b> · ' + K.esc(c.cls) + ' · ' + K.esc(c.element) + '</div></div>' +
          '</article>';
      });
      deckEl.innerHTML = html;
      collectionRendered = true;
      deckEl.querySelectorAll('.gcard').forEach(function (g) {
        g.addEventListener('click', function () { openModal(g.getAttribute('data-id')); });
        var cv = g.querySelector('.cv');
        if (cv) {
          K.bindTilt(cv, { max: 10 });
          g.addEventListener('pointerenter', function () { K.shine(cv); });
        }
      });
    }
    deckEl.querySelectorAll('.gcard').forEach(function (g) {
      var id = g.getAttribute('data-id');
      var n = state.owned[id] || 0;
      g.classList.toggle('owned', n > 0);
      var old = g.querySelector('.newtag');
      if (state.newIds.indexOf(id) >= 0) {
        if (!old) {
          var t = document.createElement('span');
          t.className = 'newtag';
          t.textContent = 'NEW';
          g.appendChild(t);
        }
      } else if (old) {
        old.remove();
      }
    });
    applyFilter();
  }

  var currentFilter = 'all';
  function applyFilter() {
    if (!deckEl) return;
    var shown = 0;
    deckEl.querySelectorAll('.gcard').forEach(function (g) {
      var r = g.getAttribute('data-rarity');
      var owned = g.classList.contains('owned');
      var hit = currentFilter === 'all' ? true
        : currentFilter === 'owned' ? owned
        : currentFilter === 'unowned' ? !owned
        : r === currentFilter;
      g.classList.toggle('hide', !hit);
      if (hit) shown++;
    });
    var el = $('deckCount');
    if (el) el.textContent = shown;
  }

  function bindFilters() {
    document.querySelectorAll('.chip[data-f]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.chip[data-f]').forEach(function (c) {
          c.classList.toggle('on', c === chip);
        });
        currentFilter = chip.getAttribute('data-f');
        applyFilter();
      });
    });
  }

  /* ══════════ 9. 卡片详情 ══════════ */
  function openModal(id) {
    var c = BY_ID[id];
    if (!c) return;
    var m = $('modal');
    var owned = state.owned[id] || 0;
    var body = m.querySelector('.modal-body');
    var stagebar = m.querySelector('.stagebar');
    stagebar.innerHTML = K.html(c, META);
    var cv = stagebar.querySelector('.cv');
    cv.style.setProperty('--cw', '250px');
    K.bindTilt(cv, { max: 18 });
    K.shine(cv);
    body.innerHTML =
      '<h3>' + K.esc(c.name) + ' <span style="font-size:12px;color:' + COLOR[c.rarity] + '">' + c.rarity + '</span></h3>' +
      '<div class="tagline">' + K.esc(c.cls) + ' · ' + K.esc(c.element) + '属性 · ' + K.esc(c.role) + '</div>' +
      '<dl class="kv">' +
        '<dt>强度档位</dt><dd>' + c.rarity + '（' + (K.RARITY[c.rarity] || {}).name + '）</dd>' +
        '<dt>单抽概率</dt><dd>' + RATE_LABEL[c.rarity] + '</dd>' +
        '<dt>种族</dt><dd>' + K.esc(c.race) + '娘</dd>' +
        '<dt>武器</dt><dd>' + K.esc(c.wpn || c.cls) + '</dd>' +
        '<dt>持有</dt><dd>' + (owned ? owned + ' 张' : '未获得') + '</dd>' +
      '</dl>' +
      '<div class="rate">卡面：背景 / 角色 / 近景粒子 / 卡框 四层分离，指针倾斜时按 Z 轴视差运动；' +
      'SR 及以上才有镭射叠层，N / R 为无镭射普通卡。</div>';
    m.classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    var m = $('modal');
    m.classList.remove('on');
    document.body.style.overflow = '';
  }

  /* ══════════ 10. 启动 ══════════ */
  function boot() {
    var one = $('one'), ten = $('ten'), rs = $('reset');
    if (one) one.addEventListener('click', function () { draw(1); });
    if (ten) ten.addEventListener('click', function () { draw(10); });
    if (rs) rs.addEventListener('click', function () {
      if (!confirm('清空抽卡记录与图鉴收藏？')) return;
      state = withDefaults({});
      save();
      slotsEl.innerHTML = '';
      slots = [];
      stage.style.height = '';
      stage.style.minHeight = '';
      var idleEl = $('idle');
      if (idleEl) idleEl.classList.remove('hide');
      hintEl.innerHTML = '按 <b>单抽</b> 抽一包，然后按住卡包左右拖开';
      hintEl.classList.remove('hide');
      renderCollection();
      updateStats();
    });
    var mm = $('mute');
    if (mm) mm.addEventListener('click', function () {
      muted = !muted;
      mm.textContent = muted ? '🔇' : '🔊';
    });
    var modal = $('modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal || e.target.classList.contains('close')) closeModal();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeModal();
      });
    }
    bindPack();
    bindFilters();
    renderCollection();
    updateStats();
    fitFx();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
